import {
    DocumentIcon,
    DocumentTextIcon,
    FilmIcon,
    PhotoIcon,
    PresentationChartBarIcon,
    TableCellsIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { buildFileThumbnailUrl } from "@/features/files/api";
import { toFileRouteId } from "@/lib/file-id";

type FileCardProps = {
    id: string;
    fileName: string;
    folderId: string;
    selected?: boolean;
    onClick?: (event: React.MouseEvent) => void;
};

const getFileExtension = (name: string) => {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toUpperCase() : "";
};

const getFileExtensionLower = (name: string) => {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const videoExtensions = new Set(["mp4", "webm", "ogg", "mov", "m4v", "avi", "mkv"]);
const spreadsheetExtensions = new Set(["xls", "xlsx", "xlsm", "csv", "tsv", "ods"]);
const presentationExtensions = new Set(["ppt", "pptx", "pptm", "odp"]);
const documentExtensions = new Set(["doc", "docx", "docm", "odt", "rtf", "pdf", "txt", "md"]);

function getFileIcon(fileName: string): ReactNode {
    const ext = getFileExtensionLower(fileName);
    if (imageExtensions.has(ext)) return <PhotoIcon className="h-8 w-8" />;
    if (videoExtensions.has(ext)) return <FilmIcon className="h-8 w-8" />;
    if (spreadsheetExtensions.has(ext)) return <TableCellsIcon className="h-8 w-8" />;
    if (presentationExtensions.has(ext)) return <PresentationChartBarIcon className="h-8 w-8" />;
    if (documentExtensions.has(ext)) return <DocumentTextIcon className="h-8 w-8" />;
    return <DocumentIcon className="h-8 w-8" />;
}

function isImageFile(fileName: string): boolean {
    return imageExtensions.has(getFileExtensionLower(fileName));
}

export function FileCard({ id, fileName, folderId, selected, onClick }: FileCardProps) {
    const router = useRouter();
    const fileRouteId = toFileRouteId(id, fileName);
    const ext = getFileExtension(fileName);
    const isImage = isImageFile(fileName);
    const thumbnailUrl = isImage ? buildFileThumbnailUrl(fileRouteId) : null;

    const handleDoubleClick = () => {
        void router.navigate({
            to: "/folder/$folderId/file/$fileId/modal",
            params: { folderId, fileId: fileRouteId },
            mask: {
                to: "/file/$fileId",
                params: { fileId: fileRouteId },
                unmaskOnReload: true,
            },
        });
    };

    return (
        <div
            onClick={onClick}
            onDoubleClick={handleDoubleClick}
            className={`group border-border bg-surface hover:border-border-bright hover:bg-surface-raised/60 focus-ring relative block cursor-pointer overflow-hidden rounded-xl border no-underline transition-all duration-150 select-none hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
                selected ? "ring-accent/60 border-accent/30 bg-accent/5 ring-2" : ""
            }`}
        >
            {selected ? (
                <div className="bg-accent absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full shadow-sm">
                    <CheckIcon className="h-3 w-3 text-white" />
                </div>
            ) : null}

            {/* Thumbnail area */}
            <div className="bg-root relative flex aspect-[4/3] items-center justify-center overflow-hidden">
                {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={fileName} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                    <div className="text-text-dim">{getFileIcon(fileName)}</div>
                )}
            </div>

            {/* Info */}
            <div className="space-y-1 px-3 py-2">
                <p className="text-text truncate text-sm font-medium">{fileName}</p>
                <div className="flex items-center gap-1.5">{ext ? <Badge>{ext}</Badge> : null}</div>
            </div>
        </div>
    );
}
