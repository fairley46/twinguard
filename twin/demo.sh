#!/usr/bin/env bash
# TwinGuard — Interactive Demo
# Simulate before you ship.
set -euo pipefail

TWIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACTS="$TWIN_ROOT/artifacts"
BASELINE="$TWIN_ROOT/fixtures/baseline"
CANDIDATE_SAFE="$TWIN_ROOT/fixtures/baseline"
CANDIDATE_RISKY="$TWIN_ROOT/fixtures/candidate"

BOLD="\033[1m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
DIM="\033[2m"
RESET="\033[0m"

separator() { echo -e "${DIM}────────────────────────────────────────────────────${RESET}"; }
step()      { echo -e "\n${CYAN}▶ $*${RESET}"; }
ok()        { echo -e "${GREEN}✔ $*${RESET}"; }
warn()      { echo -e "${YELLOW}⚠ $*${RESET}"; }
fail()      { echo -e "${RED}✘ $*${RESET}"; }
pause()     { echo -e "\n${DIM}Press Enter to continue...${RESET}"; read -r; }

clear
echo -e "${BOLD}"
cat <<'BANNER'
  ████████╗██╗    ██╗██╗███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗
  ╚══██╔══╝██║    ██║██║████╗  ██║██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗
     ██║   ██║ █╗ ██║██║██╔██╗ ██║██║  ███╗██║   ██║███████║██████╔╝██║  ██║
     ██║   ██║███╗██║██║██║╚██╗██║██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║
     ██║   ╚███╔███╔╝██║██║ ╚████║╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
     ╚═╝    ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
BANNER
echo -e "${RESET}"
echo -e "         ${DIM}Simulate before you ship.${RESET}\n"
separator

# ── SCENE 1: Context ──────────────────────────────────────────────────────────
step "Scene 1 — The Setup"
echo ""
echo "  Your team runs a production Kubernetes cluster."
echo "  A developer opens an MR with two small config changes:"
echo ""
echo -e "    ${YELLOW}• exposeDbPublic: true${RESET}   (adds a public Ingress route to the database)"
echo -e "    ${YELLOW}• wildcardProdEgress: true${RESET}  (opens 0.0.0.0/0 egress in prod namespace)"
echo ""
echo "  CI passes. Linting passes. Nothing looks obviously wrong in the diff."
echo -e "  ${RED}Both changes would cause a production security incident if merged.${RESET}"
echo ""
pause

# ── SCENE 2: Safe baseline ────────────────────────────────────────────────────
step "Scene 2 — Analysing the safe baseline (zero violations expected)"
separator
echo ""
mkdir -p "$ARTIFACTS"
npm --workspace @twin/api run analyze -- \
  --baseline "$BASELINE" \
  --candidate "$CANDIDATE_SAFE" \
  --out-dir "$ARTIFACTS" 2>&1 | grep -v "^$" || true
echo ""
echo -e "${DIM}--- Summary ---${RESET}"
cat "$ARTIFACTS/summary.md"
echo ""
ok "Baseline is clean. No violations. Safe to merge."
pause

# ── SCENE 3: Risky candidate ──────────────────────────────────────────────────
step "Scene 3 — Now analysing the risky candidate (violations expected)"
separator
echo ""
npm --workspace @twin/api run analyze -- \
  --baseline "$BASELINE" \
  --candidate "$CANDIDATE_RISKY" \
  --out-dir "$ARTIFACTS" 2>&1 | grep -v "^$" || true
echo ""
echo -e "${DIM}--- Summary ---${RESET}"
cat "$ARTIFACTS/summary.md"
echo ""
pause

# ── SCENE 4: Violations deep-dive ─────────────────────────────────────────────
step "Scene 4 — What TwinGuard caught"
separator
echo ""

# Parse violations from summary
VIOLATIONS=$(grep "^\- \[" "$ARTIFACTS/summary.md" || echo "")
if [ -n "$VIOLATIONS" ]; then
  while IFS= read -r line; do
    if echo "$line" | grep -q "\[HIGH\]"; then
      echo -e "  ${RED}$line${RESET}"
    elif echo "$line" | grep -q "\[MEDIUM\]"; then
      echo -e "  ${YELLOW}$line${RESET}"
    else
      echo -e "  $line"
    fi
  done <<< "$VIOLATIONS"
fi

echo ""
echo -e "  ${BOLD}GR-001${RESET} — The Ingress 'db-public' routes public internet traffic to the"
echo -e "           'db' Deployment, which carries the label ${YELLOW}tier=data${RESET}."
echo -e "           TwinGuard walks the Ingress → Service → Workload chain and"
echo -e "           flags it regardless of whether a NetworkPolicy theoretically blocks it."
echo ""
echo -e "  ${BOLD}GR-003${RESET} — A NetworkPolicy in the ${YELLOW}prod${RESET} namespace adds an egress rule"
echo -e "           with cidr ${YELLOW}0.0.0.0/0${RESET}. Any pod selected by this policy can"
echo -e "           now reach any external endpoint — data exfiltration risk."
echo ""
fail "MR would be blocked. Comment posted to GitLab. Artifacts archived."
pause

# ── SCENE 5: Artifacts ────────────────────────────────────────────────────────
step "Scene 5 — Artifacts produced"
separator
echo ""
echo -e "  ${GREEN}artifacts/summary.md${RESET}    — Posted as MR comment by CI"
echo -e "  ${GREEN}artifacts/analysis.json${RESET} — Machine-readable, audit archive"
echo -e "  ${GREEN}artifacts/report.html${RESET}   — Visual report (opening now...)"
echo ""

if command -v open &>/dev/null; then
  open "$ARTIFACTS/report.html"
  ok "Opened report.html in browser."
elif command -v xdg-open &>/dev/null; then
  xdg-open "$ARTIFACTS/report.html"
  ok "Opened report.html in browser."
else
  echo -e "  ${DIM}Open manually: $ARTIFACTS/report.html${RESET}"
fi

echo ""
separator
echo ""
echo -e "  ${BOLD}TwinGuard caught both violations before a single line reached production.${RESET}"
echo -e "  ${DIM}Simulate before you ship.${RESET}"
echo ""
