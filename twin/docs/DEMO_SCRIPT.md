# Demo Script

## Story

1. Render a safe baseline.
2. Render a risky candidate from a single values override.
3. Run Twin simulation.
4. Show violations and blast radius delta.

## Commands

```bash
npm ci
mkdir -p artifacts/baseline artifacts/candidate
helm template demo examples/demo-mesh > artifacts/baseline/rendered.yaml
helm template demo examples/demo-mesh -f examples/demo-mesh/values-risky.yaml > artifacts/candidate/rendered.yaml
npm run analyze -- --baseline artifacts/baseline --candidate artifacts/candidate --out-dir artifacts --enforce=false
```

## Talk track

- "This line in values exposed DB publicly; Twin catches GR-001 before merge."
- "This policy creates wildcard egress in prod; Twin catches GR-003."
- "Blast radius shows changed reachability edges, not just syntax validity."
