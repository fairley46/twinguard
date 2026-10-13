import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("k8s sample reports exactly 2 violations", () => {
  const outDir = mkdtempSync(join(tmpdir(), "twinguard-k8s-"));
  try {
    const result = spawnSync(
      "npm",
      [
        "run",
        "analyze",
        "--",
        "--driver",
        "k8s",
        "--baseline",
        "fixtures/baseline",
        "--candidate",
        "fixtures/candidate",
        "--out-dir",
        outDir,
      ],
      { cwd: packageRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);

    const analysis = JSON.parse(readFileSync(join(outDir, "analysis.json"), "utf8"));
    assert.equal(analysis.violations.length, 2);
    assert.deepEqual(
      analysis.violations.map((violation) => violation.id).sort(),
      ["GR-001", "GR-003"],
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
