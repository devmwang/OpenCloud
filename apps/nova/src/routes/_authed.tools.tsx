import { ArrowUpTrayIcon, ClockIcon, KeyIcon, PlusIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorCard } from "@/components/shared/error-card";
import { LoadingState } from "@/components/shared/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
        <div>
            <PageHeader
                title="Tools"
                description="Upload/read tokens and token-based uploads"
                icon={<WrenchScrewdriverIcon />}
            />

            {/* Token creation forms */}
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
                {/* Create Upload Token */}
                <form
                    className="border-border bg-surface space-y-4 rounded-xl border p-5"
                    onSubmit={(event) => void handleCreateUploadToken(event)}
                >
                    <div className="flex items-center gap-2.5">
                        <KeyIcon className="text-accent h-6 w-6" />
                        <h2 className="text-text text-base font-semibold">Create Upload Token</h2>
                    </div>

                    <Input name="folderId" label="Folder ID" required placeholder="Target folder ID" />
                    <Select name="fileAccess" label="File Access" defaultValue="PROTECTED">
                        <option value="PRIVATE">PRIVATE</option>
                        <option value="PROTECTED">PROTECTED</option>
                        <option value="PUBLIC">PUBLIC</option>
                    </Select>
                    <Input name="description" label="Description (optional)" placeholder="Token description" />
                    <Input
                        name="accessControlRuleIds"
                        label="Access Rule IDs (comma-separated, optional)"
                        placeholder="rule-id-1, rule-id-2"
                    />
                    <Input name="expiresAt" label="Expires At (optional)" type="datetime-local" />

                    {uploadTokenResult ? <ResultBlock value={uploadTokenResult} /> : null}

                    <Button type="submit" loading={uploadTokenPending} className="w-full">
                        <PlusIcon className="h-5 w-5" />
                        Create Upload Token
                    </Button>
                </form>

                {/* Create Read Token */}
                <form
                    className="border-border bg-surface space-y-4 rounded-xl border p-5"
                    onSubmit={(event) => void handleCreateReadToken(event)}
                >
                    <div className="flex items-center gap-2.5">
                        <KeyIcon className="text-accent h-6 w-6" />
                        <h2 className="text-text text-base font-semibold">Create Read Token</h2>
                    </div>

                    <Input name="fileId" label="File ID" required placeholder="Target file ID" />
                    <Input name="description" label="Description (optional)" placeholder="Token description" />
                    <Input name="expiresAt" label="Expires At (optional)" type="datetime-local" />

                    {readTokenResult ? <ResultBlock value={readTokenResult} /> : null}

                    <Button type="submit" loading={readTokenPending} className="w-full">
                        <PlusIcon className="h-5 w-5" />
                        Create Read Token
                    </Button>
                </form>
            </div>

            {/* Upload Tokens List */}
            <div className="border-border bg-surface mb-5 rounded-xl border p-5">
                <div className="mb-4 flex items-center gap-2.5">
                    <KeyIcon className="text-text-muted h-6 w-6" />
                    <h2 className="text-text text-base font-semibold">Your Upload Tokens</h2>
                </div>
                <p className="text-text-muted mb-4 text-sm">Tokens owned by the currently signed-in user.</p>

                {uploadTokensQuery.isPending ? <LoadingState message="Loading upload tokens..." /> : null}
                {uploadTokensQuery.error ? (
                    <ErrorCard
                        message={getErrorMessage(uploadTokensQuery.error)}
                        onRetry={() => void uploadTokensQuery.refetch()}
                    />
                ) : null}

                {uploadTokensQuery.data && uploadTokensQuery.data.length === 0 ? (
                    <p className="text-text-dim py-7 text-center text-sm">No upload tokens found.</p>
                ) : null}

                {uploadTokensQuery.data && uploadTokensQuery.data.length > 0 ? (
                    <div className="divide-border divide-y">
                        {uploadTokensQuery.data.map((token) => (
                            <div key={token.id} className="space-y-1.5 py-4">
                                <div className="flex items-center justify-between gap-5">
                                    <div className="flex items-center gap-2.5">
                                        <Badge
                                            variant={
                                                token.fileAccess === "PUBLIC"
                                                    ? "success"
                                                    : token.fileAccess === "PRIVATE"
                                                      ? "danger"
                                                      : "accent"
                                            }
                                        >
                                            {token.fileAccess}
                                        </Badge>
                                        {token.description ? (
                                            <span className="text-text text-sm">{token.description}</span>
                                        ) : null}
                                    </div>
                                    <span className="text-text-dim shrink-0 text-sm">Folder: {token.folderId}</span>
                                </div>
                                <div className="flex items-center gap-5 text-sm">
                                    <span className="text-text-dim">ID: {token.id}</span>
                                    <span className="text-text-dim">
                                        Rules:{" "}
                                        {token.accessControlRuleIds.length > 0
                                            ? token.accessControlRuleIds.join(", ")
                                            : "None"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 text-sm">
                                    <ClockIcon className="text-text-dim h-3.5 w-3.5" />
                                    <span className="text-text-dim">
                                        Expires:{" "}
                                        {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : "Never"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {/* Token Upload Utility */}
            <div className="border-border bg-surface rounded-xl border p-5">
                <form className="space-y-4" onSubmit={(event) => void handleTokenUpload(event)}>
                    <div className="flex items-center gap-2.5">
                        <ArrowUpTrayIcon className="text-accent h-6 w-6" />
                        <h2 className="text-text text-base font-semibold">Token Upload Utility</h2>
                    </div>
                    <p className="text-text-muted text-sm">Upload a file using a previously created upload token.</p>

                    <Input name="uploadToken" label="Upload Token" required placeholder="Paste upload token" />

                    <div className="grid gap-2">
                        <label className="text-text-muted text-sm font-medium">File</label>
                        <input
                            name="file"
                            type="file"
                            required
                            className="border-border bg-surface text-text file:bg-surface-raised file:text-text-muted file:border-border hover:file:bg-surface-raised/80 w-full rounded-lg border px-3 py-1.5 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:px-2.5 file:py-1 file:text-sm file:font-medium file:transition-colors"
                        />
                    </div>

                    {tokenUploadResult ? (
                        <div className="bg-surface-raised rounded-lg px-4 py-2.5">
                            <p className="text-text-muted text-sm">{tokenUploadResult}</p>
                        </div>
                    ) : null}

                    <Button type="submit" loading={tokenUploadPending}>
                        <ArrowUpTrayIcon className="h-5 w-5" />
                        Upload
                    </Button>
                </form>
            </div>
        </div>
    );
}

function ResultBlock({ value }: { value: string }) {
    return (
        <pre className="bg-surface-raised text-text-muted overflow-x-auto rounded-lg px-4 py-2.5 font-mono text-xs">
            {value}
        </pre>
    );
}
