import {
    ArrowUpTrayIcon,
    ClockIcon,
    KeyIcon,
    PencilIcon,
    PlusIcon,
    ShieldCheckIcon,
    WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorCard } from "@/components/shared/error-card";
import { LoadingState } from "@/components/shared/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import {
    createAccessRule,
    createReadToken,
    createUploadToken,
    getOwnedAccessRules,
    getOwnedUploadTokens,
    updateAccessRule,
    updateUploadToken,
    type AccessRuleSummary,
    type UploadTokenSummary,
} from "@/features/auth/api";
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

const toLocalDatetimeValue = (value: string | null) => {
    if (!value) {
        return "";
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return "";
    }

    const timezoneOffsetMs = parsedDate.getTimezoneOffset() * 60_000;
    return new Date(parsedDate.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
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
    const accessRulesQuery = useQuery({
        queryKey: queryKeys.accessRules,
        queryFn: getOwnedAccessRules,
    });
    const uploadTokensQuery = useQuery({
        queryKey: queryKeys.uploadTokens,
        queryFn: getOwnedUploadTokens,
    });

    const [uploadTokenResult, setUploadTokenResult] = useState<string | null>(null);
    const [readTokenResult, setReadTokenResult] = useState<string | null>(null);
    const [tokenUploadResult, setTokenUploadResult] = useState<string | null>(null);
    const [accessRuleResult, setAccessRuleResult] = useState<string | null>(null);

    const [uploadTokenPending, setUploadTokenPending] = useState(false);
    const [readTokenPending, setReadTokenPending] = useState(false);
    const [tokenUploadPending, setTokenUploadPending] = useState(false);
    const [accessRulePending, setAccessRulePending] = useState(false);

    const [editingRule, setEditingRule] = useState<AccessRuleSummary | null>(null);
    const [editRuleResult, setEditRuleResult] = useState<string | null>(null);
    const [editRulePending, setEditRulePending] = useState(false);

    const [editingToken, setEditingToken] = useState<UploadTokenSummary | null>(null);
    const [editTokenResult, setEditTokenResult] = useState<string | null>(null);
    const [editTokenPending, setEditTokenPending] = useState(false);

    const handleCreateAccessRule = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAccessRuleResult(null);
        setAccessRulePending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const result = await createAccessRule({
                name: String(formData.get("name") ?? ""),
                type: String(formData.get("type") ?? "ALLOW") as "ALLOW" | "DISALLOW",
                method: "IP_ADDRESS",
                match: String(formData.get("match") ?? ""),
            });

            setAccessRuleResult(result.message);
            await queryClient.invalidateQueries({ queryKey: queryKeys.accessRules });
            event.currentTarget.reset();
        } catch (error) {
            setAccessRuleResult(getErrorMessage(error));
        } finally {
            setAccessRulePending(false);
        }
    };

    const handleUpdateAccessRule = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingRule) {
            return;
        }

        setEditRuleResult(null);
        setEditRulePending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const result = await updateAccessRule({
                id: editingRule.id,
                name: String(formData.get("name") ?? ""),
                type: String(formData.get("type") ?? "ALLOW") as "ALLOW" | "DISALLOW",
                method: "IP_ADDRESS",
                match: String(formData.get("match") ?? ""),
            });

            setEditRuleResult(result.message);
            await queryClient.invalidateQueries({ queryKey: queryKeys.accessRules });
            setEditingRule(null);
            setEditRuleResult(null);
        } catch (error) {
            setEditRuleResult(getErrorMessage(error));
        } finally {
            setEditRulePending(false);
        }
    };

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

    const handleUpdateUploadToken = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingToken) {
            return;
        }

        setEditTokenResult(null);
        setEditTokenPending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const accessRuleIds = parseCsv(String(formData.get("accessControlRuleIds") ?? ""));

            const result = await updateUploadToken({
                id: editingToken.id,
                folderId: String(formData.get("folderId") ?? ""),
                fileAccess: String(formData.get("fileAccess") ?? "PROTECTED") as "PRIVATE" | "PROTECTED" | "PUBLIC",
                description: String(formData.get("description") ?? "") || undefined,
                accessControlRuleIds: accessRuleIds,
                expiresAt: toIsoDatetime(String(formData.get("expiresAt") ?? "")) ?? null,
            });

            setEditTokenResult(result.message);
            await queryClient.invalidateQueries({ queryKey: queryKeys.uploadTokens });
            setEditingToken(null);
            setEditTokenResult(null);
        } catch (error) {
            setEditTokenResult(getErrorMessage(error));
        } finally {
            setEditTokenPending(false);
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
                description="Access rules, upload/read tokens, and token-based uploads"
                icon={<WrenchScrewdriverIcon />}
            />

            {/* Create Access Rule */}
            <div className="border-border bg-surface mb-5 rounded-xl border p-5">
                <form className="space-y-4" onSubmit={(event) => void handleCreateAccessRule(event)}>
                    <div className="flex items-center gap-2.5">
                        <ShieldCheckIcon className="text-accent h-6 w-6" />
                        <h2 className="text-text text-base font-semibold">Create Access Rule</h2>
                    </div>

                    <Input name="name" label="Rule Name" required placeholder="e.g. Office Network" />
                    <Select name="type" label="Rule Type" defaultValue="ALLOW">
                        <option value="ALLOW">ALLOW</option>
                        <option value="DISALLOW">DISALLOW</option>
                    </Select>
                    <Input name="match" label="IP or CIDR Match" required placeholder="203.0.113.0/24" />

                    {accessRuleResult ? <ResultMessage message={accessRuleResult} /> : null}

                    <Button type="submit" loading={accessRulePending}>
                        <PlusIcon className="h-5 w-5" />
                        Create Access Rule
                    </Button>
                </form>
            </div>

            {/* Access Rules List */}
            <div className="border-border bg-surface mb-5 rounded-xl border p-5">
                <div className="mb-4 flex items-center gap-2.5">
                    <ShieldCheckIcon className="text-text-muted h-6 w-6" />
                    <h2 className="text-text text-base font-semibold">Your Access Rules</h2>
                </div>
                <p className="text-text-muted mb-4 text-sm">Rules owned by the currently signed-in user.</p>

                {accessRulesQuery.isPending ? <LoadingState message="Loading access rules..." /> : null}
                {accessRulesQuery.error ? (
                    <ErrorCard
                        message={getErrorMessage(accessRulesQuery.error)}
                        onRetry={() => void accessRulesQuery.refetch()}
                    />
                ) : null}

                {accessRulesQuery.data && accessRulesQuery.data.length === 0 ? (
                    <p className="text-text-dim py-7 text-center text-sm">No access rules found.</p>
                ) : null}

                {accessRulesQuery.data && accessRulesQuery.data.length > 0 ? (
                    <div className="divide-border divide-y">
                        {accessRulesQuery.data.map((rule) => (
                            <div key={rule.id} className="flex items-center justify-between gap-5 py-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-text text-sm font-medium">{rule.name}</span>
                                        <Badge variant={rule.type === "ALLOW" ? "success" : "danger"}>
                                            {rule.type}
                                        </Badge>
                                    </div>
                                    <code className="text-accent mt-1 block text-xs">{rule.match}</code>
                                    <span className="text-text-dim mt-1 block text-sm">ID: {rule.id}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    <span className="text-text-dim text-sm">{rule.method}</span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setEditRuleResult(null);
                                            setEditingRule(rule);
                                        }}
                                    >
                                        <PencilIcon className="h-4 w-4" />
                                        Edit
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

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
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="text-text-dim text-sm">Folder: {token.folderId}</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setEditTokenResult(null);
                                                setEditingToken(token);
                                            }}
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                            Edit
                                        </Button>
                                    </div>
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

            {/* Edit Access Rule Dialog */}
            <Dialog
                open={editingRule !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingRule(null);
                        setEditRuleResult(null);
                    }
                }}
            >
                <DialogContent title="Edit Access Rule" description="Update the name, type, or IP match for this rule.">
                    {editingRule ? (
                        <form className="space-y-4" onSubmit={(event) => void handleUpdateAccessRule(event)}>
                            <Input
                                name="name"
                                label="Rule Name"
                                required
                                defaultValue={editingRule.name}
                                key={editingRule.id}
                            />
                            <Select
                                name="type"
                                label="Rule Type"
                                defaultValue={editingRule.type}
                                key={`type-${editingRule.id}`}
                            >
                                <option value="ALLOW">ALLOW</option>
                                <option value="DISALLOW">DISALLOW</option>
                            </Select>
                            <Input
                                name="match"
                                label="IP or CIDR Match"
                                required
                                defaultValue={editingRule.match}
                                placeholder="203.0.113.0/24"
                                key={`match-${editingRule.id}`}
                            />

                            {editRuleResult ? <ResultMessage message={editRuleResult} /> : null}

                            <div className="flex items-center justify-end gap-2.5 pt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setEditingRule(null);
                                        setEditRuleResult(null);
                                    }}
                                    disabled={editRulePending}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" loading={editRulePending}>
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    ) : null}
                </DialogContent>
            </Dialog>

            {/* Edit Upload Token Dialog */}
            <Dialog
                open={editingToken !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingToken(null);
                        setEditTokenResult(null);
                    }
                }}
            >
                <DialogContent title="Edit Upload Token" description="Update the token configuration and expiration.">
                    {editingToken ? (
                        <form className="space-y-4" onSubmit={(event) => void handleUpdateUploadToken(event)}>
                            <Input
                                name="description"
                                label="Description (optional)"
                                defaultValue={editingToken.description ?? ""}
                                key={`description-${editingToken.id}`}
                            />
                            <Input
                                name="folderId"
                                label="Folder ID"
                                required
                                defaultValue={editingToken.folderId}
                                key={`folder-${editingToken.id}`}
                            />
                            <Select
                                name="fileAccess"
                                label="File Access"
                                defaultValue={editingToken.fileAccess}
                                key={`file-access-${editingToken.id}`}
                            >
                                <option value="PRIVATE">PRIVATE</option>
                                <option value="PROTECTED">PROTECTED</option>
                                <option value="PUBLIC">PUBLIC</option>
                            </Select>
                            <Input
                                name="accessControlRuleIds"
                                label="Access Rule IDs (comma-separated)"
                                defaultValue={editingToken.accessControlRuleIds.join(", ")}
                                placeholder="rule-id-1, rule-id-2"
                                key={`rules-${editingToken.id}`}
                            />
                            <Input
                                name="expiresAt"
                                label="Expires At (optional)"
                                type="datetime-local"
                                defaultValue={toLocalDatetimeValue(editingToken.expiresAt)}
                                key={`expires-${editingToken.id}`}
                            />

                            {editTokenResult ? <ResultMessage message={editTokenResult} /> : null}

                            <div className="flex items-center justify-end gap-2.5 pt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setEditingToken(null);
                                        setEditTokenResult(null);
                                    }}
                                    disabled={editTokenPending}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" loading={editTokenPending}>
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    ) : null}
                </DialogContent>
            </Dialog>
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

function ResultMessage({ message }: { message: string }) {
    return (
        <div className="bg-surface-raised rounded-lg px-4 py-2.5">
            <p className="text-text-muted text-sm">{message}</p>
        </div>
    );
}
