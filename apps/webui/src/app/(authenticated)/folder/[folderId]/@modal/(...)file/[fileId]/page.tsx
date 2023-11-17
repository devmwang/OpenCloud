import { cookies } from "next/headers";
import { z } from "zod";
import path from "path";

import { env } from "@/env/env.mjs";
import { PreviewPane } from "@/components/file-system/file-view/preview-pane";

export default async function FileView({ params }: { params: { fileId: string } }) {
    const cookieStore = cookies();

    const accessToken = cookieStore.get("AccessToken");

    if (!accessToken) {
        return (
            <div>
                {/* TODO: Add auth check failed message, not required since it should be impossible to get here without valid auth */}
            </div>
        );
    }

    const fileId = path.parse(params.fileId).name;

    const fileDetails = await getFileDetails(fileId);

    return (
        <>
            <div className="border-b border-zinc-400 px-6 py-4 text-xl font-semibold dark:border-zinc-700">
                {fileDetails.data.name}
            </div>
            <div className="relative h-full overflow-hidden">
                <PreviewPane fileId={params.fileId} fileType={fileDetails.data.fileType} />
            </div>
        </>
    );
}

async function getFileDetails(fileId: string) {
    const response = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get-details?fileId=${fileId}`, {
        cache: "no-store",
        headers: { Cookie: cookies().toString() },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch data");
    }

    const parsedFileDetails = getFileDetailsSchema.safeParse(await response.json());

    if (parsedFileDetails.success === false) {
        throw new Error("Failed to fetch data");
    }

    return parsedFileDetails;
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
