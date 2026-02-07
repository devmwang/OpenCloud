import { z } from "zod";

import { stripFileRouteExtension } from "@/lib/file-id";
import { buildApiUrl, getJson } from "@/lib/http";

const fileDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    ownerId: z.string(),
    ownerUsername: z.string().optional(),
    parentId: z.string(),
    fileType: z.string(),
    type: z.string().optional(),
    fileSize: z.number().int().nullable().optional(),
    size: z.number().int().nullable().optional(),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]).optional(),
    fileAccessPermission: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]).optional(),
    createdAt: z.string().datetime(),
    uploadedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime(),
    editedAt: z.string().datetime().optional(),
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
    return getJson("/v1/files/get-details", fileDetailsSchema, {
        query: { fileId, readToken },
        forwardServerCookies: options?.forwardServerCookies,
    });
};

export const buildFileContentUrl = (fileRouteId: string, readToken?: string) => {
    return buildApiUrl(`/v1/files/get/${encodeURIComponent(fileRouteId)}`, { readToken }).toString();
};

export const buildFileThumbnailUrl = (fileRouteId: string, readToken?: string) => {
    return buildApiUrl(`/v1/files/get-thumbnail/${encodeURIComponent(fileRouteId)}`, { readToken }).toString();
};
