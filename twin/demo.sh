#!/usr/bin/env bash
# TwinGuard — Interactive Demo
# Simulate before you ship.
set -euo pipefail

TWIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACTS="$TWIN_ROOT/artifacts"
K8S_BASELINE="$TWIN_ROOT/fixtures/baseline"
K8S_CANDIDATE_SAFE="$TWIN_ROOT/fixtures/baseline"
K8S_CANDIDATE_RISKY="$TWIN_ROOT/fixtures/candidate"
TF_BASELINE="$TWIN_ROOT/fixtures/terraform/baseline"
TF_CANDIDATE_SAFE="$TWIN_ROOT/fixtures/terraform/baseline"
TF_CANDIDATE_RISKY="$TWIN_ROOT/fixtures/terraform/candidate"

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
fail()      { echo -e "${RED}✘ $*${RESET}"; }
pause()     { echo -e "\n${DIM}Press Enter to continue...${RESET}"; read -r; }

header() {
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
}

print_violations() {
  local summary_file="$1"
  local violations
  violations=$(grep "^\- \[" "$summary_file" || echo "")
  if [ -n "$violations" ]; then
    while IFS= read -r line; do
      if echo "$line" | grep -q "\[HIGH\]"; then
        echo -e "  ${RED}$line${RESET}"
      elif echo "$line" | grep -q "\[MEDIUM\]"; then
        echo -e "  ${YELLOW}$line${RESET}"
      else
        echo -e "  $line"
      fi
    done <<< "$violations"
  fi
}

header

# ── PART 1: KUBERNETES ────────────────────────────────────────────────────────

step "Part 1 of 2 — Kubernetes"
echo ""
echo "  Your team runs a production Kubernetes cluster."
echo "  A developer opens a PR with two small config changes:"
echo ""
echo -e "    ${YELLOW}• exposeDbPublic: true${RESET}      (adds a public Ingress to the database)"
echo -e "    ${YELLOW}• wildcardProdEgress: true${RESET}  (opens 0.0.0.0/0 egress in prod namespace)"
echo ""
echo "  CI passes. Linting passes. Nothing looks obviously wrong in the diff."
echo -e "  ${RED}Both changes would cause a production security incident if merged.${RESET}"
echo ""
pause

# K8s — safe baseline
step "K8s — Safe baseline (0 violations expected)"
separator
echo ""
mkdir -p "$ARTIFACTS/k8s"
npm --workspace @twin/api run analyze -- \
  --driver k8s \
  --baseline "$K8S_BASELINE" \
  --candidate "$K8S_CANDIDATE_SAFE" \
  --out-dir "$ARTIFACTS/k8s" 2>&1 | grep -v "^$" || true
echo ""
echo -e "${DIM}--- Summary ---${RESET}"
cat "$ARTIFACTS/k8s/summary.md"
echo ""
ok "Baseline is clean. No violations."
pause

# K8s — risky candidate
step "K8s — Risky candidate (violations expected)"
separator
echo ""
npm --workspace @twin/api run analyze -- \
  --driver k8s \
  --baseline "$K8S_BASELINE" \
  --candidate "$K8S_CANDIDATE_RISKY" \
  --out-dir "$ARTIFACTS/k8s" 2>&1 | grep -v "^$" || true
echo ""
echo -e "${DIM}--- Summary ---${RESET}"
cat "$ARTIFACTS/k8s/summary.md"
echo ""
print_violations "$ARTIFACTS/k8s/summary.md"
echo ""
echo -e "  ${BOLD}GR-001${RESET} — Ingress 'db-public' routes public traffic to the 'db' Deployment"
echo -e "           (${YELLOW}tier=data${RESET}). TwinGuard walks Ingress → Service → Workload."
echo ""
echo -e "  ${BOLD}GR-003${RESET} — NetworkPolicy in ${YELLOW}prod${RESET} opens egress to ${YELLOW}0.0.0.0/0${RESET}."
echo -e "           Any selected pod can reach any external endpoint."
echo ""
fail "PR would be blocked. Comment posted to GitHub. Report archived."
pause

# ── PART 2: TERRAFORM ────────────────────────────────────────────────────────

