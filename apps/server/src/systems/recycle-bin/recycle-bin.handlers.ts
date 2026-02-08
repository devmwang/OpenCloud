import fs from "fs";
import path from "path";

import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { displayOrders, files, folders, users } from "@/db/schema";
import { env } from "@/env/env";

import type {
    DestinationFoldersQuery,
    EmptyBody,
    ListQuery,
    MoveToBinBody,
    PermanentlyDeleteBody,
    PurgeExpiredBody,
    RecycleItemType,
    RestoreBody,
} from "./recycle-bin.schemas";

const PURGE_LOCK_KEY = 820_514_137;
const DEFAULT_LIST_LIMIT = 100;
const DEFAULT_DESTINATION_FOLDER_LIMIT = 200;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

type DeletedFolderRow = {
    id: string;
    folderName: string;
    parentFolderId: string | null;
    deletedAt: Date;
};

type DeletedFileRow = {
    id: string;
    fileName: string;
    fileSize: number | null;
    parentId: string;
    deletedAt: Date;
};

type PurgeSummary = {
    purgedFiles: number;
    purgedFolders: number;
};

type RunPurgeExpiredResult = PurgeSummary & {
    olderThanDays: number;
    skipped: boolean;
};

const chunk = <T>(items: T[], size: number): T[][] => {
    if (items.length === 0) {
        return [];
    }

    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }

    return result;
};

const toIso = (date: Date) => date.toISOString();
const getPurgeAt = (deletedAt: Date, retentionDays = env.FILE_PURGE_RETENTION_DAYS) =>
    new Date(deletedAt.getTime() + retentionDays * MILLISECONDS_PER_DAY);

const parsePgBoolean = (value: unknown) => {
    if (value === true || value === "t" || value === "true" || value === 1 || value === "1") {
        return true;
    }

    return false;
};

const withPurgeLock = async <T>(server: FastifyInstance, fn: () => Promise<T>) => {
    return server.db.transaction(async (tx) => {
        const lockResult = (await tx.execute(sql`select pg_try_advisory_xact_lock(${PURGE_LOCK_KEY}) as locked`)) as {
            rows?: Array<{ locked?: unknown }>;
        };
        const locked = parsePgBoolean(lockResult.rows?.[0]?.locked);

        if (!locked) {
            return {
                locked: false,
                result: null,
            } as const;
        }

        const result = await fn();
        return {
            locked: true,
            result,
        } as const;
    });
};

const collectFolderSubtreeIds = async (server: FastifyInstance, ownerId: string, rootFolderId: string) => {
    const visited = new Set<string>([rootFolderId]);
    let frontier = [rootFolderId];

    while (frontier.length > 0) {
        const children = await server.db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.ownerId, ownerId), inArray(folders.parentFolderId, frontier)));

        const nextFrontier: string[] = [];

        for (const child of children) {
            if (visited.has(child.id)) {
                continue;
            }

            visited.add(child.id);
            nextFrontier.push(child.id);
        }

        frontier = nextFrontier;
    }

    return Array.from(visited);
};

const hardDeleteFilesByRows = async (
    server: FastifyInstance,
    fileRows: Array<{ id: string; ownerId: string }>,
): Promise<number> => {
    if (fileRows.length === 0) {
        return 0;
    }

    const deduped = new Map<string, { id: string; ownerId: string }>();
    for (const fileRow of fileRows) {
        if (!deduped.has(fileRow.id)) {
            deduped.set(fileRow.id, fileRow);
        }
    }

    for (const fileRow of deduped.values()) {
        const filePath = path.join(env.FILE_STORE_PATH, fileRow.ownerId, fileRow.id);

        try {
            await fs.promises.unlink(filePath);
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code !== "ENOENT") {
                throw error;
            }
        }
    }

    let purgedFiles = 0;
    for (const idChunk of chunk(Array.from(deduped.keys()), 500)) {
        const deletedRows = await server.db.delete(files).where(inArray(files.id, idChunk)).returning({ id: files.id });
        purgedFiles += deletedRows.length;
    }

    return purgedFiles;
};

