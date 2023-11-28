import { NextResponse, type NextRequest } from "next/server";
import { ResponseCookies, RequestCookies } from "next/dist/server/web/spec-extension/cookies";

import { env } from "@/env/env.mjs";

export async function middleware(request: NextRequest) {
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

    // If access token found, continue to page
    if (request.cookies.has("AccessToken")) {
        return NextResponse.next();
    }

    // If access token not found but refresh token is, attempt to refresh session
    // If refreshed successfully, continue to page
    if (!request.cookies.get("AccessToken") && !!request.cookies.get("RefreshToken")) {
        // Try refresh
        const refreshResponse = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/refresh`, {
            credentials: "include",
            headers: new Headers(request.headers),
        });

        // Continue if refreshed successfully
        if (refreshResponse.ok) {
            const response = NextResponse.redirect(new URL(request.nextUrl));

            const responseCookies = refreshResponse.headers.get("Set-Cookie") || "";
            response.headers.set("Set-Cookie", responseCookies);

            return response;
        }
    }

    // Assume client unauthenticated beyond this point (No AccessToken and failed to refresh)
    // Check if attempted route is protected and redirect if protected
    // Run authentication for file view in file component
    if (request.nextUrl.pathname.startsWith("/folder") || request.nextUrl.pathname.startsWith("/profile")) {
        // Store attempted url in search params
        const searchParams = new URLSearchParams(request.nextUrl.searchParams);
        searchParams.set("next", request.nextUrl.pathname);

        const response = NextResponse.redirect(new URL(`/login?${searchParams}`, request.url));

        return response;
    }
}
