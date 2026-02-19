import { FolderIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { renameFile } from "@/features/files/api";
import {
    batchDeleteItems,
    batchMoveItems,
    createFolder,
    getDisplayOrder,
    getFolderContents,
    getFolderDetails,
    renameFolder,
    setDisplayOrder,
    type BatchDeleteItemsResponse,
    type BatchMoveItemsResponse,
    type DisplayOrderResponse,
    type DisplayType,
    type SortOrder,
    type SortType,
} from "@/features/folder/api";
import { BackgroundContextMenu } from "@/features/folder/components/background-context-menu";
import { CreateFolderDialog } from "@/features/folder/components/create-folder-dialog";
import { DisplayPreferences } from "@/features/folder/components/display-preferences";
import { FileCard } from "@/features/folder/components/file-card";
import { FileContextMenu } from "@/features/folder/components/file-context-menu";
import { FileRow } from "@/features/folder/components/file-row";
import { FolderCard } from "@/features/folder/components/folder-card";
import { FolderContextMenu } from "@/features/folder/components/folder-context-menu";
import { FolderRow } from "@/features/folder/components/folder-row";
import { FolderToolbar } from "@/features/folder/components/folder-toolbar";
import { ItemInfoDialog } from "@/features/folder/components/item-info-dialog";
import { MoveItemsDialog } from "@/features/folder/components/move-items-dialog";
import { RenameItemDialog } from "@/features/folder/components/rename-item-dialog";
import { SelectionProvider } from "@/features/folder/components/selection-provider";
import { SelectionToolbar } from "@/features/folder/components/selection-toolbar";
import { UploadDialog } from "@/features/folder/components/upload-dialog";
import { VirtualizedItemSection } from "@/features/folder/components/virtualized-item-section";
import {
    useIsItemInMultiSelection,
    useIsItemSelected,
    useSelectionActions,
    useSelectionCount,
    type SelectionItem,
} from "@/features/folder/hooks/use-selection";
import { moveToRecycleBin } from "@/features/recycle-bin/api";
import { uploadSingleFile } from "@/features/upload/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/folder/$folderId")({
    component: FolderPage,
});

const BATCH_OPERATION_LIMIT = 500;

type BatchOperationStatus = "success" | "failed";
type BatchOperationSummary = {
    total: number;
    succeeded: number;
    failed: number;
};

const chunkIds = (ids: string[]) => {
    if (ids.length === 0) {
        return [] as string[][];
    }

    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += BATCH_OPERATION_LIMIT) {
        chunks.push(ids.slice(index, index + BATCH_OPERATION_LIMIT));
    }
    return chunks;
};

const resolveBatchStatus = (summary: BatchOperationSummary): BatchOperationStatus => {
    return summary.failed === 0 ? "success" : "failed";
};

const buildBatchMessage = (operationLabel: string, status: BatchOperationStatus) => {
    if (status === "success") {
        return `${operationLabel} completed successfully`;
    }
    return `${operationLabel} completed with failures`;
};

type MergedBatchResult = {
    status: BatchOperationStatus;
    message: string;
    summary: BatchOperationSummary;
};

const mergeBatchResults = (
    operationLabel: string,
    responses: Array<{
        summary: BatchOperationSummary;
    }>,
): MergedBatchResult => {
    const summary = responses.reduce<BatchOperationSummary>(
        (accumulator, response) => ({
            total: accumulator.total + response.summary.total,
            succeeded: accumulator.succeeded + response.summary.succeeded,
            failed: accumulator.failed + response.summary.failed,
        }),
        { total: 0, succeeded: 0, failed: 0 },
    );
    const status = resolveBatchStatus(summary);

    return {
        status,
        message: buildBatchMessage(operationLabel, status),
        summary,
    };
};

type BatchedOperationResult = {
    responses: Array<{ summary: BatchOperationSummary }>;
    firstErrorMessage: string | null;
};

