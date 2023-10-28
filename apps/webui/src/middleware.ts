import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { env } from "@/env/env.mjs";

export async function middleware(request: NextRequest) {
    const accessToken = request.cookies.get("AccessToken");

    // If there is no access token, do not allow access to protected pages
    // Run authentication for file view in file component
    if (
        request.nextUrl.pathname.startsWith("/folder") ||
        request.nextUrl.pathname.startsWith("/home") ||
        request.nextUrl.pathname.startsWith("/profile")
    ) {
        if (!accessToken) {
            return NextResponse.redirect(new URL("/login", request.nextUrl));
        }
    }

    // Handle discordbot user agent
    if (request.nextUrl.pathname.startsWith("/file")) {
        if (request.headers.get("User-Agent")?.toLowerCase().includes("discord") || request.headers.get("User-Agent") == "Mozilla/5.0 (Macintosh; Intel Mac OS X 11.6; rv:92.0) Gecko/20100101 Firefox/92.0") {
            const pathName = request.nextUrl.pathname;
            const fileId = pathName.substring(pathName.lastIndexOf('/') + 1);
    
            return NextResponse.rewrite(new URL(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get/${fileId}`));
        }
    }
}
