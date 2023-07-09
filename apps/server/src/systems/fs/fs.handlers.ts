import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { BusboyFileStream } from "@fastify/busboy";
import type { FastifyJWT } from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import util from "util";
import { pipeline } from "stream";

import type { UploadFileQuerystring, GetFileParams, DeleteFileQuerystring } from "./fs.schemas";

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
        "PRIVATE",
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
    const folderPath = "./FileStore/" + ownerId;
    const filePath = folderPath + "/" + fileId;

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

export async function getFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: GetFileParams }>,
    reply: FastifyReply,
) {
    // Remove file extension from file details
    const cleanedFileId = request.params.fileId.split(".")[0];

    if (!cleanedFileId) {
        return reply.code(404).send({ message: "File not found" });
    }

    const fileDetails = await this.prisma.file.findUnique({
        where: { id: cleanedFileId },
    });

    if (!fileDetails) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (fileDetails.fileAccess != "PUBLIC") {
        if (request.authenticated == false) {
            return reply.code(401).send({ error: "Unauthorized", message: "You do not have access to this file" });
        }

        if (request.user.id != fileDetails.ownerId) {
            return reply.code(403).send({ error: "Forbidden", message: "You do not have access to this file" });
        }
    }

    void reply.header("Content-Type", fileDetails.fileType);
    void reply.header("Content-Disposition", `filename="${fileDetails.fileName}"`);

    return reply.sendFile(fileDetails.ownerId + "/" + fileDetails.id);
}

export async function deleteFileHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: DeleteFileQuerystring }>,
    reply: FastifyReply,
) {
    const fileDetails = await this.prisma.file.findUnique({
        where: { id: request.query.fileId },
    });

    if (!fileDetails) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (request.user.id != fileDetails.ownerId) {
        return reply.code(403).send({ error: "Forbidden", message: "You do not have permission to edit this file" });
    }

    const folderPath = "./FileStore/" + request.user.id;
    const filePath = folderPath + "/" + fileDetails.id;

    try {
        await unlinkAsync(filePath);
    } catch (e) {
        return reply.code(403).send({ status: "fail", message: "File deletion failed" });
    }

    await this.prisma.file.delete({
        where: { id: fileDetails.id },
    });

    return reply.code(200).send({ status: "success", message: "File deleted successfully" });
}
