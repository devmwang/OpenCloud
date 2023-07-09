import { z } from "zod";
import { buildJsonSchemas } from "fastify-zod";

const uploadFileQuerySchema = z.object({
    parentFolderId: z.string({
        required_error: "Parent folder ID is required",
        invalid_type_error: "Parent folder ID must be a string",
    }),
});

const uploadFileResponseSchema = z.object({
    status: z.string(),
    id: z.string(),
    fileExtension: z.string(),
});

const getFileParamsSchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
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

export type UploadFileQuerystring = z.infer<typeof uploadFileQuerySchema>;
export type GetFileParams = z.infer<typeof getFileParamsSchema>;
export type DeleteFileQuerystring = z.infer<typeof deleteFileQuerySchema>;

export const { schemas: fsSchemas, $ref } = buildJsonSchemas(
    {
        uploadFileQuerySchema,
        uploadFileResponseSchema,
        getFileParamsSchema,
        deleteFileQuerySchema,
        deleteFileResponseSchema,
    },
    { $id: "FS" },
);