const getTopLevelDeletedRowsForOwner = async (
    server: FastifyInstance,
    ownerId: string,
    options: {
        threshold?: Date | undefined;
        itemType?: RecycleItemType | undefined;
    } = {},
) => {
    const allDeletedFolders = await server.db
        .select({
            id: folders.id,
            folderName: folders.folderName,
            parentFolderId: folders.parentFolderId,
            deletedAt: folders.deletedAt,
        })
        .from(folders)
        .where(and(eq(folders.ownerId, ownerId), isNotNull(folders.deletedAt)));

    const normalizedFolders: DeletedFolderRow[] = allDeletedFolders
        .filter((folder): folder is typeof folder & { deletedAt: Date } => folder.deletedAt !== null)
        .map((folder) => ({
            id: folder.id,
            folderName: folder.folderName,
            parentFolderId: folder.parentFolderId,
            deletedAt: folder.deletedAt,
        }));

    const deletedFolderIdSet = new Set(normalizedFolders.map((folder) => folder.id));

    const candidateFolders =
        options.itemType === "FILE"
            ? []
            : normalizedFolders.filter((folder) =>
                  options.threshold ? folder.deletedAt.getTime() <= options.threshold.getTime() : true,
              );

    const topLevelDeletedFolders = candidateFolders.filter((folder) => {
        if (!folder.parentFolderId) {
            return true;
        }

        return !deletedFolderIdSet.has(folder.parentFolderId);
    });

    const deletedFiles =
        options.itemType === "FOLDER"
            ? []
            : await server.db
                  .select({
                      id: files.id,
                      fileName: files.fileName,
                      fileSize: files.fileSize,
                      parentId: files.parentId,
                      deletedAt: files.deletedAt,
                  })
                  .from(files)
                  .where(
                      and(
                          eq(files.ownerId, ownerId),
                          isNotNull(files.deletedAt),
                          options.threshold ? lte(files.deletedAt, options.threshold) : undefined,
                      ),
                  );

    const normalizedFiles: DeletedFileRow[] = deletedFiles
        .filter((file): file is typeof file & { deletedAt: Date } => file.deletedAt !== null)
        .map((file) => ({
            id: file.id,
            fileName: file.fileName,
            fileSize: file.fileSize,
            parentId: file.parentId,
            deletedAt: file.deletedAt,
        }));

    const topLevelDeletedFiles = normalizedFiles.filter((file) => !deletedFolderIdSet.has(file.parentId));

    return {
        topLevelDeletedFolders,
        topLevelDeletedFiles,
        deletedFolderIdSet,
    };
};

const permanentlyDeleteFolderSubtree = async (
    server: FastifyInstance,
    ownerId: string,
    rootFolderId: string,
): Promise<PurgeSummary | null> => {
    const [rootFolder] = await server.db
        .select({ id: folders.id, ownerId: folders.ownerId, deletedAt: folders.deletedAt })
        .from(folders)
        .where(and(eq(folders.id, rootFolderId), eq(folders.ownerId, ownerId)))
        .limit(1);

    if (!rootFolder || rootFolder.deletedAt === null) {
        return null;
    }

    const subtreeFolderIds = await collectFolderSubtreeIds(server, ownerId, rootFolderId);

    if (subtreeFolderIds.length === 0) {
        return { purgedFiles: 0, purgedFolders: 0 };
    }

    const [activeFolderCount] = await server.db
        .select({ count: sql<number>`count(*)::int` })
        .from(folders)
        .where(and(eq(folders.ownerId, ownerId), inArray(folders.id, subtreeFolderIds), isNull(folders.deletedAt)));

    const [activeFileCount] = await server.db
        .select({ count: sql<number>`count(*)::int` })
        .from(files)
        .where(and(eq(files.ownerId, ownerId), inArray(files.parentId, subtreeFolderIds), isNull(files.deletedAt)));

    if ((activeFolderCount?.count ?? 0) > 0 || (activeFileCount?.count ?? 0) > 0) {
        throw new Error("ACTIVE_DESCENDANTS_PRESENT");
    }

    const subtreeFiles = await server.db
        .select({ id: files.id, ownerId: files.ownerId })
        .from(files)
        .where(and(eq(files.ownerId, ownerId), inArray(files.parentId, subtreeFolderIds)));

    const purgedFiles = await hardDeleteFilesByRows(server, subtreeFiles);

    await server.db.delete(displayOrders).where(inArray(displayOrders.folderId, subtreeFolderIds));

    let purgedFolders = 0;
    for (const folderIdChunk of chunk(subtreeFolderIds, 500)) {
        const deletedFolders = await server.db
            .delete(folders)
            .where(and(eq(folders.ownerId, ownerId), inArray(folders.id, folderIdChunk)))
            .returning({ id: folders.id });

        purgedFolders += deletedFolders.length;
    }

    return {
        purgedFiles,
        purgedFolders,
    };
};

