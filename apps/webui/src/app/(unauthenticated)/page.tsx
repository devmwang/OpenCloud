import Link from "next/link";

export default function Page() {
    return (
        <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center">
            <div className="mb-6 text-4xl font-bold">Log in to OpenCloud</div>
            <div className="w-full max-w-sm">
                <Link
                    href="/login"
                    className="flex w-full items-center justify-center rounded-lg px-4 py-3 hover:bg-black/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                    <span className="text-2xl font-semibold whitespace-nowrap">Login</span>
                </Link>
            </div>
        </div>
    );
}
