import { stat } from "fs/promises";
import path from "path";

import contentDisposition from "content-disposition";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";

import { fileReadTokens } from "@/db/schema/auth";
import { files, folders } from "@/db/schema/storage";
import { env } from "@/env/env";

import type { FileParams, FileReadQuery, PatchFileBody } from "./fs.schemas";

const INLINE_IMAGE_MIME_TYPES = new Set([
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

const THUMBNAIL_MIME_TYPES = new Set([
    "image/apng",
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const INLINE_MIME_TYPES = new Set([
    ...INLINE_IMAGE_MIME_TYPES,
    "application/pdf",
    "audio/aac",
    "audio/flac",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
    "video/mp4",
    "video/ogg",
    "video/quicktime",
    "video/webm",
    "video/x-m4v",
]);

const normalizeMimeType = (mimeType: string) => mimeType.replace(/;.*$/u, "").trim().toLowerCase();

const getReadToken = (request: FastifyRequest<{ Querystring: FileReadQuery }>) => {
    const readToken = request.query.readToken;
    return typeof readToken === "string" ? readToken : undefined;
};

const verifyReadToken = async (server: FastifyInstance, token: string, fileId: string) => {
    let payload: { id: string; type: "ReadToken" | "UploadToken" };
    try {
        payload = server.jwt.verify(token);
    } catch {
        return false;
    }

    if (payload.type !== "ReadToken") {
        return false;
    }

    const [readToken] = await server.db.select().from(fileReadTokens).where(eq(fileReadTokens.id, payload.id)).limit(1);
    if (!readToken) {
        return false;
    }

    if (readToken.fileId !== fileId) {
        return false;
    }

    if (readToken.expiresAt && readToken.expiresAt.getTime() <= Date.now()) {
        return false;
    }

    return true;
};

const ensureFileAccess = async (
    server: FastifyInstance,
    request: FastifyRequest<{ Querystring: FileReadQuery }>,
    reply: FastifyReply,
    file: Pick<typeof files.$inferSelect, "id" | "ownerId" | "fileAccess">,
) => {
    if (file.fileAccess === "PUBLIC") {
        return true;
    }

    const isOwner = request.authenticated && request.user?.id === file.ownerId;
    if (isOwner) {
        return true;
    }

    if (file.fileAccess === "PROTECTED") {
        const token = getReadToken(request);
        if (token && (await verifyReadToken(server, token, file.id))) {
            return true;
        }
    }

    const status = request.authenticated ? 403 : 401;
    const error = status === 401 ? "Unauthorized" : "Forbidden";
    reply.code(status).send({ error, message: "You do not have access to this file" });
    return false;
};

const ensureFileReadable = (
    reply: FastifyReply,
    file: Pick<typeof files.$inferSelect, "storageState" | "id">,
    actionLabel: string,
) => {
    if (file.storageState === "READY") {
        return true;
    }

    reply.code(409).send({
        message: `File is not ready for ${actionLabel}`,
        fileId: file.id,
        storageState: file.storageState,
    });
    return false;
};

const isMissingFileError = (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if (errorCode === "ENOENT") {
            return true;
        }
    }

    if (!(error instanceof Error)) {
        return false;
    }

    const normalizedMessage = error.message.toLowerCase();
    return normalizedMessage.includes("input file is missing") || normalizedMessage.includes("no such file");
};

export async function getDetailsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FileParams; Querystring: FileReadQuery }>,
    reply: FastifyReply,
) {
    const cleanedFileId = request.params.fileId.split(".")[0];
    if (!cleanedFileId) {
        return reply.code(404).send({ message: "File not found" });
    }

    const [file] = await this.db
        .select({
            id: files.id,
            fileName: files.fileName,
            fileType: files.fileType,
            fileSize: files.fileSize,
            ownerId: files.ownerId,
            parentId: files.parentId,
            fileAccess: files.fileAccess,
            createdAt: files.createdAt,
            updatedAt: files.updatedAt,
            storageState: files.storageState,
        })
        .from(files)
        .where(and(eq(files.id, cleanedFileId), isNull(files.deletedAt)))
        .limit(1);

    if (!file) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (!(await ensureFileAccess(this, request, reply, file))) {
        return reply;
    }

    return reply.code(200).send({
        id: file.id,
        name: file.fileName,
        mimeType: file.fileType,
        sizeBytes: file.fileSize,
        ownerId: file.ownerId,
        folderId: file.parentId,
        access: file.fileAccess,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
        storageState: file.storageState,
    });
}

export async function getFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FileParams; Querystring: FileReadQuery }>,
    reply: FastifyReply,
) {
    const cleanedFileId = request.params.fileId.split(".")[0];

    if (!cleanedFileId) {
        return reply.code(404).send({ message: "File not found" });
    }

    const [fileDetails] = await this.db
        .select()
        .from(files)
        .where(and(eq(files.id, cleanedFileId), isNull(files.deletedAt)))
        .limit(1);

    if (!fileDetails) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (!(await ensureFileAccess(this, request, reply, fileDetails))) {
        return reply;
    }

    if (!ensureFileReadable(reply, fileDetails, "download")) {
        return reply;
    }

    const mimeType = normalizeMimeType(fileDetails.fileType);
    const dispositionType =
        request.query.download === "1" || !INLINE_MIME_TYPES.has(mimeType) ? "attachment" : "inline";

    void reply.header("Cache-Control", "private, no-store");
    void reply.header("Content-Type", mimeType);
    void reply.header("Content-Disposition", contentDisposition(fileDetails.fileName, { type: dispositionType }));

    return reply.sendFile(fileDetails.ownerId + "/" + fileDetails.id, {
        cacheControl: false,
        contentType: false,
    });
}