const runBatchedOperation = async <TResponse extends { summary: BatchOperationSummary }>(params: {
    fileIds: string[];
    folderIds: string[];
    execute: (payload: { fileIds?: string[]; folderIds?: string[] }) => Promise<TResponse>;
}): Promise<BatchedOperationResult> => {
    const fileChunks = chunkIds(params.fileIds);
    const folderChunks = chunkIds(params.folderIds);
    const requestCount = Math.max(fileChunks.length, folderChunks.length);
    const responses: Array<{ summary: BatchOperationSummary }> = [];
    let firstErrorMessage: string | null = null;

    for (let index = 0; index < requestCount; index += 1) {
        const fileIds = fileChunks[index];
        const folderIds = folderChunks[index];
        const chunkTotal = (fileIds?.length ?? 0) + (folderIds?.length ?? 0);
        const payload = {
            ...(fileIds && fileIds.length > 0 ? { fileIds } : {}),
            ...(folderIds && folderIds.length > 0 ? { folderIds } : {}),
        };

        try {
            const response = await params.execute(payload);
            responses.push({ summary: response.summary });
        } catch (error) {
            if (!firstErrorMessage) {
                firstErrorMessage = getErrorMessage(error);
            }
            responses.push({
                summary: {
                    total: chunkTotal,
                    succeeded: 0,
                    failed: chunkTotal,
                },
            });
        }
    }

    return { responses, firstErrorMessage };
};

