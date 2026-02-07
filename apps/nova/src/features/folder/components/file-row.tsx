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
import { toFileRouteId } from "@/lib/file-id";

type FileRowProps = {
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
    if (imageExtensions.has(ext)) return <PhotoIcon className="h-5 w-5" />;
    if (videoExtensions.has(ext)) return <FilmIcon className="h-5 w-5" />;
    if (spreadsheetExtensions.has(ext)) return <TableCellsIcon className="h-5 w-5" />;
    if (presentationExtensions.has(ext)) return <PresentationChartBarIcon className="h-5 w-5" />;
    if (documentExtensions.has(ext)) return <DocumentTextIcon className="h-5 w-5" />;
    return <DocumentIcon className="h-5 w-5" />;
}

export function FileRow({ id, fileName, folderId, selected, onClick }: FileRowProps) {
    const router = useRouter();
    const fileRouteId = toFileRouteId(id, fileName);
    const ext = getFileExtension(fileName);

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
            className={`group border-border hover:border-border-bright hover:bg-surface-raised/60 focus-ring flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-1.5 no-underline transition-all duration-150 select-none ${
                selected ? "ring-accent/60 border-accent/30 bg-accent/5 ring-2" : ""
            }`}
        >
            {selected ? (
                <div className="bg-accent flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-sm">
                    <CheckIcon className="h-3 w-3 text-white" />
                </div>
            ) : null}
            <div className="text-text-dim flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                {getFileIcon(fileName)}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-text truncate text-sm font-medium">{fileName}</p>
            </div>
            {ext ? <Badge>{ext}</Badge> : null}
        </div>
    );
}
