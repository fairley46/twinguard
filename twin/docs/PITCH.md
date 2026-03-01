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

### Competitive Landscape

The market has three existing categories — none of which do what TwinGuard does.

**Static IaC scanners** (Checkov, Trivy, KICS): Check your files for known bad patterns. 1,000+ rules, open source, widely adopted. Cannot simulate behavior — a file can pass every check and still expose your database because they don't model how resources relate to each other.

**CSPM platforms** (Wiz, Prisma Cloud, Orca): Scan live running cloud infrastructure. Genuinely powerful blast radius analysis — on what's already deployed. $100K+/year. Require cloud credentials and agents. Now moving toward pre-merge analysis, which is TwinGuard's territory. **Estimated window: 12–18 months.**

**Runtime policy engines** (OPA Gatekeeper, Kyverno): Enforce at admission/deploy time. No developer feedback until `kubectl apply` or `terraform apply`.

TwinGuard's position: **behavioral simulation, pre-merge, developer-layer, MCP-native**. Unoccupied by any of the above.

---

### Roadmap

Sequenced to close distribution and enterprise adoption gaps before the incumbents arrive.

| Priority | What | Why it matters |
|----------|------|----------------|
| **1** | SARIF output | Show up in GitHub Security tab alongside Checkov/Trivy — legitimacy and visibility |
| **2** | GitHub App | One-click install — zero-friction adoption, enables freemium |
| **3** | OPA / Rego import | Enterprises already have Rego policies — "bring your own policies" removes the biggest objection |
| **4** | GCP + Azure adapters | Expands beyond AWS Terraform — full multi-cloud coverage |
| **5** | Kyverno / Gatekeeper export | Generate runtime enforcement from pre-merge analysis — closes the full SDLC loop |
| **6** | Web dashboard | Persistent history, team-wide policy status, violation trends |
| **7** | Policy management UI | Visual rule management for non-engineers |
| **8** | Multi-tenant SaaS | Full platform, monetization |

---

### The Ask

TwinGuard has a working engine, two infrastructure adapters (K8s + Terraform), GitHub Actions integration, an MCP server for AI-native use, and a live demo that proves the concept end to end.

The window is real. The CSPM giants are moving left. The next move is SARIF output — one week of work that puts TwinGuard in GitHub's Security tab — followed by the GitHub App for distribution.

The infrastructure security problem is real. The tooling gap is real. The window is open. TwinGuard fills it.

---

*Simulate before you ship.*
