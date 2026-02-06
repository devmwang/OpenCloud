import { FolderIcon, ShieldCheckIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/page-header";
import { ErrorCard } from "@/components/shared/error-card";
import { LoadingState } from "@/components/shared/loading-state";
import { Badge } from "@/components/ui/badge";
import { getAuthInfo } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/profile")({
    component: ProfilePage,
});

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-text-muted shrink-0 text-sm">{label}</span>
            <span className="text-text truncate text-right text-sm font-medium">{value}</span>
        </div>
    );
}

function ProfilePage() {
    const authInfoQuery = useQuery({
        queryKey: queryKeys.authInfo,
        queryFn: getAuthInfo,
    });

    return (
        <div>
            <PageHeader title="Profile" description="Your account details" icon={<UserCircleIcon />} />

            {authInfoQuery.isPending ? <LoadingState message="Loading profile..." /> : null}

            {authInfoQuery.error ? (
                <ErrorCard
                    message={getErrorMessage(authInfoQuery.error)}
                    onRetry={() => void authInfoQuery.refetch()}
                />
            ) : null}

            {authInfoQuery.data ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Identity card */}
                    <div className="border-border bg-surface rounded-xl border p-5">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="bg-accent-glow border-accent/20 flex h-12 w-12 items-center justify-center rounded-full border">
                                <span className="text-accent text-lg font-bold">
                                    {authInfoQuery.data.username.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-text text-sm font-semibold">{authInfoQuery.data.username}</h3>
                                <Badge variant={authInfoQuery.data.role === "ADMIN" ? "accent" : "default"}>
                                    <ShieldCheckIcon className="mr-1 h-3 w-3" />
                                    {authInfoQuery.data.role}
                                </Badge>
                            </div>
                        </div>

                        <div className="border-border divide-border divide-y border-t">
                            <InfoRow label="User ID" value={authInfoQuery.data.id} />
                            <InfoRow label="Username" value={authInfoQuery.data.username} />
                            <InfoRow label="First Name" value={authInfoQuery.data.firstName ?? "\u2014"} />
                            <InfoRow label="Last Name" value={authInfoQuery.data.lastName ?? "\u2014"} />
                        </div>
                    </div>

                    {/* Storage card */}
                    <div className="border-border bg-surface rounded-xl border p-5">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="bg-surface-raised border-border flex h-10 w-10 items-center justify-center rounded-xl border">
                                <FolderIcon className="text-accent h-5 w-5" />
                            </div>
                            <h3 className="text-text text-sm font-semibold">Storage</h3>
                        </div>

                        <div className="border-border divide-border divide-y border-t">
                            <InfoRow label="Root Folder ID" value={authInfoQuery.data.rootFolderId} />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
