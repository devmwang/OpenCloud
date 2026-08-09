import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { stripFileRouteExtension } from "@/lib/file-id";
import { buildApiUrl, getJson, patchJson } from "@/lib/http";

const fileDetailsBaseSchema = z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nullable(),
});

const fileManagementSchema = z.object({
    ownerId: z.string(),
    folderId: z.string(),
    access: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    storageState: z.enum(["PENDING", "READY", "FAILED"]),
});

const fileDetailsSchema = fileDetailsBaseSchema.extend({
    management: fileManagementSchema.optional(),
});

const legacyFileDetailsSchema = fileDetailsBaseSchema.extend(fileManagementSchema.shape);

// Keep the legacy schema first because the optional schema would strip its flat management fields.
const fileDetailsResponseSchema = z.union([legacyFileDetailsSchema, fileDetailsSchema]);

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

const normalizeFileDetailsResponse = (
    response: z.infer<typeof fileDetailsResponseSchema>,
    sessionUserId?: string,
): FileDetails => {
    if (!("ownerId" in response)) {
        return response;
    }

    const { ownerId, folderId, access, createdAt, updatedAt, storageState, ...file } = response;

    if (ownerId !== sessionUserId) {
        return file;
    }

    return {
        ...file,
        management: {
            ownerId,
            folderId,
            access,
            createdAt,
            updatedAt,
            storageState,
        },
    };
};

export const normalizeFileId = (fileRouteId: string) => {
    return stripFileRouteExtension(fileRouteId);
};

export const getFileDetails = async (
    fileId: string,
    readToken?: string,
    options?: { forwardServerCookies?: boolean; sessionUserId?: string },
) => {
    const response = await getJson(`/v1/files/${encodeURIComponent(fileId)}`, fileDetailsResponseSchema, {
        query: { readToken, detailsVersion: "2" },
        forwardServerCookies: options?.forwardServerCookies,
    });

    return normalizeFileDetailsResponse(response, options?.sessionUserId);
};

export const getOwnedFileDetails = async (fileId: string, sessionUserId: string) => {
    const file = await getFileDetails(fileId, undefined, { sessionUserId });

    if (!file.management) {
        throw new Error("File details response did not include owner management data");
    }

    return { ...file, management: file.management };
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
