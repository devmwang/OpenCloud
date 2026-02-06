import * as argon2 from "argon2";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { accessRules } from "@/db/schema/access-rules";
import { fileReadTokens, uploadTokens } from "@/db/schema/auth";
import { files, folders } from "@/db/schema/storage";
import { users } from "@/db/schema/users";

import type {
    CreateAccessRuleInput,
    CreateReadTokenInput,
    CreateUploadTokenInput,
    CreateUserInput,
} from "./auth.schemas";
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
        request.log.error({ err: e }, "Failed to create user");
        return reply.code(500).send({ error: "InternalServerError", message: "Failed to create user" });
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

export async function listAccessRulesHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const rules = await this.db
        .select({
            id: accessRules.id,
            name: accessRules.name,
            type: accessRules.type,
            method: accessRules.method,
            match: accessRules.match,
            createdAt: accessRules.createdAt,
            updatedAt: accessRules.updatedAt,
        })
        .from(accessRules)
        .where(eq(accessRules.ownerId, userId))
        .orderBy(desc(accessRules.createdAt));

    return reply.code(200).send({
        accessRules: rules.map((rule) => ({
            id: rule.id,
            name: rule.name,
            type: rule.type,
            method: rule.method,
            match: rule.match,
            createdAt: rule.createdAt.toISOString(),
            updatedAt: rule.updatedAt.toISOString(),
        })),
    });
}

export async function listUploadTokensHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const tokens = await this.db
        .select({
            id: uploadTokens.id,
            description: uploadTokens.description,
            folderId: uploadTokens.folderId,
            fileAccess: uploadTokens.fileAccess,
            accessControlRuleIds: uploadTokens.accessControlRuleIds,
            expiresAt: uploadTokens.expiresAt,
            createdAt: uploadTokens.createdAt,
            updatedAt: uploadTokens.updatedAt,
        })
        .from(uploadTokens)
        .where(eq(uploadTokens.userId, userId))
        .orderBy(desc(uploadTokens.createdAt));

    return reply.code(200).send({
        uploadTokens: tokens.map((token) => ({
            id: token.id,
            description: token.description,
            folderId: token.folderId,
            fileAccess: token.fileAccess,
            accessControlRuleIds: token.accessControlRuleIds ?? [],
            expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
            createdAt: token.createdAt.toISOString(),
            updatedAt: token.updatedAt.toISOString(),
        })),
    });
}

export async function createAccessRuleHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateAccessRuleInput }>,
    reply: FastifyReply,
) {
    const { name, type, method, match } = request.body;
    const userId = request.user?.id;
    if (!userId) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    await this.db.insert(accessRules).values({
        name: name,
        type: type,
        method: method,
        match: match,
        ownerId: userId,
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

    const { description, folderId, fileAccess, accessControlRuleIds, expiresAt } = request.body;

    const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(expiry.getTime())) {
        return reply.code(400).send({ message: "Invalid expiresAt value" });
    }

    const ruleIds = accessControlRuleIds?.length ? Array.from(new Set(accessControlRuleIds)) : undefined;
    if (ruleIds && ruleIds.length > 0) {
        const existingRules = await this.db
            .select({ id: accessRules.id })
            .from(accessRules)
            .where(and(inArray(accessRules.id, ruleIds), eq(accessRules.ownerId, user.id)));
        if (existingRules.length !== ruleIds.length) {
            return reply.code(400).send({ message: "One or more access control rules are invalid" });
        }
    }

    const [uploadToken] = await this.db
        .insert(uploadTokens)
        .values({
            userId: user.id,
            description: description != undefined ? description : null,
            folderId: folderId,
            fileAccess: fileAccess,
            accessControlRuleIds: ruleIds && ruleIds.length > 0 ? ruleIds : null,
            expiresAt: expiry,
        })
        .returning();
    if (!uploadToken) {
        return reply.code(500).send({ message: "Failed to create upload token" });
    }

    return reply.code(200).send({
        uploadToken: this.jwt.sign({ id: uploadToken.id, type: "UploadToken" }),
        expiresAt: expiry.toISOString(),
    });
}

export async function createReadTokenHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateReadTokenInput }>,
    reply: FastifyReply,
) {
    if (!request.user?.id) {
        return reply.code(401).send({ message: "Unauthorized" });
    }

    const userId = request.user.id;
    const { fileId, description, expiresAt } = request.body;

    const [file] = await this.db
        .select({ id: files.id, ownerId: files.ownerId, fileAccess: files.fileAccess })
        .from(files)
        .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
        .limit(1);

    if (!file) {
        return reply.code(404).send({ message: "File not found" });
    }

    if (file.ownerId !== userId) {
        return reply.code(403).send({ message: "You do not have permission to create a read token for this file" });
    }

    if (file.fileAccess !== "PROTECTED") {
        return reply.code(400).send({ message: "Read tokens can only be created for protected files" });
    }

    const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(expiry.getTime())) {
        return reply.code(400).send({ message: "Invalid expiresAt value" });
    }

    const [readToken] = await this.db
        .insert(fileReadTokens)
        .values({
            userId,
            fileId,
            description: description != undefined ? description : null,
            expiresAt: expiry,
        })
        .returning();

    if (!readToken) {
        return reply.code(500).send({ message: "Failed to create read token" });
    }

    return reply.code(200).send({
        readToken: this.jwt.sign({ id: readToken.id, type: "ReadToken" }),
        expiresAt: expiry.toISOString(),
    });
}

export async function csrfTokenHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const csrfToken = reply.generateCsrf();

    return reply.code(200).send({ csrfToken });
}
