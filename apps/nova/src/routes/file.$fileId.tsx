import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

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

    const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

    const deleteMutation = useMutation({
        mutationFn: () => deleteFile(data.normalizedFileId),
        onSuccess: async () => {
            if (data.kind === "ok") {
                setDeleteMessage("File deleted.");
                await router.navigate({
                    to: "/folder/$folderId",
                    params: { folderId: data.file.parentId },
                });
            }
        },
        onError: (error) => {
            setDeleteMessage(getErrorMessage(error));
        },
    });

    if (data.kind === "unauthorized") {
        return (
            <main>
                <section className="card stack">
                    <h1>File</h1>
                    <p className="muted">{data.message}</p>
                </section>
            </main>
        );
    }

    const handleDelete = async () => {
        setDeleteMessage(null);
        await deleteMutation.mutateAsync();
    };

    return (
        <main className="stack">
            <section className="card stack">
                <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="stack" style={{ gap: "0.25rem" }}>
                        <h1 style={{ margin: 0 }}>{data.file.name}</h1>
                        <span className="muted">{data.file.fileType}</span>
                    </div>

                    <div className="row">
                        <button type="button" className="danger" onClick={() => void handleDelete()}>
                            Delete File
                        </button>
                    </div>
                </div>

                {deleteMessage ? <p className="muted">{deleteMessage}</p> : null}
            </section>

            <section className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ height: "72vh" }}>
                    <PreviewPane
                        fileRouteId={data.fileRouteId}
                        fileType={data.file.fileType}
                        readToken={data.readToken}
                    />
                </div>
            </section>
        </main>
    );
}
