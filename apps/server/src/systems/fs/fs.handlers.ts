import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "fs";
import path from "path";
import util from "util";
import sharp from "sharp";

import { env } from "@/env/env";

import type { GetFileParams, GetThumbnailParams, DeleteFileQuerystring } from "./fs.schemas";

const unlinkAsync = util.promisify(fs.unlink);

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

export async function getThumbnailHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Params: GetThumbnailParams }>,
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

    const fullFilePath = path.join(env.FILE_STORE_PATH, fileDetails.ownerId, fileDetails.id);
    const thumbnailBuffer = await sharp(fullFilePath).resize(250, 200).toBuffer();

    return reply.send(thumbnailBuffer);
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
