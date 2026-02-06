import { QueryClient } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

const createQueryClient = () => {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    });
};

export const getQueryClient = () => {
    if (import.meta.env.SSR) {
        return createQueryClient();
    }

    if (!browserQueryClient) {
        browserQueryClient = createQueryClient();
    }

    return browserQueryClient;
};
