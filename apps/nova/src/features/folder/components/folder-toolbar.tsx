import { ArrowUpTrayIcon, FolderPlusIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";

type FolderToolbarProps = {
    onCreateFolder: () => void;
    onUpload: () => void;
};

export function FolderToolbar({ onCreateFolder, onUpload }: FolderToolbarProps) {
    return (
        <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onCreateFolder}>
                <FolderPlusIcon className="h-4 w-4" />
                New Folder
            </Button>
            <Button variant="primary" size="sm" onClick={onUpload}>
                <ArrowUpTrayIcon className="h-4 w-4" />
                Upload
            </Button>
        </div>
    );
}
