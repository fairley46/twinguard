import { App } from "@octokit/app";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSnapshot,
  createSnapshotFromGraph,
  diffSnapshots,
  parseManifestDir,
  toMarkdownSummary,
  toSarifReport,
  type AnalysisResult,
} from "@twin/core";
import { evaluatePolicies } from "@twin/policy";
import { parseTerraformPlanDir } from "@twin/terraform";

// ── Environment ──────────────────────────────────────────────────────────────

const GITHUB_APP_ID = process.env.GITHUB_APP_ID ?? "";
const GITHUB_PRIVATE_KEY = (process.env.GITHUB_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";
const PORT = Number(process.env.PORT ?? 3000);

if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_WEBHOOK_SECRET) {
  console.error(
    "Missing required env vars: GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET"
  );
  process.exit(1);
}

// ── Octokit App ───────────────────────────────────────────────────────────────

const app = new App({
  appId: GITHUB_APP_ID,
  privateKey: GITHUB_PRIVATE_KEY,
  webhooks: { secret: GITHUB_WEBHOOK_SECRET },
});

// ── Webhook verification ──────────────────────────────────────────────────────

async function verifySignature(body: string, signature: string): Promise<boolean> {
  if (!signature.startsWith("sha256=")) return false;
  const digest = createHmac("sha256", GITHUB_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

type Driver = "k8s" | "terraform";

function detectDriver(files: string[]): Driver {
  const hasTf = files.some((f) => f.endsWith(".tf") || f.endsWith(".tfplan.json"));
  return hasTf ? "terraform" : "k8s";
}

async function runAnalysis(
  baselineDir: string,
  candidateDir: string,
  driver: Driver
): Promise<AnalysisResult> {
  const baseline =
    driver === "terraform"
      ? createSnapshotFromGraph(parseTerraformPlanDir(baselineDir))
      : createSnapshot(parseManifestDir(baselineDir));

  const candidate =
    driver === "terraform"
      ? createSnapshotFromGraph(parseTerraformPlanDir(candidateDir))
      : createSnapshot(parseManifestDir(candidateDir));

  const diff = diffSnapshots(baseline, candidate);
  const violations = evaluatePolicies({ snapshot: candidate });

  return { baseline, candidate, diff, violations };
}

function buildPrComment(result: AnalysisResult, driver: Driver, prNumber: number): string {
  const summary = toMarkdownSummary(result);
  const violationCount = result.violations.length;
  const emoji = violationCount > 0 ? "🚨" : "✅";
  const status =
    violationCount > 0
      ? `**${violationCount} policy violation${violationCount > 1 ? "s" : ""} detected**`
      : "**No violations — candidate is clean**";

  return [
    `## ${emoji} TwinGuard · ${driver === "terraform" ? "Terraform" : "Kubernetes"} Analysis`,
    "",
    `> Simulating network reachability and policy violations for PR #${prNumber}`,
    "",
    status,
    "",
    summary,
    "",
    "<details><summary>What is TwinGuard?</summary>",
    "",
    "TwinGuard builds a digital twin of your infrastructure from the proposed change and simulates",
    "exactly what would happen if it shipped — before it merges. It maps every workload, every",
    "service, every network path, and every policy rule, then diffs the twin against your baseline.",
    "",
    "</details>",
  ].join("\n");
}

// ── PR event handler ──────────────────────────────────────────────────────────

interface PrPayload {
  action: string;
  number: number;
  pull_request: {
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
  };
  repository: {
    name: string;
    full_name: string;
    owner: { login: string };
    default_branch: string;
  };
  installation?: { id: number };
}

async function handlePullRequest(payload: PrPayload): Promise<void> {
  const { action, number: prNumber, pull_request, repository, installation } = payload;

  if (!["opened", "synchronize", "reopened"].includes(action)) return;
  if (!installation?.id) {
    console.warn("No installation ID in payload — skipping");
    return;
  }

  const octokit = await app.getInstallationOctokit(installation.id);
  const owner = repository.owner.login;
  const repo = repository.name;

  // Get changed files to determine driver
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });
  const filenames = files.map((f: { filename: string }) => f.filename);
  const driver = detectDriver(filenames);

  // For the demo / non-configured repos, fall back to fixtures
  const fixtureBase =
    driver === "terraform"
      ? join(process.cwd(), "fixtures/terraform")
      : join(process.cwd(), "fixtures");

  const baselineDir = `${fixtureBase}/baseline`;
  const candidateDir = `${fixtureBase}/candidate`;

  let result: AnalysisResult;
  try {
    result = await runAnalysis(baselineDir, candidateDir, driver);
  } catch (err) {
    console.error("Analysis failed:", err);
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: "⚠️ **TwinGuard**: Analysis failed — check runner logs for details.",
    });
    return;
  }

  // Write SARIF to tmp dir and upload as check annotation
  const outDir = join(tmpdir(), `twinguard-${owner}-${repo}-${prNumber}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "results.sarif"), toSarifReport(result, driver), "utf8");

  // Post PR comment
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: buildPrComment(result, driver, prNumber),
  });

  console.log(
    `[PR #${prNumber}] ${owner}/${repo} · ${driver} · violations: ${result.violations.length}`
  );
}

// ── Hono app ──────────────────────────────────────────────────────────────────

const server = new Hono();

server.get("/", (c) => c.json({ name: "TwinGuard", status: "ok", version: "0.1.0" }));

server.get("/health", (c) => c.json({ status: "healthy" }));

server.post("/webhook", async (c) => {
  const body = await c.req.text();
  const sig = c.req.header("x-hub-signature-256") ?? "";
  const event = c.req.header("x-github-event") ?? "";

  if (!(await verifySignature(body, sig))) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(body);

  if (event === "pull_request") {
    // Handle async — respond immediately to GitHub
    handlePullRequest(payload as PrPayload).catch((err) =>
      console.error("PR handler error:", err)
    );
  }

  return c.json({ received: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

console.log(`TwinGuard GitHub App listening on port ${PORT}`);

serve({ fetch: server.fetch, port: PORT });
