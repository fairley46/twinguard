import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadAll } from "js-yaml";
import type { K8sManifest } from "./types.js";

function collectFiles(path: string, acc: string[]): void {
  const st = statSync(path);
  if (st.isFile() && (path.endsWith(".yaml") || path.endsWith(".yml"))) {
    acc.push(path);
    return;
  }
  if (!st.isDirectory()) return;
  for (const entry of readdirSync(path)) {
    collectFiles(join(path, entry), acc);
  }
}

export function parseManifestDir(dir: string): K8sManifest[] {
  const files: string[] = [];
  collectFiles(dir, files);

  const manifests: K8sManifest[] = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const docs = loadAll(raw);
    for (const doc of docs) {
      if (!doc || typeof doc !== "object") continue;
      manifests.push(doc as K8sManifest);
    }
  }
  return manifests;
}
