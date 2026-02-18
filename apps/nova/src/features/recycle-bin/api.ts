import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { deleteJson, getJson, postJson } from "@/lib/http";

export const recycleItemTypeEnum = z.enum(["FILE", "FOLDER"]);

export type RecycleItemType = z.infer<typeof recycleItemTypeEnum>;

const moveToBinInputSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string().min(1),
});

const moveToBinResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    deletedAt: z.string().datetime(),
});

const deleteSourceResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
    id: z.string(),
});

const recycleBinListItemSchema = z.object({
    itemType: recycleItemTypeEnum,
    id: z.string(),
    name: z.string(),
    deletedAt: z.string().datetime(),
    purgeAt: z.string().datetime(),
    parentFolderId: z.string().nullable(),
    fileSize: z.number().int().nullable().optional(),
    requiresDestination: z.boolean(),
});

const listRecycleBinInputSchema = z.object({
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
    itemType: recycleItemTypeEnum.optional(),
});

const listRecycleBinResponseSchema = z.object({
    items: z.array(recycleBinListItemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
});

const destinationFoldersInputSchema = z.object({
    search: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
});

const destinationFoldersResponseSchema = z.object({
    folders: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            path: z.string(),
        }),
    ),
});

const restoreInputSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string().min(1),
    destinationFolderId: z.string().optional(),
});

const restoreResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    parentFolderId: z.string().nullable(),
    restoredCount: z.number().int().optional(),
});

const permanentlyDeleteInputSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string().min(1),
});

const permanentlyDeleteResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const batchItemOutcomeSchema = z.enum(["SUCCESS", "FAILED", "SKIPPED"]);
const batchOperationStatusSchema = z.enum(["success", "partial_success", "failed"]);

const batchItemIdsInputSchema = z
    .object({
        fileIds: z.array(z.string().min(1)).max(500).optional(),
        folderIds: z.array(z.string().min(1)).max(500).optional(),
    })
    .superRefine((value, context) => {
        const totalIds = (value.fileIds?.length ?? 0) + (value.folderIds?.length ?? 0);
        if (totalIds === 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "At least one fileId or folderId is required",
                path: ["fileIds"],
            });
        }
    });

const batchRestoreInputSchema = batchItemIdsInputSchema.extend({
    destinationFolderId: z.string().min(1).optional(),
});

const batchOperationSummarySchema = z.object({
    total: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
});

const batchRestoreResultSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    outcome: batchItemOutcomeSchema,
    message: z.string(),
    code: z.string().optional(),
    parentFolderId: z.string().nullable().optional(),
    restoredCount: z.number().int().optional(),
});

const batchPermanentlyDeleteResultSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    outcome: batchItemOutcomeSchema,
    message: z.string(),
    code: z.string().optional(),
    purgedFiles: z.number().int().optional(),
    purgedFolders: z.number().int().optional(),
});

const batchRestoreResponseSchema = z.object({
    status: batchOperationStatusSchema,
    message: z.string(),
    summary: batchOperationSummarySchema,
    results: z.array(batchRestoreResultSchema),
});

const batchPermanentlyDeleteResponseSchema = z.object({
    status: batchOperationStatusSchema,
    message: z.string(),
    summary: batchOperationSummarySchema,
    results: z.array(batchPermanentlyDeleteResultSchema),
});

const emptyRecycleBinInputSchema = z.object({
    itemType: recycleItemTypeEnum.optional(),
});

const emptyRecycleBinResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const purgeExpiredInputSchema = z
    .object({
        olderThanDays: z.number().int().min(1).optional(),
    })
    .optional();

const purgeExpiredResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    olderThanDays: z.number().int(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

export type RecycleBinListItem = z.infer<typeof recycleBinListItemSchema>;
export type ListRecycleBinInput = z.infer<typeof listRecycleBinInputSchema>;
export type DestinationFoldersInput = z.infer<typeof destinationFoldersInputSchema>;
export type RestoreRecycleBinInput = z.infer<typeof restoreInputSchema>;
export type BatchRestoreRecycleBinInput = z.infer<typeof batchRestoreInputSchema>;
export type BatchPermanentlyDeleteRecycleBinInput = z.infer<typeof batchItemIdsInputSchema>;
export type EmptyRecycleBinInput = z.infer<typeof emptyRecycleBinInputSchema>;
export type PurgeExpiredRecycleBinInput = z.infer<typeof purgeExpiredInputSchema>;

export const moveToRecycleBin = async (input: z.infer<typeof moveToBinInputSchema>) => {
    const body = moveToBinInputSchema.parse(input);
    const endpoint =
        body.itemType === "FILE"
            ? `/v1/files/${encodeURIComponent(body.itemId)}`
            : `/v1/folders/${encodeURIComponent(body.itemId)}`;

    const response = await deleteJson(endpoint, deleteSourceResponseSchema, {
        headers: await createCsrfHeaders(),
    });

    return moveToBinResponseSchema.parse({
        status: "success",
        message: response.message,
        itemType: body.itemType,
        itemId: body.itemId,
        deletedAt: new Date().toISOString(),
    });
};

export const listRecycleBin = async (input: ListRecycleBinInput = {}) => {
    const query = listRecycleBinInputSchema.parse(input);

    return getJson("/v1/recycle-bin/items", listRecycleBinResponseSchema, {
        query,
    });
};

export const getRecycleBinDestinationFolders = async (input: DestinationFoldersInput = {}) => {
    const query = destinationFoldersInputSchema.parse(input);

    return getJson("/v1/recycle-bin/destination-folders", destinationFoldersResponseSchema, {
        query,
    });
};

export const restoreRecycleBinItem = async (input: RestoreRecycleBinInput) => {
    const body = restoreInputSchema.parse(input);

    return postJson(
        `/v1/recycle-bin/items/${body.itemType}/${encodeURIComponent(body.itemId)}/restore`,
        restoreResponseSchema,
        {
            body: { destinationFolderId: body.destinationFolderId },
            headers: await createCsrfHeaders(),
        },
    );
};

export const permanentlyDeleteRecycleBinItem = async (input: z.infer<typeof permanentlyDeleteInputSchema>) => {
    const body = permanentlyDeleteInputSchema.parse(input);

    return deleteJson(
        `/v1/recycle-bin/items/${body.itemType}/${encodeURIComponent(body.itemId)}`,
        permanentlyDeleteResponseSchema,
        {
            headers: await createCsrfHeaders(),
        },
    );
};

export const batchRestoreRecycleBinItems = async (input: BatchRestoreRecycleBinInput) => {
    const body = batchRestoreInputSchema.parse(input);

    return postJson("/v1/recycle-bin/items/batch/restore", batchRestoreResponseSchema, {
        body: {
            destinationFolderId: body.destinationFolderId,
            fileIds: body.fileIds,
            folderIds: body.folderIds,
        },
        headers: await createCsrfHeaders(),
    });
};

export const batchPermanentlyDeleteRecycleBinItems = async (input: BatchPermanentlyDeleteRecycleBinInput) => {
    const body = batchItemIdsInputSchema.parse(input);

    return postJson("/v1/recycle-bin/items/batch/permanently-delete", batchPermanentlyDeleteResponseSchema, {
        body: {
            fileIds: body.fileIds,
            folderIds: body.folderIds,
        },
        headers: await createCsrfHeaders(),
    });
};

export const emptyRecycleBin = async (input?: EmptyRecycleBinInput) => {
    const query = emptyRecycleBinInputSchema.parse(input ?? {});

    return deleteJson("/v1/recycle-bin/items", emptyRecycleBinResponseSchema, {
        query,
        headers: await createCsrfHeaders(),
    });
};

export const purgeExpiredRecycleBin = async (input?: PurgeExpiredRecycleBinInput) => {
    const body = purgeExpiredInputSchema.parse(input ?? {});

    return postJson("/v1/recycle-bin/purge", purgeExpiredResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};
