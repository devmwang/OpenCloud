import { createStart } from "@tanstack/react-start";

import { agentFileRedirectMiddleware, requestContextMiddleware } from "@/global-middleware";

export const startInstance = createStart(() => ({
    requestMiddleware: [requestContextMiddleware, agentFileRedirectMiddleware],
}));
