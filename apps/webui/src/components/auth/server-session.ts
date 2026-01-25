import { cookies } from "next/headers";
import * as z from "zod";

import { env } from "@/env/env.mjs";

export async function getServerSession() {
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

    const parsedSession = betterAuthSessionResponseSchema.safeParse(await response.json());

    if (parsedSession.success === false || parsedSession.data === null) {
        throw new Error("Failed to fetch data");
    }

    const mappedSession = getSessionDetailsSchema.safeParse({
        user: {
            id: parsedSession.data.user.id,
            username: parsedSession.data.user.username,
            rootFolderId: parsedSession.data.user.rootFolderId,
            firstName: parsedSession.data.user.firstName ?? null,
            lastName: parsedSession.data.user.lastName ?? null,
        },
        accessTokenExpires: parsedSession.data.session.expiresAt,
        refreshTokenExpires: parsedSession.data.session.expiresAt,
    });

    if (mappedSession.success === false) {
        throw new Error("Failed to fetch data");
    }

    return mappedSession;
}

const getSessionDetailsSchema = z.object({
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

const betterAuthSessionResponseSchema = z.union([
    z.object({
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
    }),
    z.null(),
]);
