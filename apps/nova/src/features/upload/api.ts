import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { postMultipart } from "@/lib/http";

const uploadResponseSchema = z.object({
    status: z.string(),
    id: z.string(),
    fileExtension: z.string(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const uploadSingleFile = async (input: { parentFolderId: string; file: File }) => {
    const formData = new FormData();
    formData.append("file", input.file);

    return postMultipart("/v1/upload/single", uploadResponseSchema, {
        query: { parentFolderId: input.parentFolderId },
        body: formData,
        headers: await createCsrfHeaders(),
    });
};

export const uploadFileWithToken = async (input: { uploadToken: string; file: File }) => {
    const formData = new FormData();
    formData.append("uploadToken", input.uploadToken);
    formData.append("file", input.file);

    return postMultipart("/v1/upload/token-single", uploadResponseSchema, {
        body: formData,
    });
};