const getActiveDestinationFolder = async (server: FastifyInstance, ownerId: string, folderId: string) => {
    const [destinationFolder] = await server.db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.ownerId, ownerId), isNull(folders.deletedAt)))
        .limit(1);

    return destinationFolder;
};

const resolveRestoreParentFolder = async (
    server: FastifyInstance,
    ownerId: string,
    originalParentFolderId: string | null,
    requestedDestinationFolderId?: string,
) => {
    if (requestedDestinationFolderId) {
        const destinationFolder = await getActiveDestinationFolder(server, ownerId, requestedDestinationFolderId);
        if (!destinationFolder) {
            return {
                error: {
                    status: 400,
                    message: "Destination folder not found or unavailable",
                },
            } as const;
        }

        return {
            parentFolderId: destinationFolder.id,
        } as const;
    }

    if (!originalParentFolderId) {
        return {
            parentFolderId: null,
        } as const;
    }

    const originalParent = await getActiveDestinationFolder(server, ownerId, originalParentFolderId);
    if (!originalParent) {
        return {
            error: {
                status: 409,
                message: "Original parent folder is unavailable. Provide destinationFolderId to restore this item.",
            },
        } as const;
    }

    return {
        parentFolderId: originalParent.id,
    } as const;
};

const purgeDeletedRowsForOwner = async (server: FastifyInstance, ownerId: string, threshold?: Date) => {
    const { topLevelDeletedFiles, topLevelDeletedFolders } = await getTopLevelDeletedRowsForOwner(server, ownerId, {
        threshold,
    });

    const purgedFilesFromTopLevelFiles = await hardDeleteFilesByRows(
        server,
        topLevelDeletedFiles.map((file) => ({ id: file.id, ownerId })),
    );

    let purgedFilesFromFolders = 0;
    let purgedFolders = 0;

    for (const folderRow of topLevelDeletedFolders) {
        const folderSummary = await permanentlyDeleteFolderSubtree(server, ownerId, folderRow.id);
        if (!folderSummary) {
            continue;
        }

        purgedFilesFromFolders += folderSummary.purgedFiles;
        purgedFolders += folderSummary.purgedFolders;
    }

    return {
        purgedFiles: purgedFilesFromTopLevelFiles + purgedFilesFromFolders,
        purgedFolders,
    } satisfies PurgeSummary;
};

export async function runPurgeExpired(server: FastifyInstance, olderThanDays?: number): Promise<RunPurgeExpiredResult> {
    const retentionDays = olderThanDays ?? env.FILE_PURGE_RETENTION_DAYS;

    const lockResult = await withPurgeLock(server, async () => {
        const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

        const folderOwners = await server.db
            .select({ ownerId: folders.ownerId })
            .from(folders)
            .where(and(isNotNull(folders.deletedAt), lte(folders.deletedAt, threshold)));

        const fileOwners = await server.db
            .select({ ownerId: files.ownerId })
            .from(files)
            .where(and(isNotNull(files.deletedAt), lte(files.deletedAt, threshold)));

        const ownerIds = new Set<string>([
            ...folderOwners.map((owner) => owner.ownerId),
            ...fileOwners.map((owner) => owner.ownerId),
        ]);

        let summary: PurgeSummary = {
            purgedFiles: 0,
            purgedFolders: 0,
        };

        for (const ownerId of ownerIds) {
            const ownerSummary = await purgeDeletedRowsForOwner(server, ownerId, threshold);
            summary = {
                purgedFiles: summary.purgedFiles + ownerSummary.purgedFiles,
                purgedFolders: summary.purgedFolders + ownerSummary.purgedFolders,
            };
        }

        return summary;
    });

    if (!lockResult.locked || !lockResult.result) {
        return {
            olderThanDays: retentionDays,
            purgedFiles: 0,
            purgedFolders: 0,
            skipped: true,
        };
    }

    return {
        olderThanDays: retentionDays,
        purgedFiles: lockResult.result.purgedFiles,
        purgedFolders: lockResult.result.purgedFolders,
        skipped: false,
    };
}

