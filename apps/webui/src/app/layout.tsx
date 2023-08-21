import type { Metadata } from "next";

import "@/styles/globals.css";

import { SessionProvider } from "@/components/auth/session-provider";
import { ThemeProvider } from "@/components/ui/theme-provider";

export const metadata: Metadata = {
    title: "OpenCloud",
    description: "OpenCloud by Controllyx",
    icons: {
        icon: "/OpenCloud-Circle.svg",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
                <SessionProvider>
                    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                        {children}
                    </ThemeProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
