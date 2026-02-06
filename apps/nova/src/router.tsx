import { createRouteMask, createRouter as createTanStackRouter } from "@tanstack/react-router";

import { getQueryClient } from "@/lib/query-client";

import { routeTree } from "./routeTree.gen";

const folderFileModalMask = createRouteMask({
    routeTree,
    from: "/folder/$folderId/file/$fileId/modal",
    to: "/file/$fileId",
    params: (prev) => ({ fileId: prev.fileId }),
});

const createRouterInstance = () => {
    const queryClient = getQueryClient();

    return createTanStackRouter({
        routeTree,
        context: {
            queryClient,
        },
        defaultPreload: "intent",
        defaultStructuralSharing: true,
        routeMasks: [folderFileModalMask],
        scrollRestoration: true,
    });
};

let clientRouter: ReturnType<typeof createRouterInstance> | undefined;

export const getRouter = () => {
    if (import.meta.env.SSR) {
        return createRouterInstance();
    }

    if (!clientRouter) {
        clientRouter = createRouterInstance();
    }

    return clientRouter;
};
