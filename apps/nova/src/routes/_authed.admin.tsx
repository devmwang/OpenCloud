import {
    PencilIcon,
    PlusIcon,
    ShieldCheckIcon,
    TrashIcon,
    UserPlusIcon,
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
    createUser,
    getAuthInfo,
    getOwnedAccessRules,
    updateAccessRule,
    type AccessRuleSummary,
} from "@/features/auth/api";
import { purgeExpiredRecycleBin } from "@/features/recycle-bin/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/admin")({
    component: AdminToolsPage,
});

function AdminToolsPage() {
    const queryClient = useQueryClient();

    const authInfoQuery = useQuery({
        queryKey: queryKeys.authInfo,
        queryFn: getAuthInfo,
    });
    const accessRulesQuery = useQuery({
        queryKey: queryKeys.accessRules,
        queryFn: getOwnedAccessRules,
    });

    const [createUserResult, setCreateUserResult] = useState<string | null>(null);
    const [accessRuleResult, setAccessRuleResult] = useState<string | null>(null);
    const [purgeResult, setPurgeResult] = useState<string | null>(null);

    const [createUserPending, setCreateUserPending] = useState(false);
    const [accessRulePending, setAccessRulePending] = useState(false);
    const [purgePending, setPurgePending] = useState(false);

    const [editingRule, setEditingRule] = useState<AccessRuleSummary | null>(null);
    const [editRuleResult, setEditRuleResult] = useState<string | null>(null);
    const [editRulePending, setEditRulePending] = useState(false);

    const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCreateUserResult(null);
        setCreateUserPending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const user = await createUser({
                username: String(formData.get("username") ?? ""),
                password: String(formData.get("password") ?? ""),
                firstName: String(formData.get("firstName") ?? "") || undefined,
                lastName: String(formData.get("lastName") ?? "") || undefined,
            });

            setCreateUserResult(`Created user ${user.username} (${user.id}).`);
            event.currentTarget.reset();
        } catch (error) {
            setCreateUserResult(getErrorMessage(error));
        } finally {
            setCreateUserPending(false);
        }
    };

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
        if (!editingRule) return;

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

    const handlePurgeExpired = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPurgeResult(null);
        setPurgePending(true);

        const formData = new FormData(event.currentTarget);
        const olderThanDaysValue = String(formData.get("olderThanDays") ?? "").trim();

        try {
            const result = await purgeExpiredRecycleBin({
                olderThanDays: olderThanDaysValue ? Number(olderThanDaysValue) : undefined,
            });

            setPurgeResult(`Purged ${result.purgedFiles} file(s) and ${result.purgedFolders} folder(s).`);
            event.currentTarget.reset();
        } catch (error) {
            setPurgeResult(getErrorMessage(error));
        } finally {
            setPurgePending(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Admin"
                description="Server administration and management"
                icon={<WrenchScrewdriverIcon />}
            />

            {/* Current user info */}
            <div className="border-border bg-surface mb-5 rounded-xl border px-5 py-3.5">
                {authInfoQuery.isPending ? (
                    <p className="text-text-muted text-sm">Loading current user info...</p>
                ) : null}
                {authInfoQuery.error ? (
                    <p className="text-danger text-sm">{getErrorMessage(authInfoQuery.error)}</p>
                ) : null}
                {authInfoQuery.data ? (
                    <div className="flex items-center gap-3">
                        <span className="text-text-muted text-sm">Signed in as</span>
                        <span className="text-text text-sm font-semibold">{authInfoQuery.data.username}</span>
                        <Badge variant={authInfoQuery.data.role === "ADMIN" ? "accent" : "default"}>
                            {authInfoQuery.data.role}
                        </Badge>
                    </div>
                ) : null}
            </div>

            {/* Create User + Create Access Rule */}
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
                <form
                    className="border-border bg-surface space-y-4 rounded-xl border p-5"
                    onSubmit={(event) => void handleCreateUser(event)}
                >
                    <div className="flex items-center gap-2.5">
                        <UserPlusIcon className="text-accent h-6 w-6" />
                        <h2 className="text-text text-base font-semibold">Create User</h2>
                    </div>

                    <Input name="username" label="Username" required minLength={3} placeholder="e.g. johndoe" />
                    <Input
                        name="password"
                        label="Password"
                        type="password"
                        required
                        minLength={8}
                        placeholder="Min 8 characters"
                    />
                    <Input name="firstName" label="First Name (optional)" placeholder="John" />
                    <Input name="lastName" label="Last Name (optional)" placeholder="Doe" />

                    {createUserResult ? <ResultMessage message={createUserResult} /> : null}

                    <Button type="submit" loading={createUserPending} className="w-full">
                        <PlusIcon className="h-5 w-5" />
                        Create User
                    </Button>
                </form>

                <form
                    className="border-border bg-surface space-y-4 rounded-xl border p-5"
                    onSubmit={(event) => void handleCreateAccessRule(event)}
                >
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

                    <Button type="submit" loading={accessRulePending} className="w-full">
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

            {/* Purge Expired Recycle Bin Items */}
            <div className="border-border bg-surface rounded-xl border p-5">
                <form className="space-y-4" onSubmit={(event) => void handlePurgeExpired(event)}>
                    <div className="flex items-center gap-2.5">
                        <TrashIcon className="text-danger h-6 w-6" />
                        <h2 className="text-text text-base font-semibold">Purge Expired Recycle Bin Items</h2>
                    </div>
                    <p className="text-text-muted text-sm">
                        Permanently remove expired recycle-bin files and folders from storage.
                    </p>

                    <Input
                        name="olderThanDays"
                        label="Older Than Days (optional)"
                        type="number"
                        min={1}
                        placeholder="Leave empty for server default"
                    />

                    {purgeResult ? <ResultMessage message={purgeResult} /> : null}

                    <Button type="submit" variant="danger" loading={purgePending}>
                        <TrashIcon className="h-5 w-5" />
                        Purge Expired
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
        </div>
    );
}

function ResultMessage({ message }: { message: string }) {
    return (
        <div className="bg-surface-raised rounded-lg px-4 py-2.5">
            <p className="text-text-muted text-sm">{message}</p>
        </div>
    );
}
