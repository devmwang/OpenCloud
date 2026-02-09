import fs from "fs";
import path from "path";

import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";

import { fileReadTokens } from "@/db/schema/auth";
import { files, folders } from "@/db/schema/storage";
import { env } from "@/env/env";

import type { FileParams, FileReadQuery, PatchFileBody } from "./fs.schemas";

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

    void reply.header("Content-Type", fileDetails.fileType);
    void reply.header("Content-Disposition", `filename="${fileDetails.fileName}"`);

    return reply.sendFile(fileDetails.ownerId + "/" + fileDetails.id);
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

    if (!fileDetails.fileType.startsWith("image/")) {
        return reply.code(415).send({ message: "Unsupported media type" });
    }

    void reply.header("Content-Type", fileDetails.fileType);
    void reply.header("Content-Disposition", `filename="${fileDetails.fileName}"`);

    const fullFilePath = path.join(env.FILE_STORE_PATH, fileDetails.ownerId, fileDetails.id);
    try {
        await fs.promises.stat(fullFilePath);
    } catch {
        return reply.code(404).send({ message: "File not found" });
    }

    try {
        const thumbnailBuffer = await sharp(fullFilePath).resize(300, 200).toBuffer();
        return reply.send(thumbnailBuffer);
    } catch {
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
    const destinationFolderId = request.body.folderId;

    const [fileDetails] = await this.db
        .select({ id: files.id, ownerId: files.ownerId, parentId: files.parentId })
        .from(files)
        .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
        .limit(1);

    if (!fileDetails) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (fileDetails.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to edit this file" });
    }

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
