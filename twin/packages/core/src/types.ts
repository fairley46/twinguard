export type K8sManifest = {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
};

export type Workload = {
  id: string;
  name: string;
  namespace: string;
  kind: string;
  labels: Record<string, string>;
};

export type ServiceNode = {
  id: string;
  name: string;
  namespace: string;
  selector: Record<string, string>;
};

export type IngressRoute = {
  ingress: string;
  namespace: string;
  serviceName: string;
  servicePort?: number | string;
};

export type NetworkPolicyPeer = {
  namespaceSelector?: Record<string, string>;
  podSelector?: Record<string, string>;
  ipBlock?: { cidr: string };
};

export type NetworkPolicyNode = {
  name: string;
  namespace: string;
  podSelector: Record<string, string>;
  ingressPeers: NetworkPolicyPeer[];
  egressPeers: NetworkPolicyPeer[];
  policyTypes: string[];
};

export type TwinGraph = {
  namespaces: Set<string>;
  workloads: Workload[];
  services: ServiceNode[];
  ingressRoutes: IngressRoute[];
  networkPolicies: NetworkPolicyNode[];
};

export type ReachabilityEdge = {
  from: string;
  to: string;
  protocol: string;
  port: number | string;
  reason: string;
};

export type TwinSnapshot = {
  graph: TwinGraph;
  manifests: K8sManifest[];
  reachability: ReachabilityEdge[];
};

export type TwinDiff = {
  changedResources: string[];
  addedReachability: ReachabilityEdge[];
  removedReachability: ReachabilityEdge[];
};
