import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { getFileDetails, normalizeFileId } from "@/features/files/api";
import { PreviewPane } from "@/features/files/components/preview-pane";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/folder/$folderId/file/$fileId/modal")({
    component: FileModalRoute,
});

function FileModalRoute() {
    const { folderId, fileId } = Route.useParams();
    const router = useRouter();

    const normalizedFileId = normalizeFileId(fileId);

    const detailsQuery = useQuery({
        queryKey: queryKeys.fileDetails(normalizedFileId),
        queryFn: () => getFileDetails(normalizedFileId),
    });

    const closeModal = async () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.history.back();
            return;
        }

        await router.navigate({
            to: "/folder/$folderId",
            params: { folderId },
            replace: true,
        });
    };

    return (
        <div className="modal-overlay" onClick={() => void closeModal()}>
            <div
                className="modal-panel"
                onClick={(event) => {
                    event.stopPropagation();
                }}
            >
                <header
                    className="row"
                    style={{
                        justifyContent: "space-between",
                        padding: "0.85rem",
                        borderBottom: "1px solid var(--line)",
                    }}
                >
                    <strong>{detailsQuery.data?.name ?? "File"}</strong>
                    <button type="button" className="secondary" onClick={() => void closeModal()}>
                        Close
                    </button>
                </header>

                {detailsQuery.isPending ? (
                    <p className="muted" style={{ padding: "1rem" }}>
                        Loading file...
                    </p>
                ) : null}
                {detailsQuery.error ? (
                    <p style={{ color: "#af1b2d", padding: "1rem" }}>{getErrorMessage(detailsQuery.error)}</p>
                ) : null}

                {detailsQuery.data ? <PreviewPane fileRouteId={fileId} fileType={detailsQuery.data.fileType} /> : null}
            </div>
        </div>
    );
}
