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

    const isProtectedRoute =
        request.nextUrl.pathname.startsWith("/folder") || request.nextUrl.pathname.startsWith("/profile");
    const hasBetterAuthSession =
        request.cookies.has("better-auth.session_token") || request.cookies.has("__Secure-better-auth.session_token");

    if (isProtectedRoute && hasBetterAuthSession) {
        const cookieHeader = request.headers.get("cookie") ?? "";
        const sessionResponse = await fetch(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/api/auth/get-session`, {
            headers: { Cookie: cookieHeader },
            cache: "no-store",
        });
        const sessionPayload = sessionResponse.ok ? await sessionResponse.json().catch(() => null) : null;
        const hasValidSession = Boolean(sessionPayload?.session && sessionPayload?.user);

        if (hasValidSession) {
            return NextResponse.next();
        }
    }

    if (isProtectedRoute) {
        // Store attempted url in search params
        const searchParams = new URLSearchParams(request.nextUrl.searchParams);
        searchParams.set("next", request.nextUrl.pathname);

        const response = NextResponse.redirect(new URL(`/login?${searchParams}`, request.url));
        if (hasBetterAuthSession) {
            response.cookies.delete("better-auth.session_token");
            response.cookies.delete("__Secure-better-auth.session_token");
        }

        return response;
    }

    return NextResponse.next();
}