function FolderPage() {
    const { folderId } = Route.useParams();
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);

    const detailsQuery = useQuery({
        queryKey: queryKeys.folderDetails(folderId),
        queryFn: () => getFolderDetails(folderId),
    });

    const contentsQuery = useQuery({
        queryKey: queryKeys.folderContents(folderId),
        queryFn: () => getFolderContents(folderId),
    });

    const displayOrderQuery = useQuery({
        queryKey: queryKeys.folderDisplayOrder(folderId),
        queryFn: () => getDisplayOrder(folderId),
    });

    const displayOrderMutation = useMutation({
        mutationFn: setDisplayOrder,
        onMutate: async (newPrefs) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.folderDisplayOrder(folderId) });
            const previous = queryClient.getQueryData<DisplayOrderResponse>(queryKeys.folderDisplayOrder(folderId));
            const sortChanged =
                previous !== undefined &&
                (previous.sortType !== newPrefs.sortType || previous.sortOrder !== newPrefs.sortOrder);
            queryClient.setQueryData(queryKeys.folderDisplayOrder(folderId), newPrefs);
            return { previous, sortChanged };
        },
        onSuccess: async (_savedPrefs, newPrefs, context) => {
            if (!context?.sortChanged) {
                return;
            }

            await queryClient.cancelQueries({ queryKey: queryKeys.folderContents(folderId) });
            await queryClient.fetchQuery({
                queryKey: queryKeys.folderContents(folderId),
                queryFn: () =>
                    getFolderContents(folderId, {
                        sortType: newPrefs.sortType,
                        sortOrder: newPrefs.sortOrder,
                    }),
            });
        },
        onError: (_err, _newPrefs, context) => {
            if (context?.previous) {
                queryClient.setQueryData(queryKeys.folderDisplayOrder(folderId), context.previous);
            }
            addToast("Failed to save display preferences", "error");
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.folderDisplayOrder(folderId) });
        },
    });

    const displayType: DisplayType = displayOrderQuery.data?.displayType ?? "GRID";
    const sortOrder: SortOrder = displayOrderQuery.data?.sortOrder ?? "ASC";
    const sortType: SortType = displayOrderQuery.data?.sortType ?? "NAME";

    const handleDisplayTypeChange = useCallback(
        (newDisplayType: DisplayType) => {
            displayOrderMutation.mutate({ folderId, displayType: newDisplayType, sortOrder, sortType });
        },
        [folderId, sortOrder, sortType, displayOrderMutation],
    );

    const handleSortOrderChange = useCallback(
        (newSortOrder: SortOrder) => {
            displayOrderMutation.mutate({ folderId, displayType, sortOrder: newSortOrder, sortType });
        },
        [folderId, displayType, sortType, displayOrderMutation],
    );

    const handleSortTypeChange = useCallback(
        (newSortType: SortType) => {
            displayOrderMutation.mutate({ folderId, displayType, sortOrder, sortType: newSortType });
        },
        [folderId, displayType, sortOrder, displayOrderMutation],
    );

    const refreshContents = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) });
    }, [queryClient, folderId]);

    const refreshFolderData = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.folderDetails(folderId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) }),
        ]);
    }, [queryClient, folderId]);

    const handleCreateFolder = async (folderName: string) => {
        await createFolder({ folderName, parentFolderId: folderId });
        addToast(`Folder "${folderName}" created`, "success");
        await refreshContents();
    };

    const handleUpload = async (file: File) => {
        await uploadSingleFile({ parentFolderId: folderId, file });
        addToast(`"${file.name}" uploaded successfully`, "success");
        await refreshContents();
    };

    const handleDeleteFolder = async (targetFolderId: string) => {
        try {
            await moveToRecycleBin({ itemType: "FOLDER", itemId: targetFolderId });
            addToast("Folder moved to Recycle Bin", "success");
            await refreshContents();
        } catch (error) {
            addToast(getErrorMessage(error), "error");
            throw error;
        }
    };

    const handleDeleteFile = async (targetFileId: string) => {
        try {
            await moveToRecycleBin({ itemType: "FILE", itemId: targetFileId });
            addToast("File moved to Recycle Bin", "success");
            await refreshContents();
        } catch (error) {
            addToast(getErrorMessage(error), "error");
            throw error;
        }
    };

    const handleRenameFolder = async (targetFolderId: string, name: string) => {
        await renameFolder({ folderId: targetFolderId, name });
    };

    const handleRenameFile = async (targetFileId: string, name: string) => {
        await renameFile({ fileId: targetFileId, name });
    };

    const isLoading = detailsQuery.isPending || contentsQuery.isPending;
    const error = detailsQuery.error ?? contentsQuery.error;

    // ── Selection data ────────────────────────────────────────────
    const folderContents = contentsQuery.data;

    const { orderedIds, itemsById } = useMemo(() => {
        if (!folderContents) {
            return { orderedIds: [] as string[], itemsById: new Map<string, SelectionItem>() };
        }

        const ids: string[] = [];
        const lookup = new Map<string, SelectionItem>();

        for (const f of folderContents.folders) {
            ids.push(f.id);
            lookup.set(f.id, { id: f.id, kind: "folder", name: f.folderName });
        }
        for (const f of folderContents.files) {
            ids.push(f.id);
            lookup.set(f.id, { id: f.id, kind: "file", name: f.fileName });
        }

        return { orderedIds: ids, itemsById: lookup };
    }, [folderContents]);

    if (isLoading) {
        return (
            <div className="space-y-5">
                <div className="space-y-2 pb-5">
                    <div className="skeleton h-5 w-60 rounded" />
                    <div className="skeleton h-8 w-80 rounded" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !detailsQuery.data || !folderContents) {
        return <ErrorCard message={getErrorMessage(error)} onRetry={() => void refreshFolderData()} />;
    }

    const folderDetails = detailsQuery.data;
    const breadcrumbTrail = folderDetails.hierarchy;
    const isEmpty = folderContents.folders.length === 0 && folderContents.files.length === 0;

    return (
        <SelectionProvider orderedIds={orderedIds} itemsById={itemsById}>
            <FolderPageContent
                folderId={folderId}
                folderDetails={folderDetails}
                folderContents={folderContents}
                breadcrumbTrail={breadcrumbTrail}
                isEmpty={isEmpty}
                displayType={displayType}
                sortOrder={sortOrder}
                sortType={sortType}
                displayOrderPending={displayOrderQuery.isPending || displayOrderMutation.isPending}
                onDisplayTypeChange={handleDisplayTypeChange}
                onSortOrderChange={handleSortOrderChange}
                onSortTypeChange={handleSortTypeChange}
                onCreateFolder={() => setCreateFolderOpen(true)}
                onUpload={() => setUploadOpen(true)}
                onRefresh={() => void refreshContents()}
                onDeleteFolder={handleDeleteFolder}
                onDeleteFile={handleDeleteFile}
                onRenameFolder={handleRenameFolder}
                onRenameFile={handleRenameFile}
            />

            {/* Dialogs */}
            <CreateFolderDialog
                open={createFolderOpen}
                onOpenChange={setCreateFolderOpen}
                onSubmit={handleCreateFolder}
            />
            <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUpload={handleUpload} />

            {/* Intercepted modal file route renders here over the folder page. */}
            <Outlet />
        </SelectionProvider>
    );
}

