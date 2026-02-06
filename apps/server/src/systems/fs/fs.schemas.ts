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
    parentId: z.string(),
    fileType: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
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
        purgeDeletedBodySchema,
        purgeDeletedResponseSchema,
    },
    { $id: "FS" },
);
