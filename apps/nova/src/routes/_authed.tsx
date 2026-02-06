import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";

import { AppShell, Sidebar } from "@/components/layout/app-shell";
import { useToast } from "@/components/ui/toast";
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
    const { addToast } = useToast();

    const handleSignOut = async () => {
        try {
            await signOut();
            await queryClient.invalidateQueries({ queryKey: queryKeys.session });
            router.history.push("/login");
        } catch (error) {
            addToast(getErrorMessage(error), "error");
        }
    };

    return (
        <AppShell sidebar={<Sidebar session={session} onSignOut={() => void handleSignOut()} />}>
            <Outlet />
        </AppShell>
    );
}
