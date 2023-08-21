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

                                if (newSession) {
                                    setSession(newSession);
                                }
                            }
                        })
                        .catch((error) => {
                            console.log(error);
                        });
                },
                ms("15m") - ms("10s"),
            );

            return () => clearInterval(refetchIntervalTimer);
        }
    }, [session]);

    const value = useMemo(
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

                    if (newSession) {
                        setSession(newSession);
                    }

                    return newSession;
                } catch (error) {}
            },
        }),
        [session],
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function refreshTokenValid() {
    axios
        .get(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/verify-refresh-token`, {
            withCredentials: true,
        })
        .then((response) => {
            if (response.status === 200) {
                return true;
            } else {
                return false;
            }
        })
        .catch((error) => {
            return false;
        });
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
