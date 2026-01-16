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

export type getDetailsQuerystring = z.infer<typeof getDetailsQuerySchema>;
export type getContentsQuerystring = z.infer<typeof getContentsQuerySchema>;
export type createFolderInput = z.infer<typeof createFolderSchema>;

export const { schemas: folderSchemas, $ref } = buildJsonSchemas(
    {
        getDetailsQuerySchema,
        getDetailsResponseSchema,
        getContentsQuerySchema,
        getContentsResponseSchema,
        createFolderSchema,
        createFolderResponseSchema,
    },
    { $id: "Folder" },
);
