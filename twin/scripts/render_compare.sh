#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/baseline artifacts/candidate

if [[ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA:-}" ]]; then
  rm -rf .tmp-base
  git worktree add --detach .tmp-base "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA}"
  helm template demo .tmp-base/examples/demo-mesh > artifacts/baseline/rendered.yaml
  rm -rf .tmp-base
else
  helm template demo examples/demo-mesh > artifacts/baseline/rendered.yaml
fi

helm template demo examples/demo-mesh > artifacts/candidate/rendered.yaml
