import { getGlobalStartContext } from "@tanstack/react-start";

import { getCanonicalBaseUrl } from "@/env";
import type { NovaRequestContext } from "@/global-middleware";

export const resolveCanonicalBaseUrl = () => {
    const configured = getCanonicalBaseUrl();
    if (configured) {
        return configured;
    }

    if (import.meta.env.SSR) {
        const context = getGlobalStartContext() as NovaRequestContext | undefined;
        if (context?.requestOrigin) {
            return context.requestOrigin;
        }
    }

    if (typeof window !== "undefined") {
        return window.location.origin;
    }

    return undefined;
};
