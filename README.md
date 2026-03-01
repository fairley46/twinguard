# TwinGuard

**Simulate before you ship.**

TwinGuard builds a digital twin of your infrastructure from a proposed change, simulates network reachability, and enforces security policy — before the PR merges.

No live cluster access. No cloud credentials. No agents. Works entirely on manifests and plan files.

---

## The Problem

A developer changes two lines in a Helm values file. CI runs. Linting passes. Tests pass. The diff looks clean.

It merges — and the database is now reachable from the public internet.

This happens because the tools that guard the merge don't understand *what a change actually does* to a running system. They check syntax. They don't simulate behavior.

**TwinGuard fixes that.**

---

## How It Works

```
Pull request opened
        ↓
TwinGuard parses baseline + candidate manifests into a property graph
  Workloads · Services · Network paths · Policy rules
        ↓
Simulates reachability — who can reach what, and why
        ↓
Diffs the two graphs — what is the blast radius of this change?
        ↓
Evaluates policy rules against the candidate
        ↓
Violations → block + post report to PR     Clean → pass + archive artifact
```

---

## What It Catches

| Rule | Description | Severity |
|------|-------------|----------|
| **GR-001** | Public Ingress or load balancer routing traffic to a `tier=data` workload | `HIGH` |
| **GR-002** | Cross-namespace / cross-environment traffic without an explicit allowlist | `MEDIUM` |
| **GR-003** | Wildcard egress (`0.0.0.0/0`) from any workload in the `prod` environment | `HIGH` |

Rules are plain TypeScript — add your own in under 10 lines.

---

## Supported Infrastructure

| Platform | Input | Resource Types |
|----------|-------|----------------|
| **Kubernetes** | Helm-rendered YAML / raw manifests | Deployment, Service, Ingress, NetworkPolicy |
| **AWS** | `terraform show -json` plan | EC2, ECS, Lambda, RDS, ElastiCache, Security Groups, ALB |
| **GCP** | `terraform show -json` plan | Compute Instance, Cloud Run, Cloud SQL, Firewall, Forwarding Rule |
| **Azure** | `terraform show -json` plan | Virtual Machine, App Service, SQL, NSG, Load Balancer |

---

## Quick Start

### Prerequisites

- Node.js 22+
- npm 9+

```bash
git clone https://github.com/fairley46/twinguard
cd twinguard
npm install
```

### Run the demo

No Helm, no cloud account, no configuration required. All fixtures are pre-rendered and ship with the repo.

```bash
# Kubernetes — catches public database exposure + wildcard egress
npm run analyze -- --driver k8s \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts/k8s

# Terraform (AWS)
npm run analyze -- --driver terraform \
  --baseline fixtures/terraform/baseline \
  --candidate fixtures/terraform/candidate \
  --out-dir artifacts/terraform

# GCP
npm run analyze -- --driver terraform \
  --baseline fixtures/gcp/baseline \
  --candidate fixtures/gcp/candidate \
  --out-dir artifacts/gcp

# Azure
npm run analyze -- --driver terraform \
  --baseline fixtures/azure/baseline \
  --candidate fixtures/azure/candidate \
  --out-dir artifacts/azure
```

Open `artifacts/k8s/report.html` to see the full simulation report.

Or run the interactive terminal demo:

```bash
./demo.sh
```

---

## Ways to Consume TwinGuard

### 1. GitHub Actions — automatic on every PR

Drop-in workflow that runs on every pull request. Posts a violation summary as a PR comment, uploads SARIF to the GitHub Security tab, and archives the full HTML report as an artifact.

```yaml
# .github/workflows/twinguard.yml
- name: Run TwinGuard analysis
  run: |
    npm run analyze -- \
      --driver k8s \
      --baseline /tmp/baseline \
      --candidate /tmp/candidate \
      --out-dir artifacts/k8s \
      --enforce    # exit 1 on violations — blocks the merge

- name: Upload SARIF to GitHub Security tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: artifacts/k8s/results.sarif
    category: twinguard-k8s
```

See the full workflow at [`.github/workflows/twinguard.yml`](.github/workflows/twinguard.yml). It includes Helm rendering, Terraform plan generation, pre-rendered fixture fallback, PR comments, and 30-day artifact retention — out of the box.

---

### 2. MCP Server — AI-native (Claude Code, Cursor, Zed)

