import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { createFolder, getFolderContents, getFolderDetails } from "@/features/folder/api";
import { uploadSingleFile } from "@/features/upload/api";
import { getErrorMessage } from "@/lib/errors";
import { toFileRouteId } from "@/lib/file-id";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/folder/$folderId")({
    component: FolderPage,
});

function FolderPage() {
    const { folderId } = Route.useParams();
    const queryClient = useQueryClient();

    const [createFolderResult, setCreateFolderResult] = useState<string | null>(null);
    const [uploadResult, setUploadResult] = useState<string | null>(null);

    const [createFolderPending, setCreateFolderPending] = useState(false);
    const [uploadPending, setUploadPending] = useState(false);

    const detailsQuery = useQuery({
        queryKey: queryKeys.folderDetails(folderId),
        queryFn: () => getFolderDetails(folderId),
    });

    const contentsQuery = useQuery({
        queryKey: queryKeys.folderContents(folderId),
        queryFn: () => getFolderContents(folderId),
    });

    const handleCreateFolder = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCreateFolderResult(null);
        setCreateFolderPending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const result = await createFolder({
                folderName: String(formData.get("folderName") ?? ""),
                parentFolderId: folderId,
            });

            setCreateFolderResult(`Created folder ${result.id}`);
            event.currentTarget.reset();

            await queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) });
        } catch (error) {
            setCreateFolderResult(getErrorMessage(error));
        } finally {
            setCreateFolderPending(false);
        }
    };

    const handleUploadFile = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setUploadResult(null);
        setUploadPending(true);

        const formData = new FormData(event.currentTarget);
        const fileValue = formData.get("file");

        if (!(fileValue instanceof File)) {
            setUploadResult("Select a file before uploading.");
            setUploadPending(false);
            return;
        }

        try {
            const result = await uploadSingleFile({
                parentFolderId: folderId,
                file: fileValue,
            });

            setUploadResult(`Uploaded ${result.id}${result.fileExtension}`);
            event.currentTarget.reset();

            await queryClient.invalidateQueries({ queryKey: queryKeys.folderContents(folderId) });
        } catch (error) {
            setUploadResult(getErrorMessage(error));
        } finally {
            setUploadPending(false);
        }
    };

    const isLoading = detailsQuery.isPending || contentsQuery.isPending;
    const error = detailsQuery.error ?? contentsQuery.error;

    if (isLoading) {
        return (
            <main>
                <section className="card">
                    <p className="muted">Loading folder...</p>
                </section>
            </main>
        );
    }

    if (error || !detailsQuery.data || !contentsQuery.data) {
        return (
            <main>
                <section className="card">
                    <p style={{ color: "#af1b2d" }}>{getErrorMessage(error)}</p>
                </section>
            </main>
        );
    }

    const folderDetails = detailsQuery.data;
    const folderContents = contentsQuery.data;
    const breadcrumbTrail = [...folderDetails.hierarchy].reverse();

    return (
        <>
            <main className="stack">
                <section className="card stack">
                    <h1>Folder: {folderDetails.name}</h1>

                    <nav className="row" aria-label="Breadcrumb">
                        {breadcrumbTrail.map((entry) => (
                            <Link key={entry.id} to="/folder/$folderId" params={{ folderId: entry.id }}>
                                {entry.name}
                            </Link>
                        ))}
                        <span>{folderDetails.name}</span>
                    </nav>
                </section>

                <section className="two grid">
                    <form className="card stack" onSubmit={(event) => void handleCreateFolder(event)}>
                        <h2>Create Folder</h2>
                        <label className="stack">
                            <span>Folder Name</span>
                            <input name="folderName" required />
                        </label>
                        {createFolderResult ? <p className="muted">{createFolderResult}</p> : null}
                        <button type="submit" disabled={createFolderPending}>
                            {createFolderPending ? "Creating..." : "Create Folder"}
                        </button>
                    </form>

                    <form className="card stack" onSubmit={(event) => void handleUploadFile(event)}>
                        <h2>Upload File</h2>
                        <label className="stack">
                            <span>File</span>
                            <input name="file" type="file" required />
                        </label>
                        {uploadResult ? <p className="muted">{uploadResult}</p> : null}
                        <button type="submit" disabled={uploadPending}>
                            {uploadPending ? "Uploading..." : "Upload"}
                        </button>
                    </form>
                </section>

                <section className="two content-columns grid">
                    <article className="card stack content-column">
                        <h2>Folders</h2>
                        <div className="column-scroll">
                            <ul className="list list-top">
                                {folderContents.folders.map((entry) => (
                                    <li key={entry.id} className="list-item">
                                        <Link to="/folder/$folderId" params={{ folderId: entry.id }}>
                                            {entry.folderName}
                                        </Link>
                                    </li>
                                ))}
                                {folderContents.folders.length === 0 ? <li className="muted">No folders</li> : null}
                            </ul>
                        </div>
                    </article>

                    <article className="card stack content-column">
                        <h2>Files</h2>
                        <div className="column-scroll">
                            <ul className="list list-top">
                                {folderContents.files.map((entry) => {
                                    const fileRouteId = toFileRouteId(entry.id, entry.fileName);

                                    return (
                                        <li key={entry.id} className="stack list-item">
                                            <Link
                                                to="/folder/$folderId/file/$fileId/modal"
                                                params={{ folderId, fileId: fileRouteId }}
                                                mask={{
                                                    to: "/file/$fileId",
                                                    params: { fileId: fileRouteId },
                                                    unmaskOnReload: true,
                                                }}
                                            >
                                                {entry.fileName}
                                            </Link>
                                            <Link to="/file/$fileId" params={{ fileId: fileRouteId }}>
                                                Open full page view
                                            </Link>
                                        </li>
                                    );
                                })}
                                {folderContents.files.length === 0 ? <li className="muted">No files</li> : null}
                            </ul>
                        </div>
                    </article>
                </section>
            </main>

            {/* Intercepted modal file route renders here over the folder page. */}
            <Outlet />
        </>
    );
}
