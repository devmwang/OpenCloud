import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { getJson, patchJson, postJson, putJson } from "@/lib/http";

const folderNodeSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["ROOT", "STANDARD"]),
});

const folderDetailsSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        ownerId: z.string(),
        parentFolderId: z.string().nullable(),
        type: z.enum(["ROOT", "STANDARD"]),
        access: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        ancestors: z.array(folderNodeSchema),
    })
    .transform((value) => ({
        id: value.id,
        name: value.name,
        type: value.type,
        ownerId: value.ownerId,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        folderAccess: value.access,
        hierarchy: value.ancestors,
    }));

const folderContentsPayloadSchema = z.object({
    id: z.union([z.string(), z.number()]).transform((value) => String(value)),
    folders: z
        .array(
            z.object({
                id: z.union([z.string(), z.number()]).transform((value) => String(value)),
                name: z.string(),
                createdAt: z
                    .union([z.string().datetime(), z.date()])
                    .transform((value) => (value instanceof Date ? value.toISOString() : value)),
            }),
        )
        .default([]),
    files: z
        .array(
            z.object({
                id: z.union([z.string(), z.number()]).transform((value) => String(value)),
                name: z.string(),
                sizeBytes: z.union([z.number().int(), z.string().regex(/^\d+$/), z.null()]).transform((value) => {
                    if (value === null) {
                        return null;
                    }

                    return typeof value === "string" ? Number(value) : value;
                }),
                createdAt: z
                    .union([z.string().datetime(), z.date()])
                    .transform((value) => (value instanceof Date ? value.toISOString() : value)),
            }),
        )
        .default([]),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
});

const folderContentsSchema = folderContentsPayloadSchema.transform((value) => ({
    id: value.id,
    folders: value.folders.map((folder) => ({
        id: folder.id,
        folderName: folder.name,
        createdAt: folder.createdAt,
    })),
    files: value.files.map((file) => ({
        id: file.id,
        fileName: file.name,
        fileSize: file.sizeBytes,
        createdAt: file.createdAt,
    })),
    limit: value.limit,
    offset: value.offset,
}));

const createFolderInputSchema = z.object({
    folderName: z.string().min(1),
    parentFolderId: z.string().min(1),
});

const createFolderResponseSchema = z.object({
    id: z.string(),
});

const mutateFolderResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
    id: z.string(),
    parentFolderId: z.string().nullable(),
});

const batchOperationStatusSchema = z.enum(["success", "failed"]);

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

