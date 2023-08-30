import { ChevronRight, Folder, File } from "lucide-react";

export default function Loading() {
    return (
        <div className="h-full w-full px-6 py-4">
            <div className="mb-6">
                <div className="-mx-3 flex items-center text-3xl font-semibold">
                    <div className="flex items-center">
                        <div className="cursor-default rounded-xl pb-1 pl-2.5 pr-3 pt-0.5">{"Files"}</div>
                        <div className="block">
                            <ChevronRight className="mt-0.5 h-6" />
                        </div>
                    </div>

                    <div className="flex items-center">
                        <div className="relative ml-2.5 mr-3 h-10 w-40 cursor-default overflow-hidden rounded-xl bg-zinc-900 pb-1 pt-0.5 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:border-t before:border-zinc-700/40 before:bg-gradient-to-r before:from-transparent before:via-zinc-700/40 before:to-transparent"></div>
                        <div className="block">
                            <ChevronRight className="mt-0.5 h-6" />
                        </div>
                    </div>

                    <div className="relative ml-2.5 mr-3 h-10 w-40 cursor-default overflow-hidden rounded-xl bg-zinc-900 pb-1 pt-0.5 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:border-t before:border-zinc-700/40 before:bg-gradient-to-r before:from-transparent before:via-zinc-700/40 before:to-transparent"></div>
                </div>
            </div>

            <div className="mb-2 text-xl font-medium">Folders</div>
            <div className="mb-6 grid grid-cols-fs-grid-view gap-4">
                {Array.from(Array(8).keys()).map((number) => {
                    return (
                        <div
                            key={number}
                            className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:border-t before:border-zinc-700/40 before:bg-gradient-to-r before:from-transparent before:via-zinc-700/40 before:to-transparent dark:border-zinc-700 dark:bg-zinc-800"
                        >
                            <div className="flex items-center">
                                <div className="block px-4 py-3">
                                    <Folder className="h-6 text-zinc-900" />
                                </div>
                                <div className="mr-2.5 h-6 w-full truncate rounded-lg bg-zinc-900/60"></div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mb-2 text-xl font-medium">Files</div>
            <div className="mb-6 grid grid-cols-fs-grid-view gap-4">
                {Array.from(Array(8).keys()).map((number) => {
                    return (
                        <div
                            key={number}
                            className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:border-t before:border-zinc-700/40 before:bg-gradient-to-r before:from-transparent before:via-zinc-700/40 before:to-transparent dark:border-zinc-700 dark:bg-zinc-800"
                        >
                            <div className="flex items-center">
                                <div className="block px-4 py-3">
                                    <File className="h-6 text-zinc-900" />
                                </div>
                                <div className="mr-2.5 h-6 w-full truncate rounded-lg bg-zinc-900/60"></div>
                            </div>
                            <div className="px-2.5 pb-2">
                                <div className="aspect-[3/2] w-full rounded-md bg-zinc-900/60"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
