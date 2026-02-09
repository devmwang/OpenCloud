import { z } from "zod/v3";

import { buildJsonSchemas } from "@/utils/zod-schema";

const getDetailsQuerySchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
    readToken: z.string().optional(),
});

const getDetailsResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    ownerId: z.string(),
    ownerUsername: z.string(),
    parentId: z.string(),
    fileType: z.string(),
    type: z.string(),
    fileSize: z.number().int().nullable(),
    size: z.number().int().nullable(),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    fileAccessPermission: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    createdAt: z.string().datetime(),
    uploadedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    editedAt: z.string().datetime(),
});

const getFileParamsSchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
});

const getFileQuerySchema = z.object({
    readToken: z.string().optional(),
});

const getThumbnailParamsSchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
});

const getThumbnailQuerySchema = z.object({
    readToken: z.string().optional(),
});

const deleteFileQuerySchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
});

const deleteFileResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
});

const moveFileBodySchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
    destinationFolderId: z.string({
        required_error: "Destination folder ID is required",
        invalid_type_error: "Destination folder ID must be a string",
    }),
});

const moveFileResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
    fileId: z.string(),
    parentId: z.string(),
});

const purgeDeletedBodySchema = z
    .object({
        olderThanDays: z.coerce.number().int().min(1).optional(),
    })
    .optional();

const purgeDeletedResponseSchema = z.object({
    status: z.string(),
    purged: z.number().int(),
});

export type GetDetailsQuerystring = z.infer<typeof getDetailsQuerySchema>;
export type GetFileParams = z.infer<typeof getFileParamsSchema>;
export type GetFileQuerystring = z.infer<typeof getFileQuerySchema>;
export type GetThumbnailParams = z.infer<typeof getThumbnailParamsSchema>;
export type GetThumbnailQuerystring = z.infer<typeof getThumbnailQuerySchema>;
export type DeleteFileQuerystring = z.infer<typeof deleteFileQuerySchema>;
export type MoveFileBody = z.infer<typeof moveFileBodySchema>;
export type PurgeDeletedBody = z.infer<typeof purgeDeletedBodySchema>;

export const { schemas: fsSchemas, $ref } = buildJsonSchemas(
    {
        getDetailsQuerySchema,
        getDetailsResponseSchema,
        getFileParamsSchema,
        getFileQuerySchema,
        getThumbnailParamsSchema,
        getThumbnailQuerySchema,
        deleteFileQuerySchema,
        deleteFileResponseSchema,
        moveFileBodySchema,
        moveFileResponseSchema,
        purgeDeletedBodySchema,
        purgeDeletedResponseSchema,
    },
    { $id: "FS" },
);
