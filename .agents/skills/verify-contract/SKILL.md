---
name: verify-contract
description: Build the headless runner and 3D web app, run the full Test Contract v1.2 verification suite (Phase 1-2 regressions + Phase 3 fuel/drain/dawn/capacity/score + full-night performance), check byte-for-byte determinism, and record proof outputs.
---

# Skill: Verify Test Contract v1.2 & Collect Evidence

Use this skill before tagging `phase-3` or after any change to `src/sim/` or `game.contract.json`.

## Steps
1. Run `npm run verify` (`npm run typecheck && npm run build:headless && npm run build:web && npm test`).
2. Confirm exit code is `0` and all Contract v1.2 assertions (non-replaced Phase 1–2 regressions + fuel decay/refuel/`lantern_out`/relight, dynamic capacity, Shade `drain` + `fuel_drain` + safe-zone restore push + `+15` drain stun, `dawn_survived` vs `dawn` win/loss, and full Night 3 performance `<= 30s`) print `PASS`.
3. Run a determinism check via CLI on Night 3:
   ```bash
   node dist/headless.js --seed 42 --night 3 --ticks 1800 --snapshot-every 60 --out docs/proof/phase-3/night3_det1.jsonl
   node dist/headless.js --seed 42 --night 3 --ticks 1800 --snapshot-every 60 --out docs/proof/phase-3/night3_det2.jsonl
   ```
   Verify identical SHA-256 hashes, then remove `night3_det2.jsonl`.
4. Confirm ADR (`docs/ADR-001-lantern-fuel-and-dawn-survival.md`), `CHANGELOG.md`, and `EVIDENCE.md` match the actual test output.
