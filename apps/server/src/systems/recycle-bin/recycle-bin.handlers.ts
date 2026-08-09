import fs from "fs";
import path from "path";

import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { files, folders, users } from "@/db/schema";
import { env } from "@/env/env";
import {
    tryWithOwnerHierarchyLock,
    withOwnerHierarchyLock,
    type OwnerHierarchyTransaction,
} from "@/utils/owner-hierarchy-lock";

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

type OwnerPurgeSummary = PurgeSummary & {
    failed: boolean;
};

type RunPurgeExpiredResult = PurgeSummary & {
    failedOwners: number;
    olderThanDays: number;
    skipped: boolean;
};

type BatchItemOutcome = "SUCCESS" | "FAILED" | "SKIPPED";
type BatchOperationStatus = "success" | "failed";

type BatchOperationSummary = {
    total: number;
    succeeded: number;
    failed: number;
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

const buildFolderPath = (parentPath: string, folderId: string) => {
    const normalizedParent = parentPath.endsWith("/") ? parentPath.slice(0, -1) : parentPath;
    return `${normalizedParent}/${folderId}`;
};

const isFolderPathInSubtree = (folderPath: string, rootPath: string) => {
    return folderPath === rootPath || folderPath.startsWith(`${rootPath}/`);
};

const buildBatchSummary = (total: number, succeeded: number): BatchOperationSummary => {
    return {
        total,
        succeeded,
        failed: Math.max(total - succeeded, 0),
    };
};

const resolveBatchStatus = (summary: BatchOperationSummary): BatchOperationStatus => {
    return summary.failed === 0 ? "success" : "failed";
};

const isActiveDescendantsError = (error: unknown) =>
    error instanceof Error && error.message === "ACTIVE_DESCENDANTS_PRESENT";

const buildBatchMessage = (operationLabel: string, status: BatchOperationStatus) => {
    if (status === "success") {
        return `${operationLabel} completed successfully`;
    }

    return `${operationLabel} completed with failures`;
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
            when folder_row."parentFolderId" is null then true
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

const collectFolderSubtreeIds = async (db: OwnerHierarchyTransaction, ownerId: string, rootFolderId: string) => {
    const visited = new Set<string>([rootFolderId]);
    let frontier = [rootFolderId];

    while (frontier.length > 0) {
        const children = await db
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

const unlinkFileRows = async (fileRows: Array<{ id: string; ownerId: string }>) => {
    if (fileRows.length === 0) {
        return;
    }

    const workerCount = Math.min(32, fileRows.length);
    let cursor = 0;

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (true) {
                const rowIndex = cursor;
                cursor += 1;
                const fileRow = fileRows[rowIndex];
                if (!fileRow) {
                    return;
                }

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
        }),
    );
};

const hardDeleteFilesByRows = async (
    db: OwnerHierarchyTransaction,
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

    let purgedFiles = 0;
    const dedupedIds = Array.from(deduped.keys()).sort((left, right) => left.localeCompare(right));
    for (const idChunk of chunk(dedupedIds, 500)) {
        const idValuesSql = sql.join(
            idChunk.map((id) => sql`${id}`),
            sql`, `,
        );
        const lockedRowsResult = (await db.execute(sql`
                select file_row."id" as "id", file_row."ownerId" as "ownerId"
                from "Files" as file_row
                where file_row."id" in (${idValuesSql})
                  and file_row."deletedAt" is not null
                order by file_row."id"
                for update
            `)) as {
            rows?: Array<{
                id?: unknown;
                ownerId?: unknown;
            }>;
        };

        const lockedRows: Array<{ id: string; ownerId: string }> = [];
        for (const row of lockedRowsResult.rows ?? []) {
            if (typeof row.id !== "string" || typeof row.ownerId !== "string") {
                continue;
            }
            lockedRows.push({ id: row.id, ownerId: row.ownerId });
        }

        if (lockedRows.length === 0) {
            continue;
        }

        await unlinkFileRows(lockedRows);

        const deletedRows = await db
            .delete(files)
            .where(
                and(
                    inArray(
                        files.id,
                        lockedRows.map((row) => row.id),
                    ),
                    isNotNull(files.deletedAt),
                ),
            )
            .returning({
                id: files.id,
            });

        purgedFiles += deletedRows.length;
    }

    return purgedFiles;
};

const hardDeleteFolderSubtreeFiles = async (
    db: OwnerHierarchyTransaction,
    ownerId: string,
    rootFolderIds: string[],
): Promise<number> => {
    let purgedFiles = 0;
    const rootValuesSql = sql.join(
        rootFolderIds.map((id) => sql`(${id})`),
        sql`, `,
    );

    while (true) {
        const fileBatchResult = (await db.execute(sql`
            with recursive root_ids ("id") as (
                values ${rootValuesSql}
            ),
            subtree ("id") as (
                select "id"
                from root_ids
                union
                select child_folder."id"
                from "Folders" as child_folder
                inner join subtree on child_folder."parentFolderId" = subtree."id"
                where child_folder."ownerId" = ${ownerId}
            )
            select file_row."id" as "id", file_row."ownerId" as "ownerId"
            from "Files" as file_row
            where file_row."ownerId" = ${ownerId}
              and file_row."deletedAt" is not null
              and file_row."parentId" in (select "id" from subtree)
            order by file_row."id"
            limit 500
        `)) as {
            rows?: Array<{
                id?: unknown;
                ownerId?: unknown;
            }>;
        };
        const fileBatch: Array<{ id: string; ownerId: string }> = [];
        for (const row of fileBatchResult.rows ?? []) {
            if (typeof row.id !== "string" || typeof row.ownerId !== "string") {
                throw new Error("Unexpected file row returned by recycle-bin purge query");
            }
            fileBatch.push({ id: row.id, ownerId: row.ownerId });
        }

        if (fileBatch.length === 0) {
            return purgedFiles;
        }

        purgedFiles += await hardDeleteFilesByRows(db, fileBatch);
    }
};

const getTopLevelDeletedRowsForOwner = async (
    db: OwnerHierarchyTransaction,
    ownerId: string,
    options: {
        threshold?: Date | undefined;
        itemType?: RecycleItemType | undefined;
    } = {},
) => {
    const allDeletedFolders = await db
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
    const deletedFolderMap = new Map(normalizedFolders.map((folder) => [folder.id, folder]));

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

    if (options.itemType !== "FILE") {
        const visitedFolderIds = new Set<string>();

        for (const folder of normalizedFolders) {
            if (visitedFolderIds.has(folder.id)) {
                continue;
            }

            const path: DeletedFolderRow[] = [];
            const pathIndexes = new Map<string, number>();
            let current: DeletedFolderRow | undefined = folder;

            while (current && !visitedFolderIds.has(current.id)) {
                const cycleStart = pathIndexes.get(current.id);
                if (cycleStart !== undefined) {
                    const cycle = path.slice(cycleStart);
                    const threshold = options.threshold;
                    const cycleIsEligible = threshold
                        ? cycle.every((cycleFolder) => cycleFolder.deletedAt <= threshold)
                        : true;

                    if (cycleIsEligible) {
                        const cycleRoot = cycle.reduce((currentRoot, cycleFolder) =>
                            cycleFolder.id < currentRoot.id ? cycleFolder : currentRoot,
                        );
                        topLevelDeletedFolders.push(cycleRoot);
                    }
                    break;
                }

                pathIndexes.set(current.id, path.length);
                path.push(current);
                current = current.parentFolderId ? deletedFolderMap.get(current.parentFolderId) : undefined;
            }

            for (const pathFolder of path) {
                visitedFolderIds.add(pathFolder.id);
            }
        }
    }

    const deletedFiles =
        options.itemType === "FOLDER"
            ? []
            : await db
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
    db: OwnerHierarchyTransaction,
    ownerId: string,
    rootFolderId: string,
): Promise<PurgeSummary | null> => {
    const [rootFolder] = await db
        .select({ id: folders.id, ownerId: folders.ownerId, deletedAt: folders.deletedAt })
        .from(folders)
        .where(and(eq(folders.id, rootFolderId), eq(folders.ownerId, ownerId)))
        .limit(1);

    if (!rootFolder || rootFolder.deletedAt === null) {
        return null;
    }

    const activeCountsResult = (await db.execute(sql`
        with recursive subtree ("id") as (
            values (${rootFolderId})
            union
            select child_folder."id"
            from "Folders" as child_folder
            inner join subtree on child_folder."parentFolderId" = subtree."id"
            where child_folder."ownerId" = ${ownerId}
        )
        select
            (
                select count(*)::int
                from "Folders" as folder_row
                where folder_row."ownerId" = ${ownerId}
                  and folder_row."deletedAt" is null
                  and folder_row."id" in (select "id" from subtree)
            ) as "activeFolderCount",
            (
                select count(*)::int
                from "Files" as file_row
                where file_row."ownerId" = ${ownerId}
                  and file_row."deletedAt" is null
                  and file_row."parentId" in (select "id" from subtree)
            ) as "activeFileCount"
    `)) as {
        rows?: Array<{
            activeFolderCount?: unknown;
            activeFileCount?: unknown;
        }>;
    };
    const activeCounts = activeCountsResult.rows?.[0];

    if (parsePgInteger(activeCounts?.activeFolderCount) > 0 || parsePgInteger(activeCounts?.activeFileCount) > 0) {
        throw new Error("ACTIVE_DESCENDANTS_PRESENT");
    }

    const purgedFiles = await hardDeleteFolderSubtreeFiles(db, ownerId, [rootFolderId]);

    const deletedFoldersResult = (await db.execute(sql`
        with recursive subtree ("id") as (
            values (${rootFolderId})
            union
            select child_folder."id"
            from "Folders" as child_folder
            inner join subtree on child_folder."parentFolderId" = subtree."id"
            where child_folder."ownerId" = ${ownerId}
        ),
        target_folders ("id") as materialized (
            select folder_row."id"
            from "Folders" as folder_row
            where folder_row."ownerId" = ${ownerId}
              and folder_row."deletedAt" is not null
              and folder_row."id" in (select "id" from subtree)
            for update of folder_row
        ),
        deleted_folders as (
            delete from "Folders" as folder_row
            using target_folders
            where folder_row."id" = target_folders."id"
              and folder_row."ownerId" = ${ownerId}
              and folder_row."deletedAt" is not null
            returning folder_row."id"
        )
        select count(*)::int as "purgedFolders"
        from target_folders
    `)) as { rows?: Array<{ purgedFolders?: unknown }> };
    const purgedFolders = parsePgInteger(deletedFoldersResult.rows?.[0]?.purgedFolders);

    return {
        purgedFiles,
        purgedFolders,
    };
};

const getActiveDestinationFolder = async (db: OwnerHierarchyTransaction, ownerId: string, folderId: string) => {
    const [destinationFolder] = await db
        .select({ id: folders.id, folderPath: folders.folderPath })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.ownerId, ownerId), isNull(folders.deletedAt)))
        .limit(1);

    return destinationFolder;
};

