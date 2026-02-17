export const queryKeys = {
    session: ["session"] as const,
    authInfo: ["auth", "info"] as const,
    accessRules: ["auth", "access-rules"] as const,
    uploadTokens: ["auth", "upload-tokens"] as const,
    folderDetails: (folderId: string) => ["folder", "details", folderId] as const,
    folderContents: (folderId: string) => ["folder", "contents", folderId] as const,
    fileDetails: (fileId: string, readToken?: string) => ["file", "details", fileId, readToken] as const,
    folderDisplayOrder: (folderId: string) => ["folder", "display-order", folderId] as const,
    folderDestinationChildren: (folderId: string) => ["folder", "destination-children", folderId] as const,
    recycleBinList: (itemType?: "FILE" | "FOLDER", limit?: number, offset?: number) =>
        ["recycle-bin", "list", itemType ?? "ALL", limit ?? null, offset ?? 0] as const,
    recycleBinDestinationFolders: (search?: string, limit?: number) =>
        ["recycle-bin", "destination-folders", search ?? "", limit ?? null] as const,
};
