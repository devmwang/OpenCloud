import { z } from "zod/v3";

import { buildJsonSchemas } from "@/utils/zod-schema";

const getDetailsQuerySchema = z.object({
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
});

const getDetailsResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    hierarchy: z
        .object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
        })
        .array(),
});

const getContentsQuerySchema = z.object({
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

const getContentsResponseSchema = z.object({
    id: z.string(),
    folders: z
        .object({
            id: z.string(),
            folderName: z.string(),
        })
        .array(),
    files: z
        .object({
            id: z.string(),
            fileName: z.string(),
        })
        .array(),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
});

const createFolderSchema = z.object({
    folderName: z.string({
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

const deleteFolderQuerySchema = z.object({
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
});

const deleteFolderResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
});

export type getDetailsQuerystring = z.infer<typeof getDetailsQuerySchema>;
export type getContentsQuerystring = z.infer<typeof getContentsQuerySchema>;
export type createFolderInput = z.infer<typeof createFolderSchema>;
export type deleteFolderQuerystring = z.infer<typeof deleteFolderQuerySchema>;

export const { schemas: folderSchemas, $ref } = buildJsonSchemas(
    {
        getDetailsQuerySchema,
        getDetailsResponseSchema,
        getContentsQuerySchema,
        getContentsResponseSchema,
        createFolderSchema,
        createFolderResponseSchema,
        deleteFolderQuerySchema,
        deleteFolderResponseSchema,
    },
    { $id: "Folder" },
);
