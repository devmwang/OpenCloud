import { z } from "zod";
import { buildJsonSchemas } from "fastify-zod";

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

export type GetFileParams = z.infer<typeof getFileParamsSchema>;
export type DeleteFileQuerystring = z.infer<typeof deleteFileQuerySchema>;

export const { schemas: fsSchemas, $ref } = buildJsonSchemas(
    {
        getFileParamsSchema,
        deleteFileQuerySchema,
        deleteFileResponseSchema,
    },
    { $id: "FS" },
);
