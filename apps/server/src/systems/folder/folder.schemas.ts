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
    ownerId: z.string(),
    ownerUsername: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    editedAt: z.string().datetime(),
    folderAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    fileAccessPermission: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
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
    sortType: z.enum(["NAME", "DATE_CREATED", "SIZE"]).optional(),
    sortOrder: z.enum(["ASC", "DESC"]).optional(),
});

const getContentsResponseSchema = z.object({
    id: z.string(),
    folders: z
        .object({
            id: z.string(),
            folderName: z.string(),
            createdAt: z.string().datetime(),
        })
        .array(),
    files: z
        .object({
            id: z.string(),
            fileName: z.string(),
            fileSize: z.number().int().nullable(),
            createdAt: z.string().datetime(),
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

const moveFolderBodySchema = z.object({
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
    destinationFolderId: z.string({
        required_error: "Destination folder ID is required",
        invalid_type_error: "Destination folder ID must be a string",
    }),
});

const moveFolderResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
    folderId: z.string(),
    parentFolderId: z.string(),
});

const getDisplayOrderQuerySchema = z.object({
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
});

const displayOrderResponseSchema = z.object({
    folderId: z.string(),
    displayType: z.enum(["GRID", "LIST"]),
    sortOrder: z.enum(["ASC", "DESC"]),
    sortType: z.enum(["NAME", "DATE_CREATED", "SIZE"]),
});

const setDisplayOrderSchema = z.object({
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
    displayType: z.enum(["GRID", "LIST"]),
    sortOrder: z.enum(["ASC", "DESC"]),
    sortType: z.enum(["NAME", "DATE_CREATED", "SIZE"]),
});

export type getDetailsQuerystring = z.infer<typeof getDetailsQuerySchema>;
export type getContentsQuerystring = z.infer<typeof getContentsQuerySchema>;
export type createFolderInput = z.infer<typeof createFolderSchema>;
export type deleteFolderQuerystring = z.infer<typeof deleteFolderQuerySchema>;
export type moveFolderInput = z.infer<typeof moveFolderBodySchema>;
export type getDisplayOrderQuerystring = z.infer<typeof getDisplayOrderQuerySchema>;
export type setDisplayOrderInput = z.infer<typeof setDisplayOrderSchema>;

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
        moveFolderBodySchema,
        moveFolderResponseSchema,
        getDisplayOrderQuerySchema,
        displayOrderResponseSchema,
        setDisplayOrderSchema,
    },
    { $id: "Folder" },
);
