#!/usr/bin/env bash
set -euo pipefail

SUMMARY_PATH="${1:-artifacts/summary.md}"

if [[ ! -f "$SUMMARY_PATH" ]]; then
  echo "No summary found at $SUMMARY_PATH"
  exit 0
fi

if [[ -z "${CI_MERGE_REQUEST_IID:-}" ]] || [[ -z "${GITLAB_TOKEN:-}" ]]; then
  echo "Skipping MR comment post (missing CI_MERGE_REQUEST_IID or GITLAB_TOKEN)."
  exit 0
fi

BODY=$(jq -Rs . < "$SUMMARY_PATH")
API_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}/notes"

curl --fail --silent --show-error \
  --request POST \
  --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "{\"body\":${BODY}}" \
  "$API_URL" >/dev/null

echo "Posted Twin summary comment to MR !${CI_MERGE_REQUEST_IID}."
