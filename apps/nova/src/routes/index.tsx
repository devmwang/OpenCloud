import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSessionSafeCached } from "@/features/auth/api";

export const Route = createFileRoute("/")({
    beforeLoad: async ({ context }) => {
        const session = await getSessionSafeCached(context.queryClient);

        if (session?.user.rootFolderId) {
            throw redirect({
                to: "/folder/$folderId",
                params: { folderId: session.user.rootFolderId },
            });
        }

        throw redirect({ to: "/login" });
    },
    component: () => null,
});
