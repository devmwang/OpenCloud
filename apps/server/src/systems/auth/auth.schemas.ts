import ipaddr from "ipaddr.js";
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
    match: z
        .string({
            required_error: "String to match is required",
            invalid_type_error: "String to match must be a string",
        })
        .refine((value) => ipaddr.isValid(value) || ipaddr.isValidCIDR(value), {
            message: "Match must be a valid IP address or CIDR range",
        }),
});

const createUploadTokenSchema = z.object({
    description: z.string().optional(),
    folderId: z.string({
        required_error: "Parent folder ID is required",
        invalid_type_error: "Parent folder ID must be a string",
    }),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    accessControlRuleIds: z.array(z.string()).min(1).optional(),
    expiresAt: z.string().datetime().optional(),
});

const createUploadTokenResponseSchema = z.object({
    uploadToken: z.string(),
    expiresAt: z.string().datetime(),
});

const createReadTokenSchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
    description: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
});

const createReadTokenResponseSchema = z.object({
    readToken: z.string(),
    expiresAt: z.string().datetime(),
});

const csrfTokenResponseSchema = z.object({
    csrfToken: z.string(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateAccessRuleInput = z.infer<typeof createAccessRuleSchema>;
export type CreateUploadTokenInput = z.infer<typeof createUploadTokenSchema>;
export type CreateReadTokenInput = z.infer<typeof createReadTokenSchema>;

export const { schemas: authSchemas, $ref } = buildJsonSchemas(
    {
        createUserSchema,
        userInfoResponseSchema,
        createAccessRuleSchema,
        createUploadTokenSchema,
        createUploadTokenResponseSchema,
        createReadTokenSchema,
        createReadTokenResponseSchema,
        csrfTokenResponseSchema,
    },
    { $id: "Auth" },
);
