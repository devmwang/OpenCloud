import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";

import "@/styles.css";

type RouterContext = {
    queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
            { title: "OpenCloud Nova" },
            { name: "description", content: "OpenCloud Nova frontend" },
        ],
        links: [{ rel: "icon", href: "/OpenCloud-Circle.svg" }],
    }),
    component: RootComponent,
    notFoundComponent: RootNotFound,
    errorComponent: RootError,
});

function RootComponent() {
    const router = useRouter();
    const queryClient = router.options.context.queryClient;

    return (
        <RootDocument>
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <Outlet />
                </ToastProvider>
            </QueryClientProvider>
        </RootDocument>
    );
}

function RootError(props: { error: unknown; reset: () => void }) {
    const message = props.error instanceof Error ? props.error.message : "Unexpected error";

    return (
        <RootDocument>
            <div className="flex min-h-screen items-center justify-center p-4">
                <div className="border-border bg-surface w-full max-w-md space-y-4 rounded-xl border p-8 text-center">
                    <div className="border-warning/20 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-[rgba(245,158,11,0.15)]">
                        <svg
                            className="text-warning h-7 w-7"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-text text-lg font-semibold">Something went wrong</h1>
                        <p className="text-text-muted mt-1 text-sm">{message}</p>
                    </div>
                    <Button variant="secondary" onClick={props.reset}>
                        Try Again
                    </Button>
                </div>
            </div>
        </RootDocument>
    );
}

function RootNotFound() {
    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="border-border bg-surface w-full max-w-md space-y-4 rounded-xl border p-8 text-center">
                <p className="text-text-dim text-5xl font-bold">404</p>
                <div>
                    <h1 className="text-text text-lg font-semibold">Page not found</h1>
                    <p className="text-text-muted mt-1 text-sm">The resource you requested does not exist.</p>
                </div>
                <Button variant="primary" onClick={() => (window.location.href = "/")}>
                    Go to Files
                </Button>
            </div>
        </div>
    );
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                {children}
                <Scripts />
            </body>
        </html>
    );
}
