import { watch } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSnapshot,
  diffSnapshots,
  parseManifestDir,
  toHtmlReport,
  toMarkdownSummary,
  type AnalysisResult,
} from "@twin/core";
import { evaluatePolicies, type PolicyViolation } from "@twin/policy";

// ── ANSI ─────────────────────────────────────────────────────────────────────
const B     = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM   = (s: string) => `\x1b[2m${s}\x1b[0m`;
const CYAN  = (s: string) => `\x1b[1;36m${s}\x1b[0m`;
const GREEN = (s: string) => `\x1b[1;32m${s}\x1b[0m`;
const RED   = (s: string) => `\x1b[1;31m${s}\x1b[0m`;
const YELLOW= (s: string) => `\x1b[1;33m${s}\x1b[0m`;
const GRAY  = (s: string) => `\x1b[90m${s}\x1b[0m`;

const SEP = GRAY("─".repeat(56));

// ── Args ──────────────────────────────────────────────────────────────────────
function getArg(key: string, fallback?: string): string {
  const idx = process.argv.indexOf(`--${key}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required arg --${key}`);
}

const baselineDir  = getArg("baseline");
const candidateDir = getArg("candidate");
const outDir       = getArg("out-dir", "artifacts");

// ── Analysis ──────────────────────────────────────────────────────────────────
function runAnalysis(): AnalysisResult {
  const baseline  = createSnapshot(parseManifestDir(baselineDir));
  const candidate = createSnapshot(parseManifestDir(candidateDir));
  const diff      = diffSnapshots(baseline, candidate);
  const violations = evaluatePolicies({ snapshot: candidate });
  return { baseline, candidate, diff, violations };
}

function writeArtifacts(result: AnalysisResult): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "analysis.json"),  JSON.stringify(result, null, 2), "utf8");
  writeFileSync(join(outDir, "summary.md"),     toMarkdownSummary(result),       "utf8");
  writeFileSync(join(outDir, "report.html"),    toHtmlReport(result),            "utf8");
}

// ── Render ────────────────────────────────────────────────────────────────────
function severityColor(s: string): (t: string) => string {
  if (s === "high")   return RED;
  if (s === "medium") return YELLOW;
  return GRAY;
}

function renderViolation(v: PolicyViolation, prefix: string, prefixFn: (s: string) => string): void {
  const color = severityColor(v.severity);
  console.log(`  ${prefixFn(prefix)} ${color(`[${v.severity.toUpperCase()}]`)} ${B(v.title)}`);
  console.log(`       ${GRAY(v.id)} ${DIM(v.details)}`);
}

function renderDiff(prev: PolicyViolation[], next: PolicyViolation[]): void {
  const prevKeys = new Map(prev.map((v) => [`${v.id}:${v.details}`, v]));
  const nextKeys = new Map(next.map((v) => [`${v.id}:${v.details}`, v]));

  const appeared = [...nextKeys.entries()].filter(([k]) => !prevKeys.has(k)).map(([, v]) => v);
  const resolved = [...prevKeys.entries()].filter(([k]) => !nextKeys.has(k)).map(([, v]) => v);
  const unchanged = [...nextKeys.entries()].filter(([k]) => prevKeys.has(k)).map(([, v]) => v);

  if (appeared.length === 0 && resolved.length === 0 && unchanged.length === 0) {
    console.log(`  ${GREEN("✔")} No violations.`);
    return;
  }

  for (const v of appeared)  renderViolation(v, "NEW", RED);
  for (const v of resolved)  renderViolation(v, "FIXED", GREEN);
  for (const v of unchanged) renderViolation(v, "·", GRAY);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let prevViolations: PolicyViolation[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let runCount = 0;

function render(changed?: string): void {
  runCount += 1;
  const ts = new Date().toLocaleTimeString();

  process.stdout.write("\x1b[2J\x1b[H"); // clear screen

  // Header
  console.log(`\n  ${B("Twin")}${CYAN("Guard")}  ${DIM("watch mode")}  ${GRAY(`run #${runCount} · ${ts}`)}`);
  console.log(`  ${DIM("Simulate before you ship.")}\n`);
  console.log(SEP);

  let result: AnalysisResult;
  try {
    result = runAnalysis();
  } catch (err) {
    console.log(`\n  ${RED("Error running analysis:")}`);
    console.log(`  ${GRAY(String(err))}\n`);
    console.log(SEP);
    console.log(`\n  ${DIM(`Watching ${candidateDir} for changes...`)}\n`);
    return;
  }

  writeArtifacts(result);

  const { diff, violations } = result;

  // Trigger
  if (changed) {
    console.log(`\n  ${CYAN("↺")} ${DIM("Change detected:")} ${GRAY(changed)}`);
  } else {
    console.log(`\n  ${CYAN("↺")} ${DIM("Initial run")}`);
  }

  // KPIs
  console.log(`\n  ${DIM("Changed resources")}     ${B(String(diff.changedResources.length))}`);
  console.log(`  ${DIM("Added edges")}           ${B(String(diff.addedReachability.length))}`);
  console.log(`  ${DIM("Removed edges")}         ${B(String(diff.removedReachability.length))}`);

  const vColor = violations.length > 0 ? RED : GREEN;
  console.log(`  ${DIM("Violations")}            ${vColor(B(String(violations.length)))}\n`);

  console.log(SEP);
  console.log(`\n  ${B("Violations diff")}\n`);

  renderDiff(prevViolations, violations);

  prevViolations = violations;

  console.log(`\n${SEP}`);
  console.log(`\n  ${GREEN("artifacts/")}${DIM("summary.md · report.html · analysis.json")}`);
  console.log(`\n  ${DIM(`Watching ${candidateDir} for changes...\n`)}`);
}

// Initial run
render();

// Watch candidate dir
let watchTimeout: ReturnType<typeof setTimeout> | null = null;

watch(candidateDir, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    render(filename);
  }, 200);
});

process.on("SIGINT", () => {
  console.log(`\n\n  ${DIM("TwinGuard watch stopped.")}\n`);
  process.exit(0);
});