export async function moveToBinHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: MoveToBinBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { itemType, itemId } = request.body;
    const deletedAt = new Date();

    if (itemType === "FILE") {
        const [file] = await this.db
            .select({ id: files.id, ownerId: files.ownerId, deletedAt: files.deletedAt })
            .from(files)
            .where(eq(files.id, itemId))
            .limit(1);

        if (!file || file.deletedAt !== null) {
            return reply.code(404).send({ message: "File not found" });
        }

        if (file.ownerId !== userId) {
            return reply.code(403).send({ message: "You do not have permission to move this file to recycle bin" });
        }

        await this.db.update(files).set({ deletedAt }).where(eq(files.id, itemId));

        return reply.code(200).send({
            status: "success",
            message: "File moved to recycle bin",
            itemType,
            itemId,
            deletedAt: toIso(deletedAt),
        });
    }

    const [folder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId, type: folders.type, deletedAt: folders.deletedAt })
        .from(folders)
        .where(eq(folders.id, itemId))
        .limit(1);

    if (!folder || folder.deletedAt !== null) {
        return reply.code(404).send({ message: "Folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to move this folder to recycle bin" });
    }

    if (folder.type === "ROOT") {
        return reply.code(400).send({ message: "Root folder cannot be moved to recycle bin" });
    }

    const subtreeFolderIds = await collectFolderSubtreeIds(this, userId, itemId);

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
        itemType,
        itemId,
        deletedAt: toIso(deletedAt),
    });
}

export async function listRecycleBinHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: ListQuery }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const limit = request.query.limit ?? DEFAULT_LIST_LIMIT;
    const offset = request.query.offset ?? 0;

    const { topLevelDeletedFiles, topLevelDeletedFolders } = await getTopLevelDeletedRowsForOwner(this, userId, {
        itemType: request.query.itemType,
    });

    const parentFolderIds = new Set<string>();

    for (const folder of topLevelDeletedFolders) {
        if (folder.parentFolderId) {
            parentFolderIds.add(folder.parentFolderId);
        }
    }

    for (const file of topLevelDeletedFiles) {
        parentFolderIds.add(file.parentId);
    }

    const parentFolderStatusRows =
        parentFolderIds.size > 0
            ? await this.db
                  .select({ id: folders.id, deletedAt: folders.deletedAt })
                  .from(folders)
                  .where(and(eq(folders.ownerId, userId), inArray(folders.id, Array.from(parentFolderIds))))
            : [];

    const parentFolderStatusMap = new Map(parentFolderStatusRows.map((row) => [row.id, row.deletedAt]));

    const entries = [
        ...topLevelDeletedFolders.map((folder) => {
            const parentDeletedAt = folder.parentFolderId ? parentFolderStatusMap.get(folder.parentFolderId) : null;

            return {
                itemType: "FOLDER" as const,
                id: folder.id,
                name: folder.folderName,
                deletedAt: folder.deletedAt,
                parentFolderId: folder.parentFolderId,
                fileSize: null,
                requiresDestination:
                    folder.parentFolderId !== null && (parentDeletedAt === undefined || parentDeletedAt !== null),
            };
        }),
        ...topLevelDeletedFiles.map((file) => {
            const parentDeletedAt = parentFolderStatusMap.get(file.parentId);

            return {
                itemType: "FILE" as const,
                id: file.id,
                name: file.fileName,
                deletedAt: file.deletedAt,
                parentFolderId: file.parentId,
                fileSize: file.fileSize,
                requiresDestination: parentDeletedAt === undefined || parentDeletedAt !== null,
            };
        }),
    ].sort((left, right) => {
        const deletedAtDelta = right.deletedAt.getTime() - left.deletedAt.getTime();
        if (deletedAtDelta !== 0) {
            return deletedAtDelta;
        }

        return right.id.localeCompare(left.id);
    });

    const total = entries.length;
    const pagedItems = entries.slice(offset, offset + limit);

    return reply.code(200).send({
        items: pagedItems.map((item) => ({
            itemType: item.itemType,
            id: item.id,
            name: item.name,
            deletedAt: toIso(item.deletedAt),
            purgeAt: toIso(getPurgeAt(item.deletedAt)),
            parentFolderId: item.parentFolderId,
            fileSize: item.itemType === "FILE" ? item.fileSize : undefined,
            requiresDestination: item.requiresDestination,
        })),
        total,
        limit,
        offset,
    });
}

