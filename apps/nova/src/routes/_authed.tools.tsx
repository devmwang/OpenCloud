import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { createReadToken, createUploadToken, getOwnedUploadTokens } from "@/features/auth/api";
import { uploadFileWithToken } from "@/features/upload/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

const toIsoDatetime = (value: string) => {
    if (!value) {
        return undefined;
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return undefined;
    }

    return parsedDate.toISOString();
};

const parseCsv = (value: string) => {
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
};

export const Route = createFileRoute("/_authed/tools")({
    component: ToolsPage,
});

function ToolsPage() {
    const queryClient = useQueryClient();
    const uploadTokensQuery = useQuery({
        queryKey: queryKeys.uploadTokens,
        queryFn: getOwnedUploadTokens,
    });

    const [uploadTokenResult, setUploadTokenResult] = useState<string | null>(null);
    const [readTokenResult, setReadTokenResult] = useState<string | null>(null);
    const [tokenUploadResult, setTokenUploadResult] = useState<string | null>(null);

    const [uploadTokenPending, setUploadTokenPending] = useState(false);
    const [readTokenPending, setReadTokenPending] = useState(false);
    const [tokenUploadPending, setTokenUploadPending] = useState(false);

    const handleCreateUploadToken = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setUploadTokenResult(null);
        setUploadTokenPending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const accessRuleIds = parseCsv(String(formData.get("accessControlRuleIds") ?? ""));

            const result = await createUploadToken({
                folderId: String(formData.get("folderId") ?? ""),
                fileAccess: String(formData.get("fileAccess") ?? "PROTECTED") as "PRIVATE" | "PROTECTED" | "PUBLIC",
                description: String(formData.get("description") ?? "") || undefined,
                accessControlRuleIds: accessRuleIds.length > 0 ? accessRuleIds : undefined,
                expiresAt: toIsoDatetime(String(formData.get("expiresAt") ?? "")),
            });

            setUploadTokenResult(`Upload token: ${result.uploadToken}\nExpires: ${result.expiresAt}`);
            await queryClient.invalidateQueries({ queryKey: queryKeys.uploadTokens });
        } catch (error) {
            setUploadTokenResult(getErrorMessage(error));
        } finally {
            setUploadTokenPending(false);
        }
    };

    const handleCreateReadToken = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setReadTokenResult(null);
        setReadTokenPending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const result = await createReadToken({
                fileId: String(formData.get("fileId") ?? ""),
                description: String(formData.get("description") ?? "") || undefined,
                expiresAt: toIsoDatetime(String(formData.get("expiresAt") ?? "")),
            });

            setReadTokenResult(`Read token: ${result.readToken}\nExpires: ${result.expiresAt}`);
        } catch (error) {
            setReadTokenResult(getErrorMessage(error));
        } finally {
            setReadTokenPending(false);
        }
    };

    const handleTokenUpload = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setTokenUploadResult(null);
        setTokenUploadPending(true);

        const formData = new FormData(event.currentTarget);
        const fileValue = formData.get("file");

        if (!(fileValue instanceof File)) {
            setTokenUploadResult("Select a file before uploading.");
            setTokenUploadPending(false);
            return;
        }

        try {
            const result = await uploadFileWithToken({
                uploadToken: String(formData.get("uploadToken") ?? ""),
                file: fileValue,
            });

            setTokenUploadResult(`Uploaded file ${result.id}${result.fileExtension}`);
            event.currentTarget.reset();
        } catch (error) {
            setTokenUploadResult(getErrorMessage(error));
        } finally {
            setTokenUploadPending(false);
        }
    };

    return (
        <main className="stack">
            <section className="card stack">
                <h1>Tools</h1>
                <p className="muted">Utility actions for upload/read tokens and token-based uploads.</p>
            </section>

            <section className="two grid">
                <form className="card stack" onSubmit={(event) => void handleCreateUploadToken(event)}>
                    <h2>Create Upload Token</h2>
                    <label className="stack">
                        <span>Folder ID</span>
                        <input name="folderId" required />
                    </label>
                    <label className="stack">
                        <span>File Access</span>
                        <select name="fileAccess" defaultValue="PROTECTED">
                            <option value="PRIVATE">PRIVATE</option>
                            <option value="PROTECTED">PROTECTED</option>
                            <option value="PUBLIC">PUBLIC</option>
                        </select>
                    </label>
                    <label className="stack">
                        <span>Description (optional)</span>
                        <input name="description" />
                    </label>
                    <label className="stack">
                        <span>Access Rule IDs (comma-separated, optional)</span>
                        <input name="accessControlRuleIds" />
                    </label>
                    <label className="stack">
                        <span>Expires At (optional)</span>
                        <input name="expiresAt" type="datetime-local" />
                    </label>

                    {uploadTokenResult ? (
                        <pre className="muted" style={{ margin: 0 }}>
                            {uploadTokenResult}
                        </pre>
                    ) : null}
                    <button type="submit" disabled={uploadTokenPending}>
                        {uploadTokenPending ? "Creating..." : "Create Upload Token"}
                    </button>
                </form>

                <form className="card stack" onSubmit={(event) => void handleCreateReadToken(event)}>
                    <h2>Create Read Token</h2>
                    <label className="stack">
                        <span>File ID</span>
                        <input name="fileId" required />
                    </label>
                    <label className="stack">
                        <span>Description (optional)</span>
                        <input name="description" />
                    </label>
                    <label className="stack">
                        <span>Expires At (optional)</span>
                        <input name="expiresAt" type="datetime-local" />
                    </label>

                    {readTokenResult ? (
                        <pre className="muted" style={{ margin: 0 }}>
                            {readTokenResult}
                        </pre>
                    ) : null}
                    <button type="submit" disabled={readTokenPending}>
                        {readTokenPending ? "Creating..." : "Create Read Token"}
                    </button>
                </form>
            </section>

            <section className="card stack">
                <h2>Your Upload Tokens</h2>
                <p className="muted">Tokens owned by the currently signed-in user.</p>

                {uploadTokensQuery.isPending ? <p className="muted">Loading upload tokens...</p> : null}
                {uploadTokensQuery.error ? (
                    <p style={{ color: "#af1b2d" }}>{getErrorMessage(uploadTokensQuery.error)}</p>
                ) : null}
                {uploadTokensQuery.data && uploadTokensQuery.data.length === 0 ? (
                    <p className="muted">No upload tokens found.</p>
                ) : null}
                {uploadTokensQuery.data && uploadTokensQuery.data.length > 0 ? (
                    <ul className="list list-top">
                        {uploadTokensQuery.data.map((token) => (
                            <li className="stack list-item" key={token.id}>
                                <div className="row" style={{ justifyContent: "space-between" }}>
                                    <strong>{token.fileAccess}</strong>
                                    <span className="muted">Folder: {token.folderId}</span>
                                </div>
                                <small className="muted">ID: {token.id}</small>
                                <small className="muted">
                                    Rules:{" "}
                                    {token.accessControlRuleIds.length > 0
                                        ? token.accessControlRuleIds.join(", ")
                                        : "None"}
                                </small>
                                <small className="muted">
                                    Expires: {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : "Never"}
                                </small>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>

            <section className="card stack">
                <form className="stack" onSubmit={(event) => void handleTokenUpload(event)}>
                    <h2>Token Upload Utility</h2>
                    <label className="stack">
                        <span>Upload Token</span>
                        <input name="uploadToken" required />
                    </label>
                    <label className="stack">
                        <span>File</span>
                        <input name="file" type="file" required />
                    </label>

                    {tokenUploadResult ? <p className="muted">{tokenUploadResult}</p> : null}

                    <div className="row">
                        <button type="submit" disabled={tokenUploadPending}>
                            {tokenUploadPending ? "Uploading..." : "Upload"}
                        </button>
                    </div>
                </form>
            </section>
        </main>
    );
}
