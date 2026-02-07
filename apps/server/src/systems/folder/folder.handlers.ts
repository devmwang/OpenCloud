import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { displayOrders, files, folders, users } from "@/db/schema";

import type {
    createFolderInput,
    deleteFolderQuerystring,
    getContentsQuerystring,
    getDetailsQuerystring,
    getDisplayOrderQuerystring,
    moveFolderInput,
    setDisplayOrderInput,
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

    // SIZE is not applicable to folders; fallback to name.
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

export async function getDetailsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: getDetailsQuerystring }>,
    reply: FastifyReply,
) {
    const folderId = request.query.folderId;
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
            createdAt: folders.createdAt,
            updatedAt: folders.updatedAt,
        })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.ownerId, userId), isNull(folders.deletedAt)))
        .limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    let currentFolder: {
        id: string;
        folderName: string;
        type: "ROOT" | "STANDARD";
        parentFolderId: string | null;
    } = {
        id: folder.id,
        folderName: folder.folderName,
        type: folder.type,
        parentFolderId: folder.parentFolderId,
    };
    const hierarchy: { id: string; name: string; type: string }[] = [];

    while (currentFolder.type != "ROOT" && currentFolder.parentFolderId) {
        const [parent] = await this.db
            .select({
                id: folders.id,
                folderName: folders.folderName,
                type: folders.type,
                parentFolderId: folders.parentFolderId,
            })
            .from(folders)
            .where(
                and(
                    eq(folders.id, currentFolder.parentFolderId),
                    eq(folders.ownerId, userId),
                    isNull(folders.deletedAt),
                ),
            )
            .limit(1);

        if (!parent) {
            return reply.code(404).send({ message: "Folder not found" });
        }

        hierarchy.push({ id: parent.id, name: parent.folderName, type: parent.type });

        currentFolder = parent;
    }

    const [owner] = await this.db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, folder.ownerId))
        .limit(1);

    if (!owner) {
        return reply.code(404).send({ message: "User not found" });
    }

    return reply.code(200).send({
        id: folderId,
        name: folder.folderName,
        type: folder.type,
        ownerId: folder.ownerId,
        ownerUsername: owner.username,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        editedAt: folder.updatedAt,
        folderAccess: folder.folderAccess,
        fileAccessPermission: folder.folderAccess,
        hierarchy: hierarchy,
    });
}

export async function getContentsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: getContentsQuerystring }>,
    reply: FastifyReply,
) {
    const folderId = request.query.folderId;
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
        .select({ id: folders.id, ownerId: folders.ownerId, type: folders.type })
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
            .orderBy(desc(displayOrders.updatedAt), desc(displayOrders.createdAt), desc(displayOrders.id))
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
    const legacyRootFolderFilter = and(
        isNull(folders.parentFolderId),
        eq(folders.ownerId, userId),
        ne(folders.type, "ROOT"),
        isNull(folders.deletedAt),
    );
    const fileFilter = and(eq(files.parentId, folderId), eq(files.ownerId, userId), isNull(files.deletedAt));

    let folderFilter = directFolderFilter;
    let folderCount = 0;

    if (folder.type === "ROOT") {
        const [directCountResult] = await this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(folders)
            .where(directFolderFilter);
        const directFolderCount = directCountResult?.count ?? 0;

        if (directFolderCount > 0) {
            folderCount = directFolderCount;
        } else {
            folderFilter = legacyRootFolderFilter;

            const [legacyCountResult] = await this.db
                .select({ count: sql<number>`count(*)::int` })
                .from(folders)
                .where(legacyRootFolderFilter);

            folderCount = legacyCountResult?.count ?? 0;
        }
    } else {
        const [folderCountResult] = await this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(folders)
            .where(directFolderFilter);

        folderCount = folderCountResult?.count ?? 0;
    }

    const { folderOffset, folderLimit, fileOffset, fileLimit } = resolveCombinedPagination(folderCount, offset, limit);

    let childFolders: { id: string; folderName: string; createdAt: Date }[] = [];
    if (folderLimit !== 0) {
        let childFolderQuery = this.db
            .select({ id: folders.id, folderName: folders.folderName, createdAt: folders.createdAt })
            .from(folders)
            .where(folderFilter)
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

    let childFiles: { id: string; fileName: string; fileSize: number | null; createdAt: Date }[] = [];
    if (fileLimit !== 0) {
        let childFileQuery = this.db
            .select({ id: files.id, fileName: files.fileName, fileSize: files.fileSize, createdAt: files.createdAt })
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
        folders: childFolders,
        files: childFiles,
        ...(limit !== undefined ? { limit } : {}),
        ...(hasOffset ? { offset } : {}),
    });
}

