import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { LoadingState } from "@/components/shared/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
    emptyRecycleBin,
    getRecycleBinDestinationFolders,
    listRecycleBin,
    permanentlyDeleteRecycleBinItem,
    restoreRecycleBinItem,
    type RecycleBinListItem,
} from "@/features/recycle-bin/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

const PAGE_LIMIT = 100;

type RecycleFilter = "ALL" | "FILE" | "FOLDER";

const formatDeletedAt = (value: string) => {
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
};

const formatPurgeAt = (value: string) => {
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
};

const formatFileSize = (size: number | null | undefined) => {
    if (size === null || size === undefined) {
        return "-";
    }

    if (size < 1024) {
        return `${size} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let value = size / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
};

export const Route = createFileRoute("/_authed/recycle-bin")({
    component: RecycleBinPage,
});

function RecycleBinPage() {
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const [itemTypeFilter, setItemTypeFilter] = useState<RecycleFilter>("ALL");
    const [offset, setOffset] = useState(0);

    const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
    const [restoreTarget, setRestoreTarget] = useState<RecycleBinListItem | null>(null);
    const [destinationSearch, setDestinationSearch] = useState("");
    const [destinationFolderId, setDestinationFolderId] = useState("");

    const [permanentTarget, setPermanentTarget] = useState<RecycleBinListItem | null>(null);
    const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);

    const resolvedItemType = itemTypeFilter === "ALL" ? undefined : itemTypeFilter;

    const recycleListQuery = useQuery({
        queryKey: queryKeys.recycleBinList(resolvedItemType, PAGE_LIMIT, offset),
        queryFn: () =>
            listRecycleBin({
                itemType: resolvedItemType,
                limit: PAGE_LIMIT,
                offset,
            }),
    });

    const destinationFoldersQuery = useQuery({
        queryKey: queryKeys.recycleBinDestinationFolders(destinationSearch || undefined, 200),
        queryFn: () =>
            getRecycleBinDestinationFolders({
                search: destinationSearch || undefined,
                limit: 200,
            }),
        enabled: restoreDialogOpen,
    });

    useEffect(() => {
        if (!restoreDialogOpen) {
            return;
        }

        const firstFolderId = destinationFoldersQuery.data?.folders[0]?.id;
        if (firstFolderId && !destinationFolderId) {
            setDestinationFolderId(firstFolderId);
        }
    }, [restoreDialogOpen, destinationFoldersQuery.data, destinationFolderId]);

    const invalidateRecycleQueries = async () => {
        await queryClient.invalidateQueries({ queryKey: ["recycle-bin"] });
    };

    const restoreMutation = useMutation({
        mutationFn: restoreRecycleBinItem,
        onSuccess: async () => {
            addToast("Item restored", "success");
            await invalidateRecycleQueries();
        },
        onError: (error) => {
            addToast(getErrorMessage(error), "error");
        },
    });

    const permanentlyDeleteMutation = useMutation({
        mutationFn: permanentlyDeleteRecycleBinItem,
        onSuccess: async () => {
            addToast("Item permanently deleted", "success");
            await invalidateRecycleQueries();
        },
        onError: (error) => {
            addToast(getErrorMessage(error), "error");
        },
    });

    const emptyBinMutation = useMutation({
        mutationFn: emptyRecycleBin,
        onSuccess: async () => {
            addToast("Recycle Bin emptied", "success");
            await invalidateRecycleQueries();
        },
        onError: (error) => {
            addToast(getErrorMessage(error), "error");
        },
    });

    const isMutationPending =
        restoreMutation.isPending || permanentlyDeleteMutation.isPending || emptyBinMutation.isPending;

    const handleRestore = (item: RecycleBinListItem) => {
        if (!item.requiresDestination) {
            restoreMutation.mutate({
                itemType: item.itemType,
                itemId: item.id,
            });
            return;
        }

        setRestoreTarget(item);
        setDestinationSearch("");
        setDestinationFolderId("");
        setRestoreDialogOpen(true);
    };

    const handleRestoreWithDestination = async () => {
        if (!restoreTarget || !destinationFolderId) {
            return;
        }

        await restoreMutation.mutateAsync({
            itemType: restoreTarget.itemType,
            itemId: restoreTarget.id,
            destinationFolderId,
        });

        setRestoreDialogOpen(false);
        setRestoreTarget(null);
    };

    const total = recycleListQuery.data?.total ?? 0;
    const itemCount = recycleListQuery.data?.items.length ?? 0;
    const hasAnyItems = total > 0;
    const canGoPrevious = offset > 0;
    const canGoNext = offset + itemCount < total;
    const rangeStart = itemCount > 0 ? offset + 1 : 0;
    const rangeEnd = offset + itemCount;

    useEffect(() => {
        if (!recycleListQuery.data || !hasAnyItems || itemCount > 0 || offset === 0) {
            return;
        }

        const maxOffset = Math.max(0, Math.floor((total - 1) / PAGE_LIMIT) * PAGE_LIMIT);
        if (offset > maxOffset) {
            setOffset(maxOffset);
        }
    }, [recycleListQuery.data, hasAnyItems, itemCount, offset, total]);

    const headerActions = useMemo(
        () => (
            <>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void recycleListQuery.refetch()}
                    loading={recycleListQuery.isFetching}
                >
                    <ArrowPathIcon className="h-5 w-5" />
                    Refresh
                </Button>
                <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setEmptyConfirmOpen(true)}
                    disabled={isMutationPending || total === 0}
                >
                    <TrashIcon className="h-5 w-5" />
                    Empty Recycle Bin
                </Button>
            </>
        ),
        [isMutationPending, recycleListQuery, total],
    );

    return (
        <div>
            <PageHeader
                title="Recycle Bin"
                description="Restore deleted files and folders, or permanently remove them."
                icon={<TrashIcon />}
                actions={headerActions}
            />

            <div className="border-border bg-surface mb-5 flex flex-wrap items-end gap-3 rounded-xl border p-4">
                <div className="w-full max-w-xs">
                    <Select
                        label="Filter"
                        value={itemTypeFilter}
                        onChange={(event) => {
                            setItemTypeFilter(event.target.value as RecycleFilter);
                            setOffset(0);
                        }}
                    >
                        <option value="ALL">All Items</option>
                        <option value="FILE">Files</option>
                        <option value="FOLDER">Folders</option>
                    </Select>
                </div>
                <p className="text-text-muted text-sm">{total} total item(s) in recycle bin.</p>
            </div>

            {recycleListQuery.isPending ? <LoadingState message="Loading recycle-bin items..." /> : null}

            {recycleListQuery.error ? (
                <ErrorCard
                    message={getErrorMessage(recycleListQuery.error)}
                    onRetry={() => void recycleListQuery.refetch()}
                />
            ) : null}

            {recycleListQuery.data && total === 0 ? (
                <div className="border-border bg-surface rounded-xl border">
                    <EmptyState
                        icon={<TrashIcon className="text-text-dim h-8 w-8" />}
                        title="Recycle Bin is empty"
                        description="Deleted files and folders will appear here until they are purged."
                    />
                </div>
            ) : null}

            {recycleListQuery.data && hasAnyItems ? (
                <div className="border-border bg-surface rounded-xl border">
                    <ul className="divide-border divide-y">
                        {recycleListQuery.data.items.map((item) => (
                            <li
                                key={`${item.itemType}-${item.id}`}
                                className="flex flex-wrap items-start justify-between gap-4 p-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-text truncate text-sm font-semibold">{item.name}</span>
                                        <Badge variant={item.itemType === "FILE" ? "accent" : "default"}>
                                            {item.itemType}
                                        </Badge>
                                        {item.requiresDestination ? (
                                            <Badge variant="warning">Destination required</Badge>
                                        ) : null}
                                    </div>
                                    <div className="text-text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                        <span>Deleted: {formatDeletedAt(item.deletedAt)}</span>
                                        {item.itemType === "FILE" ? (
                                            <span>Size: {formatFileSize(item.fileSize)}</span>
                                        ) : null}
                                        {item.parentFolderId ? <span>Parent ID: {item.parentFolderId}</span> : null}
                                    </div>
                                    <p className="text-text-dim mt-1 text-xs">
                                        Permanently deleted on: {formatPurgeAt(item.purgeAt)}
                                    </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleRestore(item)}
                                        disabled={isMutationPending}
                                    >
                                        Restore
                                    </Button>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => setPermanentTarget(item)}
                                        disabled={isMutationPending}
                                    >
                                        Permanently Delete
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="border-border flex items-center justify-between border-t px-4 py-3">
                        <span className="text-text-muted text-sm">
                            Showing {rangeStart}-{rangeEnd} of {total}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canGoPrevious || isMutationPending}
                                onClick={() => setOffset((value) => Math.max(0, value - PAGE_LIMIT))}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canGoNext || isMutationPending}
                                onClick={() => setOffset((value) => value + PAGE_LIMIT)}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            <Dialog
                open={restoreDialogOpen}
                onOpenChange={(open) => {
                    setRestoreDialogOpen(open);
                    if (!open) {
                        setRestoreTarget(null);
                    }
                }}
            >
                <DialogContent
                    title="Choose Restore Destination"
                    description="The original parent folder is unavailable. Select a destination folder to restore this item."
                >
                    <div className="space-y-4">
                        <Input
                            label="Search destination folders"
                            value={destinationSearch}
                            onChange={(event) => {
                                setDestinationSearch(event.target.value);
                                setDestinationFolderId("");
                            }}
                            placeholder="Search by name or path"
                        />

                        {destinationFoldersQuery.isPending ? <LoadingState message="Loading folders..." /> : null}

                        {destinationFoldersQuery.error ? (
                            <ErrorCard
                                message={getErrorMessage(destinationFoldersQuery.error)}
                                onRetry={() => void destinationFoldersQuery.refetch()}
                            />
                        ) : null}

                        {destinationFoldersQuery.data ? (
                            <Select
                                label="Destination folder"
                                value={destinationFolderId}
                                onChange={(event) => setDestinationFolderId(event.target.value)}
                            >
                                {destinationFoldersQuery.data.folders.length === 0 ? (
                                    <option value="">No matching folders</option>
                                ) : null}
                                {destinationFoldersQuery.data.folders.map((folder) => (
                                    <option key={folder.id} value={folder.id}>
                                        {folder.path}
                                    </option>
                                ))}
                            </Select>
                        ) : null}

                        <div className="flex items-center justify-end gap-2.5">
                            <Button variant="ghost" onClick={() => setRestoreDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                loading={restoreMutation.isPending}
                                onClick={() => void handleRestoreWithDestination()}
                                disabled={!destinationFolderId || destinationFoldersQuery.data?.folders.length === 0}
                            >
                                Restore
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={permanentTarget !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPermanentTarget(null);
                    }
                }}
                title="Permanently Delete Item"
                description={
                    permanentTarget
                        ? `Permanently delete "${permanentTarget.name}"? This action cannot be undone.`
                        : "Permanently delete this item?"
                }
                confirmLabel="Permanently Delete"
                variant="danger"
                onConfirm={async () => {
                    if (!permanentTarget) {
                        return;
                    }

                    await permanentlyDeleteMutation.mutateAsync({
                        itemType: permanentTarget.itemType,
                        itemId: permanentTarget.id,
                    });
                    setPermanentTarget(null);
                }}
            />

            <ConfirmDialog
                open={emptyConfirmOpen}
                onOpenChange={setEmptyConfirmOpen}
                title="Empty Recycle Bin"
                description="Permanently delete all items currently in the recycle bin? This action cannot be undone."
                confirmLabel="Empty Recycle Bin"
                variant="danger"
                onConfirm={async () => {
                    await emptyBinMutation.mutateAsync(undefined);
                }}
            />
        </div>
    );
}
