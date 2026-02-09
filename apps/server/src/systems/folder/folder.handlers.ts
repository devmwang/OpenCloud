import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { displayOrders, files, folders, users } from "@/db/schema";

import type {
    CreateFolderInput,
    FolderParams,
    GetFolderChildrenQuery,
    PatchFolderInput,
    PutDisplayPreferencesInput,
} from "./folder.schemas";

type ResolvedSortType = "NAME" | "DATE_CREATED" | "SIZE";
type ResolvedSortOrder = "ASC" | "DESC";

const DEFAULT_SORT_TYPE: ResolvedSortType = "NAME";
const DEFAULT_SORT_ORDER: ResolvedSortOrder = "ASC";

const getFolderOrderBy = (sortType: ResolvedSortType, sortOrder: ResolvedSortOrder) => {
    const direction = sortOrder === "ASC" ? asc : desc;

    if (sortType === "DATE_CREATED") {
        return [direction(folders.createdAt), direction(folders.id)] as const;
    }

    return [direction(folders.folderName), direction(folders.id)] as const;
};

const getFileOrderBy = (sortType: ResolvedSortType, sortOrder: ResolvedSortOrder) => {
    const direction = sortOrder === "ASC" ? asc : desc;

    if (sortType === "DATE_CREATED") {
        return [direction(files.createdAt), direction(files.id)] as const;
    }

    if (sortType === "SIZE") {
        const nullSizeRank = sql<number>`case when ${files.fileSize} is null then 1 else 0 end`;
        return [asc(nullSizeRank), direction(files.fileSize), direction(files.fileName), direction(files.id)] as const;
    }

    return [direction(files.fileName), direction(files.id)] as const;
};

const resolveCombinedPagination = (folderCount: number, offset: number, limit: number | undefined) => {
    const folderOffset = Math.min(offset, folderCount);
    const fileOffset = Math.max(offset - folderCount, 0);

    if (limit === undefined) {
        return {
            folderOffset,
            folderLimit: undefined,
            fileOffset,
            fileLimit: undefined,
        };
    }

    const foldersRemaining = Math.max(folderCount - folderOffset, 0);
    const folderLimit = Math.min(limit, foldersRemaining);
    const fileLimit = offset >= folderCount ? limit : Math.max(limit - folderLimit, 0);

    return {
        folderOffset,
        folderLimit,
        fileOffset,
        fileLimit,
    };
};

const splitFolderPathIds = (folderPath: string) => {
    return folderPath.split("/").filter(Boolean);
};

const buildFolderPath = (parentPath: string, folderId: string) => {
    const normalizedParent = parentPath.endsWith("/") ? parentPath.slice(0, -1) : parentPath;
    return `${normalizedParent}/${folderId}`;
};

const collectFolderSubtreeIds = async (server: FastifyInstance, ownerId: string, rootFolderId: string) => {
    const discovered = new Set<string>([rootFolderId]);
    let frontier: string[] = [rootFolderId];

    while (frontier.length > 0) {
        const nextRows = await server.db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.ownerId, ownerId), inArray(folders.parentFolderId, frontier)));

        const nextFrontier: string[] = [];
        for (const row of nextRows) {
            if (discovered.has(row.id)) {
                continue;
            }

            discovered.add(row.id);
            nextFrontier.push(row.id);
        }

        frontier = nextFrontier;
    }

    return Array.from(discovered);
};

