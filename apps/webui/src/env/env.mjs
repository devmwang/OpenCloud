// @ts-check

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {},
    client: {
        NEXT_PUBLIC_OPENCLOUD_SERVER_URL: z.string().url().default("http://localhost:8080"),
    },
    runtimeEnv: {
        NEXT_PUBLIC_OPENCLOUD_SERVER_URL: process.env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
    },
});
