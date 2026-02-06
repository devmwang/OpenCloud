import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";

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
                <Outlet />
            </QueryClientProvider>
        </RootDocument>
    );
}

function RootError(props: { error: unknown; reset: () => void }) {
    const message = props.error instanceof Error ? props.error.message : "Unexpected error";

    return (
        <RootDocument>
            <main>
                <section className="card stack">
                    <h1>Something went wrong</h1>
                    <p className="muted">{message}</p>
                    <div className="row">
                        <button type="button" onClick={props.reset}>
                            Try again
                        </button>
                    </div>
                </section>
            </main>
        </RootDocument>
    );
}

function RootNotFound() {
    return (
        <main>
            <section className="card stack">
                <h1>Page not found</h1>
                <p className="muted">The resource you requested does not exist.</p>
            </section>
        </main>
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
