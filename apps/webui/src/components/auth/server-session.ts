import { cookies } from "next/headers";
import * as z from "zod";

import { env } from "@/env/env.mjs";

export async function getServerSession() {
    const response = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/session`, {
        headers: { Cookie: cookies().toString() },
        next: {
            tags: ["session"],
        },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedSessionDetails = getSessionDetailsSchema.safeParse(await response.json());

    if (parsedSessionDetails.success === false) {
        throw new Error("Failed to fetch data");
    }

    return parsedSessionDetails;
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
