import type {
  IngressRoute,
  K8sManifest,
  NetworkPolicyNode,
  NetworkPolicyPeer,
  ServiceNode,
  TwinGraph,
  Workload,
} from "./types.js";

const WORKLOAD_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "Pod"]);

function nsOf(m: K8sManifest): string {
  return m.metadata?.namespace ?? "default";
}

function labelsOf(obj: unknown): Record<string, string> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function includesSelector(labels: Record<string, string>, selector: Record<string, string>): boolean {
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

function parseIngressRoutes(m: K8sManifest): IngressRoute[] {
  const spec = (m.spec ?? {}) as Record<string, unknown>;
  const rules = Array.isArray(spec.rules) ? spec.rules : [];
  const routes: IngressRoute[] = [];
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    const http = (rule as Record<string, unknown>).http;
    if (!http || typeof http !== "object") continue;
    const paths = Array.isArray((http as Record<string, unknown>).paths)
      ? ((http as Record<string, unknown>).paths as unknown[])
      : [];
    for (const path of paths) {
      if (!path || typeof path !== "object") continue;
      const backend = (path as Record<string, unknown>).backend;
      if (!backend || typeof backend !== "object") continue;
      const service = (backend as Record<string, unknown>).service;
      if (!service || typeof service !== "object") continue;
      const name = (service as Record<string, unknown>).name;
      const portObj = (service as Record<string, unknown>).port;
      let port: number | string | undefined;
      if (portObj && typeof portObj === "object") {
        const pNum = (portObj as Record<string, unknown>).number;
        const pName = (portObj as Record<string, unknown>).name;
        if (typeof pNum === "number") port = pNum;
        else if (typeof pName === "string") port = pName;
      }
      if (typeof name === "string") {
        routes.push({
          ingress: m.metadata?.name ?? "unknown-ingress",
          namespace: nsOf(m),
          serviceName: name,
          servicePort: port,
        });
      }
    }
  }
  return routes;
}

function parsePolicyPeers(peers: unknown[]): NetworkPolicyPeer[] {
  const out: NetworkPolicyPeer[] = [];
  for (const peer of peers) {
    if (!peer || typeof peer !== "object") continue;
    const rec = peer as Record<string, unknown>;
    const namespaceSelector =
      rec.namespaceSelector && typeof rec.namespaceSelector === "object"
        ? labelsOf((rec.namespaceSelector as Record<string, unknown>).matchLabels)
        : undefined;
    const podSelector =
      rec.podSelector && typeof rec.podSelector === "object"
        ? labelsOf((rec.podSelector as Record<string, unknown>).matchLabels)
        : undefined;
    const ipBlock =
      rec.ipBlock && typeof rec.ipBlock === "object" && typeof (rec.ipBlock as Record<string, unknown>).cidr === "string"
        ? { cidr: (rec.ipBlock as Record<string, unknown>).cidr as string }
        : undefined;
    out.push({ namespaceSelector, podSelector, ipBlock });
  }
  return out;
}

function parseNetworkPolicy(m: K8sManifest): NetworkPolicyNode {
  const spec = (m.spec ?? {}) as Record<string, unknown>;
  const ingress = Array.isArray(spec.ingress) ? (spec.ingress as unknown[]) : [];
  const egress = Array.isArray(spec.egress) ? (spec.egress as unknown[]) : [];

  const ingressPeers: NetworkPolicyPeer[] = [];
  const egressPeers: NetworkPolicyPeer[] = [];

  for (const rule of ingress) {
    if (!rule || typeof rule !== "object") continue;
    const from = Array.isArray((rule as Record<string, unknown>).from)
      ? ((rule as Record<string, unknown>).from as unknown[])
      : [];
    ingressPeers.push(...parsePolicyPeers(from));
  }

  for (const rule of egress) {
    if (!rule || typeof rule !== "object") continue;
    const to = Array.isArray((rule as Record<string, unknown>).to)
      ? ((rule as Record<string, unknown>).to as unknown[])
      : [];
    egressPeers.push(...parsePolicyPeers(to));
  }

  return {
    name: m.metadata?.name ?? "unknown-policy",
    namespace: nsOf(m),
    podSelector: labelsOf((spec.podSelector as Record<string, unknown> | undefined)?.matchLabels),
    ingressPeers,
    egressPeers,
    policyTypes: Array.isArray(spec.policyTypes) ? (spec.policyTypes as string[]) : [],
  };
}

export function buildGraph(manifests: K8sManifest[]): TwinGraph {
  const namespaces = new Set<string>();
  const workloads: Workload[] = [];
  const services: ServiceNode[] = [];
  const ingressRoutes: IngressRoute[] = [];
  const networkPolicies: NetworkPolicyNode[] = [];

  for (const m of manifests) {
    if (!m.kind || !m.metadata?.name) continue;
    const namespace = nsOf(m);
    namespaces.add(namespace);

    if (WORKLOAD_KINDS.has(m.kind)) {
      const spec = (m.spec ?? {}) as Record<string, unknown>;
      const template = spec.template as Record<string, unknown> | undefined;
      const labels = labelsOf(template?.metadata && typeof template.metadata === "object"
        ? (template.metadata as Record<string, unknown>).labels
        : m.metadata.labels);

      workloads.push({
        id: `${namespace}/${m.kind}/${m.metadata.name}`,
        name: m.metadata.name,
        namespace,
        kind: m.kind,
        labels,
      });
      continue;
    }

    if (m.kind === "Service") {
      const spec = (m.spec ?? {}) as Record<string, unknown>;
      services.push({
        id: `${namespace}/Service/${m.metadata.name}`,
        name: m.metadata.name,
        namespace,
        selector: labelsOf(spec.selector),
      });
      continue;
    }

    if (m.kind === "Ingress") {
      ingressRoutes.push(...parseIngressRoutes(m));
      continue;
    }

    if (m.kind === "NetworkPolicy") {
      networkPolicies.push(parseNetworkPolicy(m));
    }
  }

  // Ensure services only reference realistic selector targets in same namespace.
  for (const service of services) {
    const hasTargets = workloads.some(
      (w) => w.namespace === service.namespace && includesSelector(w.labels, service.selector)
    );
    if (!hasTargets && Object.keys(service.selector).length > 0) {
      // Keep service node, but no traffic path will be built from it later.
    }
  }

  return { namespaces, workloads, services, ingressRoutes, networkPolicies };
}

export function serviceTargets(graph: TwinGraph, service: ServiceNode): Workload[] {
  return graph.workloads.filter(
    (w) => w.namespace === service.namespace && includesSelector(w.labels, service.selector)
  );
}

export function isSelectedByPolicy(workload: Workload, policy: NetworkPolicyNode): boolean {
  if (workload.namespace !== policy.namespace) return false;
  return includesSelector(workload.labels, policy.podSelector);
}
