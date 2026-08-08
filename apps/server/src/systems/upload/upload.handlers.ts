import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import util from "util";

import type { BusboyFileStream } from "@fastify/busboy";
import type { FastifyJWT } from "@fastify/jwt";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fileTypeFromFile } from "file-type";

import type { Database } from "@/db";
import { uploadTokenRules, uploadTokens } from "@/db/schema/auth";
import type { FileAccess } from "@/db/schema/enums";
import { files, folders } from "@/db/schema/storage";
import { env } from "@/env/env";

import type { UploadFileQuerystring } from "./upload.schemas";

const pump = util.promisify(pipeline);
const MAX_ACTIVE_UPLOADS = 8;
const MAX_ACTIVE_UPLOADS_PER_OWNER = 2;

let activeUploads = 0;
const activeUploadsByOwner = new Map<string, number>();

const reserveUploadSlot = (ownerId: string) => {
    const ownerActiveUploads = activeUploadsByOwner.get(ownerId) ?? 0;
    if (activeUploads >= MAX_ACTIVE_UPLOADS || ownerActiveUploads >= MAX_ACTIVE_UPLOADS_PER_OWNER) {
        return null;
    }

    activeUploads += 1;
    activeUploadsByOwner.set(ownerId, ownerActiveUploads + 1);
    let released = false;

    return () => {
        if (released) {
            return;
        }
        released = true;
        activeUploads -= 1;
        const remainingOwnerUploads = (activeUploadsByOwner.get(ownerId) ?? 1) - 1;
        if (remainingOwnerUploads === 0) {
            activeUploadsByOwner.delete(ownerId);
        } else {
            activeUploadsByOwner.set(ownerId, remainingOwnerUploads);
        }
    };
};

class UploadFileTooLargeError extends Error {
    constructor() {
        super("UPLOAD_FILE_TOO_LARGE");
        this.name = "UploadFileTooLargeError";
    }
}

const getClientUploadErrorStatus = (error: unknown) => {
    if (typeof error !== "object" || error === null || !("statusCode" in error)) {
        return null;
    }

    const statusCode = error.statusCode;
    return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500 ? statusCode : null;
};

const isUploadFileTooLargeError = (error: unknown) => {
    if (error instanceof UploadFileTooLargeError) {
        return true;
    }
    if (typeof error !== "object" || error === null) {
        return false;
    }
    return "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE";
};

const isMalformedMultipartError = (error: unknown) => {
    if (typeof error !== "object" || error === null || !("code" in error)) {
        return false;
    }

    return error.code === "ERR_STREAM_PREMATURE_CLOSE";
};

type UploadContext = {
    ownerId: string;
    folderId: string;
    fileAccess: FileAccess;
};

const resolveAuthenticatedUploadContext = async (
    server: FastifyInstance,
    request: FastifyRequest<{ Querystring: UploadFileQuerystring }>,
) => {
    const userId = request.user?.id;
    if (!userId) {
        return null;
    }

    const folderId = request.query.folderId;
    if (!folderId) {
        throw new Error("MISSING_FOLDER_ID");
    }

    const [parentFolder] = await server.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
        .limit(1);

    if (!parentFolder) {
        throw new Error("PARENT_FOLDER_NOT_FOUND");
    }

    if (parentFolder.ownerId !== userId) {
        throw new Error("FORBIDDEN_FOLDER");
    }

    return {
        ownerId: userId,
        folderId: parentFolder.id,
        fileAccess: "PROTECTED" as const,
    } satisfies UploadContext;
};

