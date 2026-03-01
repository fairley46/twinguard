import type { ReachabilityEdge, TwinDiff, TwinSnapshot } from "./types.js";

function resourceId(kind: string | undefined, ns: string | undefined, name: string | undefined): string | null {
  if (!kind || !name) return null;
  return `${ns ?? "default"}/${kind}/${name}`;
}

function edgeKey(e: ReachabilityEdge): string {
  return `${e.from}|${e.to}|${e.protocol}|${e.port}|${e.reason}`;
}

export function diffSnapshots(base: TwinSnapshot, next: TwinSnapshot): TwinDiff {
  const baseResources = new Set(
    base.manifests
      .map((m) => resourceId(m.kind, m.metadata?.namespace, m.metadata?.name))
      .filter((x): x is string => x !== null)
  );
  const nextResources = new Set(
    next.manifests
      .map((m) => resourceId(m.kind, m.metadata?.namespace, m.metadata?.name))
      .filter((x): x is string => x !== null)
  );

  const changedResources = [
    ...[...nextResources].filter((r) => !baseResources.has(r)),
    ...[...baseResources].filter((r) => !nextResources.has(r)),
  ];

  const baseEdges = new Map(base.reachability.map((e) => [edgeKey(e), e]));
  const nextEdges = new Map(next.reachability.map((e) => [edgeKey(e), e]));

  const addedReachability = [...nextEdges.entries()]
    .filter(([k]) => !baseEdges.has(k))
    .map(([, v]) => v);

  const removedReachability = [...baseEdges.entries()]
    .filter(([k]) => !nextEdges.has(k))
    .map(([, v]) => v);

  return { changedResources, addedReachability, removedReachability };
}
