import { ArrowDownTrayIcon, InformationCircleIcon, LinkIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { buildFileContentUrl } from "@/features/files/api";
import { useSelection, type SelectionItem } from "@/features/folder/hooks/use-selection";
import { toFileRouteId } from "@/lib/file-id";

type SelectionToolbarProps = {
    onDeleteFiles: (fileIds: string[]) => Promise<void>;
    onDeleteFolders: (folderIds: string[]) => Promise<void>;
    onShowInfo: (item: SelectionItem) => void;
};

export function SelectionToolbar({ onDeleteFiles, onDeleteFolders, onShowInfo }: SelectionToolbarProps) {
    const { selectionCount, selectedFiles, selectedFolders, clearSelection, selected } = useSelection();
    const { addToast } = useToast();
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const isSingleFile = selectedFiles.length === 1 && selectedFolders.length === 0;
    const isSingleItem = selectionCount === 1;
    const singleItem = isSingleItem ? [...selected.values()][0] : undefined;

    const handleDownload = () => {
        if (!isSingleFile) return;
        const file = selectedFiles[0];
        if (!file) return;
        const fileRouteId = toFileRouteId(file.id, file.name);
        const url = buildFileContentUrl(fileRouteId);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCopyLink = async () => {
        if (!isSingleFile) return;
        const file = selectedFiles[0];
        if (!file) return;
        const fileRouteId = toFileRouteId(file.id, file.name);
        const url = `${window.location.origin}/file/${fileRouteId}`;
        await navigator.clipboard.writeText(url);
        addToast("File URL copied to clipboard", "success");
    };

    const handleInfo = () => {
        if (!singleItem) return;
        onShowInfo(singleItem);
    };

    const handleDelete = async () => {
        const fileIds = selectedFiles.map((f) => f.id);
        const folderIds = selectedFolders.map((f) => f.id);

        if (folderIds.length > 0) {
            await onDeleteFolders(folderIds);
        }
        if (fileIds.length > 0) {
            await onDeleteFiles(fileIds);
        }

        clearSelection();
    };

    const deleteDescription = (() => {
        const parts: string[] = [];
        if (selectedFiles.length > 0) {
            parts.push(`${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""}`);
        }
        if (selectedFolders.length > 0) {
            parts.push(`${selectedFolders.length} folder${selectedFolders.length > 1 ? "s" : ""}`);
        }
        return `Move ${parts.join(" and ")} to Recycle Bin? You can restore them before permanent purge.`;
    })();

    return (
        <>
            <div className="flex items-center gap-3">
                <span className="text-text-muted text-sm">{selectionCount} selected</span>

                <div className="bg-border mx-0.5 h-7 w-px" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!isSingleFile}
                    aria-label="Download"
                >
                    <ArrowDownTrayIcon className="h-4.5 w-4.5" />
                    Download
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleCopyLink()}
                    disabled={!isSingleFile}
                    aria-label="Copy link"
                >
                    <LinkIcon className="h-4.5 w-4.5" />
                    Copy Link
                </Button>

                <Button variant="ghost" size="sm" onClick={handleInfo} disabled={!isSingleItem} aria-label="Info">
                    <InformationCircleIcon className="h-4.5 w-4.5" />
                    Info
                </Button>

                <div className="bg-border mx-0.5 h-7 w-px" />

                <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDeleteOpen(true)}
                    aria-label="Move selected to recycle bin"
                >
                    <TrashIcon className="h-4.5 w-4.5" />
                    Move to Recycle Bin
                </Button>

                <Button variant="ghost" size="sm" onClick={clearSelection} aria-label="Clear selection">
                    <XMarkIcon className="h-4.5 w-4.5" />
                </Button>
            </div>

            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={setConfirmDeleteOpen}
                title="Move Selected Items to Recycle Bin"
                description={deleteDescription}
                confirmLabel="Move"
                variant="danger"
                onConfirm={handleDelete}
            />
        </>
    );
}