const resolveTokenUploadContext = async (
    server: FastifyInstance,
    request: FastifyRequest,
    uploadTokenValue: string,
) => {
    let uploadTokenPayload: FastifyJWT["payload"];
    try {
        uploadTokenPayload = server.jwt.verify(uploadTokenValue);
    } catch {
        throw new Error("INVALID_UPLOAD_TOKEN");
    }

    if (!uploadTokenPayload || uploadTokenPayload.type !== "UploadToken" || !uploadTokenPayload.id) {
        throw new Error("INVALID_UPLOAD_TOKEN");
    }

    const [uploadToken] = await server.db
        .select({
            id: uploadTokens.id,
            userId: uploadTokens.userId,
            folderId: uploadTokens.folderId,
            fileAccess: uploadTokens.fileAccess,
            expiresAt: uploadTokens.expiresAt,
        })
        .from(uploadTokens)
        .where(eq(uploadTokens.id, uploadTokenPayload.id))
        .limit(1);

    if (!uploadToken) {
        throw new Error("INVALID_UPLOAD_TOKEN");
    }

    if (uploadToken.expiresAt && uploadToken.expiresAt.getTime() <= Date.now()) {
        throw new Error("UPLOAD_TOKEN_EXPIRED");
    }

    const [tokenFolder] = await server.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(and(eq(folders.id, uploadToken.folderId), isNull(folders.deletedAt)))
        .limit(1);
    if (!tokenFolder) {
        throw new Error("PARENT_FOLDER_NOT_FOUND");
    }

    if (tokenFolder.ownerId !== uploadToken.userId) {
        throw new Error("FORBIDDEN_FOLDER");
    }

    const links = await server.db
        .select({ accessRuleId: uploadTokenRules.accessRuleId })
        .from(uploadTokenRules)
        .where(eq(uploadTokenRules.uploadTokenId, uploadToken.id));
    const accessRuleIds = links.map((link) => link.accessRuleId);

    const isCompliant = await server.verifyAccessControlRules(request, accessRuleIds, uploadToken.userId);
    if (!isCompliant) {
        throw new Error("ACCESS_RULE_MISMATCH");
    }

    return {
        ownerId: uploadToken.userId,
        folderId: uploadToken.folderId,
        fileAccess: uploadToken.fileAccess,
    } satisfies UploadContext;
};

const resolveUploadContext = async (
    server: FastifyInstance,
    request: FastifyRequest<{ Querystring: UploadFileQuerystring }>,
    uploadTokenValue: string | null,
) => {
    if (request.authenticated && request.query.folderId) {
        const context = await resolveAuthenticatedUploadContext(server, request);
        if (context) {
            return context;
        }
    }

    if (uploadTokenValue) {
        return resolveTokenUploadContext(server, request, uploadTokenValue);
    }

    if (request.authenticated) {
        throw new Error("MISSING_FOLDER_ID");
    }

    throw new Error("MISSING_UPLOAD_TOKEN");
};

export async function uploadFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: UploadFileQuerystring }>,
    reply: FastifyReply,
) {
    const uploadTokenHeader = request.headers["x-opencloud-upload-token"];
    const uploadTokenValue = typeof uploadTokenHeader === "string" ? uploadTokenHeader : null;

    let uploadContext: UploadContext;
    try {
        uploadContext = await resolveUploadContext(this, request, uploadTokenValue);
    } catch (error) {
        void reply.header("Connection", "close");
        const message = error instanceof Error ? error.message : "UPLOAD_CONTEXT_ERROR";
        switch (message) {
            case "MISSING_FOLDER_ID":
                return reply.code(400).send({ message: "folderId is required for authenticated uploads" });
            case "MISSING_UPLOAD_TOKEN":
                return reply.code(401).send({ message: "No upload token provided" });
            case "INVALID_UPLOAD_TOKEN":
                return reply.code(401).send({ message: "Invalid upload token" });
            case "UPLOAD_TOKEN_EXPIRED":
                return reply.code(401).send({ message: "Upload token expired" });
            case "PARENT_FOLDER_NOT_FOUND":
                return reply.code(404).send({ message: "Parent folder not found" });
            case "FORBIDDEN_FOLDER":
                return reply.code(403).send({ message: "You do not have permission to upload to this folder" });
            case "ACCESS_RULE_MISMATCH":
                return reply.code(401).send({ message: "Upload request did not satisfy access rules" });
            default:
                request.log.error({ err: error }, "Failed to resolve upload context");
                return reply.code(500).send({ message: "Upload failed" });
        }
    }

    const releaseUploadSlot = reserveUploadSlot(uploadContext.ownerId);
    if (!releaseUploadSlot) {
        void reply.header("Retry-After", "5");
        void reply.header("Connection", "close");
        return reply.code(503).send({ message: "Upload capacity is currently full" });
    }
    let fileStream: BusboyFileStream | null = null;
    try {
        const parts = request.parts();
        const firstPart = await parts.next();
        if (firstPart.done || firstPart.value.type !== "file") {
            return reply.code(400).send({ message: "Exactly one file is required" });
        }

        const fileData = firstPart.value;
        fileStream = fileData.file;
        const verifyMultipartComplete = async () => {
            const trailingPart = await parts.next();
            if (!trailingPart.done) {
                if (trailingPart.value.type === "file") {
                    trailingPart.value.file.destroy();
                }
                throw new Error("UNEXPECTED_MULTIPART_PART");
            }
        };

        const uploadLockResult = await this.tryWithOwnerHierarchySharedLock(uploadContext.ownerId, async () => {
            const fileRecord = await createFileDetails(
                this.db,
                fileData.filename,
                uploadContext.ownerId,
                uploadContext.folderId,
                uploadContext.fileAccess,
            );
            if (!fileRecord) {
                return null;
            }

            await coreUploadHandler(
                this.db,
                uploadContext.ownerId,
                fileRecord.id,
                fileData.file,
                verifyMultipartComplete,
            );
            return fileRecord;
        });
        if (!uploadLockResult.locked) {
            fileData.file.destroy();
            void reply.header("Connection", "close");
            return reply.code(409).send({ message: "Another folder operation is already in progress" });
        }

        const fileRecord = uploadLockResult.result;
        if (!fileRecord) {
            fileData.file.destroy();
            void reply.header("Connection", "close");
            return reply.code(404).send({ message: "Parent folder not found" });
        }

        return reply.code(201).send({
            id: fileRecord.id,
            fileExtension: path.extname(fileData.filename),
            storageState: "READY",
        });
    } catch (error) {
        fileStream?.destroy();
        void reply.header("Connection", "close");
        const clientStatus = getClientUploadErrorStatus(error);
        if (isUploadFileTooLargeError(error)) {
            return reply.code(413).send({ message: "File exceeds the upload size limit" });
        }
        if (
            clientStatus !== null ||
            isMalformedMultipartError(error) ||
            (error instanceof Error && error.message === "UNEXPECTED_MULTIPART_PART")
        ) {
            return reply.code(clientStatus ?? 400).send({ message: "Invalid multipart upload" });
        }

        request.log.error({ err: error }, "Upload failed");
        return reply.code(500).send({ message: "Upload failed" });
    } finally {
        releaseUploadSlot();
    }
}

