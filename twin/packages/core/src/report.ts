import type { TwinDiff, TwinSnapshot } from "./types.js";

export type AnalysisResult = {
  baseline: TwinSnapshot;
  candidate: TwinSnapshot;
  diff: TwinDiff;
  violations: Array<{
    id: string;
    title: string;
    severity: "low" | "medium" | "high";
    details: string;
  }>;
};

function esc(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function toMarkdownSummary(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push("# Twin Simulation Summary");
  lines.push("");
  lines.push(`- Changed resources: ${result.diff.changedResources.length}`);
  lines.push(`- Added reachability edges: ${result.diff.addedReachability.length}`);
  lines.push(`- Removed reachability edges: ${result.diff.removedReachability.length}`);
  lines.push(`- Policy violations: ${result.violations.length}`);
  lines.push("");

  if (result.violations.length > 0) {
    lines.push("## Violations");
    for (const v of result.violations) {
      lines.push(`- [${v.severity.toUpperCase()}] ${v.title}: ${v.details}`);
    }
  }

  return lines.join("\n");
}

export function toHtmlReport(result: AnalysisResult): string {
  const violations = result.violations
    .map((v) => `<li><strong>${esc(v.severity.toUpperCase())}</strong> ${esc(v.title)}<br/>${esc(v.details)}</li>`)
    .join("\n");

  const edges = result.candidate.reachability
    .map((e) => `<tr><td>${esc(e.from)}</td><td>${esc(e.to)}</td><td>${esc(String(e.port))}</td><td>${esc(e.reason)}</td></tr>`)
    .join("\n");

  const violationCount = result.violations.length;
  const statusColor = violationCount > 0 ? "#ef4444" : "#22c55e";
  const statusLabel = violationCount > 0 ? `${violationCount} VIOLATION${violationCount > 1 ? "S" : ""} FOUND` : "CLEAN — NO VIOLATIONS";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TwinGuard — Simulation Report</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

      header { background: #0f172a; border-bottom: 1px solid #1e293b; padding: 20px 32px; display: flex; align-items: center; gap: 16px; }
      .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #f8fafc; }
      .logo span { color: #0ea5e9; }
      .tagline { font-size: 12px; color: #64748b; margin-top: 2px; letter-spacing: 0.05em; text-transform: uppercase; }

      .status-banner { padding: 14px 32px; font-weight: 700; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; background: ${statusColor}18; border-bottom: 2px solid ${statusColor}; color: ${statusColor}; }

      main { padding: 32px; max-width: 1100px; margin: 0 auto; }

      .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
      .kpi { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px 24px; }
      .kpi-value { font-size: 32px; font-weight: 800; color: #f8fafc; line-height: 1; margin-bottom: 6px; }
      .kpi-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }

      section { margin-bottom: 32px; }
      h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }

      .violation { background: #1e293b; border: 1px solid #334155; border-left: 4px solid #ef4444; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
      .violation.medium { border-left-color: #f59e0b; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; margin-right: 8px; }
      .badge.high { background: #ef444420; color: #ef4444; }
      .badge.medium { background: #f59e0b20; color: #f59e0b; }
      .v-title { font-weight: 600; color: #f1f5f9; margin-bottom: 4px; }
      .v-details { font-size: 13px; color: #94a3b8; font-family: ui-monospace, monospace; margin-top: 6px; }

      .empty { background: #1e293b; border: 1px solid #334155; border-left: 4px solid #22c55e; border-radius: 8px; padding: 16px 20px; color: #22c55e; font-weight: 600; }

      table { width: 100%; border-collapse: collapse; background: #1e293b; border: 1px solid #334155; border-radius: 8px; overflow: hidden; font-size: 13px; }
      th { background: #0f172a; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; border-bottom: 1px solid #334155; }
      td { padding: 10px 14px; border-bottom: 1px solid #1e293b; color: #cbd5e1; font-family: ui-monospace, monospace; }
      tr:last-child td { border-bottom: none; }
      tr:hover td { background: #263044; }

      footer { text-align: center; padding: 24px; color: #334155; font-size: 12px; border-top: 1px solid #1e293b; margin-top: 32px; }
      footer strong { color: #0ea5e9; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <div class="logo">Twin<span>Guard</span></div>
        <div class="tagline">Simulate before you ship</div>
      </div>
    </header>

    <div class="status-banner">${statusLabel}</div>

    <main>
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-value">${result.diff.changedResources.length}</div><div class="kpi-label">Changed Resources</div></div>
        <div class="kpi"><div class="kpi-value">${result.diff.addedReachability.length}</div><div class="kpi-label">Added Reachability Edges</div></div>
        <div class="kpi"><div class="kpi-value">${result.diff.removedReachability.length}</div><div class="kpi-label">Removed Reachability Edges</div></div>
        <div class="kpi"><div class="kpi-value" style="color:${statusColor}">${violationCount}</div><div class="kpi-label">Policy Violations</div></div>
      </div>

      <section>
        <h2>Policy Violations</h2>
        ${result.violations.length === 0
          ? `<div class="empty">No violations detected — candidate is clean.</div>`
          : result.violations.map((v) => `
        <div class="violation ${v.severity}">
          <div class="v-title"><span class="badge ${v.severity}">${esc(v.severity.toUpperCase())}</span>${esc(v.title)}</div>
          <div class="v-details">${esc(v.details)}</div>
        </div>`).join("")}
      </section>

      <section>
        <h2>Candidate Reachability Graph</h2>
        <table>
          <thead><tr><th>From</th><th>To</th><th>Port</th><th>Reason</th></tr></thead>
          <tbody>${edges || `<tr><td colspan="4" style="color:#64748b;text-align:center">No reachability edges computed</td></tr>`}</tbody>
        </table>
      </section>
    </main>

    <footer>Generated by <strong>TwinGuard</strong> &mdash; Simulate before you ship.</footer>
  </body>
</html>`;
}
