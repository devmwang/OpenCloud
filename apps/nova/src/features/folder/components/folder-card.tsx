import { FolderIcon } from "@heroicons/react/24/solid";
import { Link } from "@tanstack/react-router";

type FolderCardProps = {
    id: string;
    name: string;
    onContextMenu?: (event: React.MouseEvent) => void;
};

export function FolderCard({ id, name, onContextMenu }: FolderCardProps) {
    return (
        <Link
            to="/folder/$folderId"
            params={{ folderId: id }}
            className="group border-border bg-surface hover:border-border-bright hover:bg-surface-raised/60 focus-ring block rounded-xl border p-4 no-underline transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
            onContextMenu={onContextMenu}
        >
            <div className="flex items-center gap-3">
                <div className="bg-accent-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <FolderIcon className="text-accent h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-text truncate text-sm font-medium">{name}</p>
                    <p className="text-text-dim text-xs">Folder</p>
                </div>
            </div>
        </Link>
    );
}
