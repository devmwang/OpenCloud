import { DocumentIcon, ExclamationTriangleIcon, LockClosedIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    buildFileContentUrl,
    deleteFile,
    getFileDetails,
    normalizeFileId,
    type FileDetails,
} from "@/features/files/api";
import { PreviewPane } from "@/features/files/components/preview-pane";
import { resolveCanonicalBaseUrl } from "@/lib/canonical";
import { getErrorMessage } from "@/lib/errors";
import { ApiError } from "@/lib/http";

const fileSearchSchema = z.object({
    readToken: z.string().optional(),
});

type FileLoaderData =
    | {
          kind: "ok";
          file: FileDetails;
          fileRouteId: string;
          normalizedFileId: string;
          readToken?: string;
      }
    | {
          kind: "unauthorized";
          message: string;
          fileRouteId: string;
          normalizedFileId: string;
          readToken?: string;
      };

export const Route = createFileRoute("/file/$fileId")({
    validateSearch: fileSearchSchema,
    loaderDeps: ({ search }) => ({ readToken: search.readToken }),
    loader: async ({ params, deps }) => {
        const normalizedFileId = normalizeFileId(params.fileId);

        try {
            const file = await getFileDetails(normalizedFileId, deps.readToken, {
                forwardServerCookies: true,
            });

            return {
                kind: "ok",
                file,
                fileRouteId: params.fileId,
                normalizedFileId,
                readToken: deps.readToken,
            } satisfies FileLoaderData;
        } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                return {
                    kind: "unauthorized",
                    message: error.message,
                    fileRouteId: params.fileId,
                    normalizedFileId,
                    readToken: deps.readToken,
                } satisfies FileLoaderData;
            }

            throw error;
        }
    },
    head: async ({ loaderData, params }) => {
        const title = loaderData?.kind === "ok" ? `OpenCloud - ${loaderData.file.name}` : "OpenCloud - File";
        const description =
            loaderData?.kind === "ok" ? `Preview ${loaderData.file.name} in OpenCloud.` : "OpenCloud file preview";

        const imageUrl = buildFileContentUrl(params.fileId, loaderData?.readToken);

        const canonicalBase = await resolveCanonicalBaseUrl();
        const canonicalPath = `/file/${encodeURIComponent(params.fileId)}${
            loaderData?.readToken ? `?readToken=${encodeURIComponent(loaderData.readToken)}` : ""
        }`;
        const canonicalHref = canonicalBase ? new URL(canonicalPath, canonicalBase).toString() : undefined;

        return {
            meta: [
                { title },
                { name: "description", content: description },
                { property: "og:title", content: title },
                { property: "og:description", content: description },
                { property: "og:type", content: "website" },
                { property: "og:image", content: imageUrl },
                { name: "twitter:card", content: "summary_large_image" },
                { name: "twitter:title", content: title },
                { name: "twitter:description", content: description },
                { name: "twitter:image", content: imageUrl },
            ],
            links: canonicalHref ? [{ rel: "canonical", href: canonicalHref }] : undefined,
        };
    },
    component: FilePage,
});

function FilePage() {
    const router = useRouter();
    const data = Route.useLoaderData();

    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

    const deleteMutation = useMutation({
        mutationFn: () => deleteFile(data.normalizedFileId),
        onSuccess: async () => {
            if (data.kind === "ok") {
                await router.navigate({
                    to: "/folder/$folderId",
                    params: { folderId: data.file.parentId },
                });
            }
        },
        onError: (error) => {
            setDeleteErrorMessage(getErrorMessage(error));
        },
    });

    if (data.kind === "unauthorized") {
        return (
            <main className="bg-root flex min-h-screen items-center justify-center p-4">
                <div className="border-border bg-surface w-full max-w-md rounded-xl border p-8 text-center shadow-2xl shadow-black/40">
                    <div className="bg-danger-glow border-danger/20 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border">
                        <LockClosedIcon className="text-danger h-7 w-7" />
                    </div>
                    <h1 className="text-text mb-2 text-lg font-semibold">Access Denied</h1>
                    <p className="text-text-muted text-sm">{data.message}</p>
                </div>
            </main>
        );
    }

    const handleDelete = async () => {
        setDeleteErrorMessage(null);
        await deleteMutation.mutateAsync();
    };

    return (
        <main className="bg-root flex min-h-screen flex-col">
            {/* Top bar */}
            <div className="border-border bg-surface/80 sticky top-0 z-10 border-b backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="bg-surface-raised border-border flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                            <DocumentIcon className="text-accent h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-text truncate text-sm font-semibold">{data.file.name}</h1>
                            <span className="text-text-dim text-xs">{data.file.fileType}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="danger" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
                            <TrashIcon className="h-3.5 w-3.5" />
                            Delete
                        </Button>
                    </div>
                </div>
            </div>

            {/* Delete error */}
            {deleteErrorMessage ? (
                <div className="mx-auto w-full max-w-6xl px-6 pt-4">
                    <div className="border-danger/20 bg-danger-glow flex items-center gap-2 rounded-lg border px-4 py-2.5">
                        <ExclamationTriangleIcon className="text-danger h-4 w-4 shrink-0" />
                        <p className="text-danger text-sm">{deleteErrorMessage}</p>
                    </div>
                </div>
            ) : null}

            {/* Preview */}
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-4">
                    <div className="border-border bg-surface h-[calc(100vh-8rem)] overflow-hidden rounded-xl border">
                        <PreviewPane
                            fileRouteId={data.fileRouteId}
                            fileType={data.file.fileType}
                            readToken={data.readToken}
                        />
                    </div>
                </div>
            </div>

            {/* Delete confirmation */}
            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={setConfirmDeleteOpen}
                title="Delete File"
                description={`Are you sure you want to delete "${data.file.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                variant="danger"
                onConfirm={handleDelete}
            />
        </main>
    );
}
