"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

export default function Modal({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    const onKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                router.back();
            }
        },
        [router],
    );

    useEffect(() => {
        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onKeyDown]);

    return (
        <div
            onClick={(e) => router.back()}
            className="fixed top-0 right-0 bottom-0 left-0 z-20 mx-auto bg-black/30 dark:bg-black/50"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-1/2 left-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden xl:h-5/6 xl:w-5/6"
            >
                {children}
            </div>
        </div>
    );
}
