import React from "react";
import type { Route } from "next";
import Link from "next/link";
import { FolderClosed } from "lucide-react";

import { getServerSession } from "@/components/auth/server-session";

export default async function Navbar() {
    const session = await getServerSession();

    return (
        <>
            <div className="h-full w-full border-r border-zinc-300 dark:border-zinc-700">
                {/* Main Subsections */}
                <div className="px-4 py-4 text-left text-2xl font-normal">
                    <div className="flex flex-col">
                        <NavbarLinkComponent
                            LinkDestination={`/folder/${session.user.rootFolderId}`}
                            SectionTitle="My Files"
                        >
                            <FolderClosed className="mt-1 mr-4 h-6" />
                        </NavbarLinkComponent>
                    </div>
                </div>
            </div>
        </>
    );
}

function NavbarLinkComponent<T extends string>({
    children,
    LinkDestination,
    SectionTitle,
}: {
    children: React.ReactNode;
    LinkDestination: Route<T>;
    SectionTitle: string;
}) {
    return (
        <Link
            href={LinkDestination}
            className="flex items-center rounded-xl px-4 pt-2.5 pb-3 hover:bg-black/10 dark:hover:bg-white/20"
        >
            {children}
            <span className="items-center self-center whitespace-nowrap">{SectionTitle}</span>
        </Link>
    );
}
