import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { accounts } from "@/db/schema/better-auth";
import { folders } from "@/db/schema/storage";
import { users } from "@/db/schema/users";

type CreateUserWithRootFolderInput = {
    username: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: "USER" | "ADMIN";
};

export const createUserWithRootFolder = async (db: Database, input: CreateUserWithRootFolderInput) => {
    const userId = createId();
    const rootFolderId = createId();
    const trimmedFirstName = input.firstName?.trim() ?? "";
    const trimmedLastName = input.lastName?.trim() ?? "";
    const fullName = [trimmedFirstName, trimmedLastName].filter(Boolean).join(" ");
    const displayName = fullName.length > 0 ? fullName : input.username;
    const email = input.email ?? `${userId}@opencloud.local`;
    const role = input.role ?? "USER";

    return db.transaction(async (tx) => {
        const [user] = await tx
            .insert(users)
            .values({
                id: userId,
                username: input.username,
                displayUsername: input.username,
                name: displayName,
                email,
                emailVerified: false,
                image: null,
                firstName: input.firstName ?? null,
                lastName: input.lastName ?? null,
                role,
                rootFolderId: null,
            })
            .returning();
        if (!user) {
            throw new Error("Failed to create user");
        }

        const [rootFolder] = await tx
            .insert(folders)
            .values({
                id: rootFolderId,
                folderName: "Files",
                ownerId: userId,
                type: "ROOT",
                folderPath: `/${rootFolderId}`,
            })
            .returning({ id: folders.id });
        if (!rootFolder) {
            throw new Error("Failed to create root folder");
        }

        await tx.update(users).set({ rootFolderId }).where(eq(users.id, userId));

        await tx.insert(accounts).values({
            userId,
            accountId: userId,
            providerId: "credential",
            password: input.passwordHash,
        });

        return { ...user, rootFolderId };
    });
};
