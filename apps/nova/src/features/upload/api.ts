import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { postMultipart } from "@/lib/http";

const uploadResponseSchema = z.object({
    id: z.string(),
    fileExtension: z.string(),
    storageState: z.enum(["PENDING", "READY", "FAILED"]),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const uploadSingleFile = async (input: { parentFolderId: string; file: File }) => {
    const formData = new FormData();
    formData.append("file", input.file);

    return postMultipart("/v1/files", uploadResponseSchema, {
        query: { folderId: input.parentFolderId },
        body: formData,
        headers: await createCsrfHeaders(),
    });
};

export const uploadFileWithToken = async (input: { uploadToken: string; file: File }) => {
    const formData = new FormData();
    formData.append("uploadToken", input.uploadToken);
    formData.append("file", input.file);

    return postMultipart("/v1/files", uploadResponseSchema, {
        body: formData,
        credentials: "omit",
    });
};
