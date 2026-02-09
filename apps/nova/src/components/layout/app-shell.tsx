import {
    ArrowRightStartOnRectangleIcon,
    FolderIcon,
    ShieldCheckIcon,
    TrashIcon,
    UserCircleIcon,
    WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Link, useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { AuthSession } from "@/features/auth/api";

type SidebarProps = {
    session: AuthSession;
    onSignOut: () => void;
};

const navItems = [
    {
        label: "Files",
        icon: FolderIcon,
        getTo: (rootFolderId: string) => ({ to: "/folder/$folderId" as const, params: { folderId: rootFolderId } }),
    },
    { label: "Recycle Bin", icon: TrashIcon, getTo: () => ({ to: "/recycle-bin" as const }) },
    { label: "Profile", icon: UserCircleIcon, getTo: () => ({ to: "/profile" as const }) },
    { label: "Admin", icon: ShieldCheckIcon, getTo: () => ({ to: "/admin" as const }) },
    { label: "Tools", icon: WrenchScrewdriverIcon, getTo: () => ({ to: "/tools" as const }) },
] as const;

function isActiveRoute(matches: Array<{ routeId: string }>, label: string) {
    return matches.some((m) => {
        const id = m.routeId.toLowerCase();
        if (label === "Files") return id.includes("folder");
        if (label === "Recycle Bin") return id.includes("recycle-bin");
        return id.includes(label.toLowerCase());
    });
}

export function Sidebar({ session, onSignOut }: SidebarProps) {
    const matches = useMatches();
    const rootFolderId = session.user.rootFolderId;

    const initials = [session.user.firstName, session.user.lastName]
        .filter(Boolean)
        .map((n) => n?.[0]?.toUpperCase())
        .join("");
    const displayInitials = initials || session.user.username.slice(0, 2).toUpperCase();

    return (
        <>
            {/* Mobile top navigation */}
            <header className="bg-sidebar border-border border-b md:hidden">
                <div className="border-border flex items-center justify-between border-b px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <div className="bg-accent/20 flex h-8 w-8 items-center justify-center rounded-lg">
                            <div className="bg-accent h-2 w-2 rounded-full shadow-[0_0_8px_var(--color-accent)]" />
                        </div>
                        <span className="text-text text-sm font-semibold tracking-tight">OpenCloud</span>
                    </div>
                    <button
                        type="button"
                        onClick={onSignOut}
                        className="text-text-muted hover:text-text hover:bg-surface-raised flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-all duration-150"
                    >
                        <ArrowRightStartOnRectangleIcon className="h-4.5 w-4.5" />
                        Sign Out
                    </button>
                </div>
                <nav className="flex items-center gap-1 overflow-x-auto px-3 py-2">
                    {navItems.map((item) => {
                        const active = isActiveRoute(matches, item.label);
                        const linkProps = item.getTo(rootFolderId);

                        return (
                            <Link
                                key={`mobile-${item.label}`}
                                {...linkProps}
                                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors ${
                                    active
                                        ? "bg-surface-raised text-text"
                                        : "text-text-muted hover:text-text hover:bg-surface-raised/60"
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </header>

            <aside className="bg-sidebar border-border hidden h-screen w-[300px] flex-col border-r md:fixed md:top-0 md:left-0 md:z-40 md:flex">
                {/* Brand */}
                <div className="flex items-center gap-3 px-5 py-4">
                    <div className="bg-accent/20 flex h-9 w-9 items-center justify-center rounded-lg">
                        <div className="bg-accent h-2.5 w-2.5 rounded-full shadow-[0_0_8px_var(--color-accent)]" />
                    </div>
                    <span className="text-text text-base font-semibold tracking-tight">OpenCloud</span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-1 px-4 py-2">
                    <p className="text-text-dim px-2.5 pb-1 text-xs font-semibold tracking-widest uppercase">
                        Navigate
                    </p>
                    {navItems.map((item) => {
                        const active = isActiveRoute(matches, item.label);
                        const linkProps = item.getTo(rootFolderId);
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.label}
                                {...linkProps}
                                className={`relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium no-underline transition-all duration-150 ${
                                    active
                                        ? "bg-surface-raised text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                                        : "text-text-muted hover:text-text hover:bg-surface-raised/50"
                                }`}
                            >
                                {active ? (
                                    <div className="bg-accent absolute top-1/2 left-0 h-7 w-[3px] -translate-y-1/2 rounded-r-full shadow-[0_0_8px_var(--color-accent)]" />
                                ) : null}
                                <Icon className="h-6 w-6 shrink-0" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User section */}
                <div className="border-border mt-auto space-y-2 border-t px-4 pt-4 pb-4">
                    <div className="flex items-center gap-2.5 px-2">
                        <div className="from-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br to-blue-700 text-xs font-bold text-white">
                            {displayInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-text truncate text-sm font-medium">{session.user.username}</p>
                            <p className="text-text-dim truncate text-xs">{session.user.username}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onSignOut}
                        className="text-text-muted hover:text-text hover:bg-surface-raised flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-150"
                    >
                        <ArrowRightStartOnRectangleIcon className="h-6 w-6" />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}

type AppShellProps = {
    sidebar: ReactNode;
    children: ReactNode;
};

export function AppShell({ sidebar, children }: AppShellProps) {
    return (
        <div className="flex min-h-screen">
            {sidebar}
            <main className="ml-0 flex-1 p-4 md:ml-[300px] md:p-5">
                <div className="mx-auto max-w-[1800px]">{children}</div>
            </main>
        </div>
    );
}
