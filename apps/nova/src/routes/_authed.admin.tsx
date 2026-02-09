import { PlusIcon, TrashIcon, UserPlusIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUser, getAuthInfo } from "@/features/auth/api";
import { purgeExpiredRecycleBin } from "@/features/recycle-bin/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

const AUTH_INFO_GUARD_STALE_TIME_MS = 60_000;

export const Route = createFileRoute("/_authed/admin")({
    beforeLoad: async ({ context }) => {
        const authInfo = await context.queryClient.fetchQuery({
            queryKey: queryKeys.authInfo,
            queryFn: getAuthInfo,
            staleTime: AUTH_INFO_GUARD_STALE_TIME_MS,
        });

        if (authInfo.role !== "ADMIN") {
            throw redirect({
                to: "/folder/$folderId",
                params: { folderId: authInfo.rootFolderId },
            });
        }
    },
    component: AdminToolsPage,
});

function AdminToolsPage() {
    const authInfoQuery = useQuery({
        queryKey: queryKeys.authInfo,
        queryFn: getAuthInfo,
    });

    const [createUserResult, setCreateUserResult] = useState<string | null>(null);
    const [purgeResult, setPurgeResult] = useState<string | null>(null);

    const [createUserPending, setCreateUserPending] = useState(false);
    const [purgePending, setPurgePending] = useState(false);

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

            {/* Create User */}
            <div className="border-border bg-surface mb-5 rounded-xl border p-5">
                <form className="space-y-4" onSubmit={(event) => void handleCreateUser(event)}>
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

                    <Button type="submit" loading={createUserPending}>
                        <PlusIcon className="h-5 w-5" />
                        Create User
                    </Button>
                </form>
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
