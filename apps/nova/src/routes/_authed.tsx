import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";

import { getSessionSafe, signOut } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed")({
    ssr: false,
    beforeLoad: async ({ location }) => {
        const session = await getSessionSafe();

        if (!session?.user.rootFolderId) {
            throw redirect({
                to: "/login",
                search: {
                    next: location.href,
                },
            });
        }

        return { session };
    },
    component: AuthedLayout,
});

function AuthedLayout() {
    const { session } = Route.useRouteContext();

    const router = useRouter();
    const queryClient = useQueryClient();

    const handleSignOut = async () => {
        try {
            await signOut();
            await queryClient.invalidateQueries({ queryKey: queryKeys.session });
            router.history.push("/login");
        } catch (error) {
            window.alert(getErrorMessage(error));
        }
    };

    return (
        <>
            <header style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                <main
                    className="row"
                    style={{ justifyContent: "space-between", paddingTop: "0.9rem", paddingBottom: "0.9rem" }}
                >
                    <div className="row">
                        <strong>OpenCloud Nova</strong>
                        <Link to="/folder/$folderId" params={{ folderId: session.user.rootFolderId }}>
                            Files
                        </Link>
                        <Link to="/profile">Profile</Link>
                        <Link to="/admin">Admin</Link>
                        <Link to="/tools">Tools</Link>
                    </div>

                    <div className="row">
                        <span className="muted">{session.user.username}</span>
                        <button type="button" className="secondary" onClick={() => void handleSignOut()}>
                            Sign Out
                        </button>
                    </div>
                </main>
            </header>

            <Outlet />
        </>
    );
}
