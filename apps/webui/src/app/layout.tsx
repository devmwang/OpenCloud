import type { Metadata } from "next";

import "@/styles/globals.css";
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
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                {children}
            </ThemeProvider>
        </html>
    );
}
