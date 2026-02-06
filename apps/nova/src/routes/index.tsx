import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSessionSafe } from "@/features/auth/api";

export const Route = createFileRoute("/")({
    beforeLoad: async () => {
        const session = await getSessionSafe();

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
