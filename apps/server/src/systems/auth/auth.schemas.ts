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

const accessRuleCidrSchema = z
    .string({
        required_error: "CIDR is required",
        invalid_type_error: "CIDR must be a string",
    })
    .refine((value) => ipaddr.isValid(value) || ipaddr.isValidCIDR(value), {
        message: "CIDR must be a valid IP address or CIDR range",
    });

const createAccessRuleSchema = z.object({
    name: z.string({
        required_error: "Name is required",
        invalid_type_error: "Name must be a string",
    }),
    type: z.enum(["ALLOW", "DISALLOW"]),
    method: z.enum(["IP_ADDRESS"]),
    cidr: accessRuleCidrSchema,
});

const accessRuleParamsSchema = z.object({
    ruleId: z.string({
        required_error: "Access rule ID is required",
        invalid_type_error: "Access rule ID must be a string",
    }),
});

const updateAccessRuleSchema = z.object({
    name: z.string({
        required_error: "Name is required",
        invalid_type_error: "Name must be a string",
    }),
    type: z.enum(["ALLOW", "DISALLOW"]),
    method: z.enum(["IP_ADDRESS"]),
    cidr: accessRuleCidrSchema,
});

const createUploadTokenSchema = z.object({
    description: z.string().optional(),
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    accessRuleIds: z.array(z.string()).min(1).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
});

const uploadTokenParamsSchema = z.object({
    tokenId: z.string({
        required_error: "Upload token ID is required",
        invalid_type_error: "Upload token ID must be a string",
    }),
});

const updateUploadTokenSchema = z.object({
    description: z.string().optional(),
    folderId: z.string({
        required_error: "Folder ID is required",
        invalid_type_error: "Folder ID must be a string",
    }),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    accessRuleIds: z.array(z.string()),
    expiresAt: z.string().datetime().nullable(),
});

const createUploadTokenResponseSchema = z.object({
    uploadToken: z.string(),
    expiresAt: z.string().datetime().nullable(),
});

const createReadTokenParamsSchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
});

const createReadTokenSchema = z.object({
    description: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
});

const createReadTokenResponseSchema = z.object({
    readToken: z.string(),
    expiresAt: z.string().datetime(),
});

const statusMessageResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
});

const accessRuleListItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["ALLOW", "DISALLOW"]),
    method: z.enum(["IP_ADDRESS"]),
    cidr: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

const listAccessRulesResponseSchema = z.object({
    accessRules: z.array(accessRuleListItemSchema),
});

const uploadTokenListItemSchema = z.object({
    id: z.string(),
    description: z.string().nullable(),
    folderId: z.string(),
    fileAccess: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    accessRuleIds: z.array(z.string()),
    expiresAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

const listUploadTokensResponseSchema = z.object({
    uploadTokens: z.array(uploadTokenListItemSchema),
});

const csrfTokenResponseSchema = z.object({
    csrfToken: z.string(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateAccessRuleInput = z.infer<typeof createAccessRuleSchema>;
export type AccessRuleParams = z.infer<typeof accessRuleParamsSchema>;
export type UpdateAccessRuleInput = z.infer<typeof updateAccessRuleSchema>;
export type CreateUploadTokenInput = z.infer<typeof createUploadTokenSchema>;
export type UploadTokenParams = z.infer<typeof uploadTokenParamsSchema>;
export type UpdateUploadTokenInput = z.infer<typeof updateUploadTokenSchema>;
export type CreateReadTokenParams = z.infer<typeof createReadTokenParamsSchema>;
export type CreateReadTokenInput = z.infer<typeof createReadTokenSchema>;

export const { schemas: authSchemas, $ref } = buildJsonSchemas(
    {
        createUserSchema,
        userInfoResponseSchema,
        createAccessRuleSchema,
        accessRuleParamsSchema,
        updateAccessRuleSchema,
        createUploadTokenSchema,
        uploadTokenParamsSchema,
        updateUploadTokenSchema,
        createUploadTokenResponseSchema,
        createReadTokenParamsSchema,
        createReadTokenSchema,
        createReadTokenResponseSchema,
        statusMessageResponseSchema,
        listAccessRulesResponseSchema,
        listUploadTokensResponseSchema,
        csrfTokenResponseSchema,
    },
    { $id: "Auth" },
);