export async function getDetailsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FolderParams }>,
    reply: FastifyReply,
) {
    const folderId = request.params.folderId;
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const [folder] = await this.db
        .select({
            id: folders.id,
            folderName: folders.folderName,
            ownerId: folders.ownerId,
            folderAccess: folders.folderAccess,
            type: folders.type,
            parentFolderId: folders.parentFolderId,
            folderPath: folders.folderPath,
            createdAt: folders.createdAt,
            updatedAt: folders.updatedAt,
        })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.ownerId, userId), isNull(folders.deletedAt)))
        .limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    const pathIds = splitFolderPathIds(folder.folderPath);
    const ancestorIds = pathIds.slice(0, -1);

    const ancestors =
        ancestorIds.length === 0
            ? []
            : await this.db
                  .select({ id: folders.id, folderName: folders.folderName, type: folders.type })
                  .from(folders)
                  .where(and(eq(folders.ownerId, userId), inArray(folders.id, ancestorIds), isNull(folders.deletedAt)));

    const ancestorMap = new Map(ancestors.map((ancestor) => [ancestor.id, ancestor]));
    const orderedAncestors = ancestorIds
        .map((ancestorId) => ancestorMap.get(ancestorId))
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
        .map((ancestor) => ({
            id: ancestor.id,
            name: ancestor.folderName,
            type: ancestor.type,
        }));

    return reply.code(200).send({
        id: folder.id,
        name: folder.folderName,
        ownerId: folder.ownerId,
        parentFolderId: folder.parentFolderId,
        type: folder.type,
        access: folder.folderAccess,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
        ancestors: orderedAncestors,
    });
}

export async function listChildrenHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FolderParams; Querystring: GetFolderChildrenQuery }>,
    reply: FastifyReply,
) {
    const folderId = request.params.folderId;
    const limit = request.query.limit;
    const offset = request.query.offset ?? 0;
    const hasOffset = request.query.offset !== undefined;
    const requestedSortType = request.query.sortType;
    const requestedSortOrder = request.query.sortOrder;
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const [folder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to access this folder" });
    }

    let resolvedSortType: ResolvedSortType | undefined = requestedSortType;
    let resolvedSortOrder: ResolvedSortOrder | undefined = requestedSortOrder;

    if (!resolvedSortType || !resolvedSortOrder) {
        const [displayOrder] = await this.db
            .select({
                sortType: displayOrders.sortType,
                sortOrder: displayOrders.sortOrder,
            })
            .from(displayOrders)
            .where(and(eq(displayOrders.userId, userId), eq(displayOrders.folderId, folderId)))
            .limit(1);

        resolvedSortType = resolvedSortType ?? displayOrder?.sortType ?? DEFAULT_SORT_TYPE;
        resolvedSortOrder = resolvedSortOrder ?? displayOrder?.sortOrder ?? DEFAULT_SORT_ORDER;
    }

    const sortType = resolvedSortType ?? DEFAULT_SORT_TYPE;
    const sortOrder = resolvedSortOrder ?? DEFAULT_SORT_ORDER;

    const directFolderFilter = and(
        eq(folders.parentFolderId, folderId),
        eq(folders.ownerId, userId),
        isNull(folders.deletedAt),
    );
    const fileFilter = and(
        eq(files.parentId, folderId),
        eq(files.ownerId, userId),
        isNull(files.deletedAt),
        eq(files.storageState, "READY"),
    );

    const [folderCountResult] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(folders)
        .where(directFolderFilter);
    const folderCount = folderCountResult?.count ?? 0;

    const { folderOffset, folderLimit, fileOffset, fileLimit } = resolveCombinedPagination(folderCount, offset, limit);

    let childFolders: { id: string; name: string; createdAt: Date }[] = [];
    if (folderLimit !== 0) {
        let childFolderQuery = this.db
            .select({ id: folders.id, name: folders.folderName, createdAt: folders.createdAt })
            .from(folders)
            .where(directFolderFilter)
            .orderBy(...getFolderOrderBy(sortType, sortOrder))
            .$dynamic();

        if (folderOffset > 0) {
            childFolderQuery = childFolderQuery.offset(folderOffset);
        }

        if (folderLimit !== undefined) {
            childFolderQuery = childFolderQuery.limit(folderLimit);
        }

        childFolders = await childFolderQuery;
    }

    let childFiles: {
        id: string;
        name: string;
        sizeBytes: number | null;
        mimeType: string;
        access: "PRIVATE" | "PROTECTED" | "PUBLIC";
        storageState: "PENDING" | "READY" | "FAILED";
        createdAt: Date;
        updatedAt: Date;
    }[] = [];
    if (fileLimit !== 0) {
        let childFileQuery = this.db
            .select({
                id: files.id,
                name: files.fileName,
                sizeBytes: files.fileSize,
                mimeType: files.fileType,
                access: files.fileAccess,
                storageState: files.storageState,
                createdAt: files.createdAt,
                updatedAt: files.updatedAt,
            })
            .from(files)
            .where(fileFilter)
            .orderBy(...getFileOrderBy(sortType, sortOrder))
            .$dynamic();

        if (fileOffset > 0) {
            childFileQuery = childFileQuery.offset(fileOffset);
        }

        if (fileLimit !== undefined) {
            childFileQuery = childFileQuery.limit(fileLimit);
        }

        childFiles = await childFileQuery;
    }

    return reply.code(200).send({
        id: folderId,
        folders: childFolders.map((folderItem) => ({
            id: folderItem.id,
            name: folderItem.name,
            createdAt: folderItem.createdAt.toISOString(),
        })),
        files: childFiles.map((fileItem) => ({
            id: fileItem.id,
            name: fileItem.name,
            sizeBytes: fileItem.sizeBytes,
            mimeType: fileItem.mimeType,
            access: fileItem.access,
            storageState: fileItem.storageState,
            createdAt: fileItem.createdAt.toISOString(),
            updatedAt: fileItem.updatedAt.toISOString(),
        })),
        ...(limit !== undefined ? { limit } : {}),
        ...(hasOffset ? { offset } : {}),
    });
}

