import { FolderIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { getFolderDestinationChildren } from "@/features/folder/api";
import type { SelectionItem } from "@/features/folder/hooks/use-selection";
import { queryKeys } from "@/lib/query-keys";

type MoveItemsDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: SelectionItem[];
    rootFolderId: string;
    sourceFolderId: string;
    onSubmit: (destinationFolderId: string) => Promise<void>;
};

type FocusedFolderPathItem = {
    id: string;
    name: string;
};

export function MoveItemsDialog({
    open,
    onOpenChange,
    items,
    rootFolderId,
    sourceFolderId,
    onSubmit,
}: MoveItemsDialogProps) {
    const [focusedFolderPath, setFocusedFolderPath] = useState<FocusedFolderPathItem[]>(() => [
        { id: rootFolderId, name: "/" },
    ]);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const focusedFolder = focusedFolderPath[focusedFolderPath.length - 1];
    const focusedFolderId = focusedFolder?.id ?? rootFolderId;

    const destinationChildrenQuery = useQuery({
        queryKey: queryKeys.folderDestinationChildren(focusedFolderId),
        queryFn: () => getFolderDestinationChildren(focusedFolderId),
        enabled: open,
        staleTime: 60_000,
    });

    const blockedDestinationIds = useMemo(() => {
        const blocked = new Set<string>();
        for (const item of items) {
            if (item.kind === "folder") {
                blocked.add(item.id);
            }
        }
        return blocked;
    }, [items]);

    const childFolders = destinationChildrenQuery.data?.folders ?? [];
    const isFocusedDestinationBlocked = blockedDestinationIds.has(focusedFolderId);
    const isNoOpDestination = focusedFolderId === sourceFolderId;
    const moveDisabled = pending || isFocusedDestinationBlocked || isNoOpDestination;
    const helperMessage = isFocusedDestinationBlocked
        ? "Cannot move a folder into itself."
        : isNoOpDestination
          ? "Items are already in this folder."
          : null;

    useEffect(() => {
        if (!open) {
            setPending(false);
            setError(null);
            return;
        }

        setFocusedFolderPath([{ id: rootFolderId, name: "/" }]);
        setPending(false);
        setError(null);
    }, [open, rootFolderId]);

    const handleNavigateInto = (folder: { id: string; name: string }) => {
        if (blockedDestinationIds.has(folder.id)) {
            return;
        }

        setFocusedFolderPath((previous) => [...previous, { id: folder.id, name: folder.name }]);
        setError(null);
    };

    const handleJumpToPathIndex = (index: number) => {
        setFocusedFolderPath((previous) => previous.slice(0, index + 1));
        setError(null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (moveDisabled) {
            setError(helperMessage ?? "Please choose a valid destination folder");
            return;
        }

        setPending(true);
        setError(null);

        try {
            await onSubmit(focusedFolderId);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to move items");
        } finally {
            setPending(false);
        }
    };

    const itemDescription =
        items.length === 1 && items[0]
            ? `${items[0].kind === "file" ? "file" : "folder"} "${items[0].name}"`
            : `${items.length} items`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent title="Move Items" description={`Choose a destination folder for ${itemDescription}.`}>
                <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
                    <div className="border-border bg-surface rounded-lg border p-3">
                        <p className="text-text-muted mb-1 text-xs font-medium">Current destination</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                            {focusedFolderPath.map((node, index) => {
                                const isLast = index === focusedFolderPath.length - 1;
                                return (
                                    <div key={node.id} className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleJumpToPathIndex(index)}
                                            disabled={isLast}
                                            className={`rounded px-1.5 py-0.5 ${
                                                isLast
                                                    ? "text-text font-medium"
                                                    : "text-text-muted hover:bg-surface-raised hover:text-text"
                                            }`}
                                        >
                                            {index === 0 ? "/" : node.name}
                                        </button>
                                        {!isLast ? <span className="text-text-dim">/</span> : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {destinationChildrenQuery.isPending ? (
                        <p className="text-text-muted text-sm">Loading subfolders...</p>
                    ) : null}

                    {destinationChildrenQuery.error ? (
                        <div className="space-y-2">
                            <p className="text-danger text-sm">Failed to load subfolders.</p>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => void destinationChildrenQuery.refetch()}
                            >
                                Retry
                            </Button>
                        </div>
                    ) : null}

                    {destinationChildrenQuery.data ? (
                        <div className="border-border bg-surface rounded-lg border">
                            {childFolders.length === 0 ? (
                                <p className="text-text-muted px-3 py-3 text-sm">No subfolders in this location.</p>
                            ) : (
                                <ul className="divide-border divide-y">
                                    {childFolders.map((folder) => {
                                        const blocked = blockedDestinationIds.has(folder.id);

                                        return (
                                            <li key={folder.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleNavigateInto(folder)}
                                                    disabled={blocked}
                                                    className="hover:bg-surface-raised disabled:text-text-dim disabled:hover:bg-surface flex w-full items-center justify-between gap-2.5 px-3 py-2 text-left disabled:cursor-not-allowed"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <FolderIcon className="h-4.5 w-4.5" />
                                                        <span className="text-sm">{folder.name}</span>
                                                    </span>
                                                    <span className="text-text-dim text-xs">
                                                        {blocked ? "Selected item" : "Open"}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    ) : null}

                    {helperMessage ? <p className="text-warning text-sm">{helperMessage}</p> : null}
                    {error ? <p className="text-danger text-sm">{error}</p> : null}

                    <div className="flex items-center justify-end gap-2.5">
                        <DialogClose>
                            <Button type="button" variant="ghost" disabled={pending}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button type="submit" loading={pending} disabled={moveDisabled}>
                            Move Here
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
