import { cookies } from "next/headers";
import { z } from "zod";

import { Breadcrumb } from "@/components/file-system/breadcrumb";
import { GridLayout } from "@/components/file-system/grid/core-layout";
import { env } from "@/env/env.mjs";

export default async function FolderView(props: { params: Promise<{ folderId: string }> }) {
    const params = await props.params;
    const folderDetailsPromise = getFolderDetails(params.folderId);
    const folderContentsPromise = getFolderContents(params.folderId);

    const [folderDetails, folderContents] = await Promise.all([folderDetailsPromise, folderContentsPromise]);

    return (
        <div className="h-full w-full px-6 py-4">
            <div className="mb-6">
                <Breadcrumb folderDetails={folderDetails.data} />
            </div>

            <GridLayout folders={folderContents.data.folders} files={folderContents.data.files} />
        </div>
    );
}

async function getFolderDetails(folderId: string) {
    const cookieStore = await cookies();
    const response = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/folders/${folderId}`, {
        cache: "no-store",
        headers: { Cookie: cookieStore.toString() },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedFolderDetails = getFolderDetailsSchema.safeParse(await response.json());

    if (parsedFolderDetails.success === false) {
        throw new Error("Failed to fetch data");
    }

    return {
        success: true,
        data: {
            id: parsedFolderDetails.data.id,
            name: parsedFolderDetails.data.name,
            type: parsedFolderDetails.data.type,
            ownerId: parsedFolderDetails.data.ownerId,
            createdAt: parsedFolderDetails.data.createdAt,
            updatedAt: parsedFolderDetails.data.updatedAt,
            folderAccess: parsedFolderDetails.data.access,
            hierarchy: parsedFolderDetails.data.ancestors,
        },
    };
}

async function getFolderContents(folderId: string) {
    const cookieStore = await cookies();
    const response = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/folders/${folderId}/children`, {
        cache: "no-store",
        headers: { Cookie: cookieStore.toString() },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedFolderContents = getFolderContentsSchema.safeParse(await response.json());

    if (parsedFolderContents.success === false) {
        throw new Error("Failed to fetch data");
    }

    return {
        success: true,
        data: {
            id: parsedFolderContents.data.id,
            folders: parsedFolderContents.data.folders.map((folder) => ({
                id: folder.id,
                folderName: folder.name,
            })),
            files: parsedFolderContents.data.files.map((file) => ({
                id: file.id,
                fileName: file.name,
            })),
        },
    };
}

const getFolderDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    ownerId: z.string(),
    parentFolderId: z.string().nullable(),
    type: z.enum(["ROOT", "STANDARD"]),
    access: z.enum(["PRIVATE", "PROTECTED", "PUBLIC"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    ancestors: z
        .object({
            id: z.string(),
            name: z.string(),
            type: z.enum(["ROOT", "STANDARD"]),
        })
        .array(),
});

const folderSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const fileSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const getFolderContentsSchema = z.object({
    id: z.string(),
    folders: folderSchema.array(),
    files: fileSchema.array(),
});
