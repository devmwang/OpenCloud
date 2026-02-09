import { DocumentIcon, ExclamationTriangleIcon, LockClosedIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getSessionSafe } from "@/features/auth/api";
import { buildFileContentUrl, getFileDetails, normalizeFileId, type FileDetails } from "@/features/files/api";
import { PreviewPane } from "@/features/files/components/preview-pane";
import { moveToRecycleBin } from "@/features/recycle-bin/api";
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
          canDelete: boolean;
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
            const session = await getSessionSafe();

            return {
                kind: "ok",
                file,
                fileRouteId: params.fileId,
                normalizedFileId,
                canDelete: session?.user.id === file.ownerId,
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

    const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    const deleteMutation = useMutation({
        mutationFn: () => moveToRecycleBin({ itemType: "FILE", itemId: data.normalizedFileId }),
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
            <main className="bg-root flex min-h-screen items-center justify-center p-6">
                <div className="border-border bg-surface w-full max-w-lg rounded-xl border p-7 text-center shadow-2xl shadow-black/40">
                    <div className="bg-danger-glow border-danger/20 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border">
                        <LockClosedIcon className="text-danger h-8 w-8" />
                    </div>
                    <h1 className="text-text mb-3 text-lg font-semibold">Access Denied</h1>
                    <p className="text-text-muted text-sm">{data.message}</p>
                </div>
            </main>
        );
    }

    const handleDelete = async () => {
        if (!data.canDelete) {
            return;
        }

        setDeleteErrorMessage(null);
        await deleteMutation.mutateAsync();
    };

    return (
        <main className="bg-root flex min-h-screen flex-col">
            {/* Top bar */}
            <div className="border-border bg-surface/80 sticky top-0 z-10 border-b backdrop-blur-sm">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="bg-surface-raised border-border flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border">
                            <DocumentIcon className="text-accent h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-text truncate text-sm font-semibold">{data.file.name}</h1>
                            <span className="text-text-dim text-xs">{data.file.fileType}</span>
                        </div>
                    </div>

                    {data.canDelete ? (
                        <div className="flex items-center gap-3">
                            <Button
                                variant="danger"
                                size="sm"
                                loading={deleteMutation.isPending}
                                onClick={() => setDeleteConfirmOpen(true)}
                            >
                                <TrashIcon className="h-4.5 w-4.5" />
                                Delete
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Delete error */}
            {deleteErrorMessage ? (
                <div className="mx-auto w-full max-w-7xl px-5 pt-4">
                    <div className="border-danger/20 bg-danger-glow flex items-center gap-2.5 rounded-lg border px-5 py-3">
                        <ExclamationTriangleIcon className="text-danger h-5 w-5 shrink-0" />
                        <p className="text-danger text-sm">{deleteErrorMessage}</p>
                    </div>
                </div>
            ) : null}

            {/* Preview */}
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mx-auto w-full max-w-7xl flex-1 px-5 py-4">
                    <div className="border-border bg-surface h-[calc(100vh-8rem)] overflow-hidden rounded-xl border">
                        <PreviewPane
                            fileRouteId={data.fileRouteId}
                            fileName={data.file.name}
                            fileType={data.file.fileType}
                            fileAccess={data.file.fileAccess}
                            readToken={data.readToken}
                        />
                    </div>
                </div>
            </div>

            <ConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                title="Move File to Recycle Bin"
                description={`Move "${data.file.name}" to Recycle Bin?`}
                confirmLabel="Move to Recycle Bin"
                variant="danger"
                onConfirm={async () => {
                    await handleDelete();
                }}
            />
        </main>
    );
}
