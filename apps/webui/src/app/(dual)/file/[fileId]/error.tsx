"use client";

export default function Error({ error }: { error: Error & { digest?: string } }) {
    return <div className="px-6 py-10 text-center text-xl">Failed to load file.</div>;
}
