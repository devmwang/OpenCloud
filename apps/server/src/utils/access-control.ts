import { and, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import ipaddr from "ipaddr.js";

import { accessRules } from "@/db/schema/access-rules";

declare module "fastify" {
    interface FastifyInstance {
        verifyAccessControlRule(request: FastifyRequest, ruleId: string, ownerId?: string): Promise<boolean>;
        verifyAccessControlRules(request: FastifyRequest, ruleIds: string[], ownerId?: string): Promise<boolean>;
    }
}

export interface AccessControlRuleEvaluatorInput {
    id: string;
    type: string;
    method: string;
    cidr: string;
}

const isIpv6 = (addr: ipaddr.IPv4 | ipaddr.IPv6): addr is ipaddr.IPv6 => addr.kind() === "ipv6";

const parseIp = (ip: string) => {
    try {
        return ipaddr.process(ip);
    } catch {
        return null;
    }
};

const matchIp = (ruleCidr: string, client: ipaddr.IPv4 | ipaddr.IPv6) => {
    try {
        if (ipaddr.isValidCIDR(ruleCidr)) {
            const [range, prefix] = ipaddr.parseCIDR(ruleCidr);
            const isMappedIpv6Cidr = isIpv6(range) && range.isIPv4MappedAddress();
            const normalizedRange = isMappedIpv6Cidr ? range.toIPv4Address() : range;
            const normalizedPrefix = isMappedIpv6Cidr ? Math.max(prefix - 96, 0) : prefix;

            if (client.kind() !== normalizedRange.kind()) {
                return null;
            }

            return client.match(normalizedRange, normalizedPrefix);
        }

        if (ipaddr.isValid(ruleCidr)) {
            const normalizedMatch = ipaddr.process(ruleCidr);
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

export function resolveAccessControlRules(
    requestedRuleIds: string[],
    loadedRules: AccessControlRuleEvaluatorInput[],
    requestIp: string,
) {
    const uniqueRuleIds = Array.from(new Set(requestedRuleIds));
    if (uniqueRuleIds.length === 0) {
        return true;
    }

    const client = parseIp(requestIp);
    if (!client) {
        return false;
    }

    const loadedRulesById = new Map(loadedRules.map((rule) => [rule.id, rule]));

    let hasAllow = false;
    let allowMatched = false;

    for (const ruleId of uniqueRuleIds) {
        const accessRule = loadedRulesById.get(ruleId);
        if (!accessRule) {
            return false;
        }

        if (accessRule.method !== "IP_ADDRESS") {
            return false;
        }

        if (accessRule.type === "DISALLOW") {
            const matches = matchIp(accessRule.cidr, client);
            if (matches === true) {
                return false;
            }

            continue;
        }

        if (accessRule.type === "ALLOW") {
            const matches = matchIp(accessRule.cidr, client);
            hasAllow = true;
            if (matches === true) {
                allowMatched = true;
            }

            continue;
        }

        return false;
    }

    if (hasAllow) {
        return allowMatched;
    }

    return true;
}

const accessControlPlugin: FastifyPluginAsync = fp(async (server) => {
    server.decorate(
        "verifyAccessControlRules",
        async function (request: FastifyRequest, ruleIds: string[], ownerId?: string) {
            const uniqueRuleIds = Array.from(new Set(ruleIds));
            if (uniqueRuleIds.length === 0) {
                return true;
            }

            const whereClause = ownerId
                ? and(eq(accessRules.ownerId, ownerId), inArray(accessRules.id, uniqueRuleIds))
                : inArray(accessRules.id, uniqueRuleIds);

            const loadedRules = await this.db
                .select({
                    id: accessRules.id,
                    type: accessRules.type,
                    method: accessRules.method,
                    cidr: accessRules.cidr,
                })
                .from(accessRules)
                .where(whereClause);

            return resolveAccessControlRules(uniqueRuleIds, loadedRules, request.ip);
        },
    );

    server.decorate(
        "verifyAccessControlRule",
        async function (request: FastifyRequest, ruleId: string, ownerId?: string) {
            return this.verifyAccessControlRules(request, [ruleId], ownerId);
        },
    );
});

export default accessControlPlugin;
