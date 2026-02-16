import {
    ArrowsPointingOutIcon,
    ArrowsRightLeftIcon,
    ArrowTopRightOnSquareIcon,
    ClipboardIcon,
    EyeIcon,
    LinkIcon,
    PencilIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/toast";
import { env } from "@/env";
import { useSelection, type SelectionItem } from "@/features/folder/hooks/use-selection";
import { toFileRouteId } from "@/lib/file-id";

type FileContextMenuProps = {
    fileId: string;
    fileName: string;
    folderId: string;
    onDelete: (fileId: string) => Promise<void>;
    onRename: (items: SelectionItem[]) => void;
    onMove: (items: SelectionItem[]) => void;
    children: React.ReactNode;
};

export function FileContextMenu({
    fileId,
    fileName,
    folderId,
    onDelete,
    onRename,
    onMove,
    children,
}: FileContextMenuProps) {
    const router = useRouter();
    const { addToast } = useToast();
    const { selected, selectionCount, isSelected } = useSelection();
    const [deleteOpen, setDeleteOpen] = useState(false);

    const fileRouteId = toFileRouteId(fileId, fileName);

    const handleQuickPreview = () => {
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

    const handleOpenFullPage = () => {
        void router.navigate({ to: "/file/$fileId", params: { fileId: fileRouteId } });
    };

    const handleOpenNewTab = () => {
        window.open(`/file/${fileRouteId}`, "_blank");
    };

    const handleCopyId = async () => {
        await navigator.clipboard.writeText(fileId);
        addToast("File ID copied to clipboard", "success");
    };

    const handleCopyLink = async () => {
        const url = `${window.location.origin}/file/${fileRouteId}`;
        await navigator.clipboard.writeText(url);
        addToast("File URL copied to clipboard", "success");
    };

    const actionTargets = useMemo<SelectionItem[]>(() => {
        if (selectionCount > 1 && isSelected(fileId)) {
            return [...selected.values()];
        }

        return [{ id: fileId, kind: "file", name: fileName }];
    }, [selectionCount, isSelected, fileId, selected, fileName]);

    const showRename = actionTargets.length === 1;
    const showMove = actionTargets.length >= 1;

    return (
        <>
            <ContextMenu trigger={children}>
                <ContextMenuItem icon={<EyeIcon />} onClick={handleQuickPreview}>
                    Quick Preview
                </ContextMenuItem>
                <ContextMenuItem icon={<ArrowsPointingOutIcon />} onClick={handleOpenFullPage}>
                    Open Full Page
                </ContextMenuItem>
                <ContextMenuItem icon={<ArrowTopRightOnSquareIcon />} onClick={handleOpenNewTab}>
                    Open in New Tab
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem icon={<TrashIcon />} variant="danger" onClick={() => setDeleteOpen(true)}>
                    Delete
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem icon={<ClipboardIcon />} onClick={() => void handleCopyId()}>
                    Copy File ID
                </ContextMenuItem>
                <ContextMenuItem icon={<LinkIcon />} onClick={() => void handleCopyLink()}>
                    Copy Link
                </ContextMenuItem>

                {showRename || showMove ? <ContextMenuSeparator /> : null}

                {showRename ? (
                    <ContextMenuItem icon={<PencilIcon />} onClick={() => onRename(actionTargets)}>
                        Rename
                    </ContextMenuItem>
                ) : null}

                {showMove ? (
                    <ContextMenuItem icon={<ArrowsRightLeftIcon />} onClick={() => onMove(actionTargets)}>
                        Move
                    </ContextMenuItem>
                ) : null}
            </ContextMenu>

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Move to recycle bin?"
                description={`"${fileName}" will be deleted in ${env.NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS} days.`}
                confirmLabel="Delete"
                variant="danger"
                onConfirm={() => onDelete(fileId)}
            />
        </>
    );
}
