import { z } from "zod";
import { createEnv } from "@t3-oss/env-core";

export const env = createEnv({
    server: {
        AUTH_SECRET: z.string(),
        DATABASE_URL: z.string().url(),
    },
    clientPrefix: "",
    client: {},
    /**
     * What object holds the environment variables at runtime.
     * Often `process.env` or `import.meta.env`
     */
    runtimeEnv: process.env,
});
