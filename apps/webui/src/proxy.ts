import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env/env.mjs";

export async function proxy(request: NextRequest) {
    // Handle discordbot user agent
    if (request.nextUrl.pathname.startsWith("/file")) {
        if (
            request.headers.get("User-Agent")?.toLowerCase().includes("discord") ||
            request.headers.get("User-Agent") ==
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 11.6; rv:92.0) Gecko/20100101 Firefox/92.0"
        ) {
            const pathName = request.nextUrl.pathname;
            const fileId = pathName.substring(pathName.lastIndexOf("/") + 1);

            return NextResponse.rewrite(new URL(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get/${fileId}`));
        }
    }

    const hasBetterAuthSession =
        request.cookies.has("better-auth.session_token") || request.cookies.has("__Secure-better-auth.session_token");

    if (hasBetterAuthSession) {
        return NextResponse.next();
    }

    if (request.nextUrl.pathname.startsWith("/folder") || request.nextUrl.pathname.startsWith("/profile")) {
        // Store attempted url in search params
        const searchParams = new URLSearchParams(request.nextUrl.searchParams);
        searchParams.set("next", request.nextUrl.pathname);

        const response = NextResponse.redirect(new URL(`/login?${searchParams}`, request.url));

        return response;
    }
}
