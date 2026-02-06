import { z } from "zod";

const clientEnvSchema = z.object({
    NEXT_PUBLIC_OPENCLOUD_SERVER_URL: z.string().url().default("http://localhost:8080"),
});

const serverEnvSchema = z.object({
    OPENCLOUD_WEBUI_URL: z.string().url().optional(),
});

const clientRuntimeEnv = clientEnvSchema.parse({
    NEXT_PUBLIC_OPENCLOUD_SERVER_URL: import.meta.env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
});

const resolveServerEnv = () => {
    if (typeof process === "undefined") {
        return serverEnvSchema.parse({ OPENCLOUD_WEBUI_URL: undefined });
    }

    return serverEnvSchema.parse({
        OPENCLOUD_WEBUI_URL: process.env.OPENCLOUD_WEBUI_URL,
    });
};

export const env = {
    NEXT_PUBLIC_OPENCLOUD_SERVER_URL: clientRuntimeEnv.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
};

export const getServerEnv = () => resolveServerEnv();

export const getCanonicalBaseUrl = (fallbackOrigin?: string) => {
    const serverEnv = resolveServerEnv();
    return serverEnv.OPENCLOUD_WEBUI_URL ?? fallbackOrigin;
};
