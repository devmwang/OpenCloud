"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState } from "react";

import { authClient } from "@/components/auth/auth-client";
import { SessionContext } from "@/components/auth/session-provider";

export default function StatusBar() {
    const router = useRouter();
    const sessionContext = useContext(SessionContext);

    const [activeMenu, setActiveMenu] = useState("");

    const alertMenuRef = useRef<HTMLDivElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    const menuTransition = {
        duration: 0.2,
    };

    const selectMenu = (menu: string) => {
        if (activeMenu == menu) {
            setActiveMenu("");
        } else {
            setActiveMenu(menu);
        }
    };

    const closeAllMenus = (event: MouseEvent) => {
        if (
            activeMenu !== "" &&
            alertMenuRef.current &&
            profileMenuRef.current &&
            !alertMenuRef.current.contains(event.target as Node) &&
            !profileMenuRef.current.contains(event.target as Node)
        ) {
            setActiveMenu("");
        }
    };

    useEffect(() => {
        document.addEventListener("mousedown", closeAllMenus);

        return () => {
            document.removeEventListener("mousedown", closeAllMenus);
        };
    });

    const signOut = async () => {
        await authClient.signOut();
        await sessionContext.update();
        router.push("/login");
        router.refresh();
    };

    return (
        <>
            <div className="h-full w-full border-b border-zinc-300 dark:border-zinc-700">
                <div className="flex h-full flex-row items-center justify-between">
                    {/* Site Title */}
                    <div className="w-width-sidebar text-center">
                        <Link href={`/folder/${sessionContext.session?.user.rootFolderId}`} className="block">
                            <span className="self-center text-4xl font-semibold whitespace-nowrap">{"OpenCloud"}</span>
                        </Link>
                    </div>
                    <div></div>

                    {/* Main Subsections */}
                    <div className="flex h-full items-center px-12 text-center text-lg font-normal">
                        <div ref={alertMenuRef} className="relative">
                            <Bell className="h-10 w-10 hover:cursor-pointer" onClick={() => selectMenu("alertMenu")} />
                            <AnimatePresence>
                                {activeMenu == "alertMenu" && (
                                    <motion.div
                                        className="absolute right-0 translate-y-3 rounded-xl border-2 border-zinc-200 bg-zinc-50 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                                        style={{ originY: 0, translateY: 12 }}
                                        initial={{ opacity: 0, scaleY: 0.9 }}
                                        animate={{ opacity: 1, scaleY: 1 }}
                                        exit={{
                                            opacity: 0,
                                            scaleY: 0.9,
                                            transition: menuTransition,
                                        }}
                                        transition={menuTransition}
                                    >
                                        {/* Alert Pane */}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div ref={profileMenuRef} className="ml-12">
                            <UserCircle2
                                className="h-10 w-10 hover:cursor-pointer"
                                onClick={() => selectMenu("profileMenu")}
                            />
                            <AnimatePresence>
                                {activeMenu == "profileMenu" && (
                                    <motion.div
                                        className="absolute right-2 rounded-xl border-2 border-zinc-200 bg-zinc-50 px-1.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                                        style={{ originY: 0, translateY: 12 }}
                                        initial={{ opacity: 0, scaleY: 0.9 }}
                                        animate={{ opacity: 1, scaleY: 1 }}
                                        exit={{
                                            opacity: 0,
                                            scaleY: 0.9,
                                            transition: menuTransition,
                                        }}
                                        transition={menuTransition}
                                    >
                                        <Link
                                            href={`/folder/${sessionContext.session?.user.rootFolderId}`}
                                            className="block rounded-lg px-5 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                        >
                                            <span className="self-center whitespace-nowrap">{"Home"}</span>
                                        </Link>
                                        <Link
                                            href="/profile"
                                            className="block rounded-lg px-5 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                        >
                                            <span className="self-center whitespace-nowrap">{"Profile"}</span>
                                        </Link>
                                        <button
                                            onClick={signOut}
                                            className="block w-full rounded-lg px-5 py-1 text-left hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                            type="button"
                                        >
                                            <span className="self-center whitespace-nowrap">{"Sign out"}</span>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
