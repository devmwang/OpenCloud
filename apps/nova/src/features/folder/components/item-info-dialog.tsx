import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getFileDetails } from "@/features/files/api";
import { getFolderDetails } from "@/features/folder/api";
import type { SelectionItem } from "@/features/folder/hooks/use-selection";
import { queryKeys } from "@/lib/query-keys";

type ItemInfoDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: SelectionItem | null;
};

function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return "Unknown";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "Unknown";
    try {
        return new Date(dateStr).toLocaleString();
    } catch {
        return dateStr;
    }
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5">
            <span className="text-text-muted shrink-0 text-xs font-medium tracking-wide uppercase">{label}</span>
            <span className="text-text truncate text-right text-sm">{value}</span>
        </div>
    );
}

function FileInfoContent({ fileId }: { fileId: string }) {
    const query = useQuery({
        queryKey: queryKeys.fileDetails(fileId),
        queryFn: () => getFileDetails(fileId),
    });

    if (query.isPending) {
        return <LoadingSpinner />;
    }

    if (query.error) {
        return <p className="text-danger text-sm">Failed to load file details.</p>;
    }

    const file = query.data;

    return (
        <div className="divide-border divide-y">
            <InfoRow label="Name" value={file.name} />
            <InfoRow label="Type" value={file.fileType} />
            <InfoRow label="Size" value={formatBytes(file.fileSize ?? file.size)} />
            <InfoRow label="Access" value={file.fileAccess ?? file.fileAccessPermission ?? "Unknown"} />
            {file.ownerUsername ? <InfoRow label="Owner" value={file.ownerUsername} /> : null}
            <InfoRow label="Created" value={formatDate(file.createdAt)} />
            <InfoRow label="Updated" value={formatDate(file.updatedAt)} />
        </div>
    );
}

function FolderInfoContent({ folderId }: { folderId: string }) {
    const query = useQuery({
        queryKey: queryKeys.folderDetails(folderId),
        queryFn: () => getFolderDetails(folderId),
    });

    if (query.isPending) {
        return <LoadingSpinner />;
    }

    if (query.error) {
        return <p className="text-danger text-sm">Failed to load folder details.</p>;
    }

    const folder = query.data;

    return (
        <div className="divide-border divide-y">
            <InfoRow label="Name" value={folder.name} />
            <InfoRow label="Access" value={folder.folderAccess ?? folder.fileAccessPermission ?? "Unknown"} />
            {folder.ownerUsername ? <InfoRow label="Owner" value={folder.ownerUsername} /> : null}
            <InfoRow label="Created" value={formatDate(folder.createdAt)} />
            <InfoRow label="Updated" value={formatDate(folder.updatedAt)} />
        </div>
    );
}

function LoadingSpinner() {
    return (
        <div className="flex items-center justify-center py-6" role="status" aria-live="polite">
            <div className="relative h-8 w-8">
                <div className="border-border absolute inset-0 rounded-full border-2" />
                <div className="border-t-accent absolute inset-0 animate-spin rounded-full border-2 border-transparent" />
            </div>
        </div>
    );
}

export function ItemInfoDialog({ open, onOpenChange, item }: ItemInfoDialogProps) {
    const title = item ? `${item.kind === "folder" ? "Folder" : "File"} Info` : "Info";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent title={title} description={item?.name}>
                {item?.kind === "file" ? <FileInfoContent fileId={item.id} /> : null}
                {item?.kind === "folder" ? <FolderInfoContent folderId={item.id} /> : null}
            </DialogContent>
        </Dialog>
    );
}
