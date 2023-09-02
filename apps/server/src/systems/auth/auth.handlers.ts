import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FastifyJWT } from "@fastify/jwt";
import * as argon2 from "argon2";
import ms from "ms";

import { env } from "@/env/env";
import type { CreateUserInput, LoginInput, CreateAccessRuleInput, CreateUploadTokenInput } from "./auth.schemas";

export async function createUserHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateUserInput }>,
    reply: FastifyReply,
) {
    const { username, firstName, lastName, password } = request.body;

    try {
        // Verify that user does not already exist
        if (await this.prisma.user.findUnique({ where: { username: username } })) {
            return reply.code(400).send({ message: "User with username already exists" });
        }

        // Create user in db
        const hashedPassword = await argon2.hash(password);

        // Create user in db
        const user = await this.prisma.user.create({
            data: {
                username: username,
                firstName: firstName != undefined ? firstName : null,
                lastName: lastName != undefined ? lastName : null,
                password: hashedPassword,
            },
        });

        // Create Root folder with default name "Files"
        const rootFolder = await this.prisma.folder.create({
            data: {
                folderName: "Files",
                ownerId: user.id,
                type: "ROOT",
            },
        });

        // Add root folder id to user
        const userWithRoot = await this.prisma.user.update({
            where: { id: user.id },
            data: { rootFolderId: rootFolder.id },
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

    const user = await this.prisma.user.findUnique({
        where: { username: body.username },
    });

    if (!user) {
        return reply.code(401).send({ message: "Invalid username or password" });
    }

    const passwordValid = await argon2.verify(user.password, body.password);

    if (passwordValid) {
        const refreshExpiration = new Date(Date.now() + ms("7d"));

        // Create refresh token in db
        const refreshToken = await this.prisma.refreshToken.create({
            data: {
                user: {
                    connect: { id: user.id },
                },
                expiresAt: refreshExpiration,
            },
        });

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

    const user = await this.prisma.user.findUnique({ where: { id: request.user.id } });

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
    const currentRefreshToken = await this.prisma.refreshToken.findUnique({
        where: { id: tokenPayload.id },
    });

    // No token found in db with id from token payload
    if (!currentRefreshToken) {
        return reply.code(401).send({ message: "Invalid refresh token" });
    }

    // User refresh token already used (potentially stolen), invalidate all of user's refresh tokens
    if (!currentRefreshToken.valid) {
        await this.prisma.refreshToken.updateMany({
            where: {
                userId: currentRefreshToken.userId,
            },
            data: {
                valid: false,
            },
        });

        // Clear cookies on client
        reply.clearCookie("AccessToken", { domain: env.COOKIE_URL, path: "/" });
        reply.clearCookie("RefreshToken", { domain: env.COOKIE_URL, path: "/" });

        return reply.code(401).send({ message: "Invalid refresh token" });
    }

    // Session invalid/expired, clear cookies from client and mark token as invalid
    if (currentRefreshToken.expiresAt < new Date()) {
        reply.clearCookie("AccessToken", { domain: env.COOKIE_URL, path: "/" });
        reply.clearCookie("RefreshToken", { domain: env.COOKIE_URL, path: "/" });

        await this.prisma.refreshToken.update({
            where: { id: currentRefreshToken.id },
            data: { valid: false },
        });

        return reply.code(401).send({ message: "Expired refresh token" });
    }

    // Invalidate current refresh token
    await this.prisma.refreshToken.update({
        where: { id: tokenPayload.id },
        data: { valid: false },
    });

    const userId = currentRefreshToken.userId;

    // Create new refresh token in db
    const accessTokenExpires = new Date(Date.now() + ms("15m"));
    const refreshTokenExpires = new Date(Date.now() + ms("7d"));

    const newRefreshToken = await this.prisma.refreshToken.create({
        data: {
            user: {
                connect: { id: userId },
            },
            expiresAt: refreshTokenExpires,
        },
    });

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
    const user = await this.prisma.user.findUnique({ where: { id: request.user.id } });

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

    await this.prisma.accessRule.create({
        data: {
            name: name,
            type: type,
            method: method,
            match: match,
        },
    });

    return reply.code(200).send({ status: "success", message: "Access Rule created" });
}

export async function createUploadTokenHandler(
    this: FastifyInstance,
    request: FastifyRequest<{ Body: CreateUploadTokenInput }>,
    reply: FastifyReply,
) {
    const user = await this.prisma.user.findUnique({ where: { id: request.user.id } });
    const folder = await this.prisma.folder.findUnique({ where: { id: request.body.folderId } });

    if (!user || !folder) {
        return reply.code(500).send({ message: "Something went wrong. Please try again." });
    }

    if (user.id != folder.ownerId) {
        return reply
            .code(403)
            .send({ message: "You do not have permission to create an upload token for this folder" });
    }

    const { description, folderId, fileAccess } = request.body;

    const uploadToken = await this.prisma.uploadToken.create({
        data: {
            user: {
                connect: { id: user.id },
            },
            description: description != undefined ? description : null,
            folderId: folderId,
            fileAccess: fileAccess,
        },
    });

    return reply.code(200).send({ uploadToken: this.jwt.sign({ id: uploadToken.id, type: "UploadToken" }) });
}
