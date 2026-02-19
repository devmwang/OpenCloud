import { z } from "zod/v3";

import { buildJsonSchemas } from "@/utils/zod-schema";

const recycleItemTypeSchema = z.enum(["FILE", "FOLDER"]);

const listQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    itemType: recycleItemTypeSchema.optional(),
});

const recycleBinItemSchema = z.object({
    itemType: recycleItemTypeSchema,
    id: z.string(),
    name: z.string(),
    deletedAt: z.string().datetime(),
    purgeAt: z.string().datetime(),
    parentFolderId: z.string().nullable(),
    fileSize: z.number().int().nullable().optional(),
    requiresDestination: z.boolean(),
});

const listResponseSchema = z.object({
    items: z.array(recycleBinItemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
});

const destinationFoldersQuerySchema = z.object({
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
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

const itemParamsSchema = z.object({
    itemType: recycleItemTypeSchema,
    itemId: z.string({
        required_error: "Item ID is required",
        invalid_type_error: "Item ID must be a string",
    }),
});

const restoreBodySchema = z.object({
    destinationFolderId: z.string().optional(),
});

const restoreResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeSchema,
    itemId: z.string(),
    parentFolderId: z.string().nullable(),
    restoredCount: z.number().int().optional(),
});

const permanentlyDeleteResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeSchema,
    itemId: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const batchOperationStatusSchema = z.enum(["success", "failed"]);
const batchItemIdArraySchema = z.array(z.string()).max(500);

const batchItemIdsSchema = z
    .object({
        fileIds: batchItemIdArraySchema.optional(),
        folderIds: batchItemIdArraySchema.optional(),
    })
    .strict()
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

const batchRestoreBodySchema = z
    .object({
        destinationFolderId: z.string().optional(),
        fileIds: batchItemIdArraySchema.optional(),
        folderIds: batchItemIdArraySchema.optional(),
    })
    .strict()
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

const batchOperationSummarySchema = z.object({
    total: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
});

const batchRestoreResponseSchema = z.object({
    status: batchOperationStatusSchema,
    message: z.string(),
    summary: batchOperationSummarySchema,
});

const batchPermanentlyDeleteResponseSchema = z.object({
    status: batchOperationStatusSchema,
    message: z.string(),
    summary: batchOperationSummarySchema,
});

const emptyQuerySchema = z.object({
    itemType: recycleItemTypeSchema.optional(),
});

const emptyResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const purgeBodySchema = z
    .object({
        olderThanDays: z.coerce.number().int().min(1).optional(),
    })
    .optional();

const purgeResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    olderThanDays: z.number().int(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

export type RecycleItemType = z.infer<typeof recycleItemTypeSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type DestinationFoldersQuery = z.infer<typeof destinationFoldersQuerySchema>;
export type ItemParams = z.infer<typeof itemParamsSchema>;
export type RestoreBody = z.infer<typeof restoreBodySchema>;
export type BatchRestoreBody = z.infer<typeof batchRestoreBodySchema>;
export type BatchPermanentlyDeleteBody = z.infer<typeof batchItemIdsSchema>;
export type EmptyQuery = z.infer<typeof emptyQuerySchema>;
export type PurgeBody = z.infer<typeof purgeBodySchema>;

export const { schemas: recycleBinSchemas, $ref } = buildJsonSchemas(
    {
        listQuerySchema,
        listResponseSchema,
        destinationFoldersQuerySchema,
        destinationFoldersResponseSchema,
        itemParamsSchema,
        restoreBodySchema,
        restoreResponseSchema,
        permanentlyDeleteResponseSchema,
        batchRestoreBodySchema,
        batchRestoreResponseSchema,
        batchItemIdsSchema,
        batchPermanentlyDeleteResponseSchema,
        emptyQuerySchema,
        emptyResponseSchema,
        purgeBodySchema,
        purgeResponseSchema,
    },
    { $id: "RecycleBin" },
);
