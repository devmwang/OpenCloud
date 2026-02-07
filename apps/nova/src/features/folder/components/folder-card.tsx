import { CheckIcon, FolderIcon } from "@heroicons/react/24/solid";
import { useRouter } from "@tanstack/react-router";

type FolderCardProps = {
    id: string;
    name: string;
    selected?: boolean;
    onClick?: (event: React.MouseEvent) => void;
};

export function FolderCard({ id, name, selected, onClick }: FolderCardProps) {
    const router = useRouter();

    const handleDoubleClick = () => {
        void router.navigate({ to: "/folder/$folderId", params: { folderId: id } });
    };

    return (
        <div
            onClick={onClick}
            onDoubleClick={handleDoubleClick}
            className={`group border-border bg-surface hover:border-border-bright hover:bg-surface-raised/60 focus-ring relative block cursor-pointer rounded-xl border p-3 no-underline transition-all duration-150 select-none hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
                selected ? "ring-accent/60 border-accent/30 bg-accent/5 ring-2" : ""
            }`}
        >
            {selected ? (
                <div className="bg-accent absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm">
                    <CheckIcon className="h-3 w-3 text-white" />
                </div>
            ) : null}
            <div className="flex items-center gap-3">
                <div className="bg-accent-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <FolderIcon className="text-accent h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-text truncate text-sm font-medium">{name}</p>
                    <p className="text-text-dim text-xs">Folder</p>
                </div>
            </div>
        </div>
    );
}
