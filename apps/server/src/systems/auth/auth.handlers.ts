import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";

import { accessRules } from "@/db/schema/access-rules";
import { uploadTokens } from "@/db/schema/auth";
import { users } from "@/db/schema/users";
import { folders } from "@/db/schema/storage";
import type { CreateUserInput, CreateAccessRuleInput, CreateUploadTokenInput } from "./auth.schemas";
import { createUserWithRootFolder } from "./auth.utils";

export async function createUserHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateUserInput }>,
    reply: FastifyReply,
) {
    const { username, firstName, lastName, password } = request.body;

    try {
        if (!request.user?.id) {
            return reply.code(401).send({ message: "Unauthorized" });
        }

        const requestingUserId = request.user.id;

        const [requestingUser] = await this.db
            .select({ id: users.id, role: users.role })
            .from(users)
            .where(eq(users.id, requestingUserId))
            .limit(1);
        if (!requestingUser || requestingUser.role !== "ADMIN") {
            return reply.code(403).send({ message: "Admin access required" });
        }

        // Verify that user does not already exist
        const existingUser = await this.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, username))
            .limit(1);
        if (existingUser.length > 0) {
            return reply.code(400).send({ message: "User with username already exists" });
        }

        const hashedPassword = await argon2.hash(password);
        const userWithRoot = await createUserWithRootFolder(this.db, {
            username,
            passwordHash: hashedPassword,
            ...(firstName !== undefined ? { firstName } : {}),
            ...(lastName !== undefined ? { lastName } : {}),
        });

        // Return user
        return reply.code(201).send({
            id: userWithRoot.id,
            username: userWithRoot.username,
            firstName: userWithRoot.firstName,
            lastName: userWithRoot.lastName,
            role: userWithRoot.role,
            rootFolderId: userWithRoot.rootFolderId,
        });
    } catch (e) {
        console.log(e);
        return reply.code(500).send(e);
    }
}

export async function infoHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.id) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const userId = request.user.id;

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
        return reply.code(500).send({ message: "Something went wrong. Please try again." });
    }

    return reply.code(200).send({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        rootFolderId: user.rootFolderId,
    });
}

export async function createAccessRuleHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateAccessRuleInput }>,
    reply: FastifyReply,
) {
    const { name, type, method, match } = request.body;

    await this.db.insert(accessRules).values({
        name: name,
        type: type,
        method: method,
        match: match,
    });

    return reply.code(200).send({ status: "success", message: "Access Rule created" });
}

export async function createUploadTokenHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateUploadTokenInput }>,
    reply: FastifyReply,
) {
    if (!request.user?.id) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const userId = request.user.id;

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [folder] = await this.db
        .select({ id: folders.id, ownerId: folders.ownerId })
        .from(folders)
        .where(eq(folders.id, request.body.folderId))
        .limit(1);

    if (!user || !folder) {
        return reply.code(500).send({ message: "Something went wrong. Please try again." });
    }

    if (user.id != folder.ownerId) {
        return reply
            .code(403)
            .send({ message: "You do not have permission to create an upload token for this folder" });
    }

    const { description, folderId, fileAccess } = request.body;

    const [uploadToken] = await this.db
        .insert(uploadTokens)
        .values({
            userId: user.id,
            description: description != undefined ? description : null,
            folderId: folderId,
            fileAccess: fileAccess,
        })
        .returning();
    if (!uploadToken) {
        return reply.code(500).send({ message: "Failed to create upload token" });
    }

    return reply.code(200).send({ uploadToken: this.jwt.sign({ id: uploadToken.id, type: "UploadToken" }) });
}
