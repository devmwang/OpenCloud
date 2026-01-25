import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { BusboyFileStream } from "@fastify/busboy";
import type { FastifyJWT } from "@fastify/jwt";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import util from "util";
import { pipeline } from "stream";

import type { Database } from "@/db";
import { uploadTokens } from "@/db/schema/auth";
import type { FileAccess } from "@/db/schema/enums";
import { files } from "@/db/schema/storage";
import { env } from "@/env/env";

import type { UploadFileQuerystring } from "./upload.schemas";

const pump = util.promisify(pipeline);
const unlinkAsync = util.promisify(fs.unlink);

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

    const fileData = await request.file();

    if (!fileData) {
        return reply.code(400).send({ status: "fail", error: "No file provided" });
    }

    const newFileId = await createFileDetails(
        this.db,
        fileData.filename,
        fileData.mimetype,
        userId,
        parentFolderId,
        "PROTECTED",
    );

    await coreUploadHandler(this.db, userId, newFileId, fileData.file);

    return reply.code(201).send({ status: "success", id: newFileId, fileExtension: path.extname(fileData.filename) });
}

export async function tokenUploadHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const fileData = await request.file();

    if (!fileData) {
        return reply.code(400).send({ status: "fail", error: "No file provided" });
    }

    if (!fileData.fields["uploadToken"] || !("value" in fileData.fields["uploadToken"])) {
        return reply.code(401).send({ status: "fail", error: "No upload token provided" });
    }

    const uploadTokenPayload: FastifyJWT["payload"] = this.jwt.verify(fileData.fields["uploadToken"].value as string);

    const [uploadToken] = await this.db
        .select()
        .from(uploadTokens)
        .where(eq(uploadTokens.id, uploadTokenPayload.id))
        .limit(1);

    if (!uploadToken) {
        return reply.code(401).send({ status: "fail", error: "Invalid upload token" });
    }

    for (const ruleId of uploadToken.accessControlRuleIds ?? []) {
        const result = await this.verifyAccessControlRule(request, ruleId);
        if (!result) {
            return reply
                .code(401)
                .send({ status: "fail", error: "Unable to verify compliance with one or more access control rules" });
        }
    }

    const newFileId = await createFileDetails(
        this.db,
        fileData.filename,
        fileData.mimetype,
        uploadToken.userId,
        uploadToken.folderId,
        uploadToken.fileAccess,
    );

    await coreUploadHandler(this.db, uploadToken.userId, newFileId, fileData.file);

    return reply.code(201).send({ status: "success", id: newFileId, fileExtension: path.extname(fileData.filename) });
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

    // Verify correct folder structure exists, otherwise create it
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    // Save file to appropriate FileStore
    await pump(file, fs.createWriteStream(filePath));

    // Save file size to db
    const sizeInBytes = fs.statSync(filePath).size;

    await db.update(files).set({ fileSize: sizeInBytes }).where(eq(files.id, fileId));
}
