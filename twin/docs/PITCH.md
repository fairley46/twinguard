# TwinGuard
## Simulate before you ship.

---

### The Problem

Every infrastructure change is a blind spot.

A developer changes two lines in a config file. CI runs. Tests pass. Linting passes. The MR looks clean.

Then it merges — and the database is exposed to the public internet.

This happens constantly. Not because engineers are careless. Because the tools that guard the merge don't understand **what a change actually does** to a running system. They check syntax. They don't simulate behavior.

The industry calls this "shift left on security." But today, the security check is still a human reading a diff and hoping they catch it.

---

### The Solution

**TwinGuard** builds a digital twin of your infrastructure from the proposed change — before it merges — and simulates exactly what would happen if it shipped.

It maps every workload, every service, every network path, and every policy rule. Then it diffs the twin against your baseline. Then it enforces.

If a change would expose a database to the public internet, TwinGuard catches it at the merge request — not in a 3am incident.

---

### How It Works

```
Developer opens MR
        ↓
CI renders infrastructure manifests (baseline vs. proposed change)
        ↓
TwinGuard parses both into a property graph
  → Workloads, services, network paths, policy rules
        ↓
Simulates reachability: who can reach what, and why
        ↓
Diffs the two snapshots: what changed, and what's the blast radius
        ↓
Evaluates policy rules against the candidate
        ↓
Violations → block the merge + post a report to the MR
Clean → pass + archive audit artifact
```

No cluster access required. No agents. No runtime hooks. Works entirely on manifests.

---

### Live Proof

Two config changes. Both pass standard CI. Both would cause production incidents.

**Change 1:** `exposeDbPublic: true`
→ Adds a public Ingress route to the database service
→ TwinGuard traces: Ingress → Service → `tier=data` Deployment
→ **GR-001 violation: HIGH — database is publicly reachable**

**Change 2:** `wildcardProdEgress: true`
→ Adds a NetworkPolicy that allows `0.0.0.0/0` egress from prod
→ TwinGuard scans egress peers in the `prod` namespace
→ **GR-003 violation: HIGH — unrestricted outbound from production**

Both caught. Both blocked. Artifacts produced. MR comment posted. Zero human review required.

---

### Why Now

Infrastructure-as-code has become the standard. Every team ships infra changes through Git. But the security review of those changes is still manual — a human reading YAML and hoping they spot the risk.

The volume of infrastructure changes is outpacing the ability of any security team to review them. The answer is not more reviewers. It's automated semantic enforcement at the point of change.

---

### The Market

**Primary buyer:** Platform engineering and DevSecOps teams at companies running cloud-native infrastructure.

**Immediate pain:** Security and compliance teams being asked to review infra MRs they don't have the context or bandwidth to evaluate properly.

**The wedge:** Kubernetes. Every company running K8s has this problem today.

**The expansion:** The engine is infrastructure-agnostic. The same graph model that works on K8s manifests works on Terraform plans, CloudFormation templates, and service mesh configs. K8s is the beachhead. Infrastructure-as-code is the category.

---

### Roadmap

| Phase | What ships | Why it matters |
|-------|-----------|----------------|
| **Now** | K8s engine · Golden rules · CI pipeline · HTML report | Working prototype — proves the concept |
| **Next** | GitHub App — one-click install, automatic PR comments | Solves distribution — zero-friction adoption |
| **Then** | Terraform adapter | 10x the addressable market |
| **Later** | Web dashboard · Policy management UI · Historical tracking | Turns a tool into a platform |
| **SaaS** | Multi-tenant · Team policies · Audit exports · SARIF integration | Monetizable product |

---

### The Ask

TwinGuard is a working prototype with a proven engine, a live demo, and a clear expansion path.

The next step is distribution: turning this into a GitHub App so any engineering team can install it in 30 seconds and get TwinGuard running on their repos without touching a CLI.

After that, Terraform. After that, a dashboard.

The infrastructure security problem is real. The tooling gap is real. TwinGuard fills it.

---

*Simulate before you ship.*