const batchMoveItemsInputSchema = batchItemIdsInputSchema.extend({
    destinationFolderId: z.string().min(1),
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

const moveFolderInputSchema = z.object({
    folderId: z.string().min(1),
    destinationFolderId: z.string().min(1),
});

const renameFolderInputSchema = z.object({
    folderId: z.string().min(1),
    name: z.string().trim().min(1),
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

const folderDestinationChildrenResponseSchema = z.object({
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

export type FolderDetails = z.infer<typeof folderDetailsSchema>;
export type FolderContents = z.infer<typeof folderContentsSchema>;
export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;
export type DestinationFoldersInput = z.infer<typeof destinationFoldersInputSchema>;
export type FolderDestinationChildren = z.infer<typeof folderDestinationChildrenResponseSchema>;
export type BatchMoveItemsInput = z.infer<typeof batchMoveItemsInputSchema>;
export type BatchDeleteItemsInput = z.infer<typeof batchItemIdsInputSchema>;
export type BatchMoveItemsResponse = z.infer<typeof batchMoveItemsResponseSchema>;
export type BatchDeleteItemsResponse = z.infer<typeof batchDeleteItemsResponseSchema>;

export type GetFolderContentsOptions = {
    limit?: number;
    offset?: number;
    sortType?: "NAME" | "DATE_CREATED" | "SIZE";
    sortOrder?: "ASC" | "DESC";
};

export const getFolderDetails = async (folderId: string) => {
    return getJson(`/v1/folders/${encodeURIComponent(folderId)}`, folderDetailsSchema);
};

export const getFolderContents = async (folderId: string, options: GetFolderContentsOptions = {}) => {
    const { limit, offset, sortType, sortOrder } = options;

    return getJson(`/v1/folders/${encodeURIComponent(folderId)}/children`, folderContentsSchema, {
        query: { limit, offset, sortType, sortOrder },
    });
};

export const createFolder = async (input: CreateFolderInput) => {
    const body = createFolderInputSchema.parse(input);

    return postJson("/v1/folders", createFolderResponseSchema, {
        body: { name: body.folderName, parentFolderId: body.parentFolderId },
        headers: await createCsrfHeaders(),
    });
};

export const moveFolder = async (input: z.infer<typeof moveFolderInputSchema>) => {
    const body = moveFolderInputSchema.parse(input);

    return patchJson(`/v1/folders/${encodeURIComponent(body.folderId)}`, mutateFolderResponseSchema, {
        body: {
            destinationFolderId: body.destinationFolderId,
        },
        headers: await createCsrfHeaders(),
    });
};

export const batchMoveItems = async (input: BatchMoveItemsInput) => {
    const body = batchMoveItemsInputSchema.parse(input);

    return postJson("/v1/folders/batch/move", batchMoveItemsResponseSchema, {
        body: {
            destinationFolderId: body.destinationFolderId,
            fileIds: body.fileIds,
            folderIds: body.folderIds,
        },
        headers: await createCsrfHeaders(),
    });
};

export const batchDeleteItems = async (input: BatchDeleteItemsInput) => {
    const body = batchItemIdsInputSchema.parse(input);

    return postJson("/v1/folders/batch/delete", batchDeleteItemsResponseSchema, {
        body: {
            fileIds: body.fileIds,
            folderIds: body.folderIds,
        },
        headers: await createCsrfHeaders(),
    });
};

export const renameFolder = async (input: z.infer<typeof renameFolderInputSchema>) => {
    const body = renameFolderInputSchema.parse(input);

    return patchJson(`/v1/folders/${encodeURIComponent(body.folderId)}`, mutateFolderResponseSchema, {
        body: {
            name: body.name,
        },
        headers: await createCsrfHeaders(),
    });
};

export const getMoveDestinationFolders = async (input: DestinationFoldersInput = {}) => {
    const query = destinationFoldersInputSchema.parse(input);

    return getJson("/v1/recycle-bin/destination-folders", destinationFoldersResponseSchema, {
        query,
    });
};

export const getFolderDestinationChildren = async (folderId: string) => {
    return getJson(
        `/v1/folders/${encodeURIComponent(folderId)}/destination-children`,
        folderDestinationChildrenResponseSchema,
    );
};

export const displayTypeEnum = z.enum(["GRID", "LIST"]);
export const sortOrderEnum = z.enum(["ASC", "DESC"]);
export const sortTypeEnum = z.enum(["NAME", "DATE_CREATED", "SIZE"]);

export type DisplayType = z.infer<typeof displayTypeEnum>;
export type SortOrder = z.infer<typeof sortOrderEnum>;
export type SortType = z.infer<typeof sortTypeEnum>;

const displayOrderResponseSchema = z.object({
    folderId: z.string(),
    displayType: displayTypeEnum,
    sortOrder: sortOrderEnum,
    sortType: sortTypeEnum,
});

export type DisplayOrderResponse = z.infer<typeof displayOrderResponseSchema>;

const setDisplayOrderInputSchema = z.object({
    folderId: z.string(),
    displayType: displayTypeEnum,
    sortOrder: sortOrderEnum,
    sortType: sortTypeEnum,
});

export type SetDisplayOrderInput = z.infer<typeof setDisplayOrderInputSchema>;

export const getDisplayOrder = async (folderId: string) => {
    return getJson(`/v1/folders/${encodeURIComponent(folderId)}/display-preferences`, displayOrderResponseSchema);
};

export const setDisplayOrder = async (input: SetDisplayOrderInput) => {
    const body = setDisplayOrderInputSchema.parse(input);

    return putJson(`/v1/folders/${encodeURIComponent(body.folderId)}/display-preferences`, displayOrderResponseSchema, {
        body: {
            displayType: body.displayType,
            sortOrder: body.sortOrder,
            sortType: body.sortType,
        },
        headers: await createCsrfHeaders(),
    });
};