// ── Inner component that has access to SelectionContext ────────

type FolderPageContentProps = {
    folderId: string;
    folderDetails: { name: string; type: "ROOT" | "STANDARD"; hierarchy: { id: string; name: string; type: string }[] };
    folderContents: {
        folders: { id: string; folderName: string }[];
        files: { id: string; fileName: string }[];
    };
    breadcrumbTrail: { id: string; name: string; type: string }[];
    isEmpty: boolean;
    displayType: DisplayType;
    sortOrder: SortOrder;
    sortType: SortType;
    displayOrderPending: boolean;
    onDisplayTypeChange: (value: DisplayType) => void;
    onSortOrderChange: (value: SortOrder) => void;
    onSortTypeChange: (value: SortType) => void;
    onCreateFolder: () => void;
    onUpload: () => void;
    onRefresh: () => void;
    onDeleteFolder: (folderId: string) => Promise<void>;
    onDeleteFile: (fileId: string) => Promise<void>;
    onRenameFolder: (folderId: string, name: string) => Promise<void>;
    onRenameFile: (fileId: string, name: string) => Promise<void>;
};

type FolderListEntry = {
    id: string;
    folderName: string;
};

type FileListEntry = {
    id: string;
    fileName: string;
};

function FolderPageContent({
    folderId,
    folderDetails,
    folderContents,
    breadcrumbTrail,
    isEmpty,
    displayType,
    sortOrder,
    sortType,
    displayOrderPending,
    onDisplayTypeChange,
    onSortOrderChange,
    onSortTypeChange,
    onCreateFolder,
    onUpload,
    onRefresh,
    onDeleteFolder,
    onDeleteFile,
    onRenameFolder,
    onRenameFile,
}: FolderPageContentProps) {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const selectionCount = useSelectionCount();
    const { clearSelection } = useSelectionActions();

    const [infoItem, setInfoItem] = useState<SelectionItem | null>(null);
    const [infoOpen, setInfoOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<SelectionItem | null>(null);
    const [renameOpen, setRenameOpen] = useState(false);
    const [moveTargets, setMoveTargets] = useState<SelectionItem[]>([]);
    const [moveOpen, setMoveOpen] = useState(false);

    const handleShowInfo = useCallback((item: SelectionItem) => {
        setInfoItem(item);
        setInfoOpen(true);
    }, []);

    const handleOpenRename = useCallback((items: SelectionItem[]) => {
        if (items.length !== 1) {
            return;
        }

        const target = items[0];
        if (!target) {
            return;
        }

        setRenameTarget(target);
        setRenameOpen(true);
    }, []);

    const handleOpenMove = useCallback((items: SelectionItem[]) => {
        if (items.length === 0) {
            return;
        }

        setMoveTargets(items);
        setMoveOpen(true);
    }, []);

    const handleRenameSubmit = useCallback(
        async (nextName: string) => {
            if (!renameTarget) {
                return;
            }

            try {
                if (renameTarget.kind === "file") {
                    await onRenameFile(renameTarget.id, nextName);
                } else {
                    await onRenameFolder(renameTarget.id, nextName);
                }

                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) }),
                    queryClient.invalidateQueries({ queryKey: ["folder", "destination-children"] }),
                ]);

                addToast(`${renameTarget.kind === "file" ? "File" : "Folder"} renamed`, "success");
            } catch (error) {
                const message = getErrorMessage(error);
                addToast(message, "error");
                throw new Error(message);
            }
        },
        [renameTarget, onRenameFile, onRenameFolder, queryClient, folderId, addToast],
    );

    const handleMoveSubmit = useCallback(
        async (destinationFolderId: string) => {
            if (moveTargets.length === 0) {
                return;
            }

            const fileIds = moveTargets.filter((item) => item.kind === "file").map((item) => item.id);
            const folderIds = moveTargets.filter((item) => item.kind === "folder").map((item) => item.id);
            const { responses, firstErrorMessage } = await runBatchedOperation<BatchMoveItemsResponse>({
                fileIds,
                folderIds,
                execute: (payload) =>
                    batchMoveItems({
                        destinationFolderId,
                        ...payload,
                    }),
            });
            const moveResult = mergeBatchResults("Batch move", responses);

            if (moveResult.summary.succeeded > 0) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(destinationFolderId) }),
                    queryClient.invalidateQueries({ queryKey: ["folder", "destination-children"] }),
                ]);
                clearSelection();
            }

            if (moveResult.status === "success") {
                addToast(
                    moveResult.summary.succeeded === 1 ? "Item moved" : `Moved ${moveResult.summary.succeeded} item(s)`,
                    "success",
                );
                return;
            }

            if (moveResult.summary.succeeded > 0) {
                addToast(`Move completed with failures (${moveResult.summary.failed} failed)`, "error");
                return;
            }

            const message = firstErrorMessage ?? "Failed to move items";
            addToast(message, "error");
            throw new Error(message);
        },
        [moveTargets, queryClient, folderId, clearSelection, addToast],
    );

    const handleBatchDeleteSelection = useCallback(
        async (input: { fileIds: string[]; folderIds: string[] }) => {
            const { responses, firstErrorMessage } = await runBatchedOperation<BatchDeleteItemsResponse>({
                fileIds: input.fileIds,
                folderIds: input.folderIds,
                execute: (payload) =>
                    batchDeleteItems({
                        ...payload,
                    }),
            });
            const deleteResult = mergeBatchResults("Batch delete", responses);

            if (deleteResult.summary.succeeded > 0) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) });
            }

            if (deleteResult.status === "success") {
                addToast(`Moved ${deleteResult.summary.succeeded} item(s) to Recycle Bin`, "success");
                return;
            }

            if (deleteResult.summary.succeeded > 0) {
                addToast(`Delete completed with failures (${deleteResult.summary.failed} failed)`, "error");
                return;
            }

            addToast(
                firstErrorMessage ?? `Delete completed with failures (${deleteResult.summary.failed} failed)`,
                "error",
            );
        },
        [queryClient, folderId, addToast],
    );

    // ── Background click to clear selection ───────────────────
    const handleBackgroundClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (selectionCount === 0) {
                return;
            }

            const target = e.target as HTMLElement | null;
            if (target?.closest('[data-selection-item="true"]')) {
                return;
            }

            clearSelection();
        },
        [selectionCount, clearSelection],
    );

    // ── Escape key to clear selection ─────────────────────────
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && selectionCount > 0) {
                clearSelection();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [selectionCount, clearSelection]);

    const renderFolderEntry = useCallback(
        (entry: FolderListEntry) => (
            <SelectableFolderItem
                entry={entry}
                displayType={displayType}
                onDelete={onDeleteFolder}
                onRename={handleOpenRename}
                onMove={handleOpenMove}
                onRefresh={onRefresh}
            />
        ),
        [displayType, onDeleteFolder, handleOpenRename, handleOpenMove, onRefresh],
    );

    const renderFileEntry = useCallback(
        (entry: FileListEntry) => (
            <SelectableFileItem
                entry={entry}
                folderId={folderId}
                displayType={displayType}
                onDelete={onDeleteFile}
                onRename={handleOpenRename}
                onMove={handleOpenMove}
            />
        ),
        [folderId, displayType, onDeleteFile, handleOpenRename, handleOpenMove],
    );

    const hasSelection = selectionCount > 0;
    const rootFolderId = folderDetails.type === "ROOT" ? folderId : (folderDetails.hierarchy[0]?.id ?? folderId);

    return (
        <>
            <PageHeader
                title={folderDetails.name}
                icon={<FolderIcon />}
                breadcrumb={<Breadcrumb trail={breadcrumbTrail} currentName={folderDetails.name} />}
                actions={
                    hasSelection ? (
                        <SelectionToolbar
                            onDeleteSelection={handleBatchDeleteSelection}
                            onShowInfo={handleShowInfo}
                            onRename={(item) => handleOpenRename([item])}
                            onMove={handleOpenMove}
                        />
                    ) : (
                        <div className="flex items-center gap-3">
                            <DisplayPreferences
                                displayType={displayType}
                                sortOrder={sortOrder}
                                sortType={sortType}
                                onDisplayTypeChange={onDisplayTypeChange}
                                onSortOrderChange={onSortOrderChange}
                                onSortTypeChange={onSortTypeChange}
                                disabled={displayOrderPending}
                            />
                            <div className="bg-border mx-0.5 h-7 w-px" />
                            <FolderToolbar onCreateFolder={onCreateFolder} onUpload={onUpload} />
                        </div>
                    )
                }
            />

            <BackgroundContextMenu onCreateFolder={onCreateFolder} onUpload={onUpload} onRefresh={onRefresh}>
                <div className="min-h-[60vh]" onClick={handleBackgroundClick}>
                    {isEmpty ? (
                        <EmptyState
                            title="This folder is empty"
                            description="Drop files here or use the upload button to get started."
                            action={{ label: "Upload File", onClick: onUpload }}
                        />
                    ) : (
                        <div className="space-y-5">
                            {/* Folders */}
                            {folderContents.folders.length > 0 ? (
                                <section className="space-y-3">
                                    <h2 className="text-text-dim text-xs font-semibold tracking-widest uppercase">
                                        Folders ({folderContents.folders.length})
                                    </h2>
                                    <VirtualizedItemSection
                                        items={folderContents.folders}
                                        getItemId={(entry) => entry.id}
                                        renderItem={renderFolderEntry}
                                        displayType={displayType}
                                        layoutKey={hasSelection}
                                        gridMinColumnWidth={280}
                                        gridGapPx={12}
                                        gridEstimateHeight={120}
                                        listEstimateHeight={56}
                                    />
                                </section>
                            ) : null}

                            {/* Files */}
                            {folderContents.files.length > 0 ? (
                                <section className="space-y-3">
                                    <h2 className="text-text-dim text-xs font-semibold tracking-widest uppercase">
                                        Files ({folderContents.files.length})
                                    </h2>
                                    <VirtualizedItemSection
                                        items={folderContents.files}
                                        getItemId={(entry) => entry.id}
                                        renderItem={renderFileEntry}
                                        displayType={displayType}
                                        layoutKey={hasSelection}
                                        gridMinColumnWidth={240}
                                        gridGapPx={12}
                                        gridEstimateHeight={260}
                                        listEstimateHeight={56}
                                    />
                                </section>
                            ) : null}
                        </div>
                    )}
                </div>
            </BackgroundContextMenu>

            {/* Item info dialog */}
            <ItemInfoDialog open={infoOpen} onOpenChange={setInfoOpen} item={infoItem} />

            <RenameItemDialog
                open={renameOpen}
                onOpenChange={(open) => {
                    setRenameOpen(open);
                    if (!open) {
                        setRenameTarget(null);
                    }
                }}
                item={renameTarget}
                onSubmit={handleRenameSubmit}
            />

            <MoveItemsDialog
                open={moveOpen}
                onOpenChange={(open) => {
                    setMoveOpen(open);
                    if (!open) {
                        setMoveTargets([]);
                    }
                }}
                items={moveTargets}
                rootFolderId={rootFolderId}
                sourceFolderId={folderId}
                onSubmit={handleMoveSubmit}
            />
        </>
    );
}

