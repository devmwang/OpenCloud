"use client";

import Link from "next/link";

export default function Error() {
    return (
        <div className="px-6 py-4 text-lg text-white">
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
            <Link href="/home" className="text-blue-400 underline underline-offset-2">
                Go Home
            </Link>
            ?
        </div>
    );
}
