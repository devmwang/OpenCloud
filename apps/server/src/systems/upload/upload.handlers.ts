import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { BusboyFileStream } from "@fastify/busboy";
import type { FastifyJWT } from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import util from "util";
import { pipeline } from "stream";

import { env } from "@/env/env";

import type { UploadFileQuerystring } from "./upload.schemas";

const pump = util.promisify(pipeline);
const unlinkAsync = util.promisify(fs.unlink);

export async function uploadHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: UploadFileQuerystring }>,
    reply: FastifyReply,
) {
    const parentFolderId = request.query.parentFolderId;

    const fileData = await request.file();

    if (!fileData) {
        return reply.code(400).send({ status: "fail", error: "No file provided" });
    }

    const newFileId = await createFileDetails(
        this.prisma,
        fileData.filename,
        fileData.mimetype,
        request.user.id,
        parentFolderId,
        "PROTECTED",
    );

    await coreUploadHandler(this.prisma, request.user.id, newFileId, fileData.file);

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

    const uploadToken = await this.prisma.uploadToken.findUnique({
        where: { id: uploadTokenPayload.id },
    });

    if (!uploadToken) {
        return reply.code(401).send({ status: "fail", error: "Invalid upload token" });
    }

    for (const ruleId of uploadToken.accessControlRuleIds) {
        const result = await this.verifyAccessControlRule(request, ruleId);
        if (!result) {
            return reply
                .code(401)
                .send({ status: "fail", error: "Unable to verify compliance with one or more access control rules" });
        }
    }

    const newFileId = await createFileDetails(
        this.prisma,
        fileData.filename,
        fileData.mimetype,
        uploadToken.userId,
        uploadToken.folderId,
        uploadToken.fileAccess,
    );

    await coreUploadHandler(this.prisma, uploadToken.userId, newFileId, fileData.file);

    return reply.code(201).send({ status: "success", id: newFileId, fileExtension: path.extname(fileData.filename) });
}

async function createFileDetails(
    prisma: PrismaClient,
    fileName: string,
    fileType: string,
    ownerId: string,
    parentFolderId: string,
    fileAccess: "PRIVATE" | "PROTECTED" | "PUBLIC",
) {
    // Create file in db
    const fileDetails = await prisma.file.create({
        data: {
            fileName: fileName,
            fileType: fileType,
            ownerId: ownerId,
            fileAccess: fileAccess,
            parentFolder: {
                connect: { id: parentFolderId },
            },
        },
    });

    return fileDetails.id;
}

async function coreUploadHandler(prisma: PrismaClient, ownerId: string, fileId: string, file: BusboyFileStream) {
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

    await prisma.file.update({
        where: { id: fileId },
        data: { fileSize: sizeInBytes },
    });
}
