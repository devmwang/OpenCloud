import Image from "next/image";
import { cookies } from "next/headers";
import { z } from "zod";

import { env } from "@/env/env.mjs";
import { ImageView } from "@/components/file-system/file-view/image-view";

export default async function FileView({ params }: { params: { fileId: string } }) {
    const fileDetailsPromise = getFileDetails(params.fileId);

    const [fileDetails] = await Promise.all([fileDetailsPromise]);

    return (
        <>
            <div className="border-b border-zinc-300 px-6 py-4 text-xl font-semibold dark:border-zinc-700">
                {fileDetails.data.name}
            </div>
            <div className="relative h-full overflow-hidden">
                <ImageView fileId={params.fileId} />
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
