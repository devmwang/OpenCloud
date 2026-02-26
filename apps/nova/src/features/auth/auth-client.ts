import { inferAdditionalFields, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { env } from "@/env";

export const authClient = createAuthClient({
    baseURL: env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
    basePath: "/api/auth",
    fetchOptions: {
        credentials: "include",
        jsonParser: (text) => {
            if (!text) {
                return null;
            }

            return JSON.parse(text) as unknown;
        },
    },
    plugins: [
        usernameClient(),
        inferAdditionalFields({
            user: {
                rootFolderId: { type: "string", required: false },
                firstName: { type: "string", required: false },
                lastName: { type: "string", required: false },
            },
        }),
    ],
});
