import { z } from "zod";

import { getJson } from "@/lib/http";

const csrfResponseSchema = z.object({
    csrfToken: z.string(),
});

let csrfTokenCache: string | undefined;

export const getCsrfToken = async (forceRefresh = false) => {
    if (csrfTokenCache && !forceRefresh) {
        return csrfTokenCache;
    }

    const response = await getJson("/v1/csrf-token", csrfResponseSchema);
    csrfTokenCache = response.csrfToken;

    return response.csrfToken;
};

export const createCsrfHeaders = async () => {
    const csrfToken = await getCsrfToken();
    return {
        "x-csrf-token": csrfToken,
    };
};
