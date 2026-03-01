import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createSnapshot,
  createSnapshotFromGraph,
  diffSnapshots,
  parseManifestDir,
  toHtmlReport,
  toMarkdownSummary,
} from "@twin/core";
import { defaultRules, evaluatePolicies } from "@twin/policy";
import { parseTerraformPlanDir } from "@twin/terraform";
import { z } from "zod";

const server = new McpServer({
  name: "twinguard",
  version: "0.1.0",
});

// ── Tool: analyze ─────────────────────────────────────────────────────────────
server.tool(
  "analyze",
  "Simulate an infrastructure change and evaluate it against TwinGuard security policies. " +
  "Returns violations, blast radius diff, and a markdown summary. " +
  "Supports Kubernetes manifests (--driver k8s) and Terraform plans (--driver terraform).",
  {
    driver: z
      .enum(["k8s", "terraform"])
      .default("k8s")
      .describe("Infrastructure type: 'k8s' for Kubernetes manifests, 'terraform' for Terraform plan JSON"),
    baseline: z
      .string()
      .describe("Absolute or relative path to the baseline directory (current state)"),
    candidate: z
      .string()
      .describe("Absolute or relative path to the candidate directory (proposed change)"),
    out_dir: z
      .string()
      .optional()
      .describe("Optional path to write artifacts (summary.md, report.html, analysis.json). Defaults to ./artifacts"),
  },
  async ({ driver, baseline, candidate, out_dir }) => {
    const baselineAbs = resolve(baseline);
    const candidateAbs = resolve(candidate);
    const outDir = resolve(out_dir ?? "artifacts");

    try {
      const baselineSnap =
        driver === "terraform"
          ? createSnapshotFromGraph(parseTerraformPlanDir(baselineAbs))
          : createSnapshot(parseManifestDir(baselineAbs));

      const candidateSnap =
        driver === "terraform"
          ? createSnapshotFromGraph(parseTerraformPlanDir(candidateAbs))
          : createSnapshot(parseManifestDir(candidateAbs));

      const diff = diffSnapshots(baselineSnap, candidateSnap);
      const violations = evaluatePolicies({ snapshot: candidateSnap });

      const result = { baseline: baselineSnap, candidate: candidateSnap, diff, violations };

      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "analysis.json"), JSON.stringify(result, null, 2), "utf8");
      writeFileSync(join(outDir, "summary.md"), toMarkdownSummary(result), "utf8");
      writeFileSync(join(outDir, "report.html"), toHtmlReport(result), "utf8");

      const summary = {
        driver,
        violations: violations.map((v) => ({
          id: v.id,
          title: v.title,
          severity: v.severity,
          details: v.details,
        })),
        diff: {
          changedResources: diff.changedResources.length,
          addedReachabilityEdges: diff.addedReachability.length,
          removedReachabilityEdges: diff.removedReachability.length,
        },
        artifactsWrittenTo: outDir,
        markdownSummary: toMarkdownSummary(result),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `TwinGuard analysis failed: ${String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: list_policies ───────────────────────────────────────────────────────
server.tool(
  "list_policies",
  "List all active TwinGuard policy rules with their IDs, descriptions, and severity levels.",
  {},
  async () => {
    const rules = defaultRules.map((r) => ({
      id: r.id,
      title: r.title,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(rules, null, 2),
        },
      ],
    };
  }
);

// ── Tool: explain_violation ───────────────────────────────────────────────────
server.tool(
  "explain_violation",
  "Explain what a TwinGuard policy violation means in plain terms, what the risk is, and how to fix it.",
  {
    id: z.string().describe("Policy rule ID, e.g. GR-001"),
    details: z.string().describe("The violation details string from the analysis output"),
    severity: z.enum(["low", "medium", "high"]).describe("Severity of the violation"),
  },
  async ({ id, details, severity }) => {
    const explanations: Record<string, { risk: string; fix: string }> = {
      "GR-001": {
        risk: "A database, cache, or other data-tier workload is directly reachable from the public internet. " +
              "This means anyone can attempt to connect to it — no VPN, no authentication layer, no bastion host required. " +
              "This is one of the most common causes of data breaches.",
        fix: "Remove the public Ingress or load balancer rule pointing to this workload. " +
             "Data-tier resources should only be reachable from application-tier workloads within the same private network. " +
             "If external access is genuinely required, add an authenticated API gateway or bastion host in front of it.",
      },
      "GR-002": {
        risk: "A workload in one namespace or environment can reach a workload in a different namespace or environment " +
              "without this being explicitly approved. This creates unintended lateral movement paths — " +
              "if one service is compromised, it can be used to pivot into other environments.",
        fix: "Add a NetworkPolicy (Kubernetes) or security group rule (AWS) that explicitly allows only the " +
             "specific cross-namespace traffic you intend. Then add that pair to the TwinGuard allowlist " +
             "in the policy context so it is tracked and reviewed.",
      },
      "GR-003": {
        risk: "A production workload has an unrestricted outbound rule (0.0.0.0/0). This means it can connect " +
              "to any external endpoint on any port — making it trivial to exfiltrate data, download malware, " +
              "or establish a reverse shell if the workload is compromised.",
        fix: "Replace the wildcard egress rule with explicit allow rules for only the external endpoints " +
             "the workload legitimately needs to reach (e.g., a specific API domain, an S3 endpoint, a payment gateway). " +
             "Deny everything else by default.",
      },
    };

    const explanation = explanations[id] ?? {
      risk: "This rule flags a security misconfiguration in your infrastructure.",
      fix: "Review the policy definition in packages/policy/src/index.ts for remediation guidance.",
    };

    const output = {
      rule: id,
      severity,
      violation: details,
      whatThisRiskMeans: explanation.risk,
      howToFix: explanation.fix,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