export async function createFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: createFolderInput }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }
    const { folderName, parentFolderId } = request.body;

    const [parentFolder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(and(eq(folders.id, parentFolderId), isNull(folders.deletedAt)))
        .limit(1);
    if (!parentFolder) {
        return reply.code(404).send({ message: "Parent folder not found" });
    }
    if (parentFolder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to access this folder" });
    }

    const [folder] = await this.db
        .insert(folders)
        .values({
            ownerId: userId,
            folderName: folderName,
            parentFolderId: parentFolderId,
        })
        .returning({ id: folders.id });
    if (!folder) {
        return reply.code(500).send({ message: "Failed to create folder" });
    }

    return reply.code(201).send({ id: folder.id });
}

export async function deleteFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: deleteFolderQuerystring }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderId = request.query.folderId;

    const [folder] = await this.db
        .select({
            id: folders.id,
            ownerId: folders.ownerId,
            type: folders.type,
        })
        .from(folders)
        .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to delete this folder" });
    }

    if (folder.type === "ROOT") {
        return reply.code(400).send({ message: "Root folder cannot be deleted" });
    }

    const [childFolder] = await this.db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.parentFolderId, folderId), isNull(folders.deletedAt)))
        .limit(1);
    if (childFolder) {
        return reply.code(400).send({ message: "Folder is not empty (contains subfolders)" });
    }

    const [childFile] = await this.db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.parentId, folderId), isNull(files.deletedAt)))
        .limit(1);
    if (childFile) {
        return reply.code(400).send({ message: "Folder is not empty (contains files)" });
    }

    await this.db.delete(folders).where(eq(folders.id, folderId));

    return reply.code(200).send({
        status: "success",
        message: "Folder deleted successfully",
    });
}

export async function moveFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: moveFolderInput }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { folderId, destinationFolderId } = request.body;

    const [sourceFolder] = await this.db
        .select({
            id: folders.id,
            ownerId: folders.ownerId,
            type: folders.type,
            folderName: folders.folderName,
            parentFolderId: folders.parentFolderId,
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
        .select({ id: folders.id, ownerId: folders.ownerId })
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
            folderId,
            parentFolderId: destinationFolderId,
        });
    }

    if (folderId === destinationFolderId) {
        return reply.code(400).send({ message: "Folder cannot be moved into itself" });
    }

    const visitedFolderIds = new Set<string>();
    let currentFolderId: string | null = destinationFolderId;

    while (currentFolderId) {
        if (currentFolderId === folderId) {
            return reply.code(400).send({ message: "Folder cannot be moved into its own descendant" });
        }

        if (visitedFolderIds.has(currentFolderId)) {
            return reply.code(400).send({ message: "Folder hierarchy is invalid" });
        }
        visitedFolderIds.add(currentFolderId);

        const [currentFolder] = await this.db
            .select({ parentFolderId: folders.parentFolderId })
            .from(folders)
            .where(and(eq(folders.id, currentFolderId), eq(folders.ownerId, userId), isNull(folders.deletedAt)))
            .limit(1);

        if (!currentFolder) {
            break;
        }

        currentFolderId = currentFolder.parentFolderId;
    }

    await this.db.update(folders).set({ parentFolderId: destinationFolderId }).where(eq(folders.id, folderId));

    return reply.code(200).send({
        status: "success",
        message: "Folder moved successfully",
        folderId,
        parentFolderId: destinationFolderId,
    });
}

export async function getDisplayOrderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: getDisplayOrderQuerystring }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderId = request.query.folderId;

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
        .orderBy(desc(displayOrders.updatedAt), desc(displayOrders.createdAt), desc(displayOrders.id))
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

export async function setDisplayOrderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: setDisplayOrderInput }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { folderId, displayType, sortOrder, sortType } = request.body;

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

    const existingRows = await this.db
        .select({ id: displayOrders.id })
        .from(displayOrders)
        .where(and(eq(displayOrders.userId, userId), eq(displayOrders.folderId, folderId)))
        .orderBy(desc(displayOrders.updatedAt), desc(displayOrders.createdAt), desc(displayOrders.id));

    if (existingRows.length === 0) {
        await this.db.insert(displayOrders).values({
            userId,
            folderId,
            displayType,
            sortOrder,
            sortType,
        });
    } else {
        const [primaryRow, ...duplicateRows] = existingRows;

        if (!primaryRow) {
            return reply.code(500).send({ message: "Failed to persist display order" });
        }

        await this.db
            .update(displayOrders)
            .set({
                displayType,
                sortOrder,
                sortType,
            })
            .where(eq(displayOrders.id, primaryRow.id));

        if (duplicateRows.length > 0) {
            await this.db.delete(displayOrders).where(
                inArray(
                    displayOrders.id,
                    duplicateRows.map((row) => row.id),
                ),
            );
        }
    }

    return reply.code(200).send({
        folderId,
        displayType,
        sortOrder,
        sortType,
    });
}