export async function createFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateFolderInput }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { name, parentFolderId } = request.body;

    const [parentFolder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId, folderPath: folders.folderPath })
        .from(folders)
        .where(and(eq(folders.id, parentFolderId), isNull(folders.deletedAt)))
        .limit(1);
    if (!parentFolder) {
        return reply.code(404).send({ message: "Parent folder not found" });
    }
    if (parentFolder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to access this folder" });
    }

    const newFolderId = createId();
    const folderPath = buildFolderPath(parentFolder.folderPath, newFolderId);

    const [folder] = await this.db
        .insert(folders)
        .values({
            id: newFolderId,
            ownerId: userId,
            folderName: name,
            parentFolderId,
            folderPath,
        })
        .returning({ id: folders.id });
    if (!folder) {
        return reply.code(500).send({ message: "Failed to create folder" });
    }

    return reply.code(201).send({ id: folder.id });
}

export async function patchFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FolderParams; Body: PatchFolderInput }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderId = request.params.folderId;
    const { destinationFolderId } = request.body;

    const [sourceFolder] = await this.db
        .select({
            id: folders.id,
            ownerId: folders.ownerId,
            type: folders.type,
            parentFolderId: folders.parentFolderId,
            folderPath: folders.folderPath,
        })
        .from(folders)
        .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!sourceFolder) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    if (sourceFolder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to move this folder" });
    }

    if (sourceFolder.type === "ROOT") {
        return reply.code(400).send({ message: "Root folder cannot be moved" });
    }

    const [destinationFolder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId, folderPath: folders.folderPath })
        .from(folders)
        .where(and(eq(folders.id, destinationFolderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!destinationFolder) {
        return reply.code(404).send({ message: "Destination folder not found" });
    }

    if (destinationFolder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to move folders to this location" });
    }

    if (sourceFolder.parentFolderId === destinationFolderId) {
        return reply.code(200).send({
            status: "success",
            message: "Folder already in destination folder",
            id: folderId,
            parentFolderId: destinationFolderId,
        });
    }

    if (folderId === destinationFolderId) {
        return reply.code(400).send({ message: "Folder cannot be moved into itself" });
    }

    if (
        destinationFolder.folderPath === sourceFolder.folderPath ||
        destinationFolder.folderPath.startsWith(`${sourceFolder.folderPath}/`)
    ) {
        return reply.code(400).send({ message: "Folder cannot be moved into its own descendant" });
    }

    const newSourcePath = buildFolderPath(destinationFolder.folderPath, sourceFolder.id);

    await this.db.transaction(async (tx) => {
        await tx.update(folders).set({ parentFolderId: destinationFolderId }).where(eq(folders.id, folderId));
        await tx.execute(sql`
            update "Folders"
            set "folderPath" = ${newSourcePath} || substring("folderPath" from ${sourceFolder.folderPath.length + 1})
            where "ownerId" = ${userId}
              and ("folderPath" = ${sourceFolder.folderPath} or "folderPath" like ${`${sourceFolder.folderPath}/%`})
        `);
    });

    return reply.code(200).send({
        status: "success",
        message: "Folder moved successfully",
        id: folderId,
        parentFolderId: destinationFolderId,
    });
}

export async function deleteFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FolderParams }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderId = request.params.folderId;

    const [folder] = await this.db
        .select({
            id: folders.id,
            ownerId: folders.ownerId,
            type: folders.type,
            parentFolderId: folders.parentFolderId,
            deletedAt: folders.deletedAt,
        })
        .from(folders)
        .where(eq(folders.id, folderId))
        .limit(1);

    if (!folder || folder.deletedAt !== null) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to delete this folder" });
    }

    if (folder.type === "ROOT") {
        return reply.code(400).send({ message: "Root folder cannot be deleted" });
    }

    const deletedAt = new Date();
    const subtreeFolderIds = await collectFolderSubtreeIds(this, userId, folderId);

    await this.db.transaction(async (tx) => {
        await tx
            .update(files)
            .set({ deletedAt })
            .where(and(eq(files.ownerId, userId), inArray(files.parentId, subtreeFolderIds), isNull(files.deletedAt)));

        await tx
            .update(folders)
            .set({ deletedAt })
            .where(and(eq(folders.ownerId, userId), inArray(folders.id, subtreeFolderIds), isNull(folders.deletedAt)));

        await tx.delete(displayOrders).where(inArray(displayOrders.folderId, subtreeFolderIds));
    });

    return reply.code(200).send({
        status: "success",
        message: "Folder moved to recycle bin",
        id: folderId,
        parentFolderId: folder.parentFolderId,
    });
}

