import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import type { getDetailsQuerystring, getContentsQuerystring, createFolderInput } from "./folder.schemas";

export async function getDetailsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: getDetailsQuerystring }>,
    reply: FastifyReply,
) {
    const folderId = request.query.folderId;

    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });

    if (!folder) {
        return reply.code(404).send({ message: "Something went wrong. Please try again." });
    }

    let currentFolder = folder;
    const hierarchy: { id: string; name: string; type: string }[] = [];

    while (currentFolder.type != "ROOT" && currentFolder.parentFolderId) {
        const parent = await this.prisma.folder.findUnique({ where: { id: currentFolder.parentFolderId } });

        if (!parent) {
            return reply.code(404).send({ message: "Something went wrong. Please try again." });
        }

        hierarchy.push({ id: parent.id, name: parent.folderName, type: parent.type });

        currentFolder = parent;
    }

    return reply.code(200).send({ id: folderId, name: folder.folderName, type: folder.type, hierarchy: hierarchy });
}

export async function getContentsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: getContentsQuerystring }>,
    reply: FastifyReply,
) {
    const folderId = request.query.folderId;

    const contents = await this.prisma.folder.findFirst({
        where: { id: folderId },
        select: {
            childFiles: {
                select: { id: true, fileName: true },
            },
            childFolders: {
                select: { id: true, folderName: true },
            },
        },
    });

    if (!contents) {
        return reply.code(404).send({ message: "Something went wrong. Please try again." });
    }

    return reply.code(200).send({ id: folderId, folders: contents.childFolders, files: contents.childFiles });
}

export async function createFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: createFolderInput }>,
    reply: FastifyReply,
) {
    const userId = request.user.id;
    const { folderName, parentFolderId } = request.body;

    const existingFolder = await this.prisma.folder.findFirst({
        where: { ownerId: userId, folderName: folderName, parentFolderId: parentFolderId },
    });

    if (existingFolder) {
        return reply.code(400).send({ message: "A folder with this name already exists in the folder" });
    }

    const folder = await this.prisma.folder.create({
        data: {
            ownerId: userId,
            folderName: folderName,
            parentFolderId: parentFolderId,
        },
    });

    return reply.code(201).send({ id: folder.id });
}
