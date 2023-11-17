import { ImagePreviewPane } from "@/components/file-system/file-view/file-types/image";
import { OfficePreviewPane } from "@/components/file-system/file-view/file-types/office";

export function PreviewPane({ fileId, fileType }: { fileId: string; fileType: string }) {
    if (fileType.startsWith("image/")) {
        return <ImagePreviewPane fileId={fileId} />;
    }
    if (fileType.startsWith("application/vnd.openxmlformats-officedocument.")) {
        return <OfficePreviewPane fileId={fileId} />;
    }

    return <div className="p-4 text-xl font-semibold">Rendering for this file type is not currently supported.</div>;
}
