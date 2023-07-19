import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { BusboyFileStream } from "@fastify/busboy";
import type { FastifyJWT } from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import util from "util";
import { pipeline } from "stream";

import type { GetFileParams, DeleteFileQuerystring } from "./fs.schemas";

const pump = util.promisify(pipeline);
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