async function createFileDetails(
    db: Database,
    fileName: string,
    ownerId: string,
    parentFolderId: string,
    fileAccess: FileAccess,
) {
    const [parentFolder] = await db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.id, parentFolderId), eq(folders.ownerId, ownerId), isNull(folders.deletedAt)))
        .limit(1);
    if (!parentFolder) {
        return null;
    }

    const [fileDetails] = await db
        .insert(files)
        .values({
            fileName,
            fileType: "application/octet-stream",
            ownerId,
            fileAccess,
            parentId: parentFolderId,
            storageState: "PENDING",
            storageError: null,
            storageVerifiedAt: null,
        })
        .returning({ id: files.id });
    if (!fileDetails) {
        throw new Error("Failed to create file details");
    }

    return fileDetails;
}

async function coreUploadHandler(
    db: Database,
    ownerId: string,
    fileId: string,
    file: BusboyFileStream,
    verifyMultipartComplete: () => Promise<void>,
) {
    const folderPath = path.join(env.FILE_STORE_PATH, ownerId);
    const filePath = path.join(folderPath, fileId);
    let destinationCreated = false;

    try {
        await fs.promises.mkdir(folderPath, { recursive: true, mode: 0o700 });

        const folderStats = await fs.promises.lstat(folderPath);
        if (!folderStats.isDirectory() || folderStats.isSymbolicLink()) {
            throw new Error("Invalid file owner storage directory");
        }
        await fs.promises.chmod(folderPath, 0o700);

        const destination = fs.createWriteStream(filePath, { flags: "wx", mode: 0o600 });
        destination.once("open", () => {
            destinationCreated = true;
        });

        await pump(file, destination);
        if (file.truncated) {
            throw new UploadFileTooLargeError();
        }
        await verifyMultipartComplete();

        const sizeInBytes = (await fs.promises.stat(filePath)).size;
        const detectedMime = (await fileTypeFromFile(filePath))?.mime ?? "application/octet-stream";

        await db
            .update(files)
            .set({
                fileSize: sizeInBytes,
                fileType: detectedMime,
                storageState: "READY",
                storageError: null,
                storageVerifiedAt: new Date(),
            })
            .where(eq(files.id, fileId));
    } catch (error) {
        const cleanupErrors: unknown[] = [];
        if (destinationCreated) {
            try {
                await fs.promises.unlink(filePath);
            } catch (cleanupError) {
                const err = cleanupError as NodeJS.ErrnoException;
                if (err.code !== "ENOENT") {
                    cleanupErrors.push(cleanupError);
                }
            }
        }

        try {
            await db.delete(files).where(eq(files.id, fileId));
        } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
        }

        if (cleanupErrors.length > 0) {
            throw new AggregateError([error, ...cleanupErrors], "Upload failed and cleanup was incomplete");
        }

        throw error;
    }
}
