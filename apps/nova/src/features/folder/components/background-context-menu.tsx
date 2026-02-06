import { ArrowPathIcon, ArrowUpTrayIcon, FolderPlusIcon } from "@heroicons/react/24/outline";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";

type BackgroundContextMenuProps = {
    onCreateFolder: () => void;
    onUpload: () => void;
    onRefresh: () => void;
    children: React.ReactNode;
};

export function BackgroundContextMenu({ onCreateFolder, onUpload, onRefresh, children }: BackgroundContextMenuProps) {
    return (
        <ContextMenu trigger={children}>
            <ContextMenuItem icon={<FolderPlusIcon />} onClick={onCreateFolder}>
                New Folder
            </ContextMenuItem>
            <ContextMenuItem icon={<ArrowUpTrayIcon />} onClick={onUpload}>
                Upload File
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem icon={<ArrowPathIcon />} onClick={onRefresh}>
                Refresh
            </ContextMenuItem>
        </ContextMenu>
    );
}
