import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { getSessionSafe, signInWithUsername } from "@/features/auth/api";
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
    beforeLoad: async () => {
        const session = await getSessionSafe();

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

            const session = await getSessionSafe();
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
        <main>
            <section className="card stack" style={{ maxWidth: "460px", margin: "5rem auto" }}>
                <h1>OpenCloud Nova</h1>
                <p className="muted">Sign in with your existing OpenCloud account.</p>

                <form className="stack" onSubmit={handleSubmit}>
                    <label className="stack">
                        <span>Username</span>
                        <input
                            type="text"
                            autoComplete="username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            required
                        />
                    </label>

                    <label className="stack">
                        <span>Password</span>
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                    </label>

                    {error ? <p style={{ color: "#af1b2d", margin: 0 }}>{error}</p> : null}

                    <div className="row">
                        <button type="submit" disabled={pending}>
                            {pending ? "Signing in..." : "Sign In"}
                        </button>
                    </div>
                </form>
            </section>
        </main>
    );
}
