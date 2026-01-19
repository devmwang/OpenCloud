import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FastifyJWT } from "@fastify/jwt";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import ms from "ms";

import { env } from "@/env/env";
import { accessRules } from "@/db/schema/access-rules";
import { refreshTokens, uploadTokens } from "@/db/schema/auth";
import { users } from "@/db/schema/users";
import { folders } from "@/db/schema/storage";
import type { CreateUserInput, LoginInput, CreateAccessRuleInput, CreateUploadTokenInput } from "./auth.schemas";

export async function createUserHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateUserInput }>,
    reply: FastifyReply,
) {
    const { username, firstName, lastName, password } = request.body;

    try {
        // Verify that user does not already exist
        const existingUser = await this.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, username))
            .limit(1);
        if (existingUser.length > 0) {
            return reply.code(400).send({ message: "User with username already exists" });
        }

        // Create user in db
        const hashedPassword = await argon2.hash(password);

        const userWithRoot = await this.db.transaction(async (tx) => {
            const [user] = await tx
                .insert(users)
                .values({
                    username: username,
                    firstName: firstName != undefined ? firstName : null,
                    lastName: lastName != undefined ? lastName : null,
                    password: hashedPassword,
                })
                .returning();
            if (!user) {
                throw new Error("Failed to create user");
            }

            const [rootFolder] = await tx
                .insert(folders)
                .values({
                    folderName: "Files",
                    ownerId: user.id,
                    type: "ROOT",
                })
                .returning({ id: folders.id });
            if (!rootFolder) {
                throw new Error("Failed to create root folder");
            }

            const [updatedUser] = await tx
                .update(users)
                .set({ rootFolderId: rootFolder.id })
                .where(eq(users.id, user.id))
                .returning();
            if (!updatedUser) {
                throw new Error("Failed to update user");
            }

            return updatedUser;
        });

        // Return user
        return reply.code(201).send(userWithRoot);
    } catch (e) {
        console.log(e);
        return reply.code(500).send(e);
    }
}

export async function loginHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: LoginInput }>,
    reply: FastifyReply,
) {
    const body = request.body;

    const [user] = await this.db.select().from(users).where(eq(users.username, body.username)).limit(1);

    if (!user) {
        return reply.code(401).send({ message: "Invalid username or password" });
    }

    const passwordValid = await argon2.verify(user.password, body.password);

    if (passwordValid) {
        const refreshExpiration = new Date(Date.now() + ms("7d"));

        // Create refresh token in db
        const [refreshToken] = await this.db
            .insert(refreshTokens)
            .values({
                userId: user.id,
                expiresAt: refreshExpiration,
            })
            .returning();
        if (!refreshToken) {
            return reply.code(500).send({ message: "Failed to create refresh token" });
        }

        // Set Access and Refresh Token Cookies
        reply.setCookie("AccessToken", this.jwt.sign({ id: user.id, type: "AccessToken" }, { expiresIn: "15m" }), {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            expires: new Date(Date.now() + ms("15m")),
            domain: env.COOKIE_URL,
            path: "/",
        });
        reply.setCookie(
            "RefreshToken",
            this.jwt.sign({ id: refreshToken.id, type: "RefreshToken" }, { expiresIn: "7d" }),
            {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                expires: refreshExpiration,
                domain: env.COOKIE_URL,
                path: "/",
            },
        );

        // Return user details
        return reply.code(200).send({
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            rootFolderId: user.rootFolderId,
        });
    }

    return reply.code(401).send({ message: "Invalid username or password" });
}

