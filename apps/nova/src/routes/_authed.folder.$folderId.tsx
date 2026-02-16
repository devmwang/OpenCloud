import { FolderIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { moveFile, renameFile } from "@/features/files/api";
import {
    createFolder,
    getDisplayOrder,
    getFolderContents,
    getFolderDetails,
    moveFolder,
    renameFolder,
    setDisplayOrder,
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
import { useSelection, type SelectionItem } from "@/features/folder/hooks/use-selection";
import { moveToRecycleBin } from "@/features/recycle-bin/api";
import { uploadSingleFile } from "@/features/upload/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/folder/$folderId")({
    component: FolderPage,
});

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

    const handleMoveFolder = async (targetFolderId: string, destinationFolderId: string) => {
        await moveFolder({ folderId: targetFolderId, destinationFolderId });
    };

    const handleMoveFile = async (targetFileId: string, destinationFolderId: string) => {
        await moveFile({ fileId: targetFileId, destinationFolderId });
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
                onMoveFolder={handleMoveFolder}
                onMoveFile={handleMoveFile}
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
    onMoveFolder: (folderId: string, destinationFolderId: string) => Promise<void>;
    onMoveFile: (fileId: string, destinationFolderId: string) => Promise<void>;
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
    onMoveFolder,
    onMoveFile,
}: FolderPageContentProps) {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const { selectionCount, isSelected, handleItemClick, clearSelection } = useSelection();

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

                await queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) });

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

            let succeeded = 0;
            let failed = 0;
            let firstError: string | null = null;

            for (const item of moveTargets) {
                try {
                    if (item.kind === "file") {
                        await onMoveFile(item.id, destinationFolderId);
                    } else {
                        await onMoveFolder(item.id, destinationFolderId);
                    }
                    succeeded++;
                } catch (error) {
                    failed++;
                    if (!firstError) {
                        firstError = getErrorMessage(error);
                    }
                }
            }

            if (succeeded > 0) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(destinationFolderId) }),
                    queryClient.invalidateQueries({ queryKey: ["folder", "destination-children"] }),
                ]);
                clearSelection();
            }

            if (failed === 0) {
                addToast(
                    succeeded === 1
                        ? `${moveTargets[0]?.kind === "file" ? "File" : "Folder"} moved`
                        : `Moved ${succeeded} item(s)`,
                    "success",
                );
                return;
            }

            if (succeeded > 0) {
                addToast(`Moved ${succeeded} item(s), ${failed} failed`, "error");
                return;
            }

            const message = firstError ?? "Failed to move items";
            addToast(message, "error");
            throw new Error(message);
        },
        [moveTargets, onMoveFile, onMoveFolder, queryClient, folderId, clearSelection, addToast],
    );

    // ── Batch delete handlers ─────────────────────────────────
    const handleBatchDeleteFiles = useCallback(
        async (fileIds: string[]) => {
            let succeeded = 0;
            let failed = 0;
            for (const id of fileIds) {
                try {
                    await onDeleteFile(id);
                    succeeded++;
                } catch {
                    failed++;
                }
            }
            if (failed > 0) {
                addToast(`Deleted ${succeeded} file(s), ${failed} failed`, "error");
            }
        },
        [onDeleteFile, addToast],
    );

    const handleBatchDeleteFolders = useCallback(
        async (folderIds: string[]) => {
            let succeeded = 0;
            let failed = 0;
            for (const id of folderIds) {
                try {
                    await onDeleteFolder(id);
                    succeeded++;
                } catch {
                    failed++;
                }
            }
            if (failed > 0) {
                addToast(`Deleted ${succeeded} folder(s), ${failed} failed`, "error");
            }
        },
        [onDeleteFolder, addToast],
    );

    // ── Background click to clear selection ───────────────────
    const handleBackgroundClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget && selectionCount > 0) {
                clearSelection();
            }
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

    // ── Item click handlers ───────────────────────────────────
    const makeFolderClickHandler = useCallback(
        (entry: { id: string; folderName: string }) => (event: React.MouseEvent | React.KeyboardEvent) => {
            handleItemClick({ id: entry.id, kind: "folder", name: entry.folderName }, event);
        },
        [handleItemClick],
    );

    const makeFileClickHandler = useCallback(
        (entry: { id: string; fileName: string }) => (event: React.MouseEvent | React.KeyboardEvent) => {
            handleItemClick({ id: entry.id, kind: "file", name: entry.fileName }, event);
        },
        [handleItemClick],
    );

    const makeFolderContextMenuHandler = useCallback(
        (entry: { id: string; folderName: string }) => () => {
            if (isSelected(entry.id)) {
                return;
            }

            handleItemClick(
                { id: entry.id, kind: "folder", name: entry.folderName },
                { metaKey: false, ctrlKey: false, shiftKey: false },
            );
        },
        [isSelected, handleItemClick],
    );

    const makeFileContextMenuHandler = useCallback(
        (entry: { id: string; fileName: string }) => () => {
            if (isSelected(entry.id)) {
                return;
            }

            handleItemClick(
                { id: entry.id, kind: "file", name: entry.fileName },
                { metaKey: false, ctrlKey: false, shiftKey: false },
            );
        },
        [isSelected, handleItemClick],
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
                            onDeleteFiles={handleBatchDeleteFiles}
                            onDeleteFolders={handleBatchDeleteFolders}
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
                                    {displayType === "GRID" ? (
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                                            {folderContents.folders.map((entry) => (
                                                <FolderContextMenu
                                                    key={entry.id}
                                                    folderId={entry.id}
                                                    folderName={entry.folderName}
                                                    onDelete={onDeleteFolder}
                                                    onRename={handleOpenRename}
                                                    onMove={handleOpenMove}
                                                    onRefresh={onRefresh}
                                                >
                                                    <FolderCard
                                                        id={entry.id}
                                                        name={entry.folderName}
                                                        selected={isSelected(entry.id)}
                                                        onClick={makeFolderClickHandler(entry)}
                                                        onContextMenu={makeFolderContextMenuHandler(entry)}
                                                    />
                                                </FolderContextMenu>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-0.5">
                                            {folderContents.folders.map((entry) => (
                                                <FolderContextMenu
                                                    key={entry.id}
                                                    folderId={entry.id}
                                                    folderName={entry.folderName}
                                                    onDelete={onDeleteFolder}
                                                    onRename={handleOpenRename}
                                                    onMove={handleOpenMove}
                                                    onRefresh={onRefresh}
                                                >
                                                    <FolderRow
                                                        id={entry.id}
                                                        name={entry.folderName}
                                                        selected={isSelected(entry.id)}
                                                        onClick={makeFolderClickHandler(entry)}
                                                        onContextMenu={makeFolderContextMenuHandler(entry)}
                                                    />
                                                </FolderContextMenu>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            ) : null}

                            {/* Files */}
                            {folderContents.files.length > 0 ? (
                                <section className="space-y-3">
                                    <h2 className="text-text-dim text-xs font-semibold tracking-widest uppercase">
                                        Files ({folderContents.files.length})
                                    </h2>
                                    {displayType === "GRID" ? (
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                                            {folderContents.files.map((entry) => (
                                                <FileContextMenu
                                                    key={entry.id}
                                                    fileId={entry.id}
                                                    fileName={entry.fileName}
                                                    folderId={folderId}
                                                    onDelete={onDeleteFile}
                                                    onRename={handleOpenRename}
                                                    onMove={handleOpenMove}
                                                >
                                                    <FileCard
                                                        id={entry.id}
                                                        fileName={entry.fileName}
                                                        folderId={folderId}
                                                        selected={isSelected(entry.id)}
                                                        onClick={makeFileClickHandler(entry)}
                                                        onContextMenu={makeFileContextMenuHandler(entry)}
                                                    />
                                                </FileContextMenu>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-0.5">
                                            {folderContents.files.map((entry) => (
                                                <FileContextMenu
                                                    key={entry.id}
                                                    fileId={entry.id}
                                                    fileName={entry.fileName}
                                                    folderId={folderId}
                                                    onDelete={onDeleteFile}
                                                    onRename={handleOpenRename}
                                                    onMove={handleOpenMove}
                                                >
                                                    <FileRow
                                                        id={entry.id}
                                                        fileName={entry.fileName}
                                                        folderId={folderId}
                                                        selected={isSelected(entry.id)}
                                                        onClick={makeFileClickHandler(entry)}
                                                        onContextMenu={makeFileContextMenuHandler(entry)}
                                                    />
                                                </FileContextMenu>
                                            ))}
                                        </div>
                                    )}
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
