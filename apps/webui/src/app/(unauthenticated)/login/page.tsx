"use client";

import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export default function LoginPage() {
    const loginForm = useForm<z.infer<typeof loginSchema>>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    });

    function submitLoginForm(values: z.infer<typeof loginSchema>) {
        console.log(values);
    }

    return (
        <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center ">
            <div className="mb-6 text-3xl font-bold">Log in to OpenCloud</div>
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
                                            type="text"
                                            id="username"
                                            placeholder="Username"
                                            className="h-10 w-full rounded-md border border-zinc-700 bg-transparent px-2 py-1 text-xl ring-offset-zinc-50 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700 focus-visible:ring-offset-2 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-200"
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
                                            type="password"
                                            id="password"
                                            placeholder="Password"
                                            className="h-10 w-full rounded-md border border-zinc-700 bg-transparent px-2 py-1 text-xl ring-offset-zinc-50 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700 focus-visible:ring-offset-2 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-200"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <button
                            type="submit"
                            className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-2 py-2 hover:bg-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        >
                            <span className="whitespace-nowrap text-xl font-semibold text-zinc-50">Login</span>
                        </button>
                    </form>
                </Form>
            </div>
        </div>
    );
}

const loginSchema = z.object({
    username: z
        .string({
            required_error: "Username is required",
            invalid_type_error: "Username must be a string",
        })
        .min(3, { message: "Username must be at least 3 characters long" }),
    password: z
        .string({
            required_error: "Password is required",
            invalid_type_error: "Password must be a string",
        })
        .min(8, { message: "Password must be at least 3 characters long" }),
});
