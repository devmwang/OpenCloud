export const stripFileRouteExtension = (fileRouteId: string) => {
    const extensionIndex = fileRouteId.indexOf(".");
    if (extensionIndex < 0) {
        return fileRouteId;
    }

    return fileRouteId.slice(0, extensionIndex);
};

export const getFileExtension = (filename: string) => {
    const lastDotIndex = filename.lastIndexOf(".");
    if (lastDotIndex <= 0) {
        return "";
    }

    return filename.slice(lastDotIndex);
};

export const toFileRouteId = (fileId: string, filename: string) => {
    return `${fileId}${getFileExtension(filename)}`;
};
