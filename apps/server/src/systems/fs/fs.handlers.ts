import fs from "fs";
import path from "path";

import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";

import { fileReadTokens } from "@/db/schema/auth";
import { files } from "@/db/schema/storage";
import { users } from "@/db/schema/users";
import { env } from "@/env/env";

import type {
    DeleteFileQuerystring,
    GetDetailsQuerystring,
    GetFileParams,
    GetFileQuerystring,
    GetThumbnailParams,
    GetThumbnailQuerystring,
    PurgeDeletedBody,
} from "./fs.schemas";

const getReadToken = (request: FastifyRequest) => {
    if (!request.query || typeof request.query !== "object") {
        return undefined;
    }

    const readToken = (request.query as { readToken?: string }).readToken;
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
    request: FastifyRequest,
    reply: FastifyReply,
    file: typeof files.$inferSelect,
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

export async function getDetailsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: GetDetailsQuerystring }>,
    reply: FastifyReply,
) {
    const fileId = request.query.fileId;

    const [file] = await this.db
        .select()
        .from(files)
        .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
        .limit(1);

    if (!file) {
        return reply.code(404).send({ message: "Something went wrong. Please try again." });
    }

    if (!(await ensureFileAccess(this, request, reply, file))) {
        return reply;
    }

    return reply.code(200).send({
        id: fileId,
        name: file.fileName,
        ownerId: file.ownerId,
        parentId: file.parentId,
        fileType: file.fileType,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
    });
}

export async function getFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: GetFileParams; Querystring: GetFileQuerystring }>,
    reply: FastifyReply,
) {
    // Remove file extension from file details
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

    void reply.header("Content-Type", fileDetails.fileType);
    void reply.header("Content-Disposition", `filename="${fileDetails.fileName}"`);

    return reply.sendFile(fileDetails.ownerId + "/" + fileDetails.id);
}

export async function getThumbnailHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: GetThumbnailParams; Querystring: GetThumbnailQuerystring }>,
    reply: FastifyReply,
) {
    // Remove file extension from file details
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

export async function deleteFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: DeleteFileQuerystring }>,
    reply: FastifyReply,
) {
    const [fileDetails] = await this.db
        .select()
        .from(files)
        .where(and(eq(files.id, request.query.fileId), isNull(files.deletedAt)))
        .limit(1);

    if (!fileDetails) {
        return reply.code(404).send({ message: "File not found" });
    }

    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ error: "Unauthorized", message: "You do not have permission to edit this file" });
    }

    if (userId != fileDetails.ownerId) {
        return reply.code(403).send({ error: "Forbidden", message: "You do not have permission to edit this file" });
    }

    const folderPath = path.join(env.FILE_STORE_PATH, userId);
    const filePath = path.join(folderPath, fileDetails.id);

    await this.db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, fileDetails.id));

    try {
        await fs.promises.unlink(filePath);
        await this.db.delete(files).where(eq(files.id, fileDetails.id));
        return reply.code(200).send({ status: "success", message: "File deleted successfully" });
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
            await this.db.delete(files).where(eq(files.id, fileDetails.id));
            return reply.code(200).send({ status: "success", message: "File deleted successfully" });
        }
    }

    return reply.code(200).send({ status: "success", message: "File deletion scheduled" });
}

export async function purgeDeletedHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: PurgeDeletedBody }>,
    reply: FastifyReply,
) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const [user] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== "ADMIN") {
        return reply.code(403).send({ message: "Admin access required" });
    }

    const retentionDays = request.body?.olderThanDays ?? env.FILE_PURGE_RETENTION_DAYS;
    const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedFiles = await this.db
        .select({ id: files.id, ownerId: files.ownerId, deletedAt: files.deletedAt })
        .from(files)
        .where(and(isNotNull(files.deletedAt), lte(files.deletedAt, threshold)));

    const purgedIds: string[] = [];

    for (const file of deletedFiles) {
        const filePath = path.join(env.FILE_STORE_PATH, file.ownerId, file.id);
        try {
            await fs.promises.unlink(filePath);
            purgedIds.push(file.id);
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === "ENOENT") {
                purgedIds.push(file.id);
            }
        }
    }

    if (purgedIds.length > 0) {
        await this.db.delete(files).where(inArray(files.id, purgedIds));
    }

    return reply.code(200).send({ status: "success", purged: purgedIds.length });
}
