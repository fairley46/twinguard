# TwinGuard — Quickstart

No live Kubernetes cluster required.

---

## Option A — Interactive demo (fastest, no Helm needed)

```bash
npm install
./demo.sh
```

This uses pre-rendered fixture manifests in `fixtures/` and walks through a full safe→risky scenario interactively.

---

## Option B — Run analysis directly (no Helm)

```bash
npm install

# Safe baseline vs safe baseline — 0 violations
npm run analyze -- \
  --baseline fixtures/baseline \
  --candidate fixtures/baseline \
  --out-dir artifacts

# Safe baseline vs risky candidate — 2 violations (GR-001, GR-003)
npm run analyze -- \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts
```

Open `artifacts/report.html` in your browser to see the TwinGuard visual report.

---

## Option C — Full flow with Helm

Requires Helm 3+.

```bash
npm install

mkdir -p artifacts/baseline artifacts/candidate

helm template demo examples/demo-mesh \
  > artifacts/baseline/rendered.yaml

helm template demo examples/demo-mesh \
  -f examples/demo-mesh/values-risky.yaml \
  > artifacts/candidate/rendered.yaml

npm run analyze -- \
  --baseline artifacts/baseline \
  --candidate artifacts/candidate \
  --out-dir artifacts
```

---

## Outputs

| File | Description |
|------|-------------|
| `artifacts/summary.md` | Markdown summary — posted as MR comment by CI |
| `artifacts/report.html` | Visual TwinGuard report |
| `artifacts/analysis.json` | Full machine-readable result, audit archive |

---

## Enforce mode

Pass `--enforce=true` to exit with code 1 when violations are found (blocks CI merge):

```bash
npm run analyze -- \
  --baseline fixtures/baseline \
  --candidate fixtures/candidate \
  --out-dir artifacts \
  --enforce=true
```
