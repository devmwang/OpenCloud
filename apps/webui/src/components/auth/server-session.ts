import { cookies } from "next/headers";
import * as z from "zod";

import { env } from "@/env/env.mjs";

const sessionDetailsSchema = z.object({
    user: z.object({
        id: z.string(),
        username: z.string(),
        rootFolderId: z.string(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
    }),
    accessTokenExpires: z.string().datetime(),
    refreshTokenExpires: z.string().datetime(),
});

const betterAuthSessionResponseSchema = z
    .object({
        session: z.object({
            expiresAt: z.string().datetime(),
        }),
        user: z.object({
            id: z.string(),
            username: z.string(),
            rootFolderId: z.string(),
            firstName: z.string().nullable().optional(),
            lastName: z.string().nullable().optional(),
        }),
    })
    .nullable();

export type ServerSession = z.infer<typeof sessionDetailsSchema>;

export async function getServerSession(): Promise<ServerSession> {
    const cookieStore = await cookies();
    const response = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/api/auth/get-session`, {
        headers: { Cookie: cookieStore.toString() },
        next: {
            tags: ["session"],
        },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedSession = betterAuthSessionResponseSchema.parse(await response.json());

    if (!parsedSession) {
        throw new Error("Failed to fetch data");
    }

    return sessionDetailsSchema.parse({
        user: {
            id: parsedSession.user.id,
            username: parsedSession.user.username,
            rootFolderId: parsedSession.user.rootFolderId,
            firstName: parsedSession.user.firstName ?? null,
            lastName: parsedSession.user.lastName ?? null,
        },
        accessTokenExpires: parsedSession.session.expiresAt,
        refreshTokenExpires: parsedSession.session.expiresAt,
    });
}
