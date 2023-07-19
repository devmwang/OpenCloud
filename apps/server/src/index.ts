// Constants
export const SERVER_HOST = "0.0.0.0";
export const SERVER_PORT = 8080;

// Environment variables must be loaded before anything else
import * as dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import FastifyRateLimit from "@fastify/rate-limit";
import FastifyMultipart from "@fastify/multipart";
import FastifyStatic from "@fastify/static";
import path from "path";

import { env } from "@/env/env";

import prismaPlugin from "@/utils/prisma";
import authenticationPlugin from "@/utils/authentication";
import accessControlPlugin from "@/utils/access-control";

import authRouter from "@/systems/auth/auth.routes";
import { authSchemas } from "@/systems/auth/auth.schemas";
import uploadRouter from "@/systems/upload/upload.routes";
import { uploadSchemas } from "@/systems/upload/upload.schemas";
import fileSystemRouter from "@/systems/fs/fs.routes";
import { fsSchemas } from "@/systems/fs/fs.schemas";
import folderRouter from "@/systems/folder/folder.routes";
import { folderSchemas } from "@/systems/folder/folder.schemas";

// Fastify Types
declare module "fastify" {
    interface FastifyRequest {
        authenticated: boolean;
    }
}

// Initialize Fastify Instance
const server = Fastify({
    logger: true,
});

// Register Utility Plugins
void server.register(prismaPlugin);
void server.register(authenticationPlugin);
void server.register(accessControlPlugin);

void server.register(FastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
});

void server.register(FastifyMultipart, {
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // 10 GB
    },
});

void server.register(FastifyStatic, {
    root: path.resolve(env.FILE_STORE_PATH),
    prefix: "/FileStore/",
});

// Register Route Schemas
for (const schema of [...authSchemas, ...uploadSchemas, ...fsSchemas, ...folderSchemas]) {
    server.addSchema(schema);
}

// Register Routes
void server.register(authRouter, { prefix: "/v1/auth" });
void server.register(uploadRouter, { prefix: "/v1/upload" });
void server.register(fileSystemRouter, { prefix: "/v1/files" });
void server.register(folderRouter, { prefix: "/v1/folder" });

// Server Health Check
server.get("/v1/health", async () => {
    return { status: "OK" };
});

void (async () => {
    try {
        await server.listen({ host: SERVER_HOST, port: SERVER_PORT });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
})();
