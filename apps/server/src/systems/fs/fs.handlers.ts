import fs from "fs";
import path from "path";

import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { fileReadTokens } from "@/db/schema/auth";
import { files, folders } from "@/db/schema/storage";
import { env } from "@/env/env";

import type { FileParams, FileReadQuery, PatchFileBody } from "./fs.schemas";

const FILE_TYPE_SAMPLE_BYTES = 64 * 1024;
const MAX_THUMBNAIL_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_THUMBNAIL_INPUT_PIXELS = 40_000_000;
const MAX_CONCURRENT_THUMBNAILS = 4;
const FILE_ROBOTS_POLICY = "noindex, nofollow, noarchive, nosnippet, noimageindex";

const INLINE_MEDIA_MIME_TYPES = new Set([
    "image/avif",
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/webp",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "video/mp4",
    "video/ogg",
    "video/quicktime",
    "video/vnd.avi",
    "video/webm",
    "video/x-m4v",
    "video/x-msvideo",
]);

const THUMBNAIL_SOURCE_MIME_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const THUMBNAIL_SOURCE_FORMATS = new Set(["avif", "gif", "jpeg", "png", "webp"]);
type StoredFileAccess = (typeof files.$inferSelect)["fileAccess"];

let activeThumbnailJobs = 0;

class ThumbnailSourceTooLargeError extends Error {
    constructor() {
        super("THUMBNAIL_SOURCE_TOO_LARGE");
        this.name = "ThumbnailSourceTooLargeError";
    }
}

const toRfc5987Value = (value: string) =>
    encodeURIComponent(value).replace(/[!'()*]/g, (character) => {
        return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
    });

