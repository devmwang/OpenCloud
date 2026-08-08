import { DocumentIcon } from "@heroicons/react/24/outline";

import { buildFileContentUrl, buildFileDownloadUrl, getFilePreviewKind } from "@/features/files/api";

import { ImageViewer } from "./image-viewer";
import { ViewToolbar } from "./view-toolbar";

type PreviewPaneProps = {
    fileRouteId: string;
    fileName: string;
    fileType: string;
    fileAccess: "PRIVATE" | "PROTECTED" | "PUBLIC";
    readToken?: string;
};

export function PreviewPane({ fileRouteId, fileName, fileType, fileAccess, readToken }: PreviewPaneProps) {
    const previewKind = getFilePreviewKind(fileType);
    const source = buildFileContentUrl(fileRouteId, readToken);
    const downloadUrl = buildFileDownloadUrl(fileRouteId, readToken);

    if (previewKind === "image") {
        return <ImageViewer src={source} downloadUrl={downloadUrl} fileName={fileName} />;
    }

    if (previewKind === "video") {
        return <VideoPreviewPane source={source} downloadUrl={downloadUrl} />;
    }

    if (previewKind === "audio") {
        return <AudioPreviewPane source={source} downloadUrl={downloadUrl} />;
    }

    if (previewKind === "pdf") {
        return <PdfPreviewPane source={source} downloadUrl={downloadUrl} />;
    }

    if (previewKind === "office") {
        return <OfficePreviewPane fileRouteId={fileRouteId} fileAccess={fileAccess} downloadUrl={downloadUrl} />;
    }

    return <UnavailablePreview message="Preview is not available for this file type." downloadUrl={downloadUrl} />;
}

function VideoPreviewPane({ source, downloadUrl }: { source: string; downloadUrl: string }) {
    return (
        <div className="preview-shell">
            <video src={source} controls preload="metadata">
                <track kind="captions" />
                Your browser does not support video playback.
            </video>
            <ViewToolbar downloadUrl={downloadUrl} />
        </div>
    );
}

function AudioPreviewPane({ source, downloadUrl }: { source: string; downloadUrl: string }) {
    return (
        <div className="preview-shell grid place-items-center p-10">
            <audio src={source} controls preload="metadata" className="w-full max-w-2xl">
                Your browser does not support audio playback.
            </audio>
            <ViewToolbar downloadUrl={downloadUrl} />
        </div>
    );
}

function PdfPreviewPane({ source, downloadUrl }: { source: string; downloadUrl: string }) {
    return (
        <div className="preview-shell">
            <iframe src={source} title="PDF preview" />
            <ViewToolbar downloadUrl={downloadUrl} />
        </div>
    );
}

function OfficePreviewPane({
    fileRouteId,
    fileAccess,
    downloadUrl,
}: {
    fileRouteId: string;
    fileAccess: "PRIVATE" | "PROTECTED" | "PUBLIC";
    downloadUrl: string;
}) {
    if (fileAccess !== "PUBLIC") {
        return (
            <UnavailablePreview
                message="Office preview is available only for public files."
                downloadUrl={downloadUrl}
            />
        );
    }

    const source = buildFileContentUrl(fileRouteId);
    const officeSource = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`;

    return (
        <div className="preview-shell">
            <iframe src={officeSource} title="Office file preview" />
            <ViewToolbar downloadUrl={downloadUrl} />
        </div>
    );
}

function UnavailablePreview({ message, downloadUrl }: { message: string; downloadUrl: string }) {
    return (
        <div className="preview-shell grid place-items-center p-10">
            <div className="flex flex-col items-center gap-3 text-center">
                <div className="border-border flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed">
                    <DocumentIcon className="text-text-dim h-8 w-8" />
                </div>
                <p className="text-text-muted text-sm">{message}</p>
            </div>
            <ViewToolbar downloadUrl={downloadUrl} />
        </div>
    );
}
