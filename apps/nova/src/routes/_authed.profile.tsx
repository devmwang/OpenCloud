import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { getAuthInfo } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/profile")({
    component: ProfilePage,
});

function ProfilePage() {
    const authInfoQuery = useQuery({
        queryKey: queryKeys.authInfo,
        queryFn: getAuthInfo,
    });

    return (
        <main className="stack">
            <section className="card stack">
                <h1>Profile</h1>
                <p className="muted">User info from `/v1/auth/info`.</p>

                {authInfoQuery.isPending ? <p className="muted">Loading profile...</p> : null}

                {authInfoQuery.error ? (
                    <p style={{ color: "#af1b2d" }}>{getErrorMessage(authInfoQuery.error)}</p>
                ) : null}

                {authInfoQuery.data ? (
                    <div className="two grid">
                        <div className="card stack">
                            <strong>Identity</strong>
                            <span>ID: {authInfoQuery.data.id}</span>
                            <span>Username: {authInfoQuery.data.username}</span>
                            <span>Role: {authInfoQuery.data.role}</span>
                        </div>

                        <div className="card stack">
                            <strong>Folders</strong>
                            <span>Root Folder ID: {authInfoQuery.data.rootFolderId}</span>
                            <span>First Name: {authInfoQuery.data.firstName ?? "-"}</span>
                            <span>Last Name: {authInfoQuery.data.lastName ?? "-"}</span>
                        </div>
                    </div>
                ) : null}
            </section>
        </main>
    );
}
