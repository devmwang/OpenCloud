"use client";

import { createContext, useCallback, useMemo, type ReactNode } from "react";

import { authClient } from "@/components/auth/auth-client";

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
    update: () => Promise<{ status: "success"; sessionData: SessionType } | { status: "error"; error: unknown }>;
};

type BetterAuthSessionQuery = ReturnType<typeof authClient.useSession>;
type BetterAuthSessionData = BetterAuthSessionQuery["data"];
type BetterAuthSessionInput = BetterAuthSessionData | null | undefined;
type UpdateResult = { status: "success"; sessionData: SessionType } | { status: "error"; error: unknown };

const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

const mapBetterAuthSession = (data: BetterAuthSessionInput): SessionType | undefined => {
    if (!data || !("session" in data) || !data.session || !data.user) {
        return undefined;
    }

    const rootFolderId = data.user.rootFolderId;
    const username = data.user.username;

    if (!rootFolderId || !username) {
        return undefined;
    }

    return {
        user: {
            id: data.user.id,
            username,
            rootFolderId,
            firstName: data.user.firstName ?? null,
            lastName: data.user.lastName ?? null,
        },
        accessTokenExpires: toDate(data.session.expiresAt),
        refreshTokenExpires: toDate(data.session.expiresAt),
    };
};

export const SessionContext = createContext<SessionContextType>({
    session: undefined,
    authenticated: false,
    update: async () => {
        return { status: "error", error: "SessionContext not initialized" };
    },
});

export function SessionProvider({ children }: { children: ReactNode }) {
    const sessionQuery = authClient.useSession();
    const session = useMemo(() => mapBetterAuthSession(sessionQuery.data), [sessionQuery.data]);
    const authenticated = Boolean(session);

    const update = useCallback(async (): Promise<UpdateResult> => {
        try {
            await sessionQuery.refetch();
            const sessionAtom = authClient.$store.atoms.session;
            const snapshot = sessionAtom ? sessionAtom.get() : undefined;
            const refreshed = mapBetterAuthSession(snapshot?.data ?? sessionQuery.data);

            if (!refreshed) {
                return { status: "error", error: snapshot?.error ?? sessionQuery.error ?? "Invalid session" };
            }

            return { status: "success", sessionData: refreshed };
        } catch (error) {
            return { status: "error", error };
        }
    }, [sessionQuery]);

    const contextValue = useMemo(
        () => ({
            session,
            authenticated,
            update,
        }),
        [authenticated, session, update],
    );

    return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>;
}
