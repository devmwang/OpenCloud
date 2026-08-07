import { z } from "zod";

const DEVELOPMENT_OPENCLOUD_SERVER_URL = "http://localhost:8080";

// Explicit HTTP remains valid for private-LAN self-hosting. Public deployments should use HTTPS.
const openCloudServerUrlSchema = z
    .string()
    .url()
    .regex(/^https?:\/\//i, "NEXT_PUBLIC_OPENCLOUD_SERVER_URL must use http:// or https://");

const clientEnvSchema = z.object({
    NEXT_PUBLIC_OPENCLOUD_SERVER_URL: openCloudServerUrlSchema,
    NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
    NEXT_PUBLIC_OFFICE_ONLINE_PREVIEW_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
});

const openCloudServerUrl =
    import.meta.env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL ??
    (import.meta.env.DEV ? DEVELOPMENT_OPENCLOUD_SERVER_URL : undefined);

const serverEnvSchema = z.object({
    OPENCLOUD_WEBUI_URL: z.string().url().optional(),
});

const clientRuntimeEnv = clientEnvSchema.parse({
    NEXT_PUBLIC_OPENCLOUD_SERVER_URL: openCloudServerUrl,
    NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS: import.meta.env.NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS,
    NEXT_PUBLIC_OFFICE_ONLINE_PREVIEW_ENABLED: import.meta.env.NEXT_PUBLIC_OFFICE_ONLINE_PREVIEW_ENABLED,
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
    NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS: clientRuntimeEnv.NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS,
    NEXT_PUBLIC_OFFICE_ONLINE_PREVIEW_ENABLED: clientRuntimeEnv.NEXT_PUBLIC_OFFICE_ONLINE_PREVIEW_ENABLED,
};

export const getServerEnv = () => resolveServerEnv();

export const getCanonicalBaseUrl = (fallbackOrigin?: string) => {
    const serverEnv = resolveServerEnv();
    return serverEnv.OPENCLOUD_WEBUI_URL ?? fallbackOrigin;
};
