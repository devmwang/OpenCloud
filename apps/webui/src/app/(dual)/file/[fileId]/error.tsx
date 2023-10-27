"use client";

export default function Error({ error }: { error: Error & { digest?: string } }) {
    if (error.message == "Unauthorized") {
        return <div className="px-6 py-10 text-center text-xl">You are not authorized to view this file.</div>;
    }

    return <div className="px-6 py-10 text-center text-xl">Failed to load file.</div>;
}
