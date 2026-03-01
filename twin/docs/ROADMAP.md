# TwinGuard — Roadmap

Updated after competitive landscape research (March 2026).

---

## Where We Are

TwinGuard has a working engine, two infrastructure adapters (K8s + Terraform), a GitHub Actions workflow, and an MCP server. The behavioral simulation gap is real and unoccupied. The roadmap below is sequenced to close distribution and enterprise adoption gaps before the CSPM giants (Wiz, Prisma Cloud) finish moving left into pre-merge analysis.

**Estimated window: 12–18 months before the enterprise incumbents arrive at this layer.**

---

## Competitive Context

| Tool | What it does | What it can't do |
|------|-------------|-----------------|
| Checkov / Trivy / KICS | Static pattern matching on IaC files — 1000+ rules | Doesn't simulate behavior. Can't catch "these three resources combine to expose your RDS." |
| Wiz / Prisma / Orca | Runtime blast radius on live cloud — expensive, agents required | Works on deployed infrastructure. Not pre-merge. $100K+/year. |
| OPA Gatekeeper / Kyverno | Policy enforcement at admission/deploy time | Runs at deploy time, not merge time. No developer feedback until kubectl apply. |
| TwinGuard | Behavioral simulation pre-merge, K8s + Terraform, MCP-native | **Unoccupied position. This is the gap.** |

---

## Priority 1 — SARIF Output
**Status: Not started | Effort: Small | Impact: High**

SARIF (Static Analysis Results Interchange Format) is the standard format for security findings in GitHub's Security tab. Every team already using Checkov or Trivy sees their results there. Without SARIF, TwinGuard is invisible to those teams.

With SARIF:
- TwinGuard violations show up in the GitHub Security tab alongside Checkov findings
- Security teams can track violation trends over time in GitHub
- TwinGuard looks like a first-class security tool, not a side project

This is a one-day build — convert the `violations[]` array to SARIF JSON and upload it as a GitHub Actions artifact with the correct content type.

---

## Priority 2 — GitHub App
**Status: Not started | Effort: Medium | Impact: Very High**

The GitHub Actions workflow requires users to copy a YAML file into their repo. A GitHub App requires one click.

- Install on any repo in 30 seconds
- Automatic PR comments with no configuration
- Handles auth, webhooks, and artifact storage
- Enables a freemium model (free for public repos, paid for private)

This is the distribution unlock. Everything else in the roadmap becomes easier once teams can adopt TwinGuard without touching a CLI.

---

## Priority 3 — OPA / Rego Policy Import
**Status: Not started | Effort: Medium | Impact: Very High (enterprise)**

Open Policy Agent (OPA) with the Rego language is the de facto standard for policy-as-code in enterprise environments. Most platform engineering teams already have Rego policies written for Gatekeeper or Conftest.

Adding OPA compatibility means:
- "Bring your existing policies" — zero rewrite required
- Removes the biggest enterprise adoption objection
- TwinGuard becomes the pre-merge evaluation layer for policies teams already own
- Opens the door to selling into existing OPA/Gatekeeper deployments

The implementation: a Rego evaluation bridge that feeds the TwinGraph into OPA's runtime alongside the existing TypeScript rule engine.

---

## Priority 4 — GCP + Azure Adapters
**Status: Terraform (AWS) done | Effort: Medium | Impact: High**

The Terraform adapter currently maps AWS resource types. GCP and Azure use different resource naming but the same graph model applies.

- `google_compute_firewall` → NetworkPolicyNode
- `google_compute_instance`, `google_cloud_run_service` → Workload
- `azurerm_network_security_group` → NetworkPolicyNode
- `azurerm_virtual_machine`, `azurerm_linux_web_app` → Workload

Adding these expands the total addressable market to every team running cloud infrastructure, not just AWS shops.

Pulumi support follows naturally — Pulumi compiles to Terraform plan JSON.

---

## Priority 5 — Kyverno / Gatekeeper Policy Export
**Status: Not started | Effort: Medium | Impact: High (differentiation)**

No tool in the space does this: take a pre-merge TwinGuard analysis and automatically generate the runtime enforcement policy (Kyverno or OPA Gatekeeper) that would block the violation at deploy time too.

This closes the loop across the full SDLC:
```
TwinGuard catches it pre-merge
        ↓
Generates a Kyverno policy
        ↓
That policy is deployed to the cluster
        ↓
Runtime also enforces it if something slips through
```

Positioning: "TwinGuard doesn't just catch misconfigurations — it writes the enforcement rule for you."

---

## Priority 6 — Web Dashboard
**Status: Not started | Effort: Large | Impact: Medium**

A persistent dashboard showing:
- Violation trends over time per repo
- Team-wide policy status
- Which rules are firing most often
- Diff history

This is a platform play — turns TwinGuard from a tool into a product teams depend on daily. Required before serious SaaS monetization. Lower priority than the adoption unlocks above.

---

## Priority 7 — Policy Management UI
**Status: Not started | Effort: Large | Impact: Medium**

A visual interface for managing policy rules — adding, editing, toggling, and testing rules without writing TypeScript or Rego. Primarily useful for security teams who own the policy set but don't write code.

Deferred until after OPA import (Priority 3) since that solves the enterprise policy authoring problem more immediately.

---

## Priority 8 — Multi-tenant SaaS
**Status: Not started | Effort: Very Large | Impact: Very High (long-term)**

Full SaaS platform:
- Multi-tenant with org-level policy management
- Audit exports and compliance reporting
- SARIF → GitHub Security Dashboard integration
- Team analytics and violation trending
- Pricing: free for open source, usage-based for private repos

This is the long-term monetization play. Everything above is a prerequisite.

---

## What We Decided Not to Do (Yet)

| Thing | Why not now |
|-------|-------------|
| Compete with Checkov head-on | Checkov has 1000+ rules and years of adoption. Position as complementary: "Checkov catches patterns, TwinGuard catches behavior." |
| Agent-based runtime scanning | That's Wiz/Prisma's territory. Stay pre-merge. |
| Replace OPA/Kyverno | They do runtime enforcement well. TwinGuard should feed them, not replace them. |

---

## Summary

```
Now      SARIF output          → show up in GitHub Security tab
Next     GitHub App            → one-click distribution
Then     OPA/Rego import       → enterprise adoption unlock
After    GCP + Azure           → market expansion
Later    Kyverno export        → close the SDLC loop
Future   Dashboard → UI → SaaS → platform
```