const resolveRestoreParentFolder = async (
    db: OwnerHierarchyTransaction,
    ownerId: string,
    originalParentFolderId: string | null,
    requestedDestinationFolderId?: string,
) => {
    if (requestedDestinationFolderId) {
        const destinationFolder = await getActiveDestinationFolder(db, ownerId, requestedDestinationFolderId);
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

    const originalParent = await getActiveDestinationFolder(db, ownerId, originalParentFolderId);
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

const purgeDeletedRowsForOwner = async (
    db: OwnerHierarchyTransaction,
    ownerId: string,
    threshold?: Date,
): Promise<OwnerPurgeSummary> => {
    const { topLevelDeletedFiles, topLevelDeletedFolders } = await getTopLevelDeletedRowsForOwner(db, ownerId, {
        threshold,
    });

    const purgedFilesFromTopLevelFiles = await hardDeleteFilesByRows(
        db,
        topLevelDeletedFiles.map((file) => ({ id: file.id, ownerId })),
    );

    let purgedFilesFromFolders = 0;
    let purgedFolders = 0;
    let failed = false;

    for (const folderRow of topLevelDeletedFolders) {
        try {
            const folderSummary = await permanentlyDeleteFolderSubtree(db, ownerId, folderRow.id);
            if (!folderSummary) {
                continue;
            }

            purgedFilesFromFolders += folderSummary.purgedFiles;
            purgedFolders += folderSummary.purgedFolders;
        } catch (error) {
            if (!isActiveDescendantsError(error)) {
                throw error;
            }
            failed = true;
        }
    }

    return {
        failed,
        purgedFiles: purgedFilesFromTopLevelFiles + purgedFilesFromFolders,
        purgedFolders,
    };
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
        let failedOwners = 0;

        for (const ownerId of ownerIds) {
            const ownerLockResult = await tryWithOwnerHierarchyLock(server, ownerId, (tx) =>
                purgeDeletedRowsForOwner(tx, ownerId, threshold),
            );
            if (!ownerLockResult.locked) {
                failedOwners += 1;
                continue;
            }

            const ownerSummary = ownerLockResult.result;
            summary = {
                purgedFiles: summary.purgedFiles + ownerSummary.purgedFiles,
                purgedFolders: summary.purgedFolders + ownerSummary.purgedFolders,
            };
            if (ownerSummary.failed) {
                failedOwners += 1;
            }
        }

        return { ...summary, failedOwners };
    });

    if (!lockResult.locked || !lockResult.result) {
        return {
            olderThanDays: retentionDays,
            failedOwners: 0,
            purgedFiles: 0,
            purgedFolders: 0,
            skipped: true,
        };
    }

    return {
        olderThanDays: retentionDays,
        failedOwners: lockResult.result.failedOwners,
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
    db: OwnerHierarchyTransaction,
    ownerId: string,
    itemType: RecycleItemType,
    itemId: string,
    destinationFolderId?: string,
): Promise<RestoreItemResultWithStatus> => {
    if (itemType === "FILE") {
        const [file] = await db
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
            db,
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

        await db.update(files).set({ deletedAt: null, parentId: parentFolderId }).where(eq(files.id, itemId));

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

    const [folder] = await db
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

    const subtreeFolderIds = await collectFolderSubtreeIds(db, ownerId, itemId);

    const restoreParentResolution = await resolveRestoreParentFolder(
        db,
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

    const restoreCounts = await db.transaction(async (tx) => {
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
    db: OwnerHierarchyTransaction,
    ownerId: string,
    itemType: RecycleItemType,
    itemId: string,
): Promise<PermanentlyDeleteItemResultWithStatus> => {
    if (itemType === "FILE") {
        const [file] = await db
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

        const purgedFiles = await hardDeleteFilesByRows(db, [{ id: file.id, ownerId: file.ownerId }]);

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

    const [folder] = await db
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
        summary = await permanentlyDeleteFolderSubtree(db, ownerId, itemId);
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
    const restoreResult = await withOwnerHierarchyLock(this, userId, (tx) =>
        restoreRecycleItem(tx, userId, itemType, itemId, request.body.destinationFolderId),
    );

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

    const result = await withOwnerHierarchyLock(this, userId, async (ownerTx) => {
        const folderIds = dedupeIds(request.body.folderIds);
        const fileIds = dedupeIds(request.body.fileIds);
        const destinationFolderId = request.body.destinationFolderId;
        const total = folderIds.length + fileIds.length;

        let fixedDestination: { id: string; folderPath: string } | undefined;
        if (destinationFolderId) {
            fixedDestination = await getActiveDestinationFolder(ownerTx, userId, destinationFolderId);
            if (!fixedDestination) {
                const summary = buildBatchSummary(total, 0);
                const status = resolveBatchStatus(summary);
                return {
                    statusCode: 200,
                    body: {
                        status,
                        message: "Destination folder not found or unavailable",
                        summary,
                    },
                };
            }
        }

        const requestedFolders: Array<{
            id: string;
            ownerId: string;
            type: "ROOT" | "STANDARD";
            parentFolderId: string | null;
            folderPath: string;
            deletedAt: Date | null;
        }> = [];
        for (const idChunk of chunk(folderIds, 500)) {
            const rows = await ownerTx
                .select({
                    id: folders.id,
                    ownerId: folders.ownerId,
                    type: folders.type,
                    parentFolderId: folders.parentFolderId,
                    folderPath: folders.folderPath,
                    deletedAt: folders.deletedAt,
                })
                .from(folders)
                .where(inArray(folders.id, idChunk));
            requestedFolders.push(...rows);
        }

        const requestedFiles: Array<{
            id: string;
            ownerId: string;
            parentId: string;
            deletedAt: Date | null;
        }> = [];
        for (const idChunk of chunk(fileIds, 500)) {
            const rows = await ownerTx
                .select({
                    id: files.id,
                    ownerId: files.ownerId,
                    parentId: files.parentId,
                    deletedAt: files.deletedAt,
                })
                .from(files)
                .where(inArray(files.id, idChunk));
            requestedFiles.push(...rows);
        }

        const selectedRestorableFolders = requestedFolders.filter((folder) => {
            if (folder.ownerId !== userId) {
                return false;
            }
            if (folder.deletedAt === null) {
                return false;
            }
            if (folder.type === "ROOT") {
                return false;
            }
            if (fixedDestination && isFolderPathInSubtree(fixedDestination.folderPath, folder.folderPath)) {
                return false;
            }
            return true;
        });

        const selectedRestorableFolderMap = new Map(selectedRestorableFolders.map((folder) => [folder.id, folder]));
        const restorableFolderIds = new Set<string>();

        if (fixedDestination) {
            for (const folder of selectedRestorableFolders) {
                restorableFolderIds.add(folder.id);
            }
        } else {
            const externalParentIds = new Set<string>();
            for (const folder of selectedRestorableFolders) {
                if (folder.parentFolderId && !selectedRestorableFolderMap.has(folder.parentFolderId)) {
                    externalParentIds.add(folder.parentFolderId);
                }
            }

            const externalActiveParents =
                externalParentIds.size === 0
                    ? []
                    : await ownerTx
                          .select({
                              id: folders.id,
                          })
                          .from(folders)
                          .where(
                              and(
                                  eq(folders.ownerId, userId),
                                  isNull(folders.deletedAt),
                                  inArray(folders.id, Array.from(externalParentIds)),
                              ),
                          );
            const externalActiveParentSet = new Set(externalActiveParents.map((row) => row.id));

            let changed = true;
            while (changed) {
                changed = false;
                for (const folder of selectedRestorableFolders) {
                    if (restorableFolderIds.has(folder.id)) {
                        continue;
                    }
                    if (!folder.parentFolderId) {
                        continue;
                    }
                    if (
                        externalActiveParentSet.has(folder.parentFolderId) ||
                        restorableFolderIds.has(folder.parentFolderId)
                    ) {
                        restorableFolderIds.add(folder.id);
                        changed = true;
                    }
                }
            }
        }

        const restorableFolders = selectedRestorableFolders.filter((folder) => restorableFolderIds.has(folder.id));
        const sortedRestorableFolders = [...restorableFolders].sort((left, right) => {
            if (left.folderPath.length === right.folderPath.length) {
                return left.folderPath.localeCompare(right.folderPath);
            }
            return left.folderPath.length - right.folderPath.length;
        });

        const restoreRoots: Array<{
            id: string;
            oldPath: string;
            newPath: string;
            newParentId: string;
            rootDeletedAt: Date;
        }> = [];
        for (const folder of sortedRestorableFolders) {
            const newParentId = fixedDestination?.id ?? folder.parentFolderId;
            if (!newParentId || folder.deletedAt === null) {
                continue;
            }

            restoreRoots.push({
                id: folder.id,
                oldPath: folder.folderPath,
                newPath: fixedDestination ? buildFolderPath(fixedDestination.folderPath, folder.id) : folder.folderPath,
                newParentId,
                rootDeletedAt: folder.deletedAt,
            });
        }

        const selectedRestorableFilesBase = requestedFiles.filter((fileRow) => {
            return fileRow.ownerId === userId && fileRow.deletedAt !== null;
        });
        const selectedRestorableFileIds = selectedRestorableFilesBase.map((fileRow) => fileRow.id);
        const selectedRestorableFolderIds = selectedRestorableFolders.map((folder) => folder.id);

        await ownerTx.transaction(async (tx) => {
            if (fixedDestination) {
                for (const fileChunk of chunk(selectedRestorableFileIds, 500)) {
                    const fileIdsSql = sql.join(
                        fileChunk.map((fileId) => sql`${fileId}`),
                        sql`, `,
                    );

                    await tx.execute(sql`
                    update "Files" as file_row
                    set "deletedAt" = null,
                        "parentId" = ${fixedDestination.id}
                    from "Folders" as destination_folder
                    where file_row."ownerId" = ${userId}
                      and file_row."id" in (${fileIdsSql})
                      and file_row."deletedAt" is not null
                      and destination_folder."id" = ${fixedDestination.id}
                      and destination_folder."ownerId" = ${userId}
                      and destination_folder."deletedAt" is null
                `);
                }
            }

            if (restoreRoots.length > 0) {
                for (const rootChunk of chunk(restoreRoots, 500)) {
                    const rootValuesSql = sql.join(
                        rootChunk.map(
                            (root) =>
                                sql`(${root.id}, ${root.oldPath}, ${root.newPath}, ${root.newParentId}, ${root.rootDeletedAt})`,
                        ),
                        sql`, `,
                    );

                    await tx.execute(sql`
                    with recursive root_input ("id", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        values ${rootValuesSql}
                    ),
                    validated_roots ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select
                            folder_row."id",
                            folder_row."id",
                            root_input."oldPath",
                            root_input."newPath",
                            root_input."newParentId",
                            root_input."rootDeletedAt"
                        from root_input
                        inner join "Folders" as folder_row on folder_row."id" = root_input."id"
                        where folder_row."ownerId" = ${userId}
                          and folder_row."deletedAt" = root_input."rootDeletedAt"
                          and folder_row."folderPath" = root_input."oldPath"
                    ),
                    selected_roots ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select
                            validated_roots."id",
                            validated_roots."rootId",
                            validated_roots."oldPath",
                            validated_roots."newPath",
                            validated_roots."newParentId",
                            validated_roots."rootDeletedAt"
                        from validated_roots
                        where ${
                            fixedDestination
                                ? sql`not exists (
                                select 1
                                from validated_roots as ancestor_root
                                where ancestor_root."id" <> validated_roots."id"
                                  and validated_roots."oldPath" like ancestor_root."oldPath" || '/%'
                            )`
                                : sql`true`
                        }
                    ),
                    active_parents ("id") as (
                        select parent_folder."id"
                        from "Folders" as parent_folder
                        where parent_folder."ownerId" = ${userId}
                          and parent_folder."deletedAt" is null
                    ),
                    root_updates ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select
                            validated_roots."id",
                            validated_roots."rootId",
                            validated_roots."oldPath",
                            validated_roots."newPath",
                            validated_roots."newParentId",
                            validated_roots."rootDeletedAt"
                        from selected_roots as validated_roots
                        where
                            validated_roots."newParentId" in (
                                select active_parent."id"
                                from active_parents as active_parent
                            )
                        union
                        select
                            child_root."id",
                            child_root."rootId",
                            child_root."oldPath",
                            child_root."newPath",
                            child_root."newParentId",
                            child_root."rootDeletedAt"
                        from selected_roots as child_root
                        inner join root_updates as restored_parent on child_root."newParentId" = restored_parent."id"
                    ),
                    subtree ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select "id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt"
                        from root_updates
                        union
                        select
                            child_folder."id",
                            subtree."rootId",
                            subtree."oldPath",
                            subtree."newPath",
                            subtree."newParentId",
                            subtree."rootDeletedAt"
                        from "Folders" as child_folder
                        inner join subtree on child_folder."parentFolderId" = subtree."id"
                        where child_folder."ownerId" = ${userId}
                    ),
                    winner ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select distinct on (subtree."id")
                            subtree."id",
                            subtree."rootId",
                            subtree."oldPath",
                            subtree."newPath",
                            subtree."newParentId",
                            subtree."rootDeletedAt"
                        from subtree
                        order by subtree."id", char_length(subtree."oldPath") desc, subtree."rootId"
                    )
                    update "Files" as file_row
                    set "deletedAt" = null
                    from winner
                    where file_row."ownerId" = ${userId}
                      and file_row."parentId" = winner."id"
                      and file_row."deletedAt" = winner."rootDeletedAt"
                `);

                    await tx.execute(sql`
                    with recursive root_input ("id", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        values ${rootValuesSql}
                    ),
                    validated_roots ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select
                            folder_row."id",
                            folder_row."id",
                            root_input."oldPath",
                            root_input."newPath",
                            root_input."newParentId",
                            root_input."rootDeletedAt"
                        from root_input
                        inner join "Folders" as folder_row on folder_row."id" = root_input."id"
                        where folder_row."ownerId" = ${userId}
                          and folder_row."deletedAt" = root_input."rootDeletedAt"
                          and folder_row."folderPath" = root_input."oldPath"
                    ),
                    selected_roots ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select
                            validated_roots."id",
                            validated_roots."rootId",
                            validated_roots."oldPath",
                            validated_roots."newPath",
                            validated_roots."newParentId",
                            validated_roots."rootDeletedAt"
                        from validated_roots
                        where ${
                            fixedDestination
                                ? sql`not exists (
                                select 1
                                from validated_roots as ancestor_root
                                where ancestor_root."id" <> validated_roots."id"
                                  and validated_roots."oldPath" like ancestor_root."oldPath" || '/%'
                            )`
                                : sql`true`
                        }
                    ),
                    active_parents ("id") as (
                        select parent_folder."id"
                        from "Folders" as parent_folder
                        where parent_folder."ownerId" = ${userId}
                          and parent_folder."deletedAt" is null
                    ),
                    root_updates ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select
                            validated_roots."id",
                            validated_roots."rootId",
                            validated_roots."oldPath",
                            validated_roots."newPath",
                            validated_roots."newParentId",
                            validated_roots."rootDeletedAt"
                        from selected_roots as validated_roots
                        where
                            validated_roots."newParentId" in (
                                select active_parent."id"
                                from active_parents as active_parent
                            )
                        union
                        select
                            child_root."id",
                            child_root."rootId",
                            child_root."oldPath",
                            child_root."newPath",
                            child_root."newParentId",
                            child_root."rootDeletedAt"
                        from selected_roots as child_root
                        inner join root_updates as restored_parent on child_root."newParentId" = restored_parent."id"
                    ),
                    subtree ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select "id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt"
                        from root_updates
                        union
                        select
                            child_folder."id",
                            subtree."rootId",
                            subtree."oldPath",
                            subtree."newPath",
                            subtree."newParentId",
                            subtree."rootDeletedAt"
                        from "Folders" as child_folder
                        inner join subtree on child_folder."parentFolderId" = subtree."id"
                        where child_folder."ownerId" = ${userId}
                    ),
                    winner ("id", "rootId", "oldPath", "newPath", "newParentId", "rootDeletedAt") as (
                        select distinct on (subtree."id")
                            subtree."id",
                            subtree."rootId",
                            subtree."oldPath",
                            subtree."newPath",
                            subtree."newParentId",
                            subtree."rootDeletedAt"
                        from subtree
                        order by subtree."id", char_length(subtree."oldPath") desc, subtree."rootId"
                    )
                    update "Folders" as folder_row
                    set
                        "deletedAt" = case
                            when folder_row."deletedAt" = winner."rootDeletedAt" then null
                            else folder_row."deletedAt"
                        end,
                        "parentFolderId" = case
                            when folder_row."id" = winner."rootId" then winner."newParentId"
                            else folder_row."parentFolderId"
                        end,
                        "folderPath" = case
                            when winner."oldPath" = winner."newPath" then folder_row."folderPath"
                            when folder_row."folderPath" = winner."oldPath" then winner."newPath"
                            when folder_row."folderPath" like winner."oldPath" || '/%' then winner."newPath" || substring(folder_row."folderPath" from char_length(winner."oldPath") + 1)
                            else folder_row."folderPath"
                        end
                    from winner
                    where folder_row."id" = winner."id"
                      and folder_row."ownerId" = ${userId}
                `);
                }
            }

            for (const fileChunk of chunk(selectedRestorableFileIds, 500)) {
                if (!fixedDestination) {
                    const fileIdsSql = sql.join(
                        fileChunk.map((fileId) => sql`${fileId}`),
                        sql`, `,
                    );

                    await tx.execute(sql`
                    update "Files" as file_row
                    set "deletedAt" = null
                    from "Folders" as parent_folder
                    where file_row."ownerId" = ${userId}
                      and file_row."id" in (${fileIdsSql})
                      and file_row."deletedAt" is not null
                      and parent_folder."id" = file_row."parentId"
                      and parent_folder."ownerId" = ${userId}
                      and parent_folder."deletedAt" is null
                `);
                }
            }
        });

        let restoredSelectedFolderCount = 0;
        for (const idChunk of chunk(selectedRestorableFolderIds, 500)) {
            const rows = await ownerTx
                .select({
                    id: folders.id,
                })
                .from(folders)
                .where(and(eq(folders.ownerId, userId), isNull(folders.deletedAt), inArray(folders.id, idChunk)));
            restoredSelectedFolderCount += rows.length;
        }

        let restoredSelectedFileCount = 0;
        for (const idChunk of chunk(selectedRestorableFileIds, 500)) {
            const rows = await ownerTx
                .select({
                    id: files.id,
                })
                .from(files)
                .where(and(eq(files.ownerId, userId), isNull(files.deletedAt), inArray(files.id, idChunk)));
            restoredSelectedFileCount += rows.length;
        }

        const summary = buildBatchSummary(total, restoredSelectedFolderCount + restoredSelectedFileCount);
        const status = resolveBatchStatus(summary);

        return {
            statusCode: 200,
            body: {
                status,
                message: buildBatchMessage("Batch restore", status),
                summary,
            },
        };
    });

    return reply.code(result.statusCode).send(result.body);
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
    const deleteResult = await withOwnerHierarchyLock(this, userId, (tx) =>
        permanentlyDeleteRecycleItem(tx, userId, itemType, itemId),
    );

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

    const result = await withOwnerHierarchyLock(this, userId, async (ownerTx) => {
        const folderIds = dedupeIds(request.body.folderIds);
        const fileIds = dedupeIds(request.body.fileIds);
        const total = folderIds.length + fileIds.length;

        const requestedFolders: Array<{
            id: string;
            ownerId: string;
            folderPath: string;
            deletedAt: Date | null;
        }> = [];
        for (const idChunk of chunk(folderIds, 500)) {
            const rows = await ownerTx
                .select({
                    id: folders.id,
                    ownerId: folders.ownerId,
                    folderPath: folders.folderPath,
                    deletedAt: folders.deletedAt,
                })
                .from(folders)
                .where(inArray(folders.id, idChunk));
            requestedFolders.push(...rows);
        }

        const requestedFiles: Array<{
            id: string;
            ownerId: string;
            deletedAt: Date | null;
        }> = [];
        for (const idChunk of chunk(fileIds, 500)) {
            const rows = await ownerTx
                .select({
                    id: files.id,
                    ownerId: files.ownerId,
                    deletedAt: files.deletedAt,
                })
                .from(files)
                .where(inArray(files.id, idChunk));
            requestedFiles.push(...rows);
        }

        const selectedDeletedFolders = requestedFolders.filter(
            (folder) => folder.ownerId === userId && folder.deletedAt !== null,
        );
        const activeDescendantCounts = new Map<string, number>();

        for (const folderChunk of chunk(selectedDeletedFolders, 500)) {
            const valuesSql = sql.join(
                folderChunk.map((folder) => sql`(${folder.id})`),
                sql`, `,
            );
            const activeCountsResult = (await ownerTx.execute(sql`
            with recursive selected_roots ("rootId", "id") as (
                select root_values."id", root_values."id"
                from (values ${valuesSql}) as root_values("id")
            ),
            subtree ("rootId", "id") as (
                select "rootId", "id"
                from selected_roots
                union
                select subtree."rootId", child_folder."id"
                from "Folders" as child_folder
                inner join subtree on child_folder."parentFolderId" = subtree."id"
                where child_folder."ownerId" = ${userId}
            )
            select
                subtree."rootId" as "rootId",
                (count(distinct active_folder."id") + count(distinct active_file."id"))::int as "activeCount"
            from subtree
            left join "Folders" as active_folder
                on active_folder."id" = subtree."id"
                and active_folder."ownerId" = ${userId}
                and active_folder."deletedAt" is null
            left join "Files" as active_file
                on active_file."parentId" = subtree."id"
                and active_file."ownerId" = ${userId}
                and active_file."deletedAt" is null
            group by subtree."rootId"
        `)) as {
                rows?: Array<{
                    rootId?: unknown;
                    activeCount?: unknown;
                }>;
            };

            for (const row of activeCountsResult.rows ?? []) {
                if (typeof row.rootId !== "string") {
                    continue;
                }
                activeDescendantCounts.set(row.rootId, parsePgInteger(row.activeCount));
            }
        }

        const validSelectedFolders = selectedDeletedFolders.filter(
            (folder) => (activeDescendantCounts.get(folder.id) ?? 0) === 0,
        );
        const sortedValidSelectedFolders = [...validSelectedFolders].sort((left, right) => {
            if (left.folderPath.length === right.folderPath.length) {
                return left.folderPath.localeCompare(right.folderPath);
            }
            return left.folderPath.length - right.folderPath.length;
        });

        const deleteRoots: Array<{ id: string; folderPath: string }> = [];
        for (const folder of sortedValidSelectedFolders) {
            const isNestedSelectedFolder = deleteRoots.some((root) =>
                isFolderPathInSubtree(folder.folderPath, root.folderPath),
            );
            if (isNestedSelectedFolder) {
                continue;
            }

            deleteRoots.push({
                id: folder.id,
                folderPath: folder.folderPath,
            });
        }

        for (const rootChunk of chunk(deleteRoots, 500)) {
            await hardDeleteFolderSubtreeFiles(
                ownerTx,
                userId,
                rootChunk.map((root) => root.id),
            );
        }

        const selectedDeletedFiles = requestedFiles.filter(
            (fileRow) => fileRow.ownerId === userId && fileRow.deletedAt !== null,
        );
        await hardDeleteFilesByRows(ownerTx, selectedDeletedFiles);

        await ownerTx.transaction(async (tx) => {
            for (const rootChunk of chunk(deleteRoots, 500)) {
                const valuesSql = sql.join(
                    rootChunk.map((root) => sql`(${root.id})`),
                    sql`, `,
                );

                await tx.execute(sql`
                with recursive root_ids ("id") as (
                    values ${valuesSql}
                ),
                subtree ("id") as (
                    select "id"
                    from root_ids
                    union
                    select child_folder."id"
                    from "Folders" as child_folder
                    inner join subtree on child_folder."parentFolderId" = subtree."id"
                    where child_folder."ownerId" = ${userId}
                )
                delete from "DisplayOrders" as display_order
                where display_order."folderId" in (select "id" from subtree)
            `);

                await tx.execute(sql`
                with recursive root_ids ("id") as (
                    values ${valuesSql}
                ),
                subtree ("id") as (
                    select "id"
                    from root_ids
                    union
                    select child_folder."id"
                    from "Folders" as child_folder
                    inner join subtree on child_folder."parentFolderId" = subtree."id"
                    where child_folder."ownerId" = ${userId}
                )
                delete from "Folders" as folder_row
                where folder_row."ownerId" = ${userId}
                  and folder_row."deletedAt" is not null
                  and folder_row."id" in (select "id" from subtree)
            `);
            }
        });

        const summary = buildBatchSummary(total, validSelectedFolders.length + selectedDeletedFiles.length);
        const status = resolveBatchStatus(summary);

        return {
            statusCode: 200,
            body: {
                status,
                message: buildBatchMessage("Batch permanent delete", status),
                summary,
            },
        };
    });

    return reply.code(result.statusCode).send(result.body);
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

    const result = await withOwnerHierarchyLock(this, userId, async (tx) => {
        const itemType = request.query.itemType;

        const { topLevelDeletedFiles, topLevelDeletedFolders } = await getTopLevelDeletedRowsForOwner(tx, userId, {
            itemType,
        });

        const purgedFilesFromTopLevelFiles = await hardDeleteFilesByRows(
            tx,
            topLevelDeletedFiles.map((file) => ({ id: file.id, ownerId: userId })),
        );

        let purgedFilesFromFolders = 0;
        let purgedFolders = 0;

        for (const folderRow of topLevelDeletedFolders) {
            try {
                const summary = await permanentlyDeleteFolderSubtree(tx, userId, folderRow.id);
                if (!summary) {
                    continue;
                }

                purgedFilesFromFolders += summary.purgedFiles;
                purgedFolders += summary.purgedFolders;
            } catch (error) {
                if (isActiveDescendantsError(error)) {
                    return {
                        statusCode: 409,
                        body: {
                            message: "Recycle bin contains folders with active descendants that cannot be purged",
                        },
                    };
                }

                throw error;
            }
        }

        return {
            statusCode: 200,
            body: {
                status: "success",
                message: "Recycle bin emptied",
                purgedFiles: purgedFilesFromTopLevelFiles + purgedFilesFromFolders,
                purgedFolders,
            },
        };
    });

    return reply.code(result.statusCode).send(result.body);
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
    const status = purgeResult.failedOwners > 0 ? "partial" : "success";

    return reply.code(200).send({
        status,
        message: purgeResult.skipped
            ? "Purge already in progress"
            : purgeResult.failedOwners > 0
              ? "Expired recycle-bin purge completed with owner failures"
              : "Expired recycle-bin items purged",
        olderThanDays: purgeResult.olderThanDays,
        failedOwners: purgeResult.failedOwners,
        purgedFiles: purgeResult.purgedFiles,
        purgedFolders: purgeResult.purgedFolders,
        skipped: purgeResult.skipped,
    });
}

export const recycleBinScheduler = {
    intervalMs: 60 * 60 * 1000,
};
