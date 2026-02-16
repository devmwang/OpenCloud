import { z } from "zod/v3";

import { buildJsonSchemas } from "@/utils/zod-schema";

const fileParamsSchema = z.object({
    fileId: z.string({
        required_error: "File ID is required",
        invalid_type_error: "File ID must be a string",
    }),
});

const fileReadQuerySchema = z.object({
    readToken: z.string().optional(),
});

const fileDetailsResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nullable(),
    ownerId: z.string(),
    folderId: z.string(),
    access: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    storageState: z.enum(["PENDING", "READY", "FAILED"]),
});

const patchFileMoveBodySchema = z
    .object({
        folderId: z.string({
            required_error: "Destination folder ID is required",
            invalid_type_error: "Destination folder ID must be a string",
        }),
    })
    .strict();

const patchFileRenameBodySchema = z
    .object({
        name: z
            .string({
                required_error: "File name is required",
                invalid_type_error: "File name must be a string",
            })
            .trim()
            .min(1, { message: "File name cannot be empty" }),
    })
    .strict();

const patchFileBodySchema = z.union([patchFileMoveBodySchema, patchFileRenameBodySchema]);

const mutateFileResponseSchema = z.object({
    status: z.string(),
    message: z.string(),
    id: z.string(),
    folderId: z.string(),
});

export type FileParams = z.infer<typeof fileParamsSchema>;
export type FileReadQuery = z.infer<typeof fileReadQuerySchema>;
export type PatchFileBody = z.infer<typeof patchFileBodySchema>;

export const { schemas: fsSchemas, $ref } = buildJsonSchemas(
    {
        fileParamsSchema,
        fileReadQuerySchema,
        fileDetailsResponseSchema,
        patchFileBodySchema,
        mutateFileResponseSchema,
    },
    { $id: "FS" },
);
