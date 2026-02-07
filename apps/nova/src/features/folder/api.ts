import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { getJson, postJson } from "@/lib/http";

const folderEntrySchema = z
    .object({
        id: z.union([z.string(), z.number()]).transform((value) => String(value)),
        folderName: z.string().optional(),
        name: z.string().optional(),
        createdAt: z
            .union([z.string().datetime(), z.date()])
            .transform((value) => (value instanceof Date ? value.toISOString() : value))
            .optional(),
    })
    .transform((value) => ({
        id: value.id,
        folderName: value.folderName ?? value.name ?? "(unnamed folder)",
        createdAt: value.createdAt,
    }));

const fileEntrySchema = z
    .object({
        id: z.union([z.string(), z.number()]).transform((value) => String(value)),
        fileName: z.string().optional(),
        name: z.string().optional(),
        fileSize: z
            .union([z.number().int(), z.string().regex(/^\d+$/), z.null()])
            .transform((value) => {
                if (value === null) {
                    return null;
                }

                return typeof value === "string" ? Number(value) : value;
            })
            .optional(),
        createdAt: z
            .union([z.string().datetime(), z.date()])
            .transform((value) => (value instanceof Date ? value.toISOString() : value))
            .optional(),
    })
    .transform((value) => ({
        id: value.id,
        fileName: value.fileName ?? value.name ?? "(unnamed file)",
        fileSize: value.fileSize,
        createdAt: value.createdAt,
    }));

const folderNodeSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
});

const folderDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    ownerId: z.string().optional(),
    ownerUsername: z.string().optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    editedAt: z.string().datetime().optional(),
    folderAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]).optional(),
    fileAccessPermission: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]).optional(),
    hierarchy: z.array(folderNodeSchema),
});

const folderContentsPayloadSchema = z.object({
    id: z.union([z.string(), z.number()]).transform((value) => String(value)),
    folders: z.array(folderEntrySchema).default([]),
    files: z.array(fileEntrySchema).default([]),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
});

const folderContentsSchema = z
    .union([
        folderContentsPayloadSchema,
        z.object({
            data: folderContentsPayloadSchema,
        }),
    ])
    .transform((value) => ("data" in value ? value.data : value));

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
    return getJson("/v1/folder/get-details", folderDetailsSchema, {
        query: { folderId },
    });
};

export const getFolderContents = async (folderId: string, options: GetFolderContentsOptions = {}) => {
    const { limit, offset, sortType, sortOrder } = options;

    return getJson("/v1/folder/get-contents", folderContentsSchema, {
        query: { folderId, limit, offset, sortType, sortOrder },
    });
};

export const createFolder = async (input: CreateFolderInput) => {
    const body = createFolderInputSchema.parse(input);

    return postJson("/v1/folder/create-folder", createFolderResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

// ── Display Order ─────────────────────────────────────────────

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
    return getJson("/v1/folder/get-display-order", displayOrderResponseSchema, {
        query: { folderId },
    });
};

export const setDisplayOrder = async (input: SetDisplayOrderInput) => {
    const body = setDisplayOrderInputSchema.parse(input);

    return postJson("/v1/folder/set-display-order", displayOrderResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};
