import { DocumentIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";

import { createReadToken } from "@/features/auth/api";
import { buildFileContentUrl, normalizeFileId } from "@/features/files/api";

import { ImageViewer } from "./image-viewer";
import { ViewToolbar } from "./view-toolbar";

type PreviewPaneProps = {
    fileRouteId: string;
    fileType: string;
    fileAccess?: "PRIVATE" | "PROTECTED" | "PUBLIC";
    readToken?: string;
};

const officeExtensions = new Set([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".xlsm", ".pptm", ".docm"]);

const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);
const OFFICE_PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;

const getLowercaseExtension = (fileRouteId: string) => {
    const lastDotIndex = fileRouteId.lastIndexOf(".");
    if (lastDotIndex < 0) {
        return "";
    }

    return fileRouteId.slice(lastDotIndex).toLowerCase();
};

const isOfficeFile = (fileType: string, fileRouteId: string) => {
    const normalized = fileType.toLowerCase();
    const extension = getLowercaseExtension(fileRouteId);

    if (officeExtensions.has(extension)) {
        return true;
    }

    if (normalized.startsWith("application/vnd.openxmlformats-officedocument.")) {
        return true;
    }

    if (normalized.startsWith("application/vnd.ms-")) {
        return true;
    }

    return normalized === "application/msword";
};

const isVideoFile = (fileType: string, fileRouteId: string) => {
    const normalized = fileType.toLowerCase();
    if (normalized.startsWith("video/")) {
        return true;
    }

    return videoExtensions.has(getLowercaseExtension(fileRouteId));
};

export function PreviewPane({ fileRouteId, fileType, fileAccess, readToken }: PreviewPaneProps) {
    const normalizedFileType = typeof fileType === "string" ? fileType.toLowerCase() : "";

    if (normalizedFileType.startsWith("image/")) {
        return <ImagePreviewPane fileRouteId={fileRouteId} readToken={readToken} />;
    }

    if (isVideoFile(normalizedFileType, fileRouteId)) {
        return <VideoPreviewPane fileRouteId={fileRouteId} readToken={readToken} />;
    }

    if (isOfficeFile(normalizedFileType, fileRouteId)) {
        return <OfficePreviewPane fileRouteId={fileRouteId} readToken={readToken} fileAccess={fileAccess} />;
    }

    return (
        <div className="preview-shell grid place-items-center p-10">
            <div className="flex flex-col items-center gap-3">
                <div className="border-border flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed">
                    <DocumentIcon className="text-text-dim h-8 w-8" />
                </div>
                <p className="text-text-muted text-sm">Preview is not available for this file type.</p>
            </div>
        </div>
    );
}

function ImagePreviewPane({ fileRouteId, readToken }: { fileRouteId: string; readToken?: string }) {
    const source = buildFileContentUrl(fileRouteId, readToken);

    return <ImageViewer src={source} fileName={fileRouteId} />;
}

function VideoPreviewPane({ fileRouteId, readToken }: { fileRouteId: string; readToken?: string }) {
    const source = buildFileContentUrl(fileRouteId, readToken);

    return (
        <div className="preview-shell">
            <video src={source} controls preload="metadata">
                <track kind="captions" />
                Your browser does not support video playback.
            </video>
            <ViewToolbar downloadUrl={source} fileName={fileRouteId} />
        </div>
    );
}

function OfficePreviewPane({
    fileRouteId,
    readToken,
    fileAccess,
}: {
    fileRouteId: string;
    readToken?: string;
    fileAccess?: "PRIVATE" | "PROTECTED" | "PUBLIC";
}) {
    const normalizedFileId = normalizeFileId(fileRouteId);
    const requiresToken = !readToken && fileAccess === "PROTECTED";

    const readTokenQuery = useQuery({
        queryKey: ["file", "office-preview-read-token", normalizedFileId],
        queryFn: async () =>
            createReadToken({
                fileId: normalizedFileId,
                description: "Nova Office preview",
                expiresAt: new Date(Date.now() + OFFICE_PREVIEW_TOKEN_TTL_MS).toISOString(),
            }),
        enabled: requiresToken && !import.meta.env.SSR,
        retry: false,
        staleTime: 5 * 60 * 1000,
    });

    if (requiresToken && (import.meta.env.SSR || readTokenQuery.isPending)) {
        return (
            <div className="preview-shell grid place-items-center p-10">
                <p className="text-text-muted text-sm">Preparing secure Office preview...</p>
            </div>
        );
    }

    const resolvedReadToken = readToken ?? readTokenQuery.data?.readToken;
    const source = buildFileContentUrl(fileRouteId, resolvedReadToken);

    if ((fileAccess === "PRIVATE" && !readToken) || (requiresToken && !resolvedReadToken)) {
        return (
            <div className="preview-shell grid place-items-center p-10">
                <div className="flex max-w-md flex-col items-center gap-3 text-center">
                    <p className="text-text text-sm font-medium">Office preview is unavailable for this file.</p>
                    <p className="text-text-muted text-sm">
                        This document needs a public or tokenized URL for Office Online rendering.
                    </p>
                    <ViewToolbar downloadUrl={source} fileName={fileRouteId} />
                </div>
            </div>
        );
    }

    const officeSource = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`;

    return (
        <div className="preview-shell">
            <iframe src={officeSource} title="Office File Preview" />
            <ViewToolbar downloadUrl={source} fileName={fileRouteId} />
        </div>
    );
}
