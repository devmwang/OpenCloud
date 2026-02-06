import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import ipaddr from "ipaddr.js";

import { accessRules } from "@/db/schema/access-rules";

declare module "fastify" {
    interface FastifyInstance {
        verifyAccessControlRule(request: FastifyRequest, ruleId: string, ownerId?: string): Promise<boolean>;
    }
}

const accessControlPlugin: FastifyPluginAsync = fp(async (server) => {
    const isIpv6 = (addr: ipaddr.IPv4 | ipaddr.IPv6): addr is ipaddr.IPv6 => addr.kind() === "ipv6";

    const matchIp = (ruleMatch: string, ip: string) => {
        try {
            const client = ipaddr.process(ip);

            if (ipaddr.isValidCIDR(ruleMatch)) {
                const [range, prefix] = ipaddr.parseCIDR(ruleMatch);
                const isMappedIpv6Cidr = isIpv6(range) && range.isIPv4MappedAddress();
                const normalizedRange = isMappedIpv6Cidr ? range.toIPv4Address() : range;
                const normalizedPrefix = isMappedIpv6Cidr ? Math.max(prefix - 96, 0) : prefix;

                if (client.kind() !== normalizedRange.kind()) {
                    return null;
                }

                return client.match(normalizedRange, normalizedPrefix);
            }

            if (ipaddr.isValid(ruleMatch)) {
                const normalizedMatch = ipaddr.process(ruleMatch);
                if (client.kind() !== normalizedMatch.kind()) {
                    return null;
                }

                return client.toNormalizedString() === normalizedMatch.toNormalizedString();
            }

            return null;
        } catch {
            return null;
        }
    };

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

            if (accessRule.method == "IP_ADDRESS") {
                const matches = matchIp(accessRule.match, request.ip);
                if (matches === null) {
                    return accessRule.type == "DISALLOW";
                }

                if (accessRule.type == "ALLOW") {
                    return matches;
                }

                return !matches;
            }

            return false;
        },
    );
});

export default accessControlPlugin;
