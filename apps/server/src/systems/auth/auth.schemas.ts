import { z } from "zod/v3";
import { buildJsonSchemas } from "@/utils/zod-schema";

const userBase = {
    username: z
        .string({
            required_error: "Username is required",
            invalid_type_error: "Username must be a string",
        })
        .min(3, { message: "Username must be 3 or more characters long" }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
};

const createUserSchema = z.object({
    ...userBase,
    password: z
        .string({
            required_error: "Password is required",
            invalid_type_error: "Password must be a string",
        })
        .min(8, { message: "Password must be 8 or more characters long" }),
});

const loginSchema = z.object({
    username: z
        .string({
            required_error: "Username is required",
            invalid_type_error: "Username must be a string",
        })
        .min(3),
    password: z
        .string({
            required_error: "Password is required",
            invalid_type_error: "Password must be a string",
        })
        .min(8),
});

const loginResponseSchema = z.object({
    rootFolderId: z.string(),
});

const sessionResponseSchema = z.object({
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

const refreshResponseSchema = z.object({
    accessTokenExpiration: z.string().datetime(),
    refreshTokenExpiration: z.string().datetime(),
});

const userInfoResponseSchema = z.object({
    id: z.string(),
    ...userBase,
    role: z.enum(["ADMIN", "USER"]),
    rootFolderId: z.string(),
});

const createAccessRuleSchema = z.object({
    name: z.string({
        required_error: "Name is required",
        invalid_type_error: "Name must be a string",
    }),
    type: z.enum(["ALLOW", "DISALLOW"]),
    method: z.enum(["IP_ADDRESS"]),
    match: z.string({
        required_error: "String to match is required",
        invalid_type_error: "String to match must be a string",
    }),
});

const createUploadTokenSchema = z.object({
    description: z.string().optional(),
    folderId: z.string({
        required_error: "Parent folder ID is required",
        invalid_type_error: "Parent folder ID must be a string",
    }),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
});

const createUploadTokenResponseSchema = z.object({
    uploadToken: z.string(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAccessRuleInput = z.infer<typeof createAccessRuleSchema>;
export type CreateUploadTokenInput = z.infer<typeof createUploadTokenSchema>;

export const { schemas: authSchemas, $ref } = buildJsonSchemas(
    {
        createUserSchema,
        loginSchema,
        loginResponseSchema,
        sessionResponseSchema,
        refreshResponseSchema,
        userInfoResponseSchema,
        createAccessRuleSchema,
        createUploadTokenSchema,
        createUploadTokenResponseSchema,
    },
    { $id: "Auth" },
);