export async function getThumbnailHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FileParams; Querystring: FileReadQuery }>,
    reply: FastifyReply,
) {
    const cleanedFileId = request.params.fileId.split(".")[0];

    if (!cleanedFileId) {
        return reply.code(404).send({ message: "File not found" });
    }

    const [fileDetails] = await this.db
        .select()
        .from(files)
        .where(and(eq(files.id, cleanedFileId), isNull(files.deletedAt)))
        .limit(1);

    if (!fileDetails) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (!(await ensureFileAccess(this, request, reply, fileDetails))) {
        return reply;
    }

    if (!ensureFileReadable(reply, fileDetails, "thumbnail generation")) {
        return reply;
    }

    if (!THUMBNAIL_MIME_TYPES.has(normalizeMimeType(fileDetails.fileType))) {
        return reply.code(415).send({ message: "Unsupported media type" });
    }

    const fullFilePath = path.join(env.FILE_STORE_PATH, fileDetails.ownerId, fileDetails.id);

    if (request.method === "HEAD") {
        try {
            await stat(fullFilePath);
        } catch (error) {
            if (isMissingFileError(error)) {
                return reply.code(404).send({ message: "File not found" });
            }

            throw error;
        }

        void reply.header("Cache-Control", "private, no-store");
        void reply.header("Content-Type", "image/webp");
        void reply.header("Content-Disposition", "inline");
        return reply.code(200).send();
    }

    try {
        const thumbnailBuffer = await sharp(fullFilePath).resize(300, 200).webp().toBuffer();

        void reply.header("Cache-Control", "private, no-store");
        void reply.header("Content-Type", "image/webp");
        void reply.header("Content-Disposition", "inline");
        return reply.send(thumbnailBuffer);
    } catch (error) {
        if (isMissingFileError(error)) {
            return reply.code(404).send({ message: "File not found" });
        }

        return reply.code(500).send({ message: "Thumbnail generation failed" });
    }
}

export async function patchFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FileParams; Body: PatchFileBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const fileId = request.params.fileId;

    const [fileDetails] = await this.db
        .select({ id: files.id, ownerId: files.ownerId, parentId: files.parentId, fileName: files.fileName })
        .from(files)
        .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
        .limit(1);

    if (!fileDetails) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (fileDetails.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to edit this file" });
    }

    if ("name" in request.body) {
        if (fileDetails.fileName === request.body.name) {
            return reply.code(200).send({
                status: "success",
                message: "File already has this name",
                id: fileId,
                folderId: fileDetails.parentId,
            });
        }

        await this.db.update(files).set({ fileName: request.body.name }).where(eq(files.id, fileId));

        return reply.code(200).send({
            status: "success",
            message: "File renamed successfully",
            id: fileId,
            folderId: fileDetails.parentId,
        });
    }

    const destinationFolderId = request.body.folderId;

    const [destinationFolder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(and(eq(folders.id, destinationFolderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!destinationFolder) {
        return reply.code(404).send({ message: "Destination folder not found" });
    }

    if (destinationFolder.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to move files to this folder" });
    }

    if (fileDetails.parentId === destinationFolderId) {
        return reply.code(200).send({
            status: "success",
            message: "File already in destination folder",
            id: fileId,
            folderId: destinationFolderId,
        });
    }

    await this.db.update(files).set({ parentId: destinationFolderId }).where(eq(files.id, fileId));

    return reply.code(200).send({
        status: "success",
        message: "File moved successfully",
        id: fileId,
        folderId: destinationFolderId,
    });
}

export async function deleteFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: FileParams }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const fileId = request.params.fileId;

    const [fileDetails] = await this.db
        .select({ id: files.id, ownerId: files.ownerId, parentId: files.parentId, deletedAt: files.deletedAt })
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

    if (!fileDetails || fileDetails.deletedAt !== null) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (fileDetails.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to delete this file" });
    }

    await this.db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, fileId));

    return reply.code(200).send({
        status: "success",
        message: "File moved to recycle bin",
        id: fileId,
        folderId: fileDetails.parentId,
    });
}
