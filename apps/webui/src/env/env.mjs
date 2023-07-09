// @ts-check

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        OPENCLOUD_SERVER_URL: z.string().url(),
    },
    client: {},
    runtimeEnv: {
        OPENCLOUD_SERVER_URL: process.env.OPENCLOUD_SERVER_URL,
    },
});
