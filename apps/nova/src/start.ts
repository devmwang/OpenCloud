import { createStart } from "@tanstack/react-start";

import { botFileProxyMiddleware, requestContextMiddleware } from "@/global-middleware";

export const startInstance = createStart(() => ({
    requestMiddleware: [requestContextMiddleware, botFileProxyMiddleware],
}));
