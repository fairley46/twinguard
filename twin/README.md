# TwinGuard

**Simulate before you ship.**

TwinGuard builds a digital twin of your infrastructure from a proposed change, simulates network reachability, and enforces security policy — before it reaches production.

Works on **Kubernetes manifests** and **Terraform plans**. No live cluster or cloud account required.

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
Your change (Helm values · Terraform plan)
        ↓
Parse into a property graph
  Workloads · Services · Network paths · Policy rules
        ↓
Simulate reachability — who can reach what, and why
        ↓
Diff against baseline — what is the blast radius?
        ↓
Evaluate golden rules against the candidate
        ↓
Violations → block + report     Clean → pass + archive
```

---

## Ways to consume TwinGuard

### 1. MCP Server — AI-native (Claude Code, Cursor, Zed)

Add TwinGuard directly to your AI coding assistant. It can analyze your infrastructure changes inline, explain violations in plain English, and suggest fixes — while you write the code.

**Add to your MCP config** (`~/.claude/mcp.json` or `.mcp.json` in your project):

```json
{
  "mcpServers": {
    "twinguard": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "packages/mcp/src/index.ts"],
      "cwd": "/path/to/twinguard"
    }
  }
}
```

**Available tools:**

| Tool | What it does |
|------|-------------|
| `analyze` | Simulate a change — returns violations, blast radius diff, markdown summary |
| `list_policies` | List all active policy rules |
| `explain_violation` | Plain English explanation of a violation + how to fix it |

**Example:** Ask Claude — *"Analyze my Terraform changes for security violations"* → Claude calls `analyze`, gets back violations, explains them, suggests fixes.

---

### 2. CLI — run it anywhere

```bash
git clone https://github.com/fairley46/twinguard
cd twinguard
npm install
```

**Kubernetes:**
```bash
npm run analyze -- \
  --driver k8s \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts/k8s
```

**Terraform:**
```bash
npm run analyze -- \
  --driver terraform \
  --baseline fixtures/terraform/baseline \
  --candidate fixtures/terraform/candidate \
  --out-dir artifacts/terraform
```

**Live watch mode** — re-runs on every file save:
```bash
npm run watch -- \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts
```

**Interactive demo** — walks through both K8s and Terraform scenarios:
```bash
./demo.sh
```

---

### 3. GitHub Actions — automatic on every PR

Drop-in workflow that runs on every pull request to `main`. No config needed to get started — uses fixtures as fallback if Helm or Terraform aren't set up.

**What it does automatically:**
- Runs TwinGuard analysis for both Kubernetes and Terraform
- Posts a violation summary as a PR comment
- Uploads the full HTML report as a downloadable artifact (30-day retention)

**To wire up your own infra:**

*Kubernetes:* Update the `helm template` paths in `.github/workflows/twinguard.yml` to point at your charts.

*Terraform:* Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as GitHub Secrets (`Settings → Secrets → Actions`). The workflow runs `terraform plan` on both branches automatically.

**To block merges on violations**, set `--enforce=true` in the workflow.

---

### 4. Enforce mode in any CI

Works with GitHub Actions, GitLab CI, Jenkins, or any CI that runs shell commands:

```bash
npm run analyze -- \
  --driver k8s \
  --baseline /path/to/baseline \
  --candidate /path/to/candidate \
  --enforce=true   # exits 1 on violations → CI fails
```

---

## Artifacts produced every run

| File | Purpose |
|------|---------|
| `artifacts/summary.md` | Posted as a GitHub PR comment |
| `artifacts/report.html` | Visual report — open in browser |
| `artifacts/analysis.json` | Machine-readable — audit archive, downstream tools |

---

## Supported infrastructure

| Driver | Input | Flag |
|--------|-------|------|
| Kubernetes | Rendered Helm / kubectl YAML | `--driver k8s` (default) |
| Terraform (AWS) | `terraform show -json` plan output | `--driver terraform` |

GCP, Azure, and Pulumi adapters are on the roadmap.

---

## Repo layout

```
apps/api/                CLI (analyze · report · watch commands)
packages/core/           Parse · graph · simulate · diff · report engine
packages/policy/         Golden-rule policy pack (GR-001, GR-002, GR-003)
packages/terraform/      Terraform plan adapter
packages/mcp/            MCP server (Claude Code, Cursor, Zed integration)
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
demo.sh                  Interactive terminal demo (K8s + Terraform)
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

Add it to `defaultRules` — it runs on every analysis, for every driver, including MCP tool calls.

---

## Roadmap

- [ ] GitHub App — one-click install, zero CLI setup
- [ ] Web dashboard — persistent history, team-wide policy status
- [ ] GCP + Azure + Pulumi adapters
- [ ] Policy management UI
- [ ] SARIF output for GitHub Security Dashboard

---

*TwinGuard — Simulate before you ship.*
