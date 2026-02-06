import {
    DocumentIcon,
    DocumentTextIcon,
    FilmIcon,
    PhotoIcon,
    PresentationChartBarIcon,
    TableCellsIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { buildFileThumbnailUrl } from "@/features/files/api";
import { toFileRouteId } from "@/lib/file-id";

type FileCardProps = {
    id: string;
    fileName: string;
    folderId: string;
    onContextMenu?: (event: React.MouseEvent) => void;
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
    if (imageExtensions.has(ext)) return <PhotoIcon className="h-6 w-6" />;
    if (videoExtensions.has(ext)) return <FilmIcon className="h-6 w-6" />;
    if (spreadsheetExtensions.has(ext)) return <TableCellsIcon className="h-6 w-6" />;
    if (presentationExtensions.has(ext)) return <PresentationChartBarIcon className="h-6 w-6" />;
    if (documentExtensions.has(ext)) return <DocumentTextIcon className="h-6 w-6" />;
    return <DocumentIcon className="h-6 w-6" />;
}

function isImageFile(fileName: string): boolean {
    return imageExtensions.has(getFileExtensionLower(fileName));
}

export function FileCard({ id, fileName, folderId, onContextMenu }: FileCardProps) {
    const fileRouteId = toFileRouteId(id, fileName);
    const ext = getFileExtension(fileName);
    const isImage = isImageFile(fileName);
    const thumbnailUrl = isImage ? buildFileThumbnailUrl(fileRouteId) : null;

    return (
        <Link
            to="/folder/$folderId/file/$fileId/modal"
            params={{ folderId, fileId: fileRouteId }}
            mask={{
                to: "/file/$fileId",
                params: { fileId: fileRouteId },
                unmaskOnReload: true,
            }}
            className="group border-border bg-surface hover:border-border-bright hover:bg-surface-raised/60 focus-ring block overflow-hidden rounded-xl border no-underline transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
            onContextMenu={onContextMenu}
        >
            {/* Thumbnail area */}
            <div className="bg-root relative flex aspect-[4/3] items-center justify-center overflow-hidden">
                {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={fileName} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                    <div className="text-text-dim">{getFileIcon(fileName)}</div>
                )}
            </div>

            {/* Info */}
            <div className="space-y-1.5 p-3">
                <p className="text-text truncate text-sm font-medium">{fileName}</p>
                <div className="flex items-center gap-1.5">{ext ? <Badge>{ext}</Badge> : null}</div>
            </div>
        </Link>
    );
}
