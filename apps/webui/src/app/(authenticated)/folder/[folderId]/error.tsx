"use client";

import Link from "next/link";
import { useContext } from "react";

import { SessionContext } from "@/components/auth/session-provider";

export default function Error() {
    const sessionContext = useContext(SessionContext);

    return (
        <div className="px-6 py-4 text-lg">
            Failed to load data for this folder.{" "}
            <button
                onClick={() => {
                    location.reload();
                }}
                className="text-blue-400 underline underline-offset-2"
            >
                Retry
            </button>{" "}
            or{" "}
            <Link
                href={`/folder/${sessionContext.session?.user.rootFolderId}`}
                className="text-blue-400 underline underline-offset-2"
            >
                Go Home
            </Link>
            ?
        </div>
    );
}
