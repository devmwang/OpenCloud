import { z } from "zod";

import { env } from "@/env/env.mjs";
import { Breadcrumb } from "@/components/file-system/breadcrumb";
import { GridLayout } from "@/components/file-system/grid/core-layout";

export default async function FolderView({ params }: { params: { folderId: string } }) {
    const folderDetailsPromise = getFolderDetails(params.folderId);
    const folderContentsPromise = getFolderContents(params.folderId);

    const [folderDetails, folderContents] = await Promise.all([folderDetailsPromise, folderContentsPromise]);

    return (
        <div className="h-full w-full px-6 py-4 text-zinc-950 dark:text-zinc-50">
            <div className="mb-6">
                <Breadcrumb folderDetails={folderDetails.data} />
            </div>

            <GridLayout folders={folderContents.data.folders} files={folderContents.data.files} />
        </div>
    );
}

async function getFolderDetails(folderId: string) {
    const response = await fetch(`${env.OPENCLOUD_SERVER_URL}/v1/folder/get-details?folderId=${folderId}`, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedFolderDetails = getFolderDetailsSchema.safeParse(await response.json());

    if (parsedFolderDetails.success === false) {
        throw new Error("Failed to fetch data");
    }

    return parsedFolderDetails;
}

async function getFolderContents(folderId: string) {
    const response = await fetch(`${env.OPENCLOUD_SERVER_URL}/v1/folder/get-contents?folderId=${folderId}`, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedFolderContents = getFolderContentsSchema.safeParse(await response.json());

    if (parsedFolderContents.success === false) {
        throw new Error("Failed to fetch data");
    }

    return parsedFolderContents;
}

const getFolderDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    hierarchy: z
        .object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
        })
        .array(),
});

const folderSchema = z.object({
    id: z.string(),
    folderName: z.string(),
});

const fileSchema = z.object({
    id: z.string(),
    fileName: z.string(),
});

const getFolderContentsSchema = z.object({
    id: z.string(),
    folders: folderSchema.array(),
    files: fileSchema.array(),
});