type SelectableFolderItemProps = {
    entry: FolderListEntry;
    displayType: DisplayType;
    onDelete: (folderId: string) => Promise<void>;
    onRename: (items: SelectionItem[]) => void;
    onMove: (items: SelectionItem[]) => void;
    onRefresh: () => void;
};

const SelectableFolderItem = memo(function SelectableFolderItem({
    entry,
    displayType,
    onDelete,
    onRename,
    onMove,
    onRefresh,
}: SelectableFolderItemProps) {
    const selected = useIsItemSelected(entry.id);
    const isMultiSelectionTarget = useIsItemInMultiSelection(entry.id);
    const { handleItemClick, resolveActionTargets } = useSelectionActions();

    const selectionItem = useMemo<SelectionItem>(
        () => ({ id: entry.id, kind: "folder", name: entry.folderName }),
        [entry.id, entry.folderName],
    );

    const handleClick = useCallback(
        (event: React.MouseEvent | React.KeyboardEvent) => {
            handleItemClick(selectionItem, event);
        },
        [handleItemClick, selectionItem],
    );

    const handleContextMenu = useCallback(() => {
        if (selected) {
            return;
        }

        handleItemClick(selectionItem, { metaKey: false, ctrlKey: false, shiftKey: false });
    }, [selected, handleItemClick, selectionItem]);

    const resolveTargets = useCallback(
        () => resolveActionTargets(selectionItem),
        [resolveActionTargets, selectionItem],
    );

    return (
        <FolderContextMenu
            folderId={entry.id}
            folderName={entry.folderName}
            onDelete={onDelete}
            onRename={onRename}
            onMove={onMove}
            resolveActionTargets={resolveTargets}
            isMultiSelectionTarget={isMultiSelectionTarget}
            onRefresh={onRefresh}
        >
            {displayType === "GRID" ? (
                <FolderCard
                    id={entry.id}
                    name={entry.folderName}
                    selected={selected}
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                />
            ) : (
                <FolderRow
                    id={entry.id}
                    name={entry.folderName}
                    selected={selected}
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                />
            )}
        </FolderContextMenu>
    );
});