const buildContentDisposition = (fileName: string, type: "attachment" | "inline") => {
    const leafName = fileName.replace(/\\/g, "/").split("/").pop() ?? "download";
    const boundedName = Array.from(leafName).slice(0, 180).join("").normalize("NFC");
    const safeName =
        Array.from(boundedName, (character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint < 32 || codePoint === 127 ? "_" : character;
        }).join("") || "download";
    const asciiFallback =
        Array.from(safeName.normalize("NFKD"), (character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            if (codePoint < 32 || codePoint > 126 || character === '"' || character === "\\") {
                return "_";
            }
            return character;
        }).join("") || "download";

    return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${toRfc5987Value(safeName)}`;
};

const getFileCacheControl = (fileAccess: StoredFileAccess) =>
    fileAccess === "PUBLIC" ? "public, max-age=300" : "private, no-store";

const getBaseMimeType = (mimeType: string) => mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

const applyFileResponseHeaders = (
    reply: FastifyReply,
    options: {
        contentType: string;
        disposition: "attachment" | "inline";
        fileName: string;
        fileAccess: StoredFileAccess;
    },
) => {
    void reply.header("Content-Type", options.contentType);
    void reply.header("Content-Disposition", buildContentDisposition(options.fileName, options.disposition));
    void reply.header("Cache-Control", getFileCacheControl(options.fileAccess));
    void reply.header("X-Content-Type-Options", "nosniff");
    void reply.header("X-Robots-Tag", FILE_ROBOTS_POLICY);
};

const readFilePrefix = async (filePath: string, maxBytes: number) => {
    const fileHandle = await fs.promises.open(filePath, "r");
    try {
        const stats = await fileHandle.stat();
        if (!stats.isFile()) {
            throw new Error("Stored file is not a regular file");
        }

        const buffer = Buffer.alloc(Math.min(stats.size, maxBytes));
        const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await fileHandle.close();
    }
};

const detectStoredFileMime = async (filePath: string) => {
    const sample = await readFilePrefix(filePath, FILE_TYPE_SAMPLE_BYTES);
    return (await fileTypeFromBuffer(sample))?.mime ?? "application/octet-stream";
};

const readBoundedFile = async (filePath: string, maxBytes: number) => {
    const fileHandle = await fs.promises.open(filePath, "r");
    try {
        const stats = await fileHandle.stat();
        if (!stats.isFile()) {
            throw new Error("Stored file is not a regular file");
        }
        if (stats.size > maxBytes) {
            throw new ThumbnailSourceTooLargeError();
        }

        const buffer = Buffer.alloc(stats.size);
        let offset = 0;
        while (offset < buffer.length) {
            const { bytesRead } = await fileHandle.read(buffer, offset, buffer.length - offset, offset);
            if (bytesRead === 0) {
                break;
            }
            offset += bytesRead;
        }
        return buffer.subarray(0, offset);
    } finally {
        await fileHandle.close();
    }
};

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

    let verifiedMime = "application/octet-stream";
    if (file.storageState === "READY") {
        const fullFilePath = path.join(env.FILE_STORE_PATH, file.ownerId, file.id);
        try {
            verifiedMime = await detectStoredFileMime(fullFilePath);
        } catch (error) {
            if (isMissingFileError(error)) {
                return reply.code(404).send({ message: "File not found" });
            }
            throw error;
        }
    }

    void reply.header("Cache-Control", getFileCacheControl(file.fileAccess));
    void reply.header("X-Robots-Tag", FILE_ROBOTS_POLICY);

    return reply.code(200).send({
        id: file.id,
        name: file.fileName,
        mimeType: verifiedMime,
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

    const relativeFilePath = fileDetails.ownerId + "/" + fileDetails.id;
    const fullFilePath = path.join(env.FILE_STORE_PATH, relativeFilePath);
    let detectedMime: string;
    try {
        detectedMime = await detectStoredFileMime(fullFilePath);
    } catch (error) {
        if (isMissingFileError(error)) {
            return reply.code(404).send({ message: "File not found" });
        }
        throw error;
    }

    const inlineMime = INLINE_MEDIA_MIME_TYPES.has(getBaseMimeType(detectedMime)) ? detectedMime : undefined;
    applyFileResponseHeaders(reply, {
        contentType: inlineMime ?? "application/octet-stream",
        disposition: inlineMime ? "inline" : "attachment",
        fileName: fileDetails.fileName,
        fileAccess: fileDetails.fileAccess,
    });
    void reply.header("Content-Security-Policy", "sandbox; default-src 'none'");
    void reply.header("Referrer-Policy", "no-referrer");

    return reply.sendFile(relativeFilePath, { cacheControl: false, contentType: false });
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

    if (activeThumbnailJobs >= MAX_CONCURRENT_THUMBNAILS) {
        void reply.header("Retry-After", "1");
        return reply.code(503).send({ message: "Thumbnail service is busy" });
    }

    const fullFilePath = path.join(env.FILE_STORE_PATH, fileDetails.ownerId, fileDetails.id);
    activeThumbnailJobs += 1;
    try {
        const sourceBuffer = await readBoundedFile(fullFilePath, MAX_THUMBNAIL_SOURCE_BYTES);
        const detectedType = await fileTypeFromBuffer(sourceBuffer);
        if (!detectedType || !THUMBNAIL_SOURCE_MIME_TYPES.has(detectedType.mime)) {
            return reply.code(415).send({ message: "Unsupported media type" });
        }

        const image = sharp(sourceBuffer, {
            animated: false,
            failOn: "error",
            limitInputPixels: MAX_THUMBNAIL_INPUT_PIXELS,
            sequentialRead: true,
        });
        const metadata = await image.metadata();
        if (!metadata.format || !THUMBNAIL_SOURCE_FORMATS.has(metadata.format)) {
            return reply.code(415).send({ message: "Unsupported media type" });
        }

        const thumbnailBuffer = await image
            .rotate()
            .resize({ width: 300, height: 200, fit: "inside", withoutEnlargement: true })
            .png()
            .timeout({ seconds: 5 })
            .toBuffer();
        applyFileResponseHeaders(reply, {
            contentType: "image/png",
            disposition: "inline",
            fileName: `${fileDetails.fileName}.png`,
            fileAccess: fileDetails.fileAccess,
        });
        void reply.header("Content-Security-Policy", "sandbox; default-src 'none'");
        void reply.header("Referrer-Policy", "no-referrer");
        return reply.send(thumbnailBuffer);
    } catch (error) {
        if (isMissingFileError(error)) {
            return reply.code(404).send({ message: "File not found" });
        }

        if (error instanceof ThumbnailSourceTooLargeError) {
            return reply.code(413).send({ message: "Image is too large for thumbnail generation" });
        }

        return reply.code(500).send({ message: "Thumbnail generation failed" });
    } finally {
        activeThumbnailJobs -= 1;
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
