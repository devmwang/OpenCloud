import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { getJson, postJson, putJson } from "@/lib/http";

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

export type FolderDetails = z.infer<typeof folderDetailsSchema>;
export type FolderContents = z.infer<typeof folderContentsSchema>;
export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;

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
