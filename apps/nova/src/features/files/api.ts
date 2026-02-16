import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { stripFileRouteExtension } from "@/lib/file-id";
import { buildApiUrl, getJson, patchJson } from "@/lib/http";

const fileDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nullable(),
    ownerId: z.string(),
    folderId: z.string(),
    access: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    storageState: z.enum(["PENDING", "READY", "FAILED"]),
});

const mutateFileResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
    id: z.string(),
    folderId: z.string(),
});

const moveFileInputSchema = z.object({
    fileId: z.string().min(1),
    destinationFolderId: z.string().min(1),
});

const renameFileInputSchema = z.object({
    fileId: z.string().min(1),
    name: z.string().trim().min(1),
});

export type FileDetails = z.infer<typeof fileDetailsSchema>;

export const normalizeFileId = (fileRouteId: string) => {
    return stripFileRouteExtension(fileRouteId);
};

export const getFileDetails = async (
    fileId: string,
    readToken?: string,
    options?: { forwardServerCookies?: boolean },
) => {
    return getJson(`/v1/files/${encodeURIComponent(fileId)}`, fileDetailsSchema, {
        query: { readToken },
        forwardServerCookies: options?.forwardServerCookies,
    });
};

export const buildFileContentUrl = (fileRouteId: string, readToken?: string) => {
    return buildApiUrl(`/v1/files/${encodeURIComponent(fileRouteId)}/content`, { readToken }).toString();
};

export const buildFileThumbnailUrl = (fileRouteId: string, readToken?: string) => {
    return buildApiUrl(`/v1/files/${encodeURIComponent(fileRouteId)}/thumbnail`, { readToken }).toString();
};

export const moveFile = async (input: z.infer<typeof moveFileInputSchema>) => {
    const body = moveFileInputSchema.parse(input);

    return patchJson(`/v1/files/${encodeURIComponent(body.fileId)}`, mutateFileResponseSchema, {
        body: {
            folderId: body.destinationFolderId,
        },
        headers: await createCsrfHeaders(),
    });
};

export const renameFile = async (input: z.infer<typeof renameFileInputSchema>) => {
    const body = renameFileInputSchema.parse(input);

    return patchJson(`/v1/files/${encodeURIComponent(body.fileId)}`, mutateFileResponseSchema, {
        body: {
            name: body.name,
        },
        headers: await createCsrfHeaders(),
    });
};
