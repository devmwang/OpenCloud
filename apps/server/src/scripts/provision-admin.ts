import * as argon2 from "argon2";
import { eq } from "drizzle-orm";

import { createDatabase } from "@/db";
import { users } from "@/db/schema/users";
import { createUserWithRootFolder } from "@/systems/auth/auth.utils";

type ProvisionArgs = {
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
    email?: string;
};

const printUsage = () => {
    console.log("Usage: pnpm --filter server admin:provision -- --username <user> --password <pass> [options]");
    console.log("Options:");
    console.log("  --first-name <value>  Optional first name");
    console.log("  --last-name <value>   Optional last name");
    console.log("  --email <value>       Optional email (defaults to <id>@opencloud.local)");
    console.log("  --help                Show this help");
    console.log("");
    console.log("Env fallbacks: ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL");
};

const parseArgs = (): ProvisionArgs | "help" | null => {
    const args = process.argv.slice(2);

    if (args.includes("--help")) {
        printUsage();
        return "help";
    }

    const output: Partial<ProvisionArgs> = {};
    const envUsername = process.env["ADMIN_USERNAME"];
    const envPassword = process.env["ADMIN_PASSWORD"];
    const envFirstName = process.env["ADMIN_FIRST_NAME"];
    const envLastName = process.env["ADMIN_LAST_NAME"];
    const envEmail = process.env["ADMIN_EMAIL"];

    if (envUsername) output.username = envUsername;
    if (envPassword) output.password = envPassword;
    if (envFirstName) output.firstName = envFirstName;
    if (envLastName) output.lastName = envLastName;
    if (envEmail) output.email = envEmail;

    for (let i = 0; i < args.length; i += 1) {
        const flag = args[i];
        const value = args[i + 1];
        if (!value || value.startsWith("--")) {
            continue;
        }

        switch (flag) {
            case "--username":
                output.username = value;
                i += 1;
                break;
            case "--password":
                output.password = value;
                i += 1;
                break;
            case "--first-name":
                output.firstName = value;
                i += 1;
                break;
            case "--last-name":
                output.lastName = value;
                i += 1;
                break;
            case "--email":
                output.email = value;
                i += 1;
                break;
            default:
                break;
        }
    }

    if (!output.username || !output.password) {
        printUsage();
        return null;
    }

    return output as ProvisionArgs;
};

const run = async () => {
    const parsed = parseArgs();
    if (parsed === "help") {
        return;
    }

    if (!parsed) {
        process.exitCode = 1;
        return;
    }

    const { db, pool } = createDatabase();

    try {
        const existingAdmin = await db.select({ id: users.id }).from(users).where(eq(users.role, "ADMIN")).limit(1);
        if (existingAdmin.length > 0) {
            console.error("Admin user already exists. Provisioning disabled.");
            process.exitCode = 1;
            return;
        }

        const [existingUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, parsed.username))
            .limit(1);
        if (existingUser) {
            console.error("User with username already exists.");
            process.exitCode = 1;
            return;
        }

        const hashedPassword = await argon2.hash(parsed.password);

        await createUserWithRootFolder(db, {
            username: parsed.username,
            passwordHash: hashedPassword,
            ...(parsed.firstName !== undefined ? { firstName: parsed.firstName } : {}),
            ...(parsed.lastName !== undefined ? { lastName: parsed.lastName } : {}),
            ...(parsed.email !== undefined ? { email: parsed.email } : {}),
            role: "ADMIN",
        });

        console.log(`Admin user created: ${parsed.username}`);
    } catch (error) {
        console.error("Failed to provision admin user.");
        console.error(error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
};

void run();
