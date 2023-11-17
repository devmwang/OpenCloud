"use client";

import { env } from "@/env/env.mjs";

export function OfficePreviewPane({ fileId }: { fileId: string }) {
    const fileUrl = `${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get/${fileId}`;
    const encodedFileUrl = encodeURIComponent(fileUrl);

    return (
        <>
            <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodedFileUrl}`}
                width="100%"
                height="100%"
            />
        </>
    );
}
