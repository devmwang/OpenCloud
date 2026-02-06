import { FolderIcon } from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { deleteFile } from "@/features/files/api";
import { createFolder, deleteFolder, getFolderContents, getFolderDetails } from "@/features/folder/api";
import { BackgroundContextMenu } from "@/features/folder/components/background-context-menu";
import { CreateFolderDialog } from "@/features/folder/components/create-folder-dialog";
import { FileCard } from "@/features/folder/components/file-card";
import { FileContextMenu } from "@/features/folder/components/file-context-menu";
import { FolderCard } from "@/features/folder/components/folder-card";
import { FolderContextMenu } from "@/features/folder/components/folder-context-menu";
import { FolderToolbar } from "@/features/folder/components/folder-toolbar";
import { UploadDialog } from "@/features/folder/components/upload-dialog";
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

    const refreshContents = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) });
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
            await deleteFolder(targetFolderId);
            addToast("Folder deleted", "success");
            await refreshContents();
        } catch (error) {
            addToast(getErrorMessage(error), "error");
        }
    };

    const handleDeleteFile = async (targetFileId: string) => {
        try {
            await deleteFile(targetFileId);
            addToast("File deleted", "success");
            await refreshContents();
        } catch (error) {
            addToast(getErrorMessage(error), "error");
        }
    };

    const isLoading = detailsQuery.isPending || contentsQuery.isPending;
    const error = detailsQuery.error ?? contentsQuery.error;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="space-y-3 pb-6">
                    <div className="skeleton h-4 w-48 rounded" />
                    <div className="skeleton h-7 w-64 rounded" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !detailsQuery.data || !contentsQuery.data) {
        return <ErrorCard message={getErrorMessage(error)} onRetry={() => void refreshContents()} />;
    }

    const folderDetails = detailsQuery.data;
    const folderContents = contentsQuery.data;
    const breadcrumbTrail = [...folderDetails.hierarchy].reverse();
    const isEmpty = folderContents.folders.length === 0 && folderContents.files.length === 0;

    return (
        <>
            <PageHeader
                title={folderDetails.name}
                icon={<FolderIcon />}
                breadcrumb={<Breadcrumb trail={breadcrumbTrail} currentName={folderDetails.name} />}
                actions={
                    <FolderToolbar
                        onCreateFolder={() => setCreateFolderOpen(true)}
                        onUpload={() => setUploadOpen(true)}
                    />
                }
            />

            <BackgroundContextMenu
                onCreateFolder={() => setCreateFolderOpen(true)}
                onUpload={() => setUploadOpen(true)}
                onRefresh={() => void refreshContents()}
            >
                <div className="min-h-[60vh]">
                    {isEmpty ? (
                        <EmptyState
                            title="This folder is empty"
                            description="Drop files here or use the upload button to get started."
                            action={{ label: "Upload File", onClick: () => setUploadOpen(true) }}
                        />
                    ) : (
                        <div className="space-y-6">
                            {/* Folders */}
                            {folderContents.folders.length > 0 ? (
                                <section className="space-y-3">
                                    <h2 className="text-text-dim text-xs font-semibold tracking-widest uppercase">
                                        Folders ({folderContents.folders.length})
                                    </h2>
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                                        {folderContents.folders.map((entry) => (
                                            <FolderContextMenu
                                                key={entry.id}
                                                folderId={entry.id}
                                                folderName={entry.folderName}
                                                onDelete={handleDeleteFolder}
                                                onRefresh={() => void refreshContents()}
                                            >
                                                <FolderCard id={entry.id} name={entry.folderName} />
                                            </FolderContextMenu>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

                            {/* Files */}
                            {folderContents.files.length > 0 ? (
                                <section className="space-y-3">
                                    <h2 className="text-text-dim text-xs font-semibold tracking-widest uppercase">
                                        Files ({folderContents.files.length})
                                    </h2>
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                                        {folderContents.files.map((entry) => (
                                            <FileContextMenu
                                                key={entry.id}
                                                fileId={entry.id}
                                                fileName={entry.fileName}
                                                folderId={folderId}
                                                onDelete={handleDeleteFile}
                                            >
                                                <FileCard id={entry.id} fileName={entry.fileName} folderId={folderId} />
                                            </FileContextMenu>
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    )}
                </div>
            </BackgroundContextMenu>

            {/* Dialogs */}
            <CreateFolderDialog
                open={createFolderOpen}
                onOpenChange={setCreateFolderOpen}
                onSubmit={handleCreateFolder}
            />
            <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUpload={handleUpload} />

            {/* Intercepted modal file route renders here over the folder page. */}
            <Outlet />
        </>
    );
}
