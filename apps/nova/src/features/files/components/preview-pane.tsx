import { buildFileContentUrl } from "@/features/files/api";

type PreviewPaneProps = {
    fileRouteId: string;
    fileType: string;
    readToken?: string;
};

export function PreviewPane({ fileRouteId, fileType, readToken }: PreviewPaneProps) {
    if (fileType.startsWith("image/")) {
        return <ImagePreviewPane fileRouteId={fileRouteId} readToken={readToken} />;
    }

    if (fileType.startsWith("application/vnd.openxmlformats-officedocument.")) {
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

function OfficePreviewPane({ fileRouteId, readToken }: { fileRouteId: string; readToken?: string }) {
    const source = buildFileContentUrl(fileRouteId, readToken);
    const officeSource = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`;

    return (
        <div className="preview-shell">
            <iframe src={officeSource} title="Office File Preview" />
        </div>
    );
}
