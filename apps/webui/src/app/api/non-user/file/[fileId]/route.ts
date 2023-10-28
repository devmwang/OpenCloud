import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env/env.mjs";

export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
    const res = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get/${params.fileId}`, {
        cache: "no-store",
    });

    console.log(res.status);

    if (!res.ok) {
        return new Response();
    }

    return new NextResponse((await res.blob()).stream(), {
        headers: new Headers({
            "Content-Type": res.headers.get("Content-Type")!,
            "Content-Disposition": res.headers.get("Content-Disposition")!,
        }),
    });
}
