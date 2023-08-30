import { ChevronRight } from "lucide-react";

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
                        <div className="relative ml-2.5 mr-3 h-10 w-40 cursor-default overflow-hidden rounded-xl bg-zinc-900 pb-1 pt-0.5 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:border-t before:border-zinc-700/30 before:bg-gradient-to-r before:from-transparent before:via-zinc-700/30 before:to-transparent"></div>
                        <div className="block">
                            <ChevronRight className="mt-0.5 h-6" />
                        </div>
                    </div>

                    <div className="relative ml-2.5 mr-3 h-10 w-40 cursor-default overflow-hidden rounded-xl bg-zinc-900 pb-1 pt-0.5 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:border-t before:border-zinc-700/30 before:bg-gradient-to-r before:from-transparent before:via-zinc-700/30 before:to-transparent"></div>
                </div>
            </div>

            {/* <GridLayout folders={folderContents.data.folders} files={folderContents.data.files} /> */}
        </div>
    );
}
