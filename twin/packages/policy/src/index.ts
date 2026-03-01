import { serviceTargets } from "@twin/core";
import type { TwinSnapshot } from "@twin/core";

export type PolicyViolation = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  details: string;
};

export type PolicyContext = {
  snapshot: TwinSnapshot;
  allowCrossNamespacePairs?: Array<{ fromNamespace: string; toNamespace: string }>;
};

export interface PolicyRule {
  id: string;
  title: string;
  evaluate(ctx: PolicyContext): PolicyViolation[];
}

function parseWorkloadId(id: string): { namespace: string; kind: string; name: string } {
  const [namespace, kind, name] = id.split("/");
  return { namespace, kind, name };
}

const noPublicToDataTierRule: PolicyRule = {
  id: "GR-001",
  title: "No public ingress to tier=data workloads",
  evaluate(ctx) {
    const violations: PolicyViolation[] = [];
    const byId = new Map(ctx.snapshot.graph.workloads.map((w) => [w.id, w]));

    for (const edge of ctx.snapshot.reachability) {
      if (edge.from !== "public/internet") continue;
      const dst = byId.get(edge.to);
      if (!dst) continue;
      if (dst.labels.tier === "data") {
        violations.push({
          id: this.id,
          title: this.title,
          severity: "high",
          details: `${dst.id} is publicly reachable via ${edge.reason}`,
        });
      }
    }

    // Also flag Ingress routes that target tier=data workloads directly,
    // even if a NetworkPolicy prevents the edge from appearing in reachability.
    const alreadyFlagged = new Set(violations.map((v) => v.details));
    for (const route of ctx.snapshot.graph.ingressRoutes) {
      const service = ctx.snapshot.graph.services.find(
        (s) => s.namespace === route.namespace && s.name === route.serviceName
      );
      if (!service) continue;
      for (const workload of serviceTargets(ctx.snapshot.graph, service)) {
        if (workload.labels.tier !== "data") continue;
        const detail = `${workload.id} is targeted by public Ingress "${route.ingress}" via service "${route.serviceName}"`;
        if (!alreadyFlagged.has(detail)) {
          violations.push({
            id: this.id,
            title: this.title,
            severity: "high",
            details: detail,
          });
        }
      }
    }

    return violations;
  },
};

const denyCrossNamespaceUnlessAllowlistedRule: PolicyRule = {
  id: "GR-002",
  title: "No cross-namespace traffic unless explicitly allowlisted",
  evaluate(ctx) {
    const allow = new Set(
      (ctx.allowCrossNamespacePairs ?? []).map((p) => `${p.fromNamespace}->${p.toNamespace}`)
    );

    const violations: PolicyViolation[] = [];
    for (const edge of ctx.snapshot.reachability) {
      if (edge.from === "public/internet") continue;
      const src = parseWorkloadId(edge.from);
      const dst = parseWorkloadId(edge.to);
      if (src.namespace === dst.namespace) continue;
      const key = `${src.namespace}->${dst.namespace}`;
      if (allow.has(key)) continue;
      violations.push({
        id: this.id,
        title: this.title,
        severity: "medium",
        details: `${edge.from} can reach ${edge.to} (${edge.reason}) without allowlist entry`,
      });
    }

    return violations;
  },
};

const noWildcardEgressInProdRule: PolicyRule = {
  id: "GR-003",
  title: "No wildcard egress (0.0.0.0/0) for prod workloads",
  evaluate(ctx) {
    const violations: PolicyViolation[] = [];

    for (const p of ctx.snapshot.graph.networkPolicies) {
      if (p.namespace !== "prod") continue;
      for (const peer of p.egressPeers) {
        if (peer.ipBlock?.cidr === "0.0.0.0/0") {
          violations.push({
            id: this.id,
            title: this.title,
            severity: "high",
            details: `NetworkPolicy ${p.namespace}/${p.name} allows egress to 0.0.0.0/0`,
          });
        }
      }
    }

    return violations;
  },
};

export const defaultRules: PolicyRule[] = [
  noPublicToDataTierRule,
  denyCrossNamespaceUnlessAllowlistedRule,
  noWildcardEgressInProdRule,
];

export function evaluatePolicies(ctx: PolicyContext, rules: PolicyRule[] = defaultRules): PolicyViolation[] {
  return rules.flatMap((r) => r.evaluate(ctx));
}
