import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import util from "util";

import type { BusboyFileStream } from "@fastify/busboy";
import type { FastifyJWT } from "@fastify/jwt";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "@/db";
import { uploadTokens } from "@/db/schema/auth";
import type { FileAccess } from "@/db/schema/enums";
import { files, folders } from "@/db/schema/storage";
import { env } from "@/env/env";

import type { UploadFileQuerystring } from "./upload.schemas";

const pump = util.promisify(pipeline);
export async function uploadHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: UploadFileQuerystring }>,
    reply: FastifyReply,
) {
    if (!request.user?.id) {
        return reply.code(401).send({ status: "fail", error: "Unauthorized" });
    }

    const userId = request.user.id;

    const parentFolderId = request.query.parentFolderId;

    const [parentFolder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(eq(folders.id, parentFolderId))
        .limit(1);
    if (!parentFolder) {
        return reply.code(404).send({ status: "fail", error: "Parent folder not found" });
    }
    if (parentFolder.ownerId !== userId) {
        return reply.code(403).send({ status: "fail", error: "You do not have permission to upload to this folder" });
    }

    const fileData = await request.file();

    if (!fileData) {
        return reply.code(400).send({ status: "fail", error: "No file provided" });
    }

    try {
        const newFileId = await createFileDetails(
            this.db,
            fileData.filename,
            fileData.mimetype,
            userId,
            parentFolderId,
            "PROTECTED",
        );

        await coreUploadHandler(this.db, userId, newFileId, fileData.file);

        return reply
            .code(201)
            .send({ status: "success", id: newFileId, fileExtension: path.extname(fileData.filename) });
    } catch (error) {
        request.log.error({ err: error }, "Upload failed");
        return reply.code(500).send({ status: "fail", error: "Upload failed" });
    }
}

export async function tokenUploadHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const fileData = await request.file();

    if (!fileData) {
        return reply.code(400).send({ status: "fail", error: "No file provided" });
    }

    if (!fileData.fields["uploadToken"] || !("value" in fileData.fields["uploadToken"])) {
        return reply.code(401).send({ status: "fail", error: "No upload token provided" });
    }

    let uploadTokenPayload: FastifyJWT["payload"];
    try {
        uploadTokenPayload = this.jwt.verify(fileData.fields["uploadToken"].value as string);
    } catch {
        return reply.code(401).send({ status: "fail", error: "Invalid upload token" });
    }

    if (!uploadTokenPayload || uploadTokenPayload.type !== "UploadToken" || !uploadTokenPayload.id) {
        return reply.code(401).send({ status: "fail", error: "Invalid upload token" });
    }

    const [uploadToken] = await this.db
        .select()
        .from(uploadTokens)
        .where(eq(uploadTokens.id, uploadTokenPayload.id))
        .limit(1);

    if (!uploadToken) {
        return reply.code(401).send({ status: "fail", error: "Invalid upload token" });
    }

    if (uploadToken.expiresAt && uploadToken.expiresAt.getTime() <= Date.now()) {
        return reply.code(401).send({ status: "fail", error: "Upload token expired" });
    }

    const [tokenFolder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(eq(folders.id, uploadToken.folderId))
        .limit(1);
    if (!tokenFolder) {
        return reply.code(404).send({ status: "fail", error: "Parent folder not found" });
    }
    if (tokenFolder.ownerId !== uploadToken.userId) {
        return reply.code(403).send({ status: "fail", error: "You do not have permission to upload to this folder" });
    }

    for (const ruleId of uploadToken.accessControlRuleIds ?? []) {
        const result = await this.verifyAccessControlRule(request, ruleId, uploadToken.userId);
        if (!result) {
            return reply
                .code(401)
                .send({ status: "fail", error: "Unable to verify compliance with one or more access control rules" });
        }
    }

    try {
        const newFileId = await createFileDetails(
            this.db,
            fileData.filename,
            fileData.mimetype,
            uploadToken.userId,
            uploadToken.folderId,
            uploadToken.fileAccess,
        );

        await coreUploadHandler(this.db, uploadToken.userId, newFileId, fileData.file);

        return reply
            .code(201)
            .send({ status: "success", id: newFileId, fileExtension: path.extname(fileData.filename) });
    } catch (error) {
        request.log.error({ err: error }, "Token upload failed");
        return reply.code(500).send({ status: "fail", error: "Upload failed" });
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
    // Create file in db
    const [fileDetails] = await db
        .insert(files)
        .values({
            fileName: fileName,
            fileType: fileType,
            ownerId: ownerId,
            fileAccess: fileAccess,
            parentId: parentFolderId,
        })
        .returning({ id: files.id });
    if (!fileDetails) {
        throw new Error("Failed to create file details");
    }

    return fileDetails.id;
}

async function coreUploadHandler(db: Database, ownerId: string, fileId: string, file: BusboyFileStream) {
    const folderPath = path.join(env.FILE_STORE_PATH, ownerId);
    const filePath = path.join(folderPath, fileId);

    try {
        // Verify correct folder structure exists, otherwise create it
        await fs.promises.mkdir(folderPath, { recursive: true });

        // Save file to appropriate FileStore
        await pump(file, fs.createWriteStream(filePath));

        // Save file size to db
        const sizeInBytes = (await fs.promises.stat(filePath)).size;

        await db.update(files).set({ fileSize: sizeInBytes }).where(eq(files.id, fileId));
    } catch (error) {
        try {
            await fs.promises.unlink(filePath);
        } catch {}

        await db.delete(files).where(eq(files.id, fileId));
        throw error;
    }
}
