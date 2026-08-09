import { fileTypeFromFile } from "file-type";

export const UNKNOWN_MIME_TYPE = "application/octet-stream";

export const detectStoredMimeType = async (filePath: string) => {
    const fileType = await fileTypeFromFile(filePath);
    return fileType?.mime ?? UNKNOWN_MIME_TYPE;
};