export async function destinationFoldersHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: DestinationFoldersQuery }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const search = request.query.search?.trim().toLowerCase();
    const limit = request.query.limit ?? DEFAULT_DESTINATION_FOLDER_LIMIT;

    const allActiveFolders = await this.db
        .select({
            id: folders.id,
            folderName: folders.folderName,
            parentFolderId: folders.parentFolderId,
            type: folders.type,
        })
        .from(folders)
        .where(and(eq(folders.ownerId, userId), isNull(folders.deletedAt)));

    const folderMap = new Map(allActiveFolders.map((folder) => [folder.id, folder]));
    const pathCache = new Map<string, string>();

    const resolvePath = (folderId: string): string => {
        const cached = pathCache.get(folderId);
        if (cached) {
            return cached;
        }

        const folder = folderMap.get(folderId);
        if (!folder) {
            return "";
        }

        const parentPath = folder.parentFolderId ? resolvePath(folder.parentFolderId) : "";
        const normalizedPath = `${parentPath}/${folder.folderName}`.replace(/\/+/g, "/");

        pathCache.set(folderId, normalizedPath);
        return normalizedPath;
    };

    const candidates = allActiveFolders
        .map((folder) => ({
            id: folder.id,
            name: folder.folderName,
            path: resolvePath(folder.id),
        }))
        .filter((folder) => {
            if (!search) {
                return true;
            }

            return folder.name.toLowerCase().includes(search) || folder.path.toLowerCase().includes(search);
        })
        .sort((left, right) => left.path.localeCompare(right.path))
        .slice(0, limit);

    return reply.code(200).send({
        folders: candidates,
    });
}

export async function restoreHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: RestoreBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { itemType, itemId, destinationFolderId } = request.body;

    if (itemType === "FILE") {
        const [file] = await this.db
            .select({
                id: files.id,
                ownerId: files.ownerId,
                parentId: files.parentId,
                deletedAt: files.deletedAt,
            })
            .from(files)
            .where(eq(files.id, itemId))
            .limit(1);

        if (!file || file.deletedAt === null) {
            return reply.code(404).send({ message: "Deleted file not found" });
        }

        if (file.ownerId !== userId) {
            return reply.code(403).send({ message: "You do not have permission to restore this file" });
        }

        const restoreParentResolution = await resolveRestoreParentFolder(
            this,
            userId,
            file.parentId,
            destinationFolderId,
        );

        if ("error" in restoreParentResolution) {
            return reply
                .code(restoreParentResolution.error.status)
                .send({ message: restoreParentResolution.error.message });
        }

        const parentFolderId = restoreParentResolution.parentFolderId;
        if (!parentFolderId) {
            return reply.code(409).send({ message: "A destination folder is required to restore this file" });
        }

        await this.db.update(files).set({ deletedAt: null, parentId: parentFolderId }).where(eq(files.id, itemId));

        return reply.code(200).send({
            status: "success",
            message: "File restored successfully",
            itemType,
            itemId,
            parentFolderId,
            restoredCount: 1,
        });
    }

    const [folder] = await this.db
        .select({
            id: folders.id,
            ownerId: folders.ownerId,
            type: folders.type,
            parentFolderId: folders.parentFolderId,
            deletedAt: folders.deletedAt,
        })
        .from(folders)
        .where(eq(folders.id, itemId))
        .limit(1);

    if (!folder || folder.deletedAt === null) {
        return reply.code(404).send({ message: "Deleted folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to restore this folder" });
    }

    if (folder.type === "ROOT") {
        return reply.code(400).send({ message: "Root folder cannot be restored" });
    }

    const subtreeFolderIds = await collectFolderSubtreeIds(this, userId, itemId);

    const restoreParentResolution = await resolveRestoreParentFolder(
        this,
        userId,
        folder.parentFolderId,
        destinationFolderId,
    );

    if ("error" in restoreParentResolution) {
        return reply
            .code(restoreParentResolution.error.status)
            .send({ message: restoreParentResolution.error.message });
    }

    const parentFolderId = restoreParentResolution.parentFolderId;

    if (parentFolderId && subtreeFolderIds.includes(parentFolderId)) {
        return reply.code(400).send({ message: "Folder cannot be restored into its own descendant" });
    }

    const restoreCounts = await this.db.transaction(async (tx) => {
        if (folder.parentFolderId !== parentFolderId) {
            await tx.update(folders).set({ parentFolderId }).where(eq(folders.id, itemId));
        }

        const restoredFiles = await tx
            .update(files)
            .set({ deletedAt: null })
            .where(
                and(eq(files.ownerId, userId), inArray(files.parentId, subtreeFolderIds), isNotNull(files.deletedAt)),
            )
            .returning({ id: files.id });

        const restoredFolders = await tx
            .update(folders)
            .set({ deletedAt: null })
            .where(
                and(eq(folders.ownerId, userId), inArray(folders.id, subtreeFolderIds), isNotNull(folders.deletedAt)),
            )
            .returning({ id: folders.id });

        return {
            restoredFiles: restoredFiles.length,
            restoredFolders: restoredFolders.length,
        };
    });

    return reply.code(200).send({
        status: "success",
        message: "Folder restored successfully",
        itemType,
        itemId,
        parentFolderId,
        restoredCount: restoreCounts.restoredFiles + restoreCounts.restoredFolders,
    });
}

