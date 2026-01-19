import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, eq } from "drizzle-orm";

import { files, folders } from "@/db/schema/storage";
import type { getDetailsQuerystring, getContentsQuerystring, createFolderInput } from "./folder.schemas";

export async function getDetailsHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Querystring: getDetailsQuerystring }>,
    reply: FastifyReply,
) {
    const folderId = request.query.folderId;

    const [folder] = await this.db
        .select({
            id: folders.id,
            folderName: folders.folderName,
            type: folders.type,
            parentFolderId: folders.parentFolderId,
        })
        .from(folders)
        .where(eq(folders.id, folderId))
        .limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Something went wrong. Please try again." });
    }

    let currentFolder = folder;
    const hierarchy: { id: string; name: string; type: string }[] = [];

    while (currentFolder.type != "ROOT" && currentFolder.parentFolderId) {
        const [parent] = await this.db
            .select({
                id: folders.id,
                folderName: folders.folderName,
                type: folders.type,
                parentFolderId: folders.parentFolderId,
            })
            .from(folders)
            .where(eq(folders.id, currentFolder.parentFolderId))
            .limit(1);

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

    const [folder] = await this.db.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId)).limit(1);

    if (!folder) {
        return reply.code(404).send({ message: "Something went wrong. Please try again." });
    }

    const childFolders = await this.db
        .select({ id: folders.id, folderName: folders.folderName })
        .from(folders)
        .where(eq(folders.parentFolderId, folderId));

    const childFiles = await this.db
        .select({ id: files.id, fileName: files.fileName })
        .from(files)
        .where(eq(files.parentId, folderId));

    return reply.code(200).send({ id: folderId, folders: childFolders, files: childFiles });
}

export async function createFolderHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: createFolderInput }>,
    reply: FastifyReply,
) {
    const userId = request.user.id;
    const { folderName, parentFolderId } = request.body;

    const existingFolder = await this.db
        .select({ id: folders.id })
        .from(folders)
        .where(
            and(
                eq(folders.ownerId, userId),
                eq(folders.folderName, folderName),
                eq(folders.parentFolderId, parentFolderId),
            ),
        )
        .limit(1);

    if (existingFolder.length > 0) {
        return reply.code(400).send({ message: "A folder with this name already exists in the folder" });
    }

    const [folder] = await this.db
        .insert(folders)
        .values({
            ownerId: userId,
            folderName: folderName,
            parentFolderId: parentFolderId,
        })
        .returning({ id: folders.id });
    if (!folder) {
        return reply.code(500).send({ message: "Failed to create folder" });
    }

    return reply.code(201).send({ id: folder.id });
}
