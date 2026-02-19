import { z } from "zod/v3";

import { buildJsonSchemas } from "@/utils/zod-schema";

const folderParamsSchema = z.object({
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
});

const getFolderDetailsResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    ownerId: z.string(),
    parentFolderId: z.string().nullable(),
    type: z.enum(["ROOT", "STANDARD"]),
    access: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    ancestors: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            type: z.enum(["ROOT", "STANDARD"]),
        }),
    ),
});

const getFolderChildrenQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    sortType: z.enum(["NAME", "DATE_CREATED", "SIZE"]).optional(),
    sortOrder: z.enum(["ASC", "DESC"]).optional(),
});

const getFolderChildrenResponseSchema = z.object({
    id: z.string(),
    folders: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            createdAt: z.string().datetime(),
        }),
    ),
    files: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            sizeBytes: z.number().int().nullable(),
            mimeType: z.string(),
            access: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
            storageState: z.enum(["PENDING", "READY", "FAILED"]),
            createdAt: z.string().datetime(),
            updatedAt: z.string().datetime(),
        }),
    ),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
});

const getFolderDestinationChildrenResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    parentFolderId: z.string().nullable(),
    folders: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
        }),
    ),
});

const createFolderSchema = z.object({
    name: z.string({
        required_error: "Folder name is required",
        invalid_type_error: "Folder name must be a string",
    }),
    parentFolderId: z.string({
        required_error: "Parent folder ID is required",
        invalid_type_error: "Parent folder ID must be a string",
    }),
});

const createFolderResponseSchema = z.object({
    id: z.string(),
});

const patchFolderMoveBodySchema = z
    .object({
        destinationFolderId: z.string({
            required_error: "Destination folder ID is required",
            invalid_type_error: "Destination folder ID must be a string",
        }),
    })
    .strict();

const patchFolderRenameBodySchema = z
    .object({
        name: z
            .string({
                required_error: "Folder name is required",
                invalid_type_error: "Folder name must be a string",
            })
            .trim()
            .min(1, { message: "Folder name cannot be empty" }),
    })
    .strict();

const patchFolderBodySchema = z.union([patchFolderMoveBodySchema, patchFolderRenameBodySchema]);

const mutateFolderResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
    id: z.string(),
    parentFolderId: z.string().nullable(),
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

const batchMoveItemsSchema = z
    .object({
        destinationFolderId: z.string({
            required_error: "Destination folder ID is required",
            invalid_type_error: "Destination folder ID must be a string",
        }),
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

const batchMoveItemsResponseSchema = z.object({
    status: batchOperationStatusSchema,
    message: z.string(),
    summary: batchOperationSummarySchema,
});

const batchDeleteItemsResponseSchema = z.object({
    status: batchOperationStatusSchema,
    message: z.string(),
    summary: batchOperationSummarySchema,
});

const displayPreferencesResponseSchema = z.object({
    folderId: z.string(),
    displayType: z.enum(["GRID", "LIST"]),
    sortOrder: z.enum(["ASC", "DESC"]),
    sortType: z.enum(["NAME", "DATE_CREATED", "SIZE"]),
});

const putDisplayPreferencesSchema = z.object({
    displayType: z.enum(["GRID", "LIST"]),
    sortOrder: z.enum(["ASC", "DESC"]),
    sortType: z.enum(["NAME", "DATE_CREATED", "SIZE"]),
});

export type FolderParams = z.infer<typeof folderParamsSchema>;
export type GetFolderChildrenQuery = z.infer<typeof getFolderChildrenQuerySchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type PatchFolderInput = z.infer<typeof patchFolderBodySchema>;
export type PutDisplayPreferencesInput = z.infer<typeof putDisplayPreferencesSchema>;
export type BatchMoveItemsInput = z.infer<typeof batchMoveItemsSchema>;
export type BatchDeleteItemsInput = z.infer<typeof batchItemIdsSchema>;

export const { schemas: folderSchemas, $ref } = buildJsonSchemas(
    {
        folderParamsSchema,
        getFolderDetailsResponseSchema,
        getFolderChildrenQuerySchema,
        getFolderChildrenResponseSchema,
        getFolderDestinationChildrenResponseSchema,
        createFolderSchema,
        createFolderResponseSchema,
        patchFolderBodySchema,
        mutateFolderResponseSchema,
        batchMoveItemsSchema,
        batchMoveItemsResponseSchema,
        batchItemIdsSchema,
        batchDeleteItemsResponseSchema,
        displayPreferencesResponseSchema,
        putDisplayPreferencesSchema,
    },
    { $id: "Folder" },
);
