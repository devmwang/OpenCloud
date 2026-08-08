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

const previewImageMimeTypes = new Set([
    "image/apng",
    "image/avif",
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/vnd.microsoft.icon",
    "image/webp",
    "image/x-icon",
]);

const thumbnailMimeTypes = new Set(["image/apng", "image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

const previewVideoMimeTypes = new Set(["video/mp4", "video/ogg", "video/quicktime", "video/webm", "video/x-m4v"]);

const previewAudioMimeTypes = new Set([
    "audio/aac",
    "audio/flac",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
]);

const officeMimeTypes = new Set([
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-excel.sheet.macroenabled.12",
    "application/vnd.ms-powerpoint",
    "application/vnd.ms-powerpoint.presentation.macroenabled.12",
    "application/vnd.ms-word.document.macroenabled.12",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type FilePreviewKind = "image" | "video" | "audio" | "pdf" | "office" | "unsupported";

const normalizeMimeType = (mimeType: string) => mimeType.replace(/;.*$/u, "").trim().toLowerCase();

export const getFilePreviewKind = (mimeType: string): FilePreviewKind => {
    const normalizedMimeType = normalizeMimeType(mimeType);

    if (previewImageMimeTypes.has(normalizedMimeType)) return "image";
    if (previewVideoMimeTypes.has(normalizedMimeType)) return "video";
    if (previewAudioMimeTypes.has(normalizedMimeType)) return "audio";
    if (normalizedMimeType === "application/pdf") return "pdf";
    if (officeMimeTypes.has(normalizedMimeType)) return "office";
    return "unsupported";
};

export const canGenerateThumbnail = (mimeType: string) => thumbnailMimeTypes.has(normalizeMimeType(mimeType));

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

export const buildFileDownloadUrl = (fileRouteId: string, readToken?: string) => {
    return buildApiUrl(`/v1/files/${encodeURIComponent(fileRouteId)}/content`, {
        readToken,
        download: "1",
    }).toString();
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
