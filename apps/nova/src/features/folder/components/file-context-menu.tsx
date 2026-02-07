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

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { toFileRouteId } from "@/lib/file-id";

type FileContextMenuProps = {
    fileId: string;
    fileName: string;
    folderId: string;
    onDelete: (fileId: string) => Promise<void>;
    children: React.ReactNode;
};

export function FileContextMenu({ fileId, fileName, folderId, onDelete, children }: FileContextMenuProps) {
    const router = useRouter();
    const { addToast } = useToast();

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
                <ContextMenuItem icon={<TrashIcon />} variant="danger" onClick={() => void onDelete(fileId)}>
                    Delete
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem icon={<ClipboardIcon />} onClick={() => void handleCopyId()}>
                    Copy File ID
                </ContextMenuItem>
                <ContextMenuItem icon={<LinkIcon />} onClick={() => void handleCopyLink()}>
                    Copy Link
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
        </>
    );
}
