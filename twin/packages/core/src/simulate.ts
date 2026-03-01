import { buildGraph, serviceTargets } from "./graph.js";
import type {
  NetworkPolicyNode,
  ReachabilityEdge,
  TwinGraph,
  TwinSnapshot,
  Workload,
} from "./types.js";

function namespaceLabels(ns: string): Record<string, string> {
  return { "kubernetes.io/metadata.name": ns };
}

function matchesSelector(labels: Record<string, string>, selector?: Record<string, string>): boolean {
  if (!selector || Object.keys(selector).length === 0) return true;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

function allowsIngressFrom(
  policies: NetworkPolicyNode[],
  src: Workload | "public",
  dst: Workload
): boolean {
  const selecting = policies.filter((p) => {
    return p.namespace === dst.namespace && Object.entries(p.podSelector).every(([k, v]) => dst.labels[k] === v);
  });

  if (selecting.length === 0) return true;

  for (const policy of selecting) {
    if (policy.ingressPeers.length === 0) continue;
    for (const peer of policy.ingressPeers) {
      if (src === "public") {
        if (peer.ipBlock?.cidr === "0.0.0.0/0") return true;
        continue;
      }

      const nsMatch = matchesSelector(namespaceLabels(src.namespace), peer.namespaceSelector);
      const podMatch = matchesSelector(src.labels, peer.podSelector);
      if (nsMatch && podMatch) return true;
    }
  }

  return false;
}

export function computeReachability(graph: TwinGraph): ReachabilityEdge[] {
  const edges: ReachabilityEdge[] = [];

  for (const src of graph.workloads) {
    for (const dst of graph.workloads) {
      if (src.id === dst.id) continue;
      if (allowsIngressFrom(graph.networkPolicies, src, dst)) {
        edges.push({
          from: src.id,
          to: dst.id,
          protocol: "TCP",
          port: "*",
          reason: "network-policy-allowed",
        });
      }
    }
  }

  for (const route of graph.ingressRoutes) {
    const service = graph.services.find((s) => s.namespace === route.namespace && s.name === route.serviceName);
    if (!service) continue;
    const targets = serviceTargets(graph, service);
    for (const dst of targets) {
      if (allowsIngressFrom(graph.networkPolicies, "public", dst)) {
        edges.push({
          from: "public/internet",
          to: dst.id,
          protocol: "TCP",
          port: route.servicePort ?? 80,
          reason: `ingress/${route.ingress}`,
        });
      }
    }
  }

  return edges;
}

export function createSnapshot(manifests: TwinSnapshot["manifests"]): TwinSnapshot {
  const graph = buildGraph(manifests);
  const reachability = computeReachability(graph);
  return { manifests, graph, reachability };
}

export function createSnapshotFromGraph(graph: TwinGraph): TwinSnapshot {
  const reachability = computeReachability(graph);
  return { manifests: [], graph, reachability };
}
