import path from "path";

import { eq } from "drizzle-orm";
import { fileTypeFromFile } from "file-type";

import type { Database } from "@/db";
import { files } from "@/db/schema/storage";
import { env } from "@/env/env";

export const UNKNOWN_MIME_TYPE = "application/octet-stream";

export const detectStoredMimeType = async (filePath: string) => {
    const fileType = await fileTypeFromFile(filePath);
    return fileType?.mime ?? UNKNOWN_MIME_TYPE;
};

export const isMissingStoredFileError = (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if (errorCode === "ENOENT") {
            return true;
        }
    }

    if (!(error instanceof Error)) {
        return false;
    }

    const normalizedMessage = error.message.toLowerCase();
    return normalizedMessage.includes("input file is missing") || normalizedMessage.includes("no such file");
};

export const verifyStoredMimeType = async (
    db: Database,
    file: Pick<typeof files.$inferSelect, "id" | "ownerId" | "fileType">,
) => {
    try {
        const mimeType = await detectStoredMimeType(path.join(env.FILE_STORE_PATH, file.ownerId, file.id));
        if (mimeType !== file.fileType) {
            await db.update(files).set({ fileType: mimeType }).where(eq(files.id, file.id));
        }

        return mimeType;
    } catch (error) {
        if (isMissingStoredFileError(error)) {
            return null;
        }

        throw error;
    }
};
