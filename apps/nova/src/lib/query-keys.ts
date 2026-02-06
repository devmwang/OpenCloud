export const queryKeys = {
    session: ["session"] as const,
    authInfo: ["auth", "info"] as const,
    accessRules: ["auth", "access-rules"] as const,
    uploadTokens: ["auth", "upload-tokens"] as const,
    folderDetails: (folderId: string) => ["folder", "details", folderId] as const,
    folderContents: (folderId: string) => ["folder", "contents", folderId] as const,
    fileDetails: (fileId: string, readToken?: string) => ["file", "details", fileId, readToken] as const,
};
