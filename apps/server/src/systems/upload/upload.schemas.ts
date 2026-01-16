import { z } from "zod/v3";
import { buildJsonSchemas } from "@/utils/zod-schema";

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

export type UploadFileQuerystring = z.infer<typeof uploadFileQuerySchema>;

export const { schemas: uploadSchemas, $ref } = buildJsonSchemas(
    {
        uploadFileQuerySchema,
        uploadFileResponseSchema,
    },
    { $id: "Upload" },
);