export async function getDisplayPreferencesHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FolderParams }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderId = request.params.folderId;

    const [folder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to access this folder" });
    }

    const [displayOrder] = await this.db
        .select({
            displayType: displayOrders.displayType,
            sortOrder: displayOrders.sortOrder,
            sortType: displayOrders.sortType,
        })
        .from(displayOrders)
        .where(and(eq(displayOrders.userId, userId), eq(displayOrders.folderId, folderId)))
        .limit(1);

    if (displayOrder) {
        return reply.code(200).send({
            folderId,
            displayType: displayOrder.displayType,
            sortOrder: displayOrder.sortOrder,
            sortType: displayOrder.sortType,
        });
    }

    const [user] = await this.db
        .select({
            defaultDisplayType: users.defaultDisplayType,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) {
        return reply.code(404).send({ message: "User not found" });
    }

    return reply.code(200).send({
        folderId,
        displayType: user.defaultDisplayType,
        sortOrder: "ASC",
        sortType: "NAME",
    });
}

export async function putDisplayPreferencesHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FolderParams; Body: PutDisplayPreferencesInput }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderId = request.params.folderId;
    const { displayType, sortOrder, sortType } = request.body;

    const [folder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to edit this folder" });
    }

    await this.db
        .insert(displayOrders)
        .values({
            userId,
            folderId,
            displayType,
            sortOrder,
            sortType,
        })
        .onConflictDoUpdate({
            target: [displayOrders.userId, displayOrders.folderId],
            set: {
                displayType,
                sortOrder,
                sortType,
                updatedAt: new Date(),
            },
        });

    return reply.code(200).send({
        folderId,
        displayType,
        sortOrder,
        sortType,
    });
}
