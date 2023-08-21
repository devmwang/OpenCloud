import { z } from "zod";
import { createEnv } from "@t3-oss/env-core";

export const env = createEnv({
    server: {
        OPENCLOUD_WEBUI_URL: z.string(),
        COOKIE_URL: z.string(),
        AUTH_SECRET: z.string(),
        DATABASE_URL: z.string().url(),
        FILE_STORE_PATH: z.string(),
    },
    clientPrefix: "",
    client: {},
    /**
     * What object holds the environment variables at runtime.
     * Often `process.env` or `import.meta.env`
     */
    runtimeEnv: process.env,
});
