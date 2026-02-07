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
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

type FolderContextMenuProps = {
    folderId: string;
    folderName: string;
    onDelete: (folderId: string) => Promise<void>;
    onRefresh: () => void;
    children: React.ReactNode;
};

export function FolderContextMenu({ folderId, folderName, onDelete, onRefresh, children }: FolderContextMenuProps) {
    const router = useRouter();
    const { addToast } = useToast();
    const [confirmOpen, setConfirmOpen] = useState(false);

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
                <ContextMenuItem icon={<TrashIcon />} variant="danger" onClick={() => setConfirmOpen(true)}>
                    Move to Recycle Bin
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem icon={<ClipboardIcon />} onClick={() => void handleCopyId()}>
                    Copy Folder ID
                </ContextMenuItem>
                <ContextMenuItem icon={<ArrowPathIcon />} onClick={onRefresh}>
                    Refresh
                </ContextMenuItem>
                <ContextMenuSeparator />
                <Tooltip content="Not yet available">
                    <ContextMenuItem icon={<PencilIcon />} disabled>
                        Rename
                    </ContextMenuItem>
                </Tooltip>
                <Tooltip content="Not yet available">
                    <ContextMenuItem icon={<ArrowsRightLeftIcon />} disabled>
                        Move
                    </ContextMenuItem>
                </Tooltip>
            </ContextMenu>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Move Folder to Recycle Bin"
                description={`Move "${folderName}" to Recycle Bin? Contents are moved with it and can be restored later.`}
                confirmLabel="Move"
                variant="danger"
                onConfirm={() => onDelete(folderId)}
            />
        </>
    );
}
