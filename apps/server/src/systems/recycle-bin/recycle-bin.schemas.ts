import { z } from "zod/v3";

import { buildJsonSchemas } from "@/utils/zod-schema";

const recycleItemTypeSchema = z.enum(["FILE", "FOLDER"]);

const moveToBinBodySchema = z.object({
    itemType: recycleItemTypeSchema,
    itemId: z.string({
        required_error: "Item ID is required",
        invalid_type_error: "Item ID must be a string",
    }),
});

const moveToBinResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeSchema,
    itemId: z.string(),
    deletedAt: z.string().datetime(),
});

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

const restoreBodySchema = z.object({
    itemType: recycleItemTypeSchema,
    itemId: z.string({
        required_error: "Item ID is required",
        invalid_type_error: "Item ID must be a string",
    }),
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

const permanentlyDeleteBodySchema = z.object({
    itemType: recycleItemTypeSchema,
    itemId: z.string({
        required_error: "Item ID is required",
        invalid_type_error: "Item ID must be a string",
    }),
});

const permanentlyDeleteResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeSchema,
    itemId: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const emptyBodySchema = z
    .object({
        itemType: recycleItemTypeSchema.optional(),
    })
    .optional();

const emptyResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const purgeExpiredBodySchema = z
    .object({
        olderThanDays: z.coerce.number().int().min(1).optional(),
    })
    .optional();

const purgeExpiredResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    olderThanDays: z.number().int(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

export type RecycleItemType = z.infer<typeof recycleItemTypeSchema>;
export type MoveToBinBody = z.infer<typeof moveToBinBodySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type DestinationFoldersQuery = z.infer<typeof destinationFoldersQuerySchema>;
export type RestoreBody = z.infer<typeof restoreBodySchema>;
export type PermanentlyDeleteBody = z.infer<typeof permanentlyDeleteBodySchema>;
export type EmptyBody = z.infer<typeof emptyBodySchema>;
export type PurgeExpiredBody = z.infer<typeof purgeExpiredBodySchema>;

export const { schemas: recycleBinSchemas, $ref } = buildJsonSchemas(
    {
        moveToBinBodySchema,
        moveToBinResponseSchema,
        listQuerySchema,
        listResponseSchema,
        destinationFoldersQuerySchema,
        destinationFoldersResponseSchema,
        restoreBodySchema,
        restoreResponseSchema,
        permanentlyDeleteBodySchema,
        permanentlyDeleteResponseSchema,
        emptyBodySchema,
        emptyResponseSchema,
        purgeExpiredBodySchema,
        purgeExpiredResponseSchema,
    },
    { $id: "RecycleBin" },
);
