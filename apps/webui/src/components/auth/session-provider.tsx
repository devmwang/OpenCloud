"use client";

import { useState, useEffect, useMemo, useRef, createContext } from "react";
import axios from "axios";
import * as z from "zod";
import ms from "ms";

import { env } from "@/env/env.mjs";

type SessionType = {
    user: {
        id: string;
        username: string;
        rootFolderId: string;
        firstName: string | null;
        lastName: string | null;
    };
    accessTokenExpires: Date;
    refreshTokenExpires: Date;
};

type SessionContextType = {
    session: SessionType | undefined;
    authenticated: boolean;
    update: (
        data?: any,
    ) => Promise<{ status: "success"; sessionData: SessionType } | { status: "error"; error: unknown }>;
};

export const SessionContext = createContext<SessionContextType>({
    session: undefined,
    authenticated: false,
    update: async () => {
        return { status: "error", error: "SessionContext not initialized" };
    },
});
export function SessionProvider({ children }: { children: React.ReactNode }) {
    const firstLoad = useRef(true);
    const [session, setSession] = useState<SessionType | undefined>(undefined);
    const [authenticated, setAuthenticated] = useState<boolean>(false);

    const contextValue = useMemo(
        () => ({
            session: session,
            authenticated: authenticated,
            update: async (): Promise<
                { status: "success"; sessionData: SessionType } | { status: "error"; error: unknown }
            > => {
                try {
                    const response = await axios.get(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/session`, {
                        withCredentials: true,
                    });

                    const parsedResponse = getSessionDetailsSchema.safeParse(response.data);

                    if (parsedResponse.success === false) return { status: "error", error: parsedResponse.error };

                    const newSession: SessionType = {
                        user: parsedResponse.data.user,
                        accessTokenExpires: new Date(parsedResponse.data.accessTokenExpires),
                        refreshTokenExpires: new Date(parsedResponse.data.refreshTokenExpires),
                    };

                    if (newSession) {
                        setSession(newSession);
                        setAuthenticated(true);
                    }

                    return { status: "success", sessionData: newSession };
                } catch (error) {
                    return { status: "error", error: error };
                }
            },
        }),
        [session],
    );

    useEffect(() => {
        if (firstLoad.current) {
            firstLoad.current = false;

            contextValue.update().then((initialStatus) => {
                if (initialStatus.status === "success") return;

                // Try updating every 5 seconds until successful
                const updateIntervalTimer = setInterval(async () => {
                    contextValue.update().then((updateStatus) => {
                        if (updateStatus.status === "success") {
                            clearInterval(updateIntervalTimer);
                            return;
                        }
                    });
                }, ms("5s"));
            });
        }
    }, []);

    // Token refresh system
    useEffect(() => {
        if (authenticated && session) {
            // Refetch 10 seconds prior to expiry
            const refetchIntervalTimer = setInterval(
                async () => {
                    try {
                        const response = await axios.get(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/refresh`, {
                            withCredentials: true,
                        });

                        if (response.status === 200) {
                            const parsedResponse = refreshSessionSchema.safeParse(response.data);

                            if (parsedResponse.success === false) return;

                            const newSession = {
                                user: session.user,
                                accessTokenExpires: new Date(parsedResponse.data.accessTokenExpires),
                                refreshTokenExpires: new Date(parsedResponse.data.refreshTokenExpires),
                            };

                            if (newSession) {
                                setSession(newSession);
                            }
                        }
                    } catch (error) {
                        console.log(error);

                        // Failed to refresh, so clear session
                        setSession(undefined);
                    }
                },
                ms("15m") - ms("10s"),
            );

            return () => {
                clearInterval(refetchIntervalTimer);
            };
        }
    }, [authenticated]);

    return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>;
}

const getSessionDetailsSchema = z.object({
    user: z.object({
        id: z.string(),
        username: z.string(),
        rootFolderId: z.string(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
    }),
    accessTokenExpires: z.string().datetime(),
    refreshTokenExpires: z.string().datetime(),
});

const refreshSessionSchema = z.object({
    accessTokenExpires: z.string().datetime(),
    refreshTokenExpires: z.string().datetime(),
});
