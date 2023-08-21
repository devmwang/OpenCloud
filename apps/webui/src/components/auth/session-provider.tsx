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
    expires: Date;
}

type SessionContextType =
    | {
          update: (data?: any) => Promise<SessionInterface | undefined>;
          session: SessionInterface;
          status: "authenticated";
      }
    | {
          update: (data?: any) => Promise<SessionInterface | undefined>;
          session: null;
          status: "loading" | "unauthenticated";
      };

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<SessionInterface | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Refetch 10 seconds prior to expiry
        const refetchIntervalTimer = setInterval(
            () => {
                axios
                    .get(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/refresh`, {
                        withCredentials: true,
                    })
                    .then((response) => {
                        if (response.status === 200) {
                            setSession(response.data);
                        }
                        console.error(response);
                    })
                    .catch((error) => {
                        console.error(error);
                    });
            },
            ms("15m") - ms("10s"),
        );

        return () => clearInterval(refetchIntervalTimer);
    }, []);

    const value = useMemo(
        () => ({
            session: session,
            status: loading ? "loading" : session ? "authenticated" : "unauthenticated",
            update: async () => {
                if (loading || !session) return;

                setLoading(true);

                try {
                    const response = await axios.get(`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/auth/session`, {
                        withCredentials: true,
                    });

                    const parsedResponse = getSessionDetailsSchema.safeParse(response.data);

                    if (parsedResponse.success === false) return;

                    const newSession = {
                        user: parsedResponse.data.user,
                        expires: new Date(parsedResponse.data.expires),
                    };

                    if (newSession) {
                        setSession(newSession);
                    }

                    return newSession;
                } catch (error) {}

                setLoading(false);
            },
        }),
        [session, loading],
    );

    value.update();

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
    expires: z.string().datetime(),
});
