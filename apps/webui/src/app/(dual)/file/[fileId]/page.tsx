import { Metadata } from "next";
import { cookies } from "next/headers";
import { z } from "zod";
import path from "path";

import { env } from "@/env/env.mjs";
import { PreviewPane } from "@/components/file-system/file-view/preview-pane";

export async function generateMetadata({ params }: { params: { fileId: string } }): Promise<Metadata> {
    const fileId = path.parse(params.fileId).name;

    const fileDetails = await getFileDetails(fileId);

    if (!fileDetails.success) {
        if (fileDetails.error == "Unauthorized") {
            return {
                title: "OpenCloud - Unauthorized",
            };
        } else {
            return {};
        }
    }
    if (!fileDetails.data) {
        return {};
    }

    return {
        title: `OpenCloud - ${fileDetails.data.name}`,
        openGraph: {
            images: [`https://opencloud-api.devmwang.com/v1/files/get/${fileId}${path.extname(fileDetails.data.name)}`],
        },
    };
}

export default async function FileView({ params }: { params: { fileId: string } }) {
    const fileId = path.parse(params.fileId).name;
    const fileDetailsPromise = getFileDetails(fileId);

    const [fileDetails] = await Promise.all([fileDetailsPromise]);

    if (!fileDetails.success) {
        if (fileDetails.error == "Unauthorized") {
            return <div className="px-6 py-10 text-center text-xl">You are not authorized to view this file.</div>;
        } else {
            throw new Error("Failed to fetch data");
        }
    }
    if (!fileDetails.data) {
        throw new Error("Failed to fetch data");
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 top-0 z-20 mx-auto bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
            <div className="grid h-full w-full grid-rows-core-layout">
                <div className="flex h-full w-full flex-row items-center border-b border-zinc-300 dark:border-zinc-700">
                    <div className="flex basis-1/3 justify-start">
                        <div className="w-width-sidebar text-center">
                            <span className="self-center whitespace-nowrap text-4xl font-semibold">{"OpenCloud"}</span>
                        </div>
                    </div>

                    <div className="flex basis-1/3 items-center justify-center">
                        <span className="px-6 py-4 text-xl font-semibold dark:border-zinc-700">
                            {fileDetails.data.name}
                        </span>
                    </div>

                    <div className="flex basis-1/3"></div>
                </div>

                <div className="relative h-full overflow-hidden">
                    <PreviewPane fileId={params.fileId} />
                </div>
            </div>
        </div>
    );
}

async function getFileDetails(fileId: string) {
    const response = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get-details?fileId=${fileId}`, {
        cache: "no-store",
        headers: { Cookie: cookies().toString() },
    });

    if (response.status == 401 || response.status == 403) {
        return { success: false, error: "Unauthorized" };
    }

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedFileDetails = getFileDetailsSchema.safeParse(await response.json());

    if (parsedFileDetails.success === false) {
        throw new Error("Failed to fetch data");
    }

    // return parsedFileDetails.data;
    return { success: true, data: parsedFileDetails.data };
}

const getFileDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    ownerId: z.string(),
    parentId: z.string(),
    fileType: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
