import fs from "fs";
import path from "path";

import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { displayOrders, files, folders, users } from "@/db/schema";
import { env } from "@/env/env";

import type {
    BatchPermanentlyDeleteBody,
    BatchRestoreBody,
    DestinationFoldersQuery,
    EmptyQuery,
    ItemParams,
    ListQuery,
    PurgeBody,
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

type RecycleBinListRow = {
    itemType: RecycleItemType;
    id: string;
    name: string;
    deletedAt: Date;
    parentFolderId: string | null;
    fileSize: number | null;
    requiresDestination: boolean;
};

type PurgeSummary = {
    purgedFiles: number;
    purgedFolders: number;
};

type RunPurgeExpiredResult = PurgeSummary & {
    olderThanDays: number;
    skipped: boolean;
};

type BatchItemOutcome = "SUCCESS" | "FAILED" | "SKIPPED";
type BatchOperationStatus = "success" | "partial_success" | "failed";

type BatchOperationSummary = {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
};

type RestoreItemResult = {
    itemType: RecycleItemType;
    itemId: string;
    outcome: BatchItemOutcome;
    message: string;
    code?: string;
    parentFolderId?: string | null;
    restoredCount?: number;
};

type PermanentlyDeleteItemResult = {
    itemType: RecycleItemType;
    itemId: string;
    outcome: BatchItemOutcome;
    message: string;
    code?: string;
    purgedFiles?: number;
    purgedFolders?: number;
};

type RestoreItemResultWithStatus = RestoreItemResult & {
    statusCode: number;
};

type PermanentlyDeleteItemResultWithStatus = PermanentlyDeleteItemResult & {
    statusCode: number;
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

const dedupeIds = (ids: string[] | undefined) => {
    return Array.from(new Set(ids ?? []));
};

const summarizeBatchResults = <T extends { outcome: BatchItemOutcome }>(results: T[]): BatchOperationSummary => {
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const result of results) {
        if (result.outcome === "SUCCESS") {
            succeeded += 1;
            continue;
        }

        if (result.outcome === "FAILED") {
            failed += 1;
            continue;
        }

        skipped += 1;
    }

    return {
        total: results.length,
        succeeded,
        failed,
        skipped,
    };
};

const resolveBatchStatus = (summary: BatchOperationSummary): BatchOperationStatus => {
    if (summary.failed === 0) {
        return "success";
    }

    if (summary.succeeded === 0 && summary.skipped === 0) {
        return "failed";
    }

    return "partial_success";
};

const buildBatchMessage = (operationLabel: string, status: BatchOperationStatus, summary: BatchOperationSummary) => {
    if (status === "success") {
        return `${operationLabel} completed successfully`;
    }

    if (status === "failed") {
        return `${operationLabel} failed`;
    }

    return `${operationLabel} completed with partial success (${summary.failed} failed)`;
};

const parsePgBoolean = (value: unknown) => {
    if (value === true || value === "t" || value === "true" || value === 1 || value === "1") {
        return true;
    }

    return false;
};

const parsePgInteger = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.trunc(value);
    }

    if (typeof value === "bigint") {
        return Number(value);
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.trunc(parsed);
        }
    }

    return 0;
};

const parseNullablePgInteger = (value: unknown): number | null => {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.trunc(value);
    }

    if (typeof value === "bigint") {
        return Number(value);
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.trunc(parsed);
        }
    }

    return null;
};

const parsePgTimestamp = (value: unknown) => {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    throw new Error("Unexpected timestamp value returned by recycle-bin query");
};

