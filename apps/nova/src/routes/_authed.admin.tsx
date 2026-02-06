import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { createAccessRule, createUser, getAuthInfo, getOwnedAccessRules } from "@/features/auth/api";
import { purgeDeletedFiles } from "@/features/files/api";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/admin")({
    component: AdminToolsPage,
});

function AdminToolsPage() {
    const queryClient = useQueryClient();

    const authInfoQuery = useQuery({
        queryKey: queryKeys.authInfo,
        queryFn: getAuthInfo,
    });
    const accessRulesQuery = useQuery({
        queryKey: queryKeys.accessRules,
        queryFn: getOwnedAccessRules,
    });

    const [createUserResult, setCreateUserResult] = useState<string | null>(null);
    const [accessRuleResult, setAccessRuleResult] = useState<string | null>(null);
    const [purgeResult, setPurgeResult] = useState<string | null>(null);

    const [createUserPending, setCreateUserPending] = useState(false);
    const [accessRulePending, setAccessRulePending] = useState(false);
    const [purgePending, setPurgePending] = useState(false);

    const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCreateUserResult(null);
        setCreateUserPending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const user = await createUser({
                username: String(formData.get("username") ?? ""),
                password: String(formData.get("password") ?? ""),
                firstName: String(formData.get("firstName") ?? "") || undefined,
                lastName: String(formData.get("lastName") ?? "") || undefined,
            });

            setCreateUserResult(`Created user ${user.username} (${user.id}).`);
            event.currentTarget.reset();
        } catch (error) {
            setCreateUserResult(getErrorMessage(error));
        } finally {
            setCreateUserPending(false);
        }
    };

    const handleCreateAccessRule = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAccessRuleResult(null);
        setAccessRulePending(true);

        const formData = new FormData(event.currentTarget);

        try {
            const result = await createAccessRule({
                name: String(formData.get("name") ?? ""),
                type: String(formData.get("type") ?? "ALLOW") as "ALLOW" | "DISALLOW",
                method: "IP_ADDRESS",
                match: String(formData.get("match") ?? ""),
            });

            setAccessRuleResult(result.message);
            await queryClient.invalidateQueries({ queryKey: queryKeys.accessRules });
            event.currentTarget.reset();
        } catch (error) {
            setAccessRuleResult(getErrorMessage(error));
        } finally {
            setAccessRulePending(false);
        }
    };

    const handlePurgeDeleted = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPurgeResult(null);
        setPurgePending(true);

        const formData = new FormData(event.currentTarget);
        const olderThanDaysValue = String(formData.get("olderThanDays") ?? "").trim();

        try {
            const result = await purgeDeletedFiles({
                olderThanDays: olderThanDaysValue ? Number(olderThanDaysValue) : undefined,
            });

            setPurgeResult(`Purged ${result.purged} file(s).`);
            event.currentTarget.reset();
        } catch (error) {
            setPurgeResult(getErrorMessage(error));
        } finally {
            setPurgePending(false);
        }
    };

    return (
        <main className="stack">
            <section className="card stack">
                <h1>Admin</h1>
                <p className="muted">Minimal admin tooling mapped to server endpoints.</p>

                {authInfoQuery.isPending ? <p className="muted">Loading current user info...</p> : null}
                {authInfoQuery.error ? (
                    <p style={{ color: "#af1b2d" }}>{getErrorMessage(authInfoQuery.error)}</p>
                ) : null}
                {authInfoQuery.data ? (
                    <p>
                        Current user: <strong>{authInfoQuery.data.username}</strong> ({authInfoQuery.data.role})
                    </p>
                ) : null}
            </section>

            <section className="two grid">
                <form className="card stack" onSubmit={(event) => void handleCreateUser(event)}>
                    <h2>Create User</h2>
                    <label className="stack">
                        <span>Username</span>
                        <input name="username" required minLength={3} />
                    </label>
                    <label className="stack">
                        <span>Password</span>
                        <input name="password" type="password" required minLength={8} />
                    </label>
                    <label className="stack">
                        <span>First Name (optional)</span>
                        <input name="firstName" />
                    </label>
                    <label className="stack">
                        <span>Last Name (optional)</span>
                        <input name="lastName" />
                    </label>

                    {createUserResult ? <p className="muted">{createUserResult}</p> : null}
                    <button type="submit" disabled={createUserPending}>
                        {createUserPending ? "Creating..." : "Create User"}
                    </button>
                </form>

                <form className="card stack" onSubmit={(event) => void handleCreateAccessRule(event)}>
                    <h2>Create Access Rule</h2>
                    <label className="stack">
                        <span>Rule Name</span>
                        <input name="name" required />
                    </label>
                    <label className="stack">
                        <span>Rule Type</span>
                        <select name="type" defaultValue="ALLOW">
                            <option value="ALLOW">ALLOW</option>
                            <option value="DISALLOW">DISALLOW</option>
                        </select>
                    </label>
                    <label className="stack">
                        <span>IP or CIDR Match</span>
                        <input name="match" required placeholder="203.0.113.0/24" />
                    </label>

                    {accessRuleResult ? <p className="muted">{accessRuleResult}</p> : null}
                    <button type="submit" disabled={accessRulePending}>
                        {accessRulePending ? "Creating..." : "Create Access Rule"}
                    </button>
                </form>
            </section>

            <section className="card stack">
                <h2>Your Access Rules</h2>
                <p className="muted">Rules owned by the currently signed-in user.</p>

                {accessRulesQuery.isPending ? <p className="muted">Loading access rules...</p> : null}
                {accessRulesQuery.error ? (
                    <p style={{ color: "#af1b2d" }}>{getErrorMessage(accessRulesQuery.error)}</p>
                ) : null}
                {accessRulesQuery.data && accessRulesQuery.data.length === 0 ? (
                    <p className="muted">No access rules found.</p>
                ) : null}
                {accessRulesQuery.data && accessRulesQuery.data.length > 0 ? (
                    <ul className="list list-top">
                        {accessRulesQuery.data.map((rule) => (
                            <li className="stack list-item" key={rule.id}>
                                <div className="row" style={{ justifyContent: "space-between" }}>
                                    <strong>{rule.name}</strong>
                                    <span className="muted">
                                        {rule.type} {rule.method}
                                    </span>
                                </div>
                                <code>{rule.match}</code>
                                <small className="muted">ID: {rule.id}</small>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>

            <section className="card stack">
                <form className="stack" onSubmit={(event) => void handlePurgeDeleted(event)}>
                    <h2>Purge Deleted Files</h2>
                    <label className="stack">
                        <span>Older Than Days (optional)</span>
                        <input
                            name="olderThanDays"
                            type="number"
                            min={1}
                            placeholder="Leave empty for server default"
                        />
                    </label>

                    {purgeResult ? <p className="muted">{purgeResult}</p> : null}
                    <div className="row">
                        <button type="submit" className="danger" disabled={purgePending}>
                            {purgePending ? "Purging..." : "Purge"}
                        </button>
                    </div>
                </form>
            </section>
        </main>
    );
}
