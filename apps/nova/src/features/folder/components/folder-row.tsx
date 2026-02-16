import { CheckIcon, FolderIcon } from "@heroicons/react/24/solid";
import { useRouter } from "@tanstack/react-router";

type FolderRowProps = {
    id: string;
    name: string;
    selected?: boolean;
    onClick?: (event: React.MouseEvent | React.KeyboardEvent) => void;
    onContextMenu?: (event: React.MouseEvent) => void;
};

export function FolderRow({ id, name, selected, onClick, onContextMenu }: FolderRowProps) {
    const router = useRouter();

    const openFolder = () => {
        void router.navigate({ to: "/folder/$folderId", params: { folderId: id } });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            openFolder();
            return;
        }

        if (event.key === " ") {
            event.preventDefault();
            onClick?.(event);
        }
    };

    return (
        <div
            onClick={onClick}
            onContextMenu={onContextMenu}
            onDoubleClick={openFolder}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Folder ${name}`}
            aria-pressed={selected ?? false}
            className={`group border-border hover:border-border-bright hover:bg-surface-raised/60 focus-ring flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-1.5 no-underline transition-all duration-150 select-none ${
                selected ? "ring-accent/60 border-accent/30 bg-accent/5 ring-2" : ""
            }`}
        >
            {selected ? (
                <div className="bg-accent flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-sm">
                    <CheckIcon className="h-3 w-3 text-white" />
                </div>
            ) : null}
            <div className="bg-accent-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                <FolderIcon className="text-accent h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-text truncate text-sm font-medium">{name}</p>
            </div>
            <span className="text-text-dim text-xs">Folder</span>
        </div>
    );
}
