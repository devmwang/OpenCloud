import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { accessRules } from "@/db/schema/access-rules";

declare module "fastify" {
    interface FastifyInstance {
        verifyAccessControlRule(request: FastifyRequest, ruleId: string, ownerId?: string): Promise<boolean>;
    }
}

const accessControlPlugin: FastifyPluginAsync = fp(async (server) => {
    // If route is protected by AC rule, verify that user has access or return 403
    server.decorate(
        "verifyAccessControlRule",
        async function (request: FastifyRequest, ruleId: string, ownerId?: string) {
            const whereClause = ownerId
                ? and(eq(accessRules.id, ruleId), eq(accessRules.ownerId, ownerId))
                : eq(accessRules.id, ruleId);
            const [accessRule] = await this.db.select().from(accessRules).where(whereClause).limit(1);

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
        },
    );
});

export default accessControlPlugin;