header
step "Part 2 of 2 — Terraform (AWS)"
echo ""
echo "  Same engine. Different infrastructure."
echo ""
echo "  A developer opens a PR that modifies two AWS security groups:"
echo ""
echo -e "    ${YELLOW}• db-sg${RESET}   adds ingress rule: port 5432 from ${YELLOW}0.0.0.0/0${RESET}"
echo -e "    ${YELLOW}• api-sg${RESET}  changes egress to ${YELLOW}0.0.0.0/0${RESET} (all ports, all destinations)"
echo ""
echo "  TwinGuard parses the Terraform plan JSON — no AWS credentials needed."
echo -e "  ${RED}Both changes would expose production infrastructure.${RESET}"
echo ""
pause

# Terraform — safe baseline
step "Terraform — Safe baseline (0 violations expected)"
separator
echo ""
mkdir -p "$ARTIFACTS/terraform"
npm --workspace @twin/api run analyze -- \
  --driver terraform \
  --baseline "$TF_BASELINE" \
  --candidate "$TF_CANDIDATE_SAFE" \
  --out-dir "$ARTIFACTS/terraform" 2>&1 | grep -v "^$" || true
echo ""
echo -e "${DIM}--- Summary ---${RESET}"
cat "$ARTIFACTS/terraform/summary.md"
echo ""
ok "Baseline is clean. No violations."
pause

# Terraform — risky candidate
step "Terraform — Risky candidate (violations expected)"
separator
echo ""
npm --workspace @twin/api run analyze -- \
  --driver terraform \
  --baseline "$TF_BASELINE" \
  --candidate "$TF_CANDIDATE_RISKY" \
  --out-dir "$ARTIFACTS/terraform" 2>&1 | grep -v "^$" || true
echo ""
echo -e "${DIM}--- Summary ---${RESET}"
cat "$ARTIFACTS/terraform/summary.md"
echo ""
print_violations "$ARTIFACTS/terraform/summary.md"
echo ""
echo -e "  ${BOLD}GR-001${RESET} — Security group 'db-sg' has ${YELLOW}0.0.0.0/0${RESET} ingress on port 5432."
echo -e "           TwinGuard resolves: SG → RDS instance (${YELLOW}tier=data${RESET}) → public exposure."
echo ""
echo -e "  ${BOLD}GR-003${RESET} — Security group 'api-sg' in ${YELLOW}prod${RESET} opens unrestricted egress."
echo -e "           Any EC2 or ECS workload using this SG can reach any endpoint."
echo ""
fail "PR would be blocked. Comment posted to GitHub. Report archived."
pause

# ── ARTIFACTS ─────────────────────────────────────────────────────────────────

header
step "Artifacts produced every run"
separator
echo ""
echo -e "  ${GREEN}artifacts/k8s/summary.md${RESET}          Posted as GitHub PR comment"
echo -e "  ${GREEN}artifacts/k8s/report.html${RESET}         Visual TwinGuard report"
echo -e "  ${GREEN}artifacts/k8s/analysis.json${RESET}       Machine-readable, audit archive"
echo ""
echo -e "  ${GREEN}artifacts/terraform/summary.md${RESET}    Posted as GitHub PR comment"
echo -e "  ${GREEN}artifacts/terraform/report.html${RESET}   Visual TwinGuard report"
echo -e "  ${GREEN}artifacts/terraform/analysis.json${RESET} Machine-readable, audit archive"
echo ""
echo -e "  ${DIM}Opening K8s report in browser...${RESET}"

if command -v open &>/dev/null; then
  open "$ARTIFACTS/k8s/report.html"
  open "$ARTIFACTS/terraform/report.html"
  ok "Opened both reports."
elif command -v xdg-open &>/dev/null; then
  xdg-open "$ARTIFACTS/k8s/report.html"
  xdg-open "$ARTIFACTS/terraform/report.html"
  ok "Opened both reports."
else
  echo -e "  ${DIM}Open manually:${RESET}"
  echo -e "  ${DIM}  $ARTIFACTS/k8s/report.html${RESET}"
  echo -e "  ${DIM}  $ARTIFACTS/terraform/report.html${RESET}"
fi

echo ""
separator
echo ""
echo -e "  ${BOLD}Kubernetes. Terraform. Same engine. Same rules. Before it merges.${RESET}"
echo -e "  ${DIM}Simulate before you ship.${RESET}"
echo ""
