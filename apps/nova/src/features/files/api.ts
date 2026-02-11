import { z } from "zod";

import { stripFileRouteExtension } from "@/lib/file-id";
import { buildApiUrl, getJson } from "@/lib/http";

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
