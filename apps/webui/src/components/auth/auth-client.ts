import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, usernameClient } from "better-auth/client/plugins";

import { env } from "@/env/env.mjs";

export const authClient = createAuthClient({
    baseURL: env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
    basePath: "/api/auth",
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
