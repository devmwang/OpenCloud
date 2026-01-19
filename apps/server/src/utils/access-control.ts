import type { FastifyRequest, FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";

import { accessRules } from "@/db/schema/access-rules";

declare module "fastify" {
    interface FastifyInstance {
        verifyAccessControlRule(request: FastifyRequest, ruleId: string): Promise<boolean>;
    }
}

const accessControlPlugin: FastifyPluginAsync = fp(async (server) => {
    // If route is protected by AC rule, verify that user has access or return 403
    server.decorate("verifyAccessControlRule", async function (request: FastifyRequest, ruleId: string) {
        const [accessRule] = await this.db
            .select()
            .from(accessRules)
            .where(eq(accessRules.id, ruleId))
            .limit(1);

        if (!accessRule) {
            return false;
        }

        if (accessRule.type == "ALLOW" && accessRule.method == "IP_ADDRESS" && accessRule.match == request.ip) {
            return true;
        }
        if (accessRule.type == "DISALLOW" && accessRule.method == "IP_ADDRESS" && accessRule.match != request.ip) {
            return true;
        }

        return false;
    });
});

export default accessControlPlugin;
