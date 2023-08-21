"use client";

import { useState, useEffect, useMemo, createContext } from "react";
import axios from "axios";
import * as z from "zod";
import ms from "ms";

import { env } from "@/env/env.mjs";

interface SessionInterface {
    user: {
        id: string;
        username: string;
        rootFolderId: string;
        firstName: string | null;
        lastName: string | null;
    };
    accessTokenExpires: Date;
    refreshTokenExpires: Date;
}

type SessionContextType = {
    session: SessionInterface | undefined;
    update: (data?: any) => Promise<SessionInterface | undefined>;
};

export const SessionContext = createContext<SessionContextType>({
    session: undefined,
    update: async () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<SessionInterface | undefined>(undefined);

    const contextValue = useMemo(
        () => ({
            session: session,
            update: async () => {
                try {
                    const response = await axios.get(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/session`, {
                        withCredentials: true,
                    });

                    const parsedResponse = getSessionDetailsSchema.safeParse(response.data);

                    if (parsedResponse.success === false) return;

                    const newSession = {
                        user: parsedResponse.data.user,
                        accessTokenExpires: new Date(parsedResponse.data.accessTokenExpires),
                        refreshTokenExpires: new Date(parsedResponse.data.refreshTokenExpires),
                    };

                    // Update localStorage
                    localStorage.setItem("accessTokenExpires", parsedResponse.data.accessTokenExpires);
                    localStorage.setItem("refreshTokenExpires", parsedResponse.data.refreshTokenExpires);

                    if (newSession) {
                        setSession(newSession);
                    }

                    return newSession;
                } catch (error) {}
            },
        }),
        [session],
    );

    // Check for existing session in localStorage
    useEffect(() => {
        const accessTokenExpiresString = localStorage.getItem("accessTokenExpires");
        const refreshTokenExpiresString = localStorage.getItem("refreshTokenExpires");

        // Verify both token expiration times exist in localStorage
        if (!!accessTokenExpiresString && !!refreshTokenExpiresString) {
            const accessTokenExpires = new Date(accessTokenExpiresString);
            const refreshTokenExpires = new Date(refreshTokenExpiresString);

            // Verify both token expiration times are in the future
            if (accessTokenExpires > new Date() && refreshTokenExpires > new Date()) {
                // Get session details from server and set session
                contextValue.update();
                console.log("Session restored from localStorage");
            }
        }
    }, []);

    // Token refresh system
    useEffect(() => {
        if (session) {
            // Refetch 10 seconds prior to expiry
            const refetchIntervalTimer = setInterval(
                () => {
                    axios
                        .get(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/refresh`, {
                            withCredentials: true,
                        })
                        .then((response) => {
                            if (response.status === 200) {
                                const parsedResponse = refreshSessionSchema.safeParse(response.data);

                                if (parsedResponse.success === false) return;

                                const newSession = {
                                    user: session.user,
                                    accessTokenExpires: new Date(parsedResponse.data.accessTokenExpires),
                                    refreshTokenExpires: new Date(parsedResponse.data.refreshTokenExpires),
                                };

                                // Update localStorage
                                localStorage.setItem("accessTokenExpires", parsedResponse.data.accessTokenExpires);
                                localStorage.setItem("refreshTokenExpires", parsedResponse.data.refreshTokenExpires);

                                if (newSession) {
                                    setSession(newSession);
                                }
                            }
                        })
                        .catch((error) => {
                            console.log(error);

                            // Failed to refresh, so clear session
                            setSession(undefined);
                        });
                },
                ms("15m") - ms("10s"),
            );

            return () => clearInterval(refetchIntervalTimer);
        }
    }, [session]);

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
