import {
    ArrowPathIcon,
    ArrowsRightLeftIcon,
    ArrowTopRightOnSquareIcon,
    ClipboardIcon,
    FolderOpenIcon,
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

type FolderContextMenuProps = {
    folderId: string;
    folderName: string;
    onDelete: (folderId: string) => Promise<void>;
    onRename: (items: SelectionItem[]) => void;
    onMove: (items: SelectionItem[]) => void;
    onRefresh: () => void;
    children: React.ReactNode;
};

export function FolderContextMenu({
    folderId,
    folderName,
    onDelete,
    onRename,
    onMove,
    onRefresh,
    children,
}: FolderContextMenuProps) {
    const router = useRouter();
    const { addToast } = useToast();
    const { selected, selectionCount, isSelected } = useSelection();
    const [deleteOpen, setDeleteOpen] = useState(false);

    const handleOpen = () => {
        void router.navigate({ to: "/folder/$folderId", params: { folderId } });
    };

    const handleOpenNewTab = () => {
        window.open(`/folder/${folderId}`, "_blank");
    };

    const handleCopyId = async () => {
        await navigator.clipboard.writeText(folderId);
        addToast("Folder ID copied to clipboard", "success");
    };

    const actionTargets = useMemo<SelectionItem[]>(() => {
        if (selectionCount > 1 && isSelected(folderId)) {
            return [...selected.values()];
        }

        return [{ id: folderId, kind: "folder", name: folderName }];
    }, [selectionCount, isSelected, folderId, selected, folderName]);

    const showRename = actionTargets.length === 1;
    const showMove = actionTargets.length >= 1;

    return (
        <>
            <ContextMenu trigger={children}>
                <ContextMenuItem icon={<FolderOpenIcon />} onClick={handleOpen}>
                    Open
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
                    Copy Folder ID
                </ContextMenuItem>
                <ContextMenuItem icon={<ArrowPathIcon />} onClick={onRefresh}>
                    Refresh
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
                description={`"${folderName}" will be deleted in ${env.NEXT_PUBLIC_FILE_PURGE_RETENTION_DAYS} days.`}
                confirmLabel="Delete"
                variant="danger"
                onConfirm={() => onDelete(folderId)}
            />
        </>
    );
}
