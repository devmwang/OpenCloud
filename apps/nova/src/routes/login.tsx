import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSessionSafeCached, signInWithUsername } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

const loginSearchSchema = z.object({
    next: z.string().optional(),
});

const sanitizeNextPath = (next: string | undefined) => {
    if (!next) {
        return undefined;
    }

    if (!next.startsWith("/") || next.startsWith("//")) {
        return undefined;
    }

    return next;
};

export const Route = createFileRoute("/login")({
    validateSearch: loginSearchSchema,
    beforeLoad: async ({ context }) => {
        const session = await getSessionSafeCached(context.queryClient);

        if (session?.user.rootFolderId) {
            throw redirect({
                to: "/folder/$folderId",
                params: { folderId: session.user.rootFolderId },
            });
        }
    },
    component: LoginPage,
});

function LoginPage() {
    const search = Route.useSearch();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        setPending(true);
        setError(null);

        try {
            const signInResult = await signInWithUsername(username, password);
            if (!signInResult.success) {
                setError(signInResult.error);
                return;
            }

            await queryClient.invalidateQueries({ queryKey: queryKeys.session });

            const session = await getSessionSafeCached(queryClient);
            if (!session?.user.rootFolderId) {
                setError("Could not load session after login.");
                return;
            }

            const nextPath = sanitizeNextPath(search.next);
            if (nextPath) {
                router.history.push(nextPath);
                return;
            }

            await router.navigate({
                to: "/folder/$folderId",
                params: { folderId: session.user.rootFolderId },
            });
        } catch (submitError) {
            setError(getErrorMessage(submitError));
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center p-6">
            {/* Background glow */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="bg-accent/[0.06] absolute top-1/2 left-1/2 h-[750px] w-[750px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]" />
            </div>

            <div className="relative w-full max-w-[520px]">
                {/* Card */}
                <div className="border-border-bright bg-surface/80 space-y-5 rounded-2xl border p-7 shadow-2xl shadow-black/40 backdrop-blur-xl">
                    {/* Header */}
                    <div className="space-y-3 text-center">
                        <div className="bg-accent/20 mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg">
                            <div className="bg-accent h-4 w-4 rounded-full shadow-[0_0_12px_var(--color-accent)]" />
                        </div>
                        <h1 className="text-text text-2xl font-semibold tracking-tight">OpenCloud</h1>
                        <p className="text-text-muted text-sm">Sign in to continue</p>
                    </div>

                    {/* Form */}
                    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
                        <Input
                            label="Username"
                            type="text"
                            autoComplete="username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="Enter your username"
                            required
                        />

                        <Input
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Enter your password"
                            required
                        />

                        {error ? (
                            <div className="border-danger/30 bg-danger-glow text-danger animate-[slide-up_150ms_ease-out] rounded-lg border px-4 py-3 text-sm">
                                {error}
                            </div>
                        ) : null}

                        <Button type="submit" loading={pending} className="w-full" size="lg">
                            {pending ? "Signing in..." : "Sign In"}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
