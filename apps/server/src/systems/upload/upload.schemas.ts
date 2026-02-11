import { z } from "zod/v3";

import { buildJsonSchemas } from "@/utils/zod-schema";

const uploadFileQuerySchema = z.object({
    folderId: z.string().optional(),
});

const uploadFileResponseSchema = z.object({
    id: z.string(),
    fileExtension: z.string(),
    storageState: z.enum(["PENDING", "READY", "FAILED"]),
});

export type UploadFileQuerystring = z.infer<typeof uploadFileQuerySchema>;

export const { schemas: uploadSchemas, $ref } = buildJsonSchemas(
    {
        uploadFileQuerySchema,
        uploadFileResponseSchema,
    },
    { $id: "Upload" },
);