export async function sessionHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    if (!request.cookies["AccessToken"] || !request.cookies["RefreshToken"]) {
        return reply.code(401).send({ message: "Invalid session" });
    }

    const accessToken = request.cookies["AccessToken"];
    const refreshToken = request.cookies["RefreshToken"];

    const decodedAccessToken: FastifyJWT["decoded"] | null = this.jwt.decode(accessToken);
    const decodedRefreshToken: FastifyJWT["decoded"] | null = this.jwt.decode(refreshToken);

    if (!decodedAccessToken || !decodedRefreshToken) {
        return reply.code(500).send({ message: "Invalid session" });
    }

    const accessTokenExpires = new Date(decodedAccessToken.exp * 1000);
    const refreshTokenExpires = new Date(decodedRefreshToken.exp * 1000);

    const [user] = await this.db.select().from(users).where(eq(users.id, request.user.id)).limit(1);

    if (!user) {
        return reply.code(500).send({ message: "Invalid session" });
    }

    return reply.code(200).send({
        user: {
            id: user.id,
            username: user.username,
            rootFolderId: user.rootFolderId,
            firstName: user.firstName,
            lastName: user.lastName,
        },
        accessTokenExpires: accessTokenExpires,
        refreshTokenExpires: refreshTokenExpires,
    });
}

export async function refreshHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    if (!request.cookies["RefreshToken"]) {
        return reply.code(401).send({ message: "Invalid refresh token" });
    }

    const refreshToken = request.cookies["RefreshToken"];

    const tokenPayload: FastifyJWT["decoded"] = this.jwt.verify(refreshToken);

    // Get current token from db and verify that it is valid
    const [currentRefreshToken] = await this.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.id, tokenPayload.id))
        .limit(1);

    // No token found in db with id from token payload
    if (!currentRefreshToken) {
        return reply.code(401).send({ message: "Invalid refresh token" });
    }

    // User refresh token already used (potentially stolen), invalidate all of user's refresh tokens
    if (!currentRefreshToken.valid) {
        await this.db
            .update(refreshTokens)
            .set({ valid: false })
            .where(eq(refreshTokens.userId, currentRefreshToken.userId));

        // Clear cookies on client
        reply.clearCookie("AccessToken", { domain: env.COOKIE_URL, path: "/" });
        reply.clearCookie("RefreshToken", { domain: env.COOKIE_URL, path: "/" });

        return reply.code(401).send({ message: "Invalid refresh token" });
    }

    // Session invalid/expired, clear cookies from client and mark token as invalid
    if (currentRefreshToken.expiresAt < new Date()) {
        reply.clearCookie("AccessToken", { domain: env.COOKIE_URL, path: "/" });
        reply.clearCookie("RefreshToken", { domain: env.COOKIE_URL, path: "/" });

        await this.db
            .update(refreshTokens)
            .set({ valid: false })
            .where(eq(refreshTokens.id, currentRefreshToken.id));

        return reply.code(401).send({ message: "Expired refresh token" });
    }

    // Invalidate current refresh token
    await this.db
        .update(refreshTokens)
        .set({ valid: false })
        .where(eq(refreshTokens.id, tokenPayload.id));

    const userId = currentRefreshToken.userId;

    // Create new refresh token in db
    const accessTokenExpires = new Date(Date.now() + ms("15m"));
    const refreshTokenExpires = new Date(Date.now() + ms("7d"));

    const [newRefreshToken] = await this.db
        .insert(refreshTokens)
        .values({
            userId: userId,
            expiresAt: refreshTokenExpires,
        })
        .returning();
    if (!newRefreshToken) {
        return reply.code(500).send({ message: "Failed to create refresh token" });
    }

    // Set Access and Refresh Token Cookies
    reply.setCookie("AccessToken", this.jwt.sign({ id: userId, type: "AccessToken" }, { expiresIn: "15m" }), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        expires: accessTokenExpires,
        domain: env.COOKIE_URL,
        path: "/",
    });
    reply.setCookie(
        "RefreshToken",
        this.jwt.sign({ id: newRefreshToken.id, type: "RefreshToken" }, { expiresIn: "7d" }),
        {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            expires: refreshTokenExpires,
            domain: env.COOKIE_URL,
            path: "/",
        },
    );

    return reply.code(200).send({
        accessTokenExpires: accessTokenExpires,
        refreshTokenExpires: refreshTokenExpires,
    });
}

export async function infoHandler(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const [user] = await this.db.select().from(users).where(eq(users.id, request.user.id)).limit(1);

    if (!user) {
        return reply.code(500).send({ message: "Something went wrong. Please try again." });
    }

    return reply.code(200).send(user);
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
    const [user] = await this.db.select().from(users).where(eq(users.id, request.user.id)).limit(1);
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