TwinGuard ships as a [Model Context Protocol](https://modelcontextprotocol.io) server. Connect it to your AI coding assistant and it can analyze infrastructure changes inline, explain violations in plain English, and suggest fixes while you write code.

**`~/.claude/mcp.json` or `.mcp.json` in your project:**

```json
{
  "mcpServers": {
    "twinguard": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/twinguard/packages/mcp/src/index.ts"]
    }
  }
}
```

**Available tools:**

| Tool | What it does |
|------|-------------|
| `analyze` | Simulate a change — returns violations, blast radius diff, markdown summary |
| `list_policies` | List all active policy rules with descriptions |
| `explain_violation` | Plain English explanation of a violation + remediation steps |

Ask Claude: *"Analyze my Terraform changes for security violations"* → Claude calls `analyze`, receives violations, explains them, and suggests fixes — in context, without leaving your editor.

---

### 3. CLI — run anywhere

Works in any CI that can run shell commands (GitHub Actions, GitLab CI, Jenkins, local).

```bash
# Analyze and write all artifacts
npm run analyze -- \
  --driver k8s \
  --baseline /path/to/baseline \
  --candidate /path/to/candidate \
  --out-dir artifacts \
  --enforce          # exit 1 if violations found

# Re-generate report from a saved analysis
npm run report -- \
  --in artifacts/analysis.json \
  --out-dir artifacts

# Live watch mode — re-runs on every file save
npm run watch -- \
  --driver k8s \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate
```

**Outputs per run:**

| File | Contents |
|------|----------|
| `analysis.json` | Full machine-readable result — violations, diff, reachability graph |
| `summary.md` | Markdown summary for PR comments |
| `report.html` | Dark-theme HTML report with reachability table |
| `results.sarif` | SARIF 2.1.0 for GitHub Security tab |

---

### 4. GitHub App — zero-config org-wide

Self-host the TwinGuard GitHub App to get automatic analysis on every PR across your entire organization — no per-repo workflow setup required.

```bash
# Environment
GITHUB_APP_ID=your-app-id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your-webhook-secret
PORT=3000

cd apps/github-app
npm start
```

The app handles webhook verification, auto-detects K8s vs Terraform from the PR file list, runs simulation, and posts a structured report comment on every PR.

---

## Artifacts

Every analysis run produces four outputs:

**`report.html`** — Full dark-theme simulation report. Shows violation details, severity badges, and the complete candidate reachability graph.

**`results.sarif`** — SARIF 2.1.0. Shows up in the **GitHub Security tab** alongside Checkov and Trivy results. Maps violations to logical infrastructure locations.

**`summary.md`** — Compact markdown summary. Posted directly as a PR comment by the GitHub Actions workflow.

**`analysis.json`** — Complete machine-readable result. Archive it, feed it to downstream tools, or re-render it later with `npm run report`.

---

## Writing Custom Policy Rules

Rules live in [`packages/policy/src/index.ts`](packages/policy/src/index.ts). Each rule is a plain TypeScript object implementing two fields: `id`, `title`, and an `evaluate` function.

```typescript
const myRule: PolicyRule = {
  id: "GR-004",
  title: "No SSH from the internet",
  evaluate(ctx) {
    const violations: PolicyViolation[] = [];
    for (const edge of ctx.snapshot.reachability) {
      if (edge.to.includes("bastion") && edge.port === 22) {
        violations.push({
          id: this.id,
          title: this.title,
          severity: "high",
          details: `SSH reachable on ${edge.to} from ${edge.from}`,
        });
      }
    }
    return violations;
  },
};
```

Add it to `defaultRules` — it runs on every analysis across all drivers: K8s, Terraform, GCP, Azure, and MCP tool calls.

---

## Repository Layout

```
twinguard/
├── packages/
│   ├── core/          # Property graph, simulation engine, diff, HTML/SARIF reports
│   ├── policy/        # Built-in policy rules (GR-001 · GR-002 · GR-003)
│   ├── terraform/     # Terraform plan JSON parser (AWS · GCP · Azure)
│   └── mcp/           # MCP server — analyze, list_policies, explain_violation
├── apps/
│   ├── api/           # CLI: npm run analyze / report / watch
│   └── github-app/    # GitHub App webhook server (Hono + Octokit)
├── fixtures/
│   ├── baseline/      # Pre-rendered safe K8s manifests
│   ├── candidate/     # Risky K8s manifests (triggers GR-001 + GR-003)
│   ├── terraform/     # AWS Terraform plans (baseline · candidate)
│   ├── gcp/           # GCP Terraform plans (baseline · candidate)
│   └── azure/         # Azure Terraform plans (baseline · candidate)
├── .github/
│   └── workflows/
│       └── twinguard.yml   # Full CI integration — K8s + Terraform, PR comments, SARIF
└── docs/
    ├── PITCH.md        # Product overview and competitive landscape
    ├── ROADMAP.md      # Development priorities and rationale
    └── QUICKSTART.md   # Detailed setup guide
```

---

## Why Not Existing Tools?

**Static IaC scanners** (Checkov, Trivy, KICS) check files for known bad patterns. A manifest can pass every check and still expose your database — because static scanners don't model how resources relate to each other.

**CSPM platforms** (Wiz, Prisma Cloud, Orca) scan live running infrastructure. Powerful blast radius analysis — on what's already deployed. $100K+/year. Require cloud credentials, agents, and runtime access.

**Runtime policy engines** (OPA Gatekeeper, Kyverno) enforce at admission time. No developer feedback until `kubectl apply` or `terraform apply`.

TwinGuard's position: **behavioral simulation, pre-merge, zero runtime access**. Unoccupied by any of the above.

---

## Roadmap

| Priority | Feature | Status |
|----------|---------|--------|
| ~~SARIF output~~ | GitHub Security tab integration | **Shipped** |
| ~~GitHub App~~ | One-click install, org-wide coverage | **Shipped** |
| ~~GCP + Azure adapters~~ | Full multi-cloud Terraform coverage | **Shipped** |
| OPA / Rego import | Bring your existing Rego policies | Planned |
| Kyverno / Gatekeeper export | Generate runtime enforcement from pre-merge analysis | Planned |
| Web dashboard | Persistent history, team-wide violation trends | Planned |
| Policy management UI | Visual rule management for non-engineers | Planned |
| Multi-tenant SaaS | Full platform, monetization | Planned |

See [docs/ROADMAP.md](./docs/ROADMAP.md) for priority rationale and competitive context.

---

*Simulate before you ship.*
