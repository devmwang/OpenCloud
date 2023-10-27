import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
}
