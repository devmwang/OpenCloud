"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useContext, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { authClient } from "@/components/auth/auth-client";
import { SessionContext } from "@/components/auth/session-provider";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-full min-h-screen w-full items-center justify-center">
                    <span className="text-lg text-zinc-600 dark:text-zinc-300">Loading login…</span>
                </div>
            }
        >
            <LoginForm />
        </Suspense>
    );
}

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const sessionContext = useContext(SessionContext);

    const [attemptingLogin, setAttemptingLogin] = useState(false);
    const [loginError, setLoginError] = useState("");

    const loginForm = useForm<z.infer<typeof loginSchema>>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    });

    function submitLoginForm(values: z.infer<typeof loginSchema>) {
        setAttemptingLogin(true);
        setLoginError("");

        authClient.signIn
            .username({ username: values.username, password: values.password })
            .then(async (result) => {
                if (result.error) {
                    setAttemptingLogin(false);
                    setLoginError(result.error.message ?? "Invalid username or password");
                    return;
                }

                const sessionResult = await sessionContext.update();
                const rootFolderId =
                    sessionResult.status === "success" ? sessionResult.sessionData.user.rootFolderId : undefined;
                const nextUrl = searchParams.get("next") ?? (rootFolderId ? `/folder/${rootFolderId}` : "/");
                router.push(nextUrl as Route);
                router.refresh();
            })
            .catch((error) => {
                setAttemptingLogin(false);
                setLoginError(error?.message ?? "Login failed");
            });
    }

    return (
        <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center">
            <div className="mb-4 text-3xl font-bold">Log in to OpenCloud</div>
            {loginError && (
                <div className="mb-2">
                    <span className="text-lg font-medium text-red-500 dark:text-red-800">{loginError}</span>
                </div>
            )}
            <div className="w-full max-w-xs">
                <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(submitLoginForm)} className="space-y-3.5">
                        <FormField
                            control={loginForm.control}
                            name="username"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <input
                                            {...field}
                                            value={field.value ?? ""}
                                            type="text"
                                            id="username"
                                            placeholder="Username"
                                            className="h-10 w-full rounded-md border border-zinc-700 bg-transparent px-2 py-1 text-xl ring-offset-zinc-50 placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-700 focus-visible:ring-offset-2 focus-visible:outline-none dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-200"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={loginForm.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <input
                                            {...field}
                                            value={field.value ?? ""}
                                            type="password"
                                            id="password"
                                            placeholder="Password"
                                            className="h-10 w-full rounded-md border border-zinc-700 bg-transparent px-2 py-1 text-xl ring-offset-zinc-50 placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-700 focus-visible:ring-offset-2 focus-visible:outline-none dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-200"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <button
                            disabled={attemptingLogin}
                            type="submit"
                            className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-2 py-2 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-75 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        >
                            <span className="text-xl font-semibold whitespace-nowrap text-zinc-50">Login</span>
                        </button>
                    </form>
                </Form>
            </div>
        </div>
    );
}

const loginSchema = z.object({
    username: z
        .string()
        .min(1, { message: "Username is required" })
        .min(3, { message: "Username must be at least 3 characters long" }),
    password: z
        .string()
        .min(1, { message: "Password is required" })
        .min(8, { message: "Password must be at least 8 characters long" }),
});
