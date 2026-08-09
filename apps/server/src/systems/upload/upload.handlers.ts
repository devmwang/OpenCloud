import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import util from "util";

import type { BusboyFileStream } from "@fastify/busboy";
import type { FastifyJWT } from "@fastify/jwt";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "@/db";
import { uploadTokenRules, uploadTokens } from "@/db/schema/auth";
import type { FileAccess } from "@/db/schema/enums";
import { files, folders } from "@/db/schema/storage";
import { env } from "@/env/env";
import { detectStoredMimeType, UNKNOWN_MIME_TYPE } from "@/utils/stored-mime";

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

    return () => {
        activeUploads -= 1;
        const remainingOwnerUploads = (activeUploadsByOwner.get(ownerId) ?? 1) - 1;
        if (remainingOwnerUploads === 0) {
            activeUploadsByOwner.delete(ownerId);
        } else {
            activeUploadsByOwner.set(ownerId, remainingOwnerUploads);
        }
    };
};

class InvalidMultipartUploadError extends Error {
    constructor(readonly statusCode = 400) {
        super("INVALID_MULTIPART_UPLOAD");
    }
}

class UploadFileTooLargeError extends Error {
    readonly statusCode = 413;

    constructor() {
        super("UPLOAD_FILE_TOO_LARGE");
    }
}

const getMultipartStatusCode = (error: unknown) => {
    if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number") {
        return error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : null;
    }

    if (error instanceof Error && error.message.includes("terminated early")) {
        return 400;
    }

    return null;
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
    uploadTokenValue: string | undefined,
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
    const uploadTokenValue = typeof uploadTokenHeader === "string" ? uploadTokenHeader : undefined;

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

    let file: BusboyFileStream | undefined;
    try {
        const parts = request.parts();
        let firstPart: Awaited<ReturnType<typeof parts.next>>;
        try {
            firstPart = await parts.next();
        } catch (error) {
            throw new InvalidMultipartUploadError(getMultipartStatusCode(error) ?? 400);
        }

        if (firstPart.done || firstPart.value.type !== "file") {
            throw new InvalidMultipartUploadError();
        }

        const fileData = firstPart.value;
        file = fileData.file;
        const fileRecord = await createPendingFile(this.db, fileData.filename, uploadContext);
        if (!fileRecord) {
            fileData.file.destroy();
            void reply.header("Connection", "close");
            return reply.code(409).send({ message: "Upload parent folder is no longer available" });
        }

        await coreUploadHandler(this.db, uploadContext.ownerId, fileRecord.id, fileData.file, async () => {
            if (fileData.file.truncated) {
                throw new UploadFileTooLargeError();
            }

            let trailingPart: Awaited<ReturnType<typeof parts.next>>;
            try {
                trailingPart = await parts.next();
            } catch (error) {
                throw new InvalidMultipartUploadError(getMultipartStatusCode(error) ?? 400);
            }

            if (!trailingPart.done) {
                throw new InvalidMultipartUploadError();
            }
        });

        return reply.code(201).send({
            id: fileRecord.id,
            fileExtension: path.extname(fileData.filename),
            storageState: "READY",
        });
    } catch (error) {
        if (file && !file.readableEnded) {
            file.destroy();
        }

        const multipartStatusCode = getMultipartStatusCode(error);
        if (multipartStatusCode) {
            void reply.header("Connection", "close");
            return reply.code(multipartStatusCode).send({ message: "Invalid multipart upload" });
        }

        request.log.error({ err: error }, "Upload failed");
        void reply.header("Connection", "close");
        return reply.code(500).send({ message: "Upload failed" });
    } finally {
        releaseUploadSlot();
    }
}

async function createPendingFile(db: Database, fileName: string, uploadContext: UploadContext) {
    return db.transaction(async (tx) => {
        const [parentFolder] = await tx
            .select({ id: folders.id })
            .from(folders)
            .where(
                and(
                    eq(folders.id, uploadContext.folderId),
                    eq(folders.ownerId, uploadContext.ownerId),
                    isNull(folders.deletedAt),
                ),
            )
            .for("share")
            .limit(1);

        if (!parentFolder) {
            return null;
        }

        const [fileDetails] = await tx
            .insert(files)
            .values({
                fileName,
                fileType: UNKNOWN_MIME_TYPE,
                ownerId: uploadContext.ownerId,
                fileAccess: uploadContext.fileAccess,
                parentId: parentFolder.id,
                storageState: "PENDING",
                storageError: null,
                storageVerifiedAt: null,
            })
            .returning({ id: files.id });
        if (!fileDetails) {
            throw new Error("Failed to create file details");
        }

        return fileDetails;
    });
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

    try {
        await fs.promises.mkdir(folderPath, { recursive: true });
        const output = fs.createWriteStream(filePath);
        const multipartComplete = verifyMultipartComplete();
        void multipartComplete.catch((error: unknown) => {
            if (!output.destroyed) {
                output.destroy(error instanceof Error ? error : new InvalidMultipartUploadError());
            }
        });
        await pump(file, output);
        await multipartComplete;
        const sizeInBytes = (await fs.promises.stat(filePath)).size;
        const fileType = await detectStoredMimeType(filePath);

        await db
            .update(files)
            .set({
                fileSize: sizeInBytes,
                fileType,
                storageState: "READY",
                storageError: null,
                storageVerifiedAt: new Date(),
            })
            .where(eq(files.id, fileId));
    } catch (error) {
        if (!file.readableEnded) {
            file.destroy();
        }

        const [fileCleanup, recordCleanup] = await Promise.allSettled([
            fs.promises.rm(filePath, { force: true }),
            db.delete(files).where(eq(files.id, fileId)),
        ]);
        if (fileCleanup.status === "rejected") {
            throw fileCleanup.reason;
        }
        if (recordCleanup.status === "rejected") {
            throw recordCleanup.reason;
        }

        throw error;
    }
}
