"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Folder, File } from "lucide-react";
import path from "path";

import { env } from "@/env/env.mjs";

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
                    <div className="truncate select-none">{folderName}</div>
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
                    router.push(`/file/${fileId}${path.parse(fileName).ext}`);
                }
            }}
        >
            <div className="rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50">
                <div className="flex items-center">
                    <div className="block px-4 py-3">
                        <File className="h-6" />
                    </div>
                    <div className="truncate select-none">{fileName}</div>
                </div>
                <div className="px-2.5 pb-2">
                    <Image
                        className="h-auto w-full rounded-md"
                        src={`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get-thumbnail/${fileId}`}
                        width={300}
                        height={200}
                        alt="File Preview Thumbnail"
                        placeholder="data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjcwMCIgaGVpZ2h0PSI0NzUiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjcwMCIgaGVpZ2h0PSI0NzUiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSI3MDAiIGhlaWdodD0iNDc1IiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItNzAwIiB0bz0iNzAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg=="
                    />
                </div>
            </div>
        </div>
    );
}