export async function permanentlyDeleteHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: PermanentlyDeleteBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { itemType, itemId } = request.body;

    if (itemType === "FILE") {
        const [file] = await this.db
            .select({ id: files.id, ownerId: files.ownerId, deletedAt: files.deletedAt })
            .from(files)
            .where(eq(files.id, itemId))
            .limit(1);

        if (!file || file.deletedAt === null) {
            return reply.code(404).send({ message: "Deleted file not found" });
        }

        if (file.ownerId !== userId) {
            return reply.code(403).send({ message: "You do not have permission to permanently delete this file" });
        }

        const purgedFiles = await hardDeleteFilesByRows(this, [{ id: file.id, ownerId: file.ownerId }]);

        return reply.code(200).send({
            status: "success",
            message: "File permanently deleted",
            itemType,
            itemId,
            purgedFiles,
            purgedFolders: 0,
        });
    }

    const [folder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId, deletedAt: folders.deletedAt })
        .from(folders)
        .where(eq(folders.id, itemId))
        .limit(1);

    if (!folder || folder.deletedAt === null) {
        return reply.code(404).send({ message: "Deleted folder not found" });
    }

    if (folder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to permanently delete this folder" });
    }

    let summary: PurgeSummary | null;
    try {
        summary = await permanentlyDeleteFolderSubtree(this, userId, itemId);
    } catch (error) {
        if (error instanceof Error && error.message === "ACTIVE_DESCENDANTS_PRESENT") {
            return reply
                .code(409)
                .send({ message: "Folder contains active descendants and cannot be permanently deleted" });
        }

        throw error;
    }

    if (!summary) {
        return reply.code(404).send({ message: "Deleted folder not found" });
    }

    return reply.code(200).send({
        status: "success",
        message: "Folder permanently deleted",
        itemType,
        itemId,
        purgedFiles: summary.purgedFiles,
        purgedFolders: summary.purgedFolders,
    });
}

export async function emptyRecycleBinHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: EmptyBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const itemType = request.body?.itemType;

    const { topLevelDeletedFiles, topLevelDeletedFolders } = await getTopLevelDeletedRowsForOwner(this, userId, {
        itemType,
    });

    const purgedFilesFromTopLevelFiles = await hardDeleteFilesByRows(
        this,
        topLevelDeletedFiles.map((file) => ({ id: file.id, ownerId: userId })),
    );

    let purgedFilesFromFolders = 0;
    let purgedFolders = 0;

    for (const folderRow of topLevelDeletedFolders) {
        try {
            const summary = await permanentlyDeleteFolderSubtree(this, userId, folderRow.id);
            if (!summary) {
                continue;
            }

            purgedFilesFromFolders += summary.purgedFiles;
            purgedFolders += summary.purgedFolders;
        } catch (error) {
            if (error instanceof Error && error.message === "ACTIVE_DESCENDANTS_PRESENT") {
                return reply
                    .code(409)
                    .send({ message: "Recycle bin contains folders with active descendants that cannot be purged" });
            }

            throw error;
        }
    }

    return reply.code(200).send({
        status: "success",
        message: "Recycle bin emptied",
        purgedFiles: purgedFilesFromTopLevelFiles + purgedFilesFromFolders,
        purgedFolders,
    });
}

export async function purgeExpiredHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: PurgeExpiredBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const [user] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== "ADMIN") {
        return reply.code(403).send({ message: "Admin access required" });
    }

    const purgeResult = await runPurgeExpired(this, request.body?.olderThanDays);

    return reply.code(200).send({
        status: "success",
        message: purgeResult.skipped ? "Purge already in progress" : "Expired recycle-bin items purged",
        olderThanDays: purgeResult.olderThanDays,
        purgedFiles: purgeResult.purgedFiles,
        purgedFolders: purgeResult.purgedFolders,
    });
}

export const recycleBinScheduler = {
    intervalMs: 60 * 60 * 1000,
};
