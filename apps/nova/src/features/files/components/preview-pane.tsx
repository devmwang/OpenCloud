import { buildFileContentUrl } from "@/features/files/api";

type PreviewPaneProps = {
    fileRouteId: string;
    fileType: string;
    readToken?: string;
};

const officeExtensions = new Set([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".xlsm", ".pptm", ".docm"]);

const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);

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

export function PreviewPane({ fileRouteId, fileType, readToken }: PreviewPaneProps) {
    const normalizedFileType = typeof fileType === "string" ? fileType.toLowerCase() : "";

    if (normalizedFileType.startsWith("image/")) {
        return <ImagePreviewPane fileRouteId={fileRouteId} readToken={readToken} />;
    }

    if (isVideoFile(normalizedFileType, fileRouteId)) {
        return <VideoPreviewPane fileRouteId={fileRouteId} readToken={readToken} />;
    }

    if (isOfficeFile(normalizedFileType, fileRouteId)) {
        return <OfficePreviewPane fileRouteId={fileRouteId} readToken={readToken} />;
    }

    return (
        <div className="preview-shell" style={{ display: "grid", placeItems: "center", padding: "1rem" }}>
            <div>Rendering for this file type is not currently supported.</div>
        </div>
    );
}

function ImagePreviewPane({ fileRouteId, readToken }: { fileRouteId: string; readToken?: string }) {
    const source = buildFileContentUrl(fileRouteId, readToken);

    return (
        <div className="preview-shell">
            <img src={source} alt="File Preview" loading="lazy" />
        </div>
    );
}

function VideoPreviewPane({ fileRouteId, readToken }: { fileRouteId: string; readToken?: string }) {
    const source = buildFileContentUrl(fileRouteId, readToken);

    return (
        <div className="preview-shell">
            <video src={source} controls preload="metadata">
                <track kind="captions" />
                Your browser does not support video playback.
            </video>
        </div>
    );
}

function OfficePreviewPane({ fileRouteId, readToken }: { fileRouteId: string; readToken?: string }) {
    const source = buildFileContentUrl(fileRouteId, readToken);
    const officeSource = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`;

    return (
        <div className="preview-shell">
            <iframe src={officeSource} title="Office File Preview" />
        </div>
    );
}
