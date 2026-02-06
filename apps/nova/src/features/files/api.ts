import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { stripFileRouteExtension } from "@/lib/file-id";
import { buildApiUrl, deleteJson, getJson, postJson } from "@/lib/http";

const fileDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    ownerId: z.string(),
    parentId: z.string(),
    fileType: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

const deleteFileResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
});

const purgeDeletedInputSchema = z.object({
    olderThanDays: z.number().int().min(1).optional(),
});

const purgeDeletedResponseSchema = z.object({
    status: z.string(),
    purged: z.number().int(),
});

export type FileDetails = z.infer<typeof fileDetailsSchema>;
export type PurgeDeletedInput = z.infer<typeof purgeDeletedInputSchema>;

export const normalizeFileId = (fileRouteId: string) => {
    return stripFileRouteExtension(fileRouteId);
};

export const getFileDetails = async (
    fileId: string,
    readToken?: string,
    options?: { forwardServerCookies?: boolean },
) => {
    return getJson("/v1/files/get-details", fileDetailsSchema, {
        query: { fileId, readToken },
        forwardServerCookies: options?.forwardServerCookies,
    });
};

export const deleteFile = async (fileId: string) => {
    return deleteJson("/v1/files/delete", deleteFileResponseSchema, {
        query: { fileId },
        headers: await createCsrfHeaders(),
    });
};

export const purgeDeletedFiles = async (input?: PurgeDeletedInput) => {
    const body = purgeDeletedInputSchema.parse(input ?? {});

    return postJson("/v1/files/purge-deleted", purgeDeletedResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const buildFileContentUrl = (fileRouteId: string, readToken?: string) => {
    return buildApiUrl(`/v1/files/get/${encodeURIComponent(fileRouteId)}`, { readToken }).toString();
};

export const buildFileThumbnailUrl = (fileRouteId: string, readToken?: string) => {
    return buildApiUrl(`/v1/files/get-thumbnail/${encodeURIComponent(fileRouteId)}`, { readToken }).toString();
};
