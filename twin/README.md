# TwinGuard

**Simulate before you ship.**

TwinGuard is a Kubernetes-first infrastructure digital twin. It builds a property graph of your cluster from rendered Helm manifests, simulates L3/L4 network reachability, and enforces golden-rule security policies — all in CI, before a merge request reaches production.

---

## What it catches

| Violation | Rule | Severity |
|-----------|------|----------|
| Public Ingress routing to a `tier=data` workload | GR-001 | HIGH |
| Cross-namespace traffic without an allowlist entry | GR-002 | MEDIUM |
| Wildcard egress (`0.0.0.0/0`) in the `prod` namespace | GR-003 | HIGH |

---

## How it works

```
Helm render → Parse manifests → Build graph → Simulate reachability → Diff snapshots → Evaluate policies → Report
```

See [docs/BUSINESS_VALUE.md](./docs/BUSINESS_VALUE.md) for the full architecture diagram and business value breakdown.

---

## Quick start (no cluster required)

```bash
# Install dependencies
npm install

# Run the demo (uses pre-rendered fixtures — no Helm needed)
./demo.sh
```

Or run analysis directly:

```bash
npm run analyze -- \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts
```

Artifacts written to `artifacts/`:
- `summary.md` — Markdown summary (posted as MR comment by CI)
- `report.html` — Visual report
- `analysis.json` — Machine-readable, audit-ready

---

## Repo layout

```
apps/api/          CLI entrypoint (analyze · report commands)
packages/core/     Parse · graph · simulate · diff · report
packages/policy/   Golden-rule policy pack (GR-001, GR-002, GR-003)
charts/twin/       Helm chart for deploying TwinGuard itself
examples/demo-mesh/  Demo target environment (safe + risky values)
fixtures/          Pre-rendered manifests for no-Helm demo
docs/              QUICKSTART.md · BUSINESS_VALUE.md · DEMO_SCRIPT.md
.gitlab-ci.yml     GitLab CI pipeline (warning-only, MR comment, artifacts)
demo.sh            Interactive demo script
```

---

## CI pipeline

TwinGuard ships with a GitLab CI pipeline (`.gitlab-ci.yml`) that:
1. Renders baseline and candidate manifests with Helm
2. Runs TwinGuard analysis
3. Posts a `summary.md` comment to the MR
4. Archives artifacts for audit

Enforce mode (`--enforce=true`) blocks the pipeline on violations. Default is warning-only.

---

## Adding a policy rule

Implement `PolicyRule` in `packages/policy/src/index.ts`:

```ts
const myRule: PolicyRule = {
  id: "GR-004",
  title: "My custom rule",
  evaluate(ctx) {
    const violations: PolicyViolation[] = [];
    // inspect ctx.snapshot.graph and ctx.snapshot.reachability
    return violations;
  },
};
```

Add it to `defaultRules` and it runs automatically on every analysis.

---

*TwinGuard — Simulate before you ship.*
