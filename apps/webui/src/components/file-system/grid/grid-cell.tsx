"use client";

import { useRouter } from "next/navigation";
import { Folder, File } from "lucide-react";

export function FolderGridCell({ folderId, folderName }: { folderId: string; folderName: string }) {
    const router = useRouter();

    return (
        <div
            className="cursor-pointer"
            onClick={(event) => {
                if (event.detail >= 2) {
                    router.push(`/folder/${folderId}`);
                }
            }}
        >
            <div className="rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50">
                <div className="flex items-center">
                    <div className="block px-4 py-3">
                        <Folder className="h-6" />
                    </div>
                    <div className="truncate">{folderName}</div>
                </div>
            </div>
        </div>
    );
}

export function FileGridCell({ fileId, fileName }: { fileId: string; fileName: string }) {
    const router = useRouter();

    return (
        <div
            className="cursor-pointer"
            onClick={(event) => {
                if (event.detail >= 2) {
                    router.push(`/file/${fileId}`);
                }
            }}
        >
            <div className="rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50">
                <div className="flex items-center">
                    <div className="block px-4 py-3">
                        <File className="h-6" />
                    </div>
                    <div className="truncate">{fileName}</div>
                </div>
            </div>
        </div>
    );
}
