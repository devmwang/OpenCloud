import { z } from "zod";

import { createCsrfHeaders } from "@/lib/csrf";
import { getJson, postJson } from "@/lib/http";

export const recycleItemTypeEnum = z.enum(["FILE", "FOLDER"]);

export type RecycleItemType = z.infer<typeof recycleItemTypeEnum>;

const moveToBinInputSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string().min(1),
});

const moveToBinResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    deletedAt: z.string().datetime(),
});

const recycleBinListItemSchema = z.object({
    itemType: recycleItemTypeEnum,
    id: z.string(),
    name: z.string(),
    deletedAt: z.string().datetime(),
    purgeAt: z.string().datetime(),
    parentFolderId: z.string().nullable(),
    fileSize: z.number().int().nullable().optional(),
    requiresDestination: z.boolean(),
});

const listRecycleBinInputSchema = z.object({
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
    itemType: recycleItemTypeEnum.optional(),
});

const listRecycleBinResponseSchema = z.object({
    items: z.array(recycleBinListItemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
});

const destinationFoldersInputSchema = z.object({
    search: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
});

const destinationFoldersResponseSchema = z.object({
    folders: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            path: z.string(),
        }),
    ),
});

const restoreInputSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string().min(1),
    destinationFolderId: z.string().optional(),
});

const restoreResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    parentFolderId: z.string().nullable(),
    restoredCount: z.number().int().optional(),
});

const permanentlyDeleteInputSchema = z.object({
    itemType: recycleItemTypeEnum,
    itemId: z.string().min(1),
});

const permanentlyDeleteResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    itemType: recycleItemTypeEnum,
    itemId: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const emptyRecycleBinInputSchema = z
    .object({
        itemType: recycleItemTypeEnum.optional(),
    })
    .optional();

const emptyRecycleBinResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

const purgeExpiredInputSchema = z
    .object({
        olderThanDays: z.number().int().min(1).optional(),
    })
    .optional();

const purgeExpiredResponseSchema = z.object({
    status: z.literal("success"),
    message: z.string(),
    olderThanDays: z.number().int(),
    purgedFiles: z.number().int(),
    purgedFolders: z.number().int(),
});

export type RecycleBinListItem = z.infer<typeof recycleBinListItemSchema>;
export type ListRecycleBinInput = z.infer<typeof listRecycleBinInputSchema>;
export type DestinationFoldersInput = z.infer<typeof destinationFoldersInputSchema>;
export type RestoreRecycleBinInput = z.infer<typeof restoreInputSchema>;
export type EmptyRecycleBinInput = z.infer<typeof emptyRecycleBinInputSchema>;
export type PurgeExpiredRecycleBinInput = z.infer<typeof purgeExpiredInputSchema>;

export const moveToRecycleBin = async (input: z.infer<typeof moveToBinInputSchema>) => {
    const body = moveToBinInputSchema.parse(input);

    return postJson("/v1/recycle-bin/move-to-bin", moveToBinResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const listRecycleBin = async (input: ListRecycleBinInput = {}) => {
    const query = listRecycleBinInputSchema.parse(input);

    return getJson("/v1/recycle-bin/list", listRecycleBinResponseSchema, {
        query,
    });
};

export const getRecycleBinDestinationFolders = async (input: DestinationFoldersInput = {}) => {
    const query = destinationFoldersInputSchema.parse(input);

    return getJson("/v1/recycle-bin/destination-folders", destinationFoldersResponseSchema, {
        query,
    });
};

export const restoreRecycleBinItem = async (input: RestoreRecycleBinInput) => {
    const body = restoreInputSchema.parse(input);

    return postJson("/v1/recycle-bin/restore", restoreResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const permanentlyDeleteRecycleBinItem = async (input: z.infer<typeof permanentlyDeleteInputSchema>) => {
    const body = permanentlyDeleteInputSchema.parse(input);

    return postJson("/v1/recycle-bin/permanently-delete", permanentlyDeleteResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const emptyRecycleBin = async (input?: EmptyRecycleBinInput) => {
    const body = emptyRecycleBinInputSchema.parse(input ?? {});

    return postJson("/v1/recycle-bin/empty", emptyRecycleBinResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};

export const purgeExpiredRecycleBin = async (input?: PurgeExpiredRecycleBinInput) => {
    const body = purgeExpiredInputSchema.parse(input ?? {});

    return postJson("/v1/recycle-bin/purge-expired", purgeExpiredResponseSchema, {
        body,
        headers: await createCsrfHeaders(),
    });
};
