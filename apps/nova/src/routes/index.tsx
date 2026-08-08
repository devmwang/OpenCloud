import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSessionCached } from "@/features/auth/api";

export const Route = createFileRoute("/")({
    beforeLoad: async ({ context }) => {
        const session = await getSessionCached(context.queryClient);

        if (session) {
            throw redirect({
                to: "/folder/$folderId",
                params: { folderId: session.user.rootFolderId },
            });
        }

        throw redirect({ to: "/login" });
    },
    component: () => null,
});