type SelectableFileItemProps = {
    entry: FileListEntry;
    folderId: string;
    displayType: DisplayType;
    onDelete: (fileId: string) => Promise<void>;
    onRename: (items: SelectionItem[]) => void;
    onMove: (items: SelectionItem[]) => void;
};

const SelectableFileItem = memo(function SelectableFileItem({
    entry,
    folderId,
    displayType,
    onDelete,
    onRename,
    onMove,
}: SelectableFileItemProps) {
    const selected = useIsItemSelected(entry.id);
    const isMultiSelectionTarget = useIsItemInMultiSelection(entry.id);
    const { handleItemClick, resolveActionTargets } = useSelectionActions();

    const selectionItem = useMemo<SelectionItem>(
        () => ({ id: entry.id, kind: "file", name: entry.fileName }),
        [entry.id, entry.fileName],
    );

    const handleClick = useCallback(
        (event: React.MouseEvent | React.KeyboardEvent) => {
            handleItemClick(selectionItem, event);
        },
        [handleItemClick, selectionItem],
    );

    const handleContextMenu = useCallback(() => {
        if (selected) {
            return;
        }

        handleItemClick(selectionItem, { metaKey: false, ctrlKey: false, shiftKey: false });
    }, [selected, handleItemClick, selectionItem]);

    const resolveTargets = useCallback(
        () => resolveActionTargets(selectionItem),
        [resolveActionTargets, selectionItem],
    );

    return (
        <FileContextMenu
            fileId={entry.id}
            fileName={entry.fileName}
            folderId={folderId}
            onDelete={onDelete}
            onRename={onRename}
            onMove={onMove}
            resolveActionTargets={resolveTargets}
            isMultiSelectionTarget={isMultiSelectionTarget}
        >
            {displayType === "GRID" ? (
                <FileCard
                    id={entry.id}
                    fileName={entry.fileName}
                    folderId={folderId}
                    selected={selected}
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                />
            ) : (
                <FileRow
                    id={entry.id}
                    fileName={entry.fileName}
                    folderId={folderId}
                    selected={selected}
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                />
            )}
        </FileContextMenu>
    );
});
