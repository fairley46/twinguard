# TwinGuard

**Simulate before you ship.**

TwinGuard builds a digital twin of your infrastructure from a proposed change, simulates the network reachability of that change, and enforces security policy — all in CI, before it reaches production.

It works on **Kubernetes manifests** and **Terraform plans** today. No live cluster or cloud account required.

---

## What it catches

| Rule | What it flags | Severity |
|------|--------------|----------|
| **GR-001** | Public Ingress or load balancer routing to a `tier=data` workload | HIGH |
| **GR-002** | Cross-namespace / cross-environment traffic without an allowlist entry | MEDIUM |
| **GR-003** | Wildcard egress (`0.0.0.0/0`) from any workload in the `prod` environment | HIGH |

Rules are plain TypeScript — add your own in under 10 lines.

---

## How it works

```
Your change (Helm values / Terraform plan)
        ↓
Parse into a property graph
  Workloads · Services · Network paths · Policy rules
        ↓
Simulate reachability — who can reach what, and why
        ↓
Diff against baseline — what is the blast radius of this change?
        ↓
Evaluate golden rules against the candidate
        ↓
Violations → block merge + post PR comment + archive report
Clean      → pass + archive report
```

---

## Supported infrastructure

| Driver | Input | How to use |
|--------|-------|------------|
| `k8s` | Rendered Helm / kubectl YAML | `--driver k8s` (default) |
| `terraform` | `terraform show -json` plan output | `--driver terraform` |

GCP, Azure, and Pulumi adapters are on the roadmap.

---

## Quick start

No cluster. No cloud account. No Helm.

```bash
git clone https://github.com/fairley46/twinguard
cd twinguard
npm install
```

**Kubernetes — safe baseline vs. risky candidate**
```bash
npm run analyze -- \
  --driver k8s \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts/k8s
```

**Terraform — safe baseline vs. risky candidate**
```bash
npm run analyze -- \
  --driver terraform \
  --baseline fixtures/terraform/baseline \
  --candidate fixtures/terraform/candidate \
  --out-dir artifacts/terraform
```

**Interactive demo (walks through both scenarios)**
```bash
./demo.sh
```

**Live watch mode — re-runs on every file save**
```bash
npm run watch -- \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts
```

---

## Artifacts produced every run

| File | Purpose |
|------|---------|
| `artifacts/summary.md` | Posted as a GitHub PR comment |
| `artifacts/report.html` | Visual report — open in browser |
| `artifacts/analysis.json` | Machine-readable — audit archive, downstream tools |

---

## GitHub Actions

TwinGuard ships with a GitHub Actions workflow (`.github/workflows/twinguard.yml`) that runs on every pull request to `main`:

- **Two jobs**: `TwinGuard / Kubernetes` and `TwinGuard / Terraform`
- **Automatic PR comment** with the violation summary posted to the PR
- **Downloadable HTML report** uploaded as a GitHub Actions artifact (30-day retention)
- **Smart fallback** — if Helm or Terraform aren't configured in CI, uses fixture files and still runs a full analysis

To block merges on violations, set `--enforce=true` in the workflow.

---

## Repo layout

```
apps/api/                CLI (analyze · report · watch commands)
packages/core/           Parse · graph · simulate · diff · report engine
packages/policy/         Golden-rule policy pack (GR-001, GR-002, GR-003)
packages/terraform/      Terraform plan adapter
charts/twin/             Helm chart for deploying TwinGuard itself
examples/demo-mesh/      Demo K8s environment (safe + risky Helm values)
fixtures/
  baseline/              Pre-rendered safe K8s manifests
  candidate/             Pre-rendered risky K8s manifests
  terraform/baseline/    Safe AWS Terraform plan JSON
  terraform/candidate/   Risky AWS Terraform plan JSON
.github/workflows/       GitHub Actions — runs on every PR
docs/
  QUICKSTART.md          Step-by-step setup guide
  BUSINESS_VALUE.md      Architecture diagram + business case
  PITCH.md               One-page pitch deck
  DEMO_SCRIPT.md         Talk track for live demos
demo.sh                  Interactive terminal demo
```

---

## Adding a policy rule

Implement `PolicyRule` in `packages/policy/src/index.ts`:

```ts
const myRule: PolicyRule = {
  id: "GR-004",
  title: "No privileged containers in prod",
  evaluate(ctx) {
    const violations: PolicyViolation[] = [];
    // inspect ctx.snapshot.graph and ctx.snapshot.reachability
    return violations;
  },
};
```

Add it to `defaultRules` — it runs automatically on every analysis, for both K8s and Terraform.

---

## Roadmap

- [ ] GitHub App — one-click install, zero CLI setup
- [ ] Web dashboard — persistent history, team-wide policy status
- [ ] GCP + Azure + Pulumi adapters
- [ ] Policy management UI
- [ ] SARIF output for GitHub Security Dashboard

---

*TwinGuard — Simulate before you ship.*
