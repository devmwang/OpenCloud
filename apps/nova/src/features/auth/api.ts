import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { getJson, postJson } from "@/lib/http";

import { authClient } from "./auth-client";

const userSchema = z.object({
    id: z.string(),
    username: z.string(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    rootFolderId: z.string(),
});

const sessionExpiresAtSchema = z.union([z.date(), z.string().datetime()]).transform((value) => {
    return value instanceof Date ? value.toISOString() : value;
});

const authSessionSchema = z.object({
    session: z.object({
        expiresAt: sessionExpiresAtSchema,
    }),
    user: userSchema,
});

const authInfoSchema = userSchema.extend({
    role: z.enum(["ADMIN", "USER"]),
});

const createUserInputSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(8),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
});

const createAccessRuleInputSchema = z.object({
    name: z.string().min(1),
    type: z.enum(["ALLOW", "DISALLOW"]),
    method: z.literal("IP_ADDRESS"),
    match: z.string().min(1),
});

const statusMessageSchema = z.object({
    status: z.string(),
    message: z.string(),
});

const createUploadTokenInputSchema = z.object({
    description: z.string().optional(),
    folderId: z.string().min(1),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    accessControlRuleIds: z.array(z.string()).min(1).optional(),
    expiresAt: z.string().datetime().optional(),
});

const createUploadTokenResponseSchema = z.object({
    uploadToken: z.string(),
    expiresAt: z.string().datetime(),
});

const createReadTokenInputSchema = z.object({
    fileId: z.string().min(1),
    description: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
});

const createReadTokenResponseSchema = z.object({
    readToken: z.string(),
    expiresAt: z.string().datetime(),
});

const accessRuleSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["ALLOW", "DISALLOW"]),
    method: z.literal("IP_ADDRESS"),
    match: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

const listAccessRulesResponseSchema = z.object({
    accessRules: z.array(accessRuleSummarySchema),
});

const uploadTokenSummarySchema = z.object({
    id: z.string(),
    description: z.string().nullable(),
    folderId: z.string(),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    accessControlRuleIds: z.array(z.string()),
    expiresAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

const listUploadTokensResponseSchema = z.object({
    uploadTokens: z.array(uploadTokenSummarySchema),
});

export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthInfo = z.infer<typeof authInfoSchema>;
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type CreateAccessRuleInput = z.infer<typeof createAccessRuleInputSchema>;
export type CreateUploadTokenInput = z.infer<typeof createUploadTokenInputSchema>;
export type CreateReadTokenInput = z.infer<typeof createReadTokenInputSchema>;
export type AccessRuleSummary = z.infer<typeof accessRuleSummarySchema>;
export type UploadTokenSummary = z.infer<typeof uploadTokenSummarySchema>;

type BetterAuthResult = {
    data?: unknown;
    error?: {
        message?: string;
    } | null;
};

const unwrapBetterAuthData = (input: unknown) => {
    if (!input || typeof input !== "object") {
        return input;
    }

    if ("data" in input) {
        return (input as BetterAuthResult).data;
    }

    return input;
};

const parseSessionPayload = (payload: unknown) => {
    const unwrapped = unwrapBetterAuthData(payload);
    if (!unwrapped) {
        return null;
    }

    const parsed = authSessionSchema.safeParse(unwrapped);
    if (!parsed.success) {
        return null;
    }

    return parsed.data;
};

export const getSession = async () => {
    const payload = await authClient.getSession({
        query: {
            disableCookieCache: true,
        },
    });
    return parseSessionPayload(payload);
};

export const getSessionSafe = async () => {
    try {
        return await getSession();
    } catch {
        return null;
    }
};

export const signInWithUsername = async (username: string, password: string) => {
    const result = (await authClient.signIn.username({ username, password })) as BetterAuthResult;

    if (result?.error) {
        return {
            success: false,
            error: result.error.message ?? "Invalid username or password",
        } as const;
    }

    return {
        success: true,
    } as const;
};

export const signOut = async () => {
    await authClient.signOut();
};

export const getAuthInfo = async () => {
    return getJson("/v1/auth/info", authInfoSchema);
};

export const createUser = async (input: CreateUserInput) => {
    const body = createUserInputSchema.parse(input);

    return postJson("/v1/auth/create", authInfoSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const createAccessRule = async (input: CreateAccessRuleInput) => {
    const body = createAccessRuleInputSchema.parse(input);

    return postJson("/v1/auth/create-access-rule", statusMessageSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const createUploadToken = async (input: CreateUploadTokenInput) => {
    const body = createUploadTokenInputSchema.parse(input);

    return postJson("/v1/auth/create-upload-token", createUploadTokenResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const createReadToken = async (input: CreateReadTokenInput) => {
    const body = createReadTokenInputSchema.parse(input);

    return postJson("/v1/auth/create-read-token", createReadTokenResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const getOwnedAccessRules = async () => {
    const response = await getJson("/v1/auth/access-rules", listAccessRulesResponseSchema);
    return response.accessRules;
};

export const getOwnedUploadTokens = async () => {
    const response = await getJson("/v1/auth/upload-tokens", listUploadTokensResponseSchema);
    return response.uploadTokens;
};
