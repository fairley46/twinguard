import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSnapshot,
  createSnapshotFromGraph,
  diffSnapshots,
  parseManifestDir,
  toHtmlReport,
  toMarkdownSummary,
  toSarifReport,
  type AnalysisResult,
} from "@twin/core";
import { evaluatePolicies } from "@twin/policy";
import { parseTerraformPlanDir } from "@twin/terraform";

type ArgMap = Record<string, string | boolean>;
type Driver = "k8s" | "terraform";

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function getString(args: ArgMap, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required arg --${key}`);
}

function getBool(args: ArgMap, key: string, fallback: boolean): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function getDriver(args: ArgMap): Driver {
  const val = args["driver"];
  if (val === "terraform") return "terraform";
  return "k8s";
}

function runAnalyze(args: ArgMap): number {
  const baselineDir = getString(args, "baseline");
  const candidateDir = getString(args, "candidate");
  const outDir = getString(args, "out-dir", "artifacts");
  const enforce = getBool(args, "enforce", false);
  const driver = getDriver(args);

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

  const result: AnalysisResult = { baseline, candidate, diff, violations };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "analysis.json"), JSON.stringify(result, null, 2), "utf8");
  writeFileSync(join(outDir, "summary.md"), toMarkdownSummary(result), "utf8");
  writeFileSync(join(outDir, "report.html"), toHtmlReport(result), "utf8");
  writeFileSync(join(outDir, "results.sarif"), toSarifReport(result, driver), "utf8");

  if (enforce && violations.length > 0) {
    console.error(`[${driver}] Policy violations found: ${violations.length}`);
    return 1;
  }

  console.log(`[${driver}] Analysis complete. Violations: ${violations.length}. Artifacts in ${outDir}`);
  return 0;
}

function runReport(args: ArgMap): number {
  const inFile = getString(args, "in", "artifacts/analysis.json");
  const outDir = getString(args, "out-dir", "artifacts");

  const result = JSON.parse(readFileSync(inFile, "utf8")) as AnalysisResult;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "summary.md"), toMarkdownSummary(result), "utf8");
  writeFileSync(join(outDir, "report.html"), toHtmlReport(result), "utf8");

  console.log(`Report generated in ${outDir}`);
  return 0;
}

function main(): void {
  const [command = "analyze", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  let code = 0;
  if (command === "analyze") code = runAnalyze(args);
  else if (command === "report") code = runReport(args);
  else {
    console.error(`Unknown command: ${command}`);
    code = 1;
  }

  process.exit(code);
}

main();
