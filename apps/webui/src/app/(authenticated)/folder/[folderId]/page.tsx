import { z } from "zod";

import { cookies } from "next/headers";

import { env } from "@/env/env.mjs";
import { Breadcrumb } from "@/components/file-system/breadcrumb";
import { GridLayout } from "@/components/file-system/grid/core-layout";

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
    const response = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/folder/get-details?folderId=${folderId}`, {
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

    return parsedFolderDetails;
}

async function getFolderContents(folderId: string) {
    const cookieStore = await cookies();
    const response = await fetch(
        `${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/folder/get-contents?folderId=${folderId}`,
        {
            cache: "no-store",
            headers: { Cookie: cookieStore.toString() },
        },
    );

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