const topLevelDeletedFoldersSql = (ownerId: string) => sql`
    select
        'FOLDER'::text as "itemType",
        folder_row."id" as "id",
        folder_row."folderName" as "name",
        folder_row."deletedAt" as "deletedAt",
        folder_row."parentFolderId" as "parentFolderId",
        null::bigint as "fileSize",
        case
            when folder_row."parentFolderId" is null then false
            when parent_folder."id" is null then true
            when parent_folder."deletedAt" is not null then true
            else false
        end as "requiresDestination"
    from "Folders" as folder_row
    left join "Folders" as parent_folder
        on parent_folder."id" = folder_row."parentFolderId"
        and parent_folder."ownerId" = folder_row."ownerId"
    where
        folder_row."ownerId" = ${ownerId}
        and folder_row."deletedAt" is not null
        and not exists (
            select 1
            from "Folders" as deleted_parent
            where
                deleted_parent."ownerId" = folder_row."ownerId"
                and deleted_parent."id" = folder_row."parentFolderId"
                and deleted_parent."deletedAt" is not null
        )
`;

const topLevelDeletedFilesSql = (ownerId: string) => sql`
    select
        'FILE'::text as "itemType",
        file_row."id" as "id",
        file_row."fileName" as "name",
        file_row."deletedAt" as "deletedAt",
        file_row."parentId" as "parentFolderId",
        file_row."fileSize" as "fileSize",
        case
            when parent_folder."id" is null then true
            when parent_folder."deletedAt" is not null then true
            else false
        end as "requiresDestination"
    from "Files" as file_row
    left join "Folders" as parent_folder
        on parent_folder."id" = file_row."parentId"
        and parent_folder."ownerId" = file_row."ownerId"
    where
        file_row."ownerId" = ${ownerId}
        and file_row."deletedAt" is not null
        and not exists (
            select 1
            from "Folders" as deleted_parent
            where
                deleted_parent."ownerId" = file_row."ownerId"
                and deleted_parent."id" = file_row."parentId"
                and deleted_parent."deletedAt" is not null
        )
`;

const buildTopLevelDeletedItemsSql = (ownerId: string, itemType?: RecycleItemType) => {
    if (itemType === "FILE") {
        return topLevelDeletedFilesSql(ownerId);
    }

    if (itemType === "FOLDER") {
        return topLevelDeletedFoldersSql(ownerId);
    }

    return sql`${topLevelDeletedFoldersSql(ownerId)} union all ${topLevelDeletedFilesSql(ownerId)}`;
};

