import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { getJson, postJson } from "@/lib/http";

const folderEntrySchema = z
    .object({
        id: z.union([z.string(), z.number()]).transform((value) => String(value)),
        folderName: z.string().optional(),
        name: z.string().optional(),
    })
    .transform((value) => ({
        id: value.id,
        folderName: value.folderName ?? value.name ?? "(unnamed folder)",
    }));

const fileEntrySchema = z
    .object({
        id: z.union([z.string(), z.number()]).transform((value) => String(value)),
        fileName: z.string().optional(),
        name: z.string().optional(),
    })
    .transform((value) => ({
        id: value.id,
        fileName: value.fileName ?? value.name ?? "(unnamed file)",
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

export const getFolderDetails = async (folderId: string) => {
    return getJson("/v1/folder/get-details", folderDetailsSchema, {
        query: { folderId },
    });
};

export const getFolderContents = async (folderId: string, limit?: number, offset?: number) => {
    return getJson("/v1/folder/get-contents", folderContentsSchema, {
        query: { folderId, limit, offset },
    });
};

export const createFolder = async (input: CreateFolderInput) => {
    const body = createFolderInputSchema.parse(input);

    return postJson("/v1/folder/create-folder", createFolderResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};
