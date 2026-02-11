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

import type { UploadFileQuerystring } from "./upload.schemas";

const pump = util.promisify(pipeline);

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
    const fileData = await request.file();

    if (!fileData) {
        return reply.code(400).send({ message: "No file provided" });
    }

    const uploadTokenField = fileData.fields["uploadToken"];
    const uploadTokenValue =
        uploadTokenField && "value" in uploadTokenField ? (uploadTokenField.value as string) : null;

    let uploadContext: UploadContext;
    try {
        uploadContext = await resolveUploadContext(this, request, uploadTokenValue);
    } catch (error) {
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

    try {
        const fileRecord = await createFileDetails(
            this.db,
            fileData.filename,
            fileData.mimetype,
            uploadContext.ownerId,
            uploadContext.folderId,
            uploadContext.fileAccess,
        );

        await coreUploadHandler(this.db, uploadContext.ownerId, fileRecord.id, fileData.file);

        return reply.code(201).send({
            id: fileRecord.id,
            fileExtension: path.extname(fileData.filename),
            storageState: "READY",
        });
    } catch (error) {
        request.log.error({ err: error }, "Upload failed");
        return reply.code(500).send({ message: "Upload failed" });
    }
}

async function createFileDetails(
    db: Database,
    fileName: string,
    fileType: string,
    ownerId: string,
    parentFolderId: string,
    fileAccess: FileAccess,
) {
    const [fileDetails] = await db
        .insert(files)
        .values({
            fileName,
            fileType,
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

async function coreUploadHandler(db: Database, ownerId: string, fileId: string, file: BusboyFileStream) {
    const folderPath = path.join(env.FILE_STORE_PATH, ownerId);
    const filePath = path.join(folderPath, fileId);

    try {
        await fs.promises.mkdir(folderPath, { recursive: true });
        await pump(file, fs.createWriteStream(filePath));
        const sizeInBytes = (await fs.promises.stat(filePath)).size;

        await db
            .update(files)
            .set({
                fileSize: sizeInBytes,
                storageState: "READY",
                storageError: null,
                storageVerifiedAt: new Date(),
            })
            .where(eq(files.id, fileId));
    } catch (error) {
        try {
            await fs.promises.unlink(filePath);
        } catch {}

        await db.delete(files).where(eq(files.id, fileId));

        throw error;
    }
}