const listRecycleBinRowsPaged = async (
    server: FastifyInstance,
    ownerId: string,
    limit: number,
    offset: number,
    itemType?: RecycleItemType,
) => {
    const topLevelItemsSql = buildTopLevelDeletedItemsSql(ownerId, itemType);

    const totalResult = (await server.db.execute(sql`
        with top_level_items as (${topLevelItemsSql})
        select count(*)::int as "total"
        from top_level_items
    `)) as { rows?: Array<{ total?: unknown }> };

    const total = parsePgInteger(totalResult.rows?.[0]?.total);

    const pagedResult = (await server.db.execute(sql`
        with top_level_items as (${topLevelItemsSql})
        select
            "itemType",
            "id",
            "name",
            "deletedAt",
            "parentFolderId",
            "fileSize",
            "requiresDestination"
        from top_level_items
        order by "deletedAt" desc, "id" desc
        limit ${limit}
        offset ${offset}
    `)) as {
        rows?: Array<{
            itemType?: unknown;
            id?: unknown;
            name?: unknown;
            deletedAt?: unknown;
            parentFolderId?: unknown;
            fileSize?: unknown;
            requiresDestination?: unknown;
        }>;
    };

    const items: RecycleBinListRow[] = [];

    for (const row of pagedResult.rows ?? []) {
        if (row.itemType !== "FILE" && row.itemType !== "FOLDER") {
            throw new Error("Unexpected itemType returned by recycle-bin query");
        }

        if (typeof row.id !== "string" || typeof row.name !== "string") {
            throw new Error("Unexpected row shape returned by recycle-bin query");
        }

        items.push({
            itemType: row.itemType,
            id: row.id,
            name: row.name,
            deletedAt: parsePgTimestamp(row.deletedAt),
            parentFolderId: typeof row.parentFolderId === "string" ? row.parentFolderId : null,
            fileSize: row.itemType === "FILE" ? parseNullablePgInteger(row.fileSize) : null,
            requiresDestination: parsePgBoolean(row.requiresDestination),
        });
    }

    return {
        total,
        items,
    };
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
        .select({ id: folders.id, folderPath: folders.folderPath })
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
            parentFolderPath: destinationFolder.folderPath,
        } as const;
    }

    if (!originalParentFolderId) {
        return {
            parentFolderId: null,
            parentFolderPath: null,
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
        parentFolderPath: originalParent.folderPath,
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

    const pagedResult = await listRecycleBinRowsPaged(this, userId, limit, offset, request.query.itemType);

    return reply.code(200).send({
        items: pagedResult.items.map((item) => ({
            itemType: item.itemType,
            id: item.id,
            name: item.name,
            deletedAt: toIso(item.deletedAt),
            purgeAt: toIso(getPurgeAt(item.deletedAt)),
            parentFolderId: item.parentFolderId,
            fileSize: item.itemType === "FILE" ? item.fileSize : undefined,
            requiresDestination: item.requiresDestination,
        })),
        total: pagedResult.total,
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

const restoreRecycleItem = async (
    server: FastifyInstance,
    ownerId: string,
    itemType: RecycleItemType,
    itemId: string,
    destinationFolderId?: string,
): Promise<RestoreItemResultWithStatus> => {
    if (itemType === "FILE") {
        const [file] = await server.db
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
            return {
                statusCode: 404,
                itemType,
                itemId,
                outcome: "SKIPPED",
                message: "Deleted file not found",
                code: "FILE_NOT_FOUND",
            };
        }

        if (file.ownerId !== ownerId) {
            return {
                statusCode: 403,
                itemType,
                itemId,
                outcome: "FAILED",
                message: "You do not have permission to restore this file",
                code: "FORBIDDEN_FILE",
            };
        }

        const restoreParentResolution = await resolveRestoreParentFolder(
            server,
            ownerId,
            file.parentId,
            destinationFolderId,
        );

        if ("error" in restoreParentResolution) {
            return {
                statusCode: restoreParentResolution.error.status,
                itemType,
                itemId,
                outcome: "FAILED",
                message: restoreParentResolution.error.message,
                code:
                    restoreParentResolution.error.status === 400
                        ? "DESTINATION_FOLDER_INVALID"
                        : "DESTINATION_FOLDER_REQUIRED",
            };
        }

        const parentFolderId = restoreParentResolution.parentFolderId;
        if (!parentFolderId) {
            return {
                statusCode: 409,
                itemType,
                itemId,
                outcome: "FAILED",
                message: "A destination folder is required to restore this file",
                code: "DESTINATION_FOLDER_REQUIRED",
            };
        }

        await server.db.update(files).set({ deletedAt: null, parentId: parentFolderId }).where(eq(files.id, itemId));

        return {
            statusCode: 200,
            itemType,
            itemId,
            outcome: "SUCCESS",
            message: "File restored successfully",
            parentFolderId,
            restoredCount: 1,
        };
    }

    const [folder] = await server.db
        .select({
            id: folders.id,
            ownerId: folders.ownerId,
            type: folders.type,
            parentFolderId: folders.parentFolderId,
            folderPath: folders.folderPath,
            deletedAt: folders.deletedAt,
        })
        .from(folders)
        .where(eq(folders.id, itemId))
        .limit(1);

    if (!folder || folder.deletedAt === null) {
        return {
            statusCode: 404,
            itemType,
            itemId,
            outcome: "SKIPPED",
            message: "Deleted folder not found",
            code: "FOLDER_NOT_FOUND",
        };
    }
    const folderDeletedAt = folder.deletedAt;

    if (folder.ownerId !== ownerId) {
        return {
            statusCode: 403,
            itemType,
            itemId,
            outcome: "FAILED",
            message: "You do not have permission to restore this folder",
            code: "FORBIDDEN_FOLDER",
        };
    }

    if (folder.type === "ROOT") {
        return {
            statusCode: 400,
            itemType,
            itemId,
            outcome: "FAILED",
            message: "Root folder cannot be restored",
            code: "ROOT_FOLDER_NOT_RESTORABLE",
        };
    }

    const subtreeFolderIds = await collectFolderSubtreeIds(server, ownerId, itemId);

    const restoreParentResolution = await resolveRestoreParentFolder(
        server,
        ownerId,
        folder.parentFolderId,
        destinationFolderId,
    );

    if ("error" in restoreParentResolution) {
        return {
            statusCode: restoreParentResolution.error.status,
            itemType,
            itemId,
            outcome: "FAILED",
            message: restoreParentResolution.error.message,
            code:
                restoreParentResolution.error.status === 400
                    ? "DESTINATION_FOLDER_INVALID"
                    : "DESTINATION_FOLDER_REQUIRED",
        };
    }

    const parentFolderId = restoreParentResolution.parentFolderId;
    const parentFolderPath = restoreParentResolution.parentFolderPath;

    if (!parentFolderId || !parentFolderPath) {
        return {
            statusCode: 409,
            itemType,
            itemId,
            outcome: "FAILED",
            message: "A destination folder is required to restore this folder",
            code: "DESTINATION_FOLDER_REQUIRED",
        };
    }

    if (subtreeFolderIds.includes(parentFolderId)) {
        return {
            statusCode: 400,
            itemType,
            itemId,
            outcome: "FAILED",
            message: "Folder cannot be restored into its own descendant",
            code: "DESTINATION_IS_DESCENDANT",
        };
    }

    const restoreCounts = await server.db.transaction(async (tx) => {
        const newFolderPath = `${parentFolderPath}/${itemId}`;
        if (folder.folderPath !== newFolderPath) {
            await tx.execute(sql`
                update "Folders"
                set "folderPath" = ${newFolderPath} || substring("folderPath" from ${folder.folderPath.length + 1})
                where "ownerId" = ${ownerId}
                  and ("folderPath" = ${folder.folderPath} or "folderPath" like ${`${folder.folderPath}/%`})
            `);
        }

        if (folder.parentFolderId !== parentFolderId) {
            await tx.update(folders).set({ parentFolderId }).where(eq(folders.id, itemId));
        }

        const restoredFiles = await tx
            .update(files)
            .set({ deletedAt: null })
            .where(
                and(
                    eq(files.ownerId, ownerId),
                    inArray(files.parentId, subtreeFolderIds),
                    eq(files.deletedAt, folderDeletedAt),
                ),
            )
            .returning({ id: files.id });

        const restoredFolders = await tx
            .update(folders)
            .set({ deletedAt: null })
            .where(
                and(
                    eq(folders.ownerId, ownerId),
                    inArray(folders.id, subtreeFolderIds),
                    eq(folders.deletedAt, folderDeletedAt),
                ),
            )
            .returning({ id: folders.id });

        return {
            restoredFiles: restoredFiles.length,
            restoredFolders: restoredFolders.length,
        };
    });

    return {
        statusCode: 200,
        itemType,
        itemId,
        outcome: "SUCCESS",
        message: "Folder restored successfully",
        parentFolderId,
        restoredCount: restoreCounts.restoredFiles + restoreCounts.restoredFolders,
    };
};

const permanentlyDeleteRecycleItem = async (
    server: FastifyInstance,
    ownerId: string,
    itemType: RecycleItemType,
    itemId: string,
): Promise<PermanentlyDeleteItemResultWithStatus> => {
    if (itemType === "FILE") {
        const [file] = await server.db
            .select({ id: files.id, ownerId: files.ownerId, deletedAt: files.deletedAt })
            .from(files)
            .where(eq(files.id, itemId))
            .limit(1);

        if (!file || file.deletedAt === null) {
            return {
                statusCode: 404,
                itemType,
                itemId,
                outcome: "SKIPPED",
                message: "Deleted file not found",
                code: "FILE_NOT_FOUND",
                purgedFiles: 0,
                purgedFolders: 0,
            };
        }

        if (file.ownerId !== ownerId) {
            return {
                statusCode: 403,
                itemType,
                itemId,
                outcome: "FAILED",
                message: "You do not have permission to permanently delete this file",
                code: "FORBIDDEN_FILE",
                purgedFiles: 0,
                purgedFolders: 0,
            };
        }

        const purgedFiles = await hardDeleteFilesByRows(server, [{ id: file.id, ownerId: file.ownerId }]);

        return {
            statusCode: 200,
            itemType,
            itemId,
            outcome: "SUCCESS",
            message: "File permanently deleted",
            purgedFiles,
            purgedFolders: 0,
        };
    }

    const [folder] = await server.db
        .select({ id: folders.id, ownerId: folders.ownerId, deletedAt: folders.deletedAt })
        .from(folders)
        .where(eq(folders.id, itemId))
        .limit(1);

    if (!folder || folder.deletedAt === null) {
        return {
            statusCode: 404,
            itemType,
            itemId,
            outcome: "SKIPPED",
            message: "Deleted folder not found",
            code: "FOLDER_NOT_FOUND",
            purgedFiles: 0,
            purgedFolders: 0,
        };
    }

    if (folder.ownerId !== ownerId) {
        return {
            statusCode: 403,
            itemType,
            itemId,
            outcome: "FAILED",
            message: "You do not have permission to permanently delete this folder",
            code: "FORBIDDEN_FOLDER",
            purgedFiles: 0,
            purgedFolders: 0,
        };
    }

    let summary: PurgeSummary | null;
    try {
        summary = await permanentlyDeleteFolderSubtree(server, ownerId, itemId);
    } catch (error) {
        if (error instanceof Error && error.message === "ACTIVE_DESCENDANTS_PRESENT") {
            return {
                statusCode: 409,
                itemType,
                itemId,
                outcome: "FAILED",
                message: "Folder contains active descendants and cannot be permanently deleted",
                code: "ACTIVE_DESCENDANTS_PRESENT",
                purgedFiles: 0,
                purgedFolders: 0,
            };
        }

        throw error;
    }

    if (!summary) {
        return {
            statusCode: 404,
            itemType,
            itemId,
            outcome: "SKIPPED",
            message: "Deleted folder not found",
            code: "FOLDER_NOT_FOUND",
            purgedFiles: 0,
            purgedFolders: 0,
        };
    }

    return {
        statusCode: 200,
        itemType,
        itemId,
        outcome: "SUCCESS",
        message: "Folder permanently deleted",
        purgedFiles: summary.purgedFiles,
        purgedFolders: summary.purgedFolders,
    };
};

export async function restoreHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: ItemParams; Body: RestoreBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { itemType, itemId } = request.params;
    const restoreResult = await restoreRecycleItem(this, userId, itemType, itemId, request.body.destinationFolderId);

    if (restoreResult.outcome !== "SUCCESS") {
        return reply.code(restoreResult.statusCode).send({ message: restoreResult.message });
    }

    return reply.code(200).send({
        status: "success",
        message: restoreResult.message,
        itemType: restoreResult.itemType,
        itemId: restoreResult.itemId,
        parentFolderId: restoreResult.parentFolderId ?? null,
        restoredCount: restoreResult.restoredCount,
    });
}

export async function batchRestoreHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: BatchRestoreBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderIds = dedupeIds(request.body.folderIds);
    const fileIds = dedupeIds(request.body.fileIds);
    const results: RestoreItemResult[] = [];

    for (const folderId of folderIds) {
        const restoreResult = await restoreRecycleItem(
            this,
            userId,
            "FOLDER",
            folderId,
            request.body.destinationFolderId,
        );
        results.push({
            itemType: restoreResult.itemType,
            itemId: restoreResult.itemId,
            outcome: restoreResult.outcome,
            message: restoreResult.message,
            ...(restoreResult.code !== undefined ? { code: restoreResult.code } : {}),
            ...(restoreResult.parentFolderId !== undefined ? { parentFolderId: restoreResult.parentFolderId } : {}),
            ...(restoreResult.restoredCount !== undefined ? { restoredCount: restoreResult.restoredCount } : {}),
        });
    }

    for (const fileId of fileIds) {
        const restoreResult = await restoreRecycleItem(this, userId, "FILE", fileId, request.body.destinationFolderId);
        results.push({
            itemType: restoreResult.itemType,
            itemId: restoreResult.itemId,
            outcome: restoreResult.outcome,
            message: restoreResult.message,
            ...(restoreResult.code !== undefined ? { code: restoreResult.code } : {}),
            ...(restoreResult.parentFolderId !== undefined ? { parentFolderId: restoreResult.parentFolderId } : {}),
            ...(restoreResult.restoredCount !== undefined ? { restoredCount: restoreResult.restoredCount } : {}),
        });
    }

    const summary = summarizeBatchResults(results);
    const status = resolveBatchStatus(summary);

    return reply.code(200).send({
        status,
        message: buildBatchMessage("Batch restore", status, summary),
        summary,
        results,
    });
}

export async function permanentlyDeleteHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: ItemParams }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const { itemType, itemId } = request.params;
    const deleteResult = await permanentlyDeleteRecycleItem(this, userId, itemType, itemId);

    if (deleteResult.outcome !== "SUCCESS") {
        return reply.code(deleteResult.statusCode).send({ message: deleteResult.message });
    }

    return reply.code(200).send({
        status: "success",
        message: deleteResult.message,
        itemType: deleteResult.itemType,
        itemId: deleteResult.itemId,
        purgedFiles: deleteResult.purgedFiles ?? 0,
        purgedFolders: deleteResult.purgedFolders ?? 0,
    });
}

export async function batchPermanentlyDeleteHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: BatchPermanentlyDeleteBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const folderIds = dedupeIds(request.body.folderIds);
    const fileIds = dedupeIds(request.body.fileIds);
    const results: PermanentlyDeleteItemResult[] = [];

    for (const folderId of folderIds) {
        const deleteResult = await permanentlyDeleteRecycleItem(this, userId, "FOLDER", folderId);
        results.push({
            itemType: deleteResult.itemType,
            itemId: deleteResult.itemId,
            outcome: deleteResult.outcome,
            message: deleteResult.message,
            ...(deleteResult.code !== undefined ? { code: deleteResult.code } : {}),
            ...(deleteResult.purgedFiles !== undefined ? { purgedFiles: deleteResult.purgedFiles } : {}),
            ...(deleteResult.purgedFolders !== undefined ? { purgedFolders: deleteResult.purgedFolders } : {}),
        });
    }

    for (const fileId of fileIds) {
        const deleteResult = await permanentlyDeleteRecycleItem(this, userId, "FILE", fileId);
        results.push({
            itemType: deleteResult.itemType,
            itemId: deleteResult.itemId,
            outcome: deleteResult.outcome,
            message: deleteResult.message,
            ...(deleteResult.code !== undefined ? { code: deleteResult.code } : {}),
            ...(deleteResult.purgedFiles !== undefined ? { purgedFiles: deleteResult.purgedFiles } : {}),
            ...(deleteResult.purgedFolders !== undefined ? { purgedFolders: deleteResult.purgedFolders } : {}),
        });
    }

    const summary = summarizeBatchResults(results);
    const status = resolveBatchStatus(summary);

    return reply.code(200).send({
        status,
        message: buildBatchMessage("Batch permanent delete", status, summary),
        summary,
        results,
    });
}

export async function emptyRecycleBinHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: EmptyQuery }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const itemType = request.query.itemType;

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
    request: FastifyRequest<{ Body: PurgeBody }>,
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
