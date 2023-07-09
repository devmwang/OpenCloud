import type { FastifyRequest, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
    interface FastifyInstance {
        verifyAccessControlRule(request: FastifyRequest, ruleId: string): Promise<boolean>;
    }
}

const accessControlPlugin: FastifyPluginAsync = fp(async (server) => {
    // If route is protected by AC rule, verify that user has access or return 403
    server.decorate("verifyAccessControlRule", async function (request: FastifyRequest, ruleId: string) {
        const accessRule = await this.prisma.accessRule.findUnique({ where: { id: ruleId } });

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
