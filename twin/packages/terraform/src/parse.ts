import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  IngressRoute,
  NetworkPolicyNode,
  NetworkPolicyPeer,
  ServiceNode,
  TwinGraph,
  Workload,
} from "@twin/core";
import type { TfModule, TfPlan, TfResource, TfSgRule } from "./types.js";

// Resource types we map to Workloads
const COMPUTE_TYPES = new Set([
  "aws_instance",
  "aws_ecs_service",
  "aws_ecs_task_definition",
  "aws_lambda_function",
  "aws_rds_instance",
  "aws_db_instance",
  "aws_elasticache_cluster",
  "aws_elasticache_replication_group",
  "google_compute_instance",
  "google_cloud_run_service",
  "google_sql_database_instance",
  "azurerm_virtual_machine",
  "azurerm_linux_web_app",
]);

const DATA_TIER_TYPES = new Set([
  "aws_rds_instance",
  "aws_db_instance",
  "aws_elasticache_cluster",
  "aws_elasticache_replication_group",
  "google_sql_database_instance",
]);

const LB_TYPES = new Set([
  "aws_lb",
  "aws_alb",
  "google_compute_forwarding_rule",
  "azurerm_lb",
]);

// Firewall / NSG resource types (mapped to NetworkPolicyNode)
const FIREWALL_TYPES = new Set([
  "aws_security_group",
  "google_compute_firewall",
  "azurerm_network_security_group",
]);

function flattenModule(mod: TfModule): TfResource[] {
  const resources = mod.resources ?? [];
  const childResources = (mod.child_modules ?? []).flatMap(flattenModule);
  return [...resources, ...childResources];
}

function tagsOf(r: TfResource): Record<string, string> {
  const raw = r.values.tags;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function envOf(tags: Record<string, string>): string {
  return tags.env ?? tags.environment ?? tags.Env ?? tags.Environment ?? "default";
}

function sgPeersFromRules(rules: TfSgRule[]): NetworkPolicyPeer[] {
  const peers: NetworkPolicyPeer[] = [];
  for (const rule of rules) {
    for (const cidr of rule.cidr_blocks ?? []) {
      peers.push({ ipBlock: { cidr } });
    }
    for (const sgId of rule.security_groups ?? []) {
      // Map SG ID/name reference to a podSelector equivalent
      peers.push({ podSelector: { "sg.id": sgId } });
    }
    if (rule.self) {
      peers.push({ podSelector: { "sg.self": "true" } });
    }
  }
  return peers;
}

function isWildcardCidr(cidr: string): boolean {
  return cidr === "0.0.0.0/0" || cidr === "::/0";
}

function hasPublicIngress(rules: TfSgRule[]): boolean {
  return rules.some((r) => (r.cidr_blocks ?? []).some(isWildcardCidr));
}

export function parseTerraformPlan(planPath: string): TwinGraph {
  const raw = readFileSync(planPath, "utf8");
  const plan = JSON.parse(raw) as TfPlan;

  // Support both `terraform show -json plan.tfplan` and `terraform show -json` (state)
  const rootModule =
    plan.planned_values?.root_module ?? plan.values?.root_module;
  if (!rootModule) {
    throw new Error(`No root_module found in plan at ${planPath}`);
  }

  const resources = flattenModule(rootModule);

  const namespaces = new Set<string>();
  const workloads: Workload[] = [];
  const services: ServiceNode[] = [];
  const ingressRoutes: IngressRoute[] = [];
  const networkPolicies: NetworkPolicyNode[] = [];

  // Index firewall rules by their address for reference resolution
  const sgByAddress = new Map<string, TfResource>();
  const sgByName = new Map<string, TfResource>();

  for (const r of resources) {
    if (FIREWALL_TYPES.has(r.type)) {
      sgByAddress.set(r.address, r);
      if (r.values.name) sgByName.set(r.values.name, r);
      sgByAddress.set(r.name, r);
    }
  }

  // Build workloads from compute resources
  for (const r of resources) {
    if (!COMPUTE_TYPES.has(r.type)) continue;

    const tags = tagsOf(r);
    const env = envOf(tags);
    namespaces.add(env);

    // Auto-assign tier=data for known data-tier resource types
    const labels: Record<string, string> = { ...tags };
    if (DATA_TIER_TYPES.has(r.type) && !labels.tier) {
      labels.tier = "data";
    }

    workloads.push({
      id: `${env}/${r.type}/${r.name}`,
      name: r.name,
      namespace: env,
      kind: r.type,
      labels,
    });
  }

  // Build NetworkPolicyNodes from security groups
  for (const r of resources) {
    if (!FIREWALL_TYPES.has(r.type)) continue;

    const tags = tagsOf(r);
    const env = envOf(tags);
    namespaces.add(env);

    const ingressRules = r.values.ingress ?? [];
    const egressRules = r.values.egress ?? [];

    // podSelector: match workloads by sg reference (via name or address)
    // We use a label that workloads get implicitly if they reference this SG
    const podSelector: Record<string, string> = {};
    if (tags.tier) podSelector.tier = tags.tier;
    if (tags.env || tags.environment) podSelector.env = env;

    networkPolicies.push({
      name: r.address,
      namespace: env,
      podSelector,
      ingressPeers: sgPeersFromRules(ingressRules),
      egressPeers: sgPeersFromRules(egressRules),
      policyTypes: [
        ...(ingressRules.length > 0 ? ["Ingress"] : []),
        ...(egressRules.length > 0 ? ["Egress"] : []),
      ],
    });

    // If this SG has public ingress AND is associated with a data-tier workload → IngressRoute
    if (hasPublicIngress(ingressRules)) {
      const sgName = r.values.name ?? r.name;
      ingressRoutes.push({
        ingress: r.address,
        namespace: env,
        serviceName: sgName,
        servicePort: ingressRules[0]?.from_port ?? 443,
      });

      // Create a synthetic service node so the policy engine can resolve
      // public Ingress → Service → Workload chains
      services.push({
        id: `${env}/SecurityGroup/${sgName}`,
        name: sgName,
        namespace: env,
        selector: { ...(tags.tier ? { tier: tags.tier } : {}), env },
      });
    }
  }

  // Build IngressRoutes from load balancers
  for (const r of resources) {
    if (!LB_TYPES.has(r.type)) continue;
    if (r.values.internal === true) continue; // skip internal LBs

    const tags = tagsOf(r);
    const env = envOf(tags);

    ingressRoutes.push({
      ingress: r.address,
      namespace: env,
      serviceName: r.values.name ?? r.name,
      servicePort: 443,
    });
  }

  return { namespaces, workloads, services, ingressRoutes, networkPolicies };
}

export function parseTerraformPlanDir(dir: string): TwinGraph {
  return parseTerraformPlan(join(dir, "plan.json"));
}
