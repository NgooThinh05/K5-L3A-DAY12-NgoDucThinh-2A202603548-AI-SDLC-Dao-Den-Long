---
name: verify-contract
description: Build the headless runner and 3D web app, run the full Test Contract v1.1 verification suite (Nights 1-3 + regression + 21,600-tick performance), check byte-for-byte determinism, and record proof outputs.
---

# Skill: Verify Test Contract v1.1 & Collect Evidence

Use this skill before tagging any phase (`phase-2`..`phase-4`) or after any change to `src/sim/` or `game.contract.json`.

## Steps
1. Run `npm run verify` (`npm run typecheck && npm run build:headless && npm run build:web && npm test`).
2. Confirm exit code is `0` and every Test Contract v1.1 test (Phase 1 regressions + Phase 2 Nights 1–3, Dash, Fall/Respawn, Dropped Motes, Safe Push, Pulse 3D, Shade 5-state AI, Drifters, Charms, Wind, Pause, and 21,600-tick speed <= 30s) prints `PASS`.
3. Run a determinism check via CLI on Nights 1, 2, and 3:
   ```bash
   node dist/headless.js --seed 42 --night 3 --ticks 1200 --snapshot-every 60 --out docs/proof/phase-2/det_a.jsonl
   node dist/headless.js --seed 42 --night 3 --ticks 1200 --snapshot-every 60 --out docs/proof/phase-2/det_b.jsonl
   ```
   Verify both files have identical SHA-256 hashes, then remove the duplicate file.
4. Benchmark a full Night 3 headless run (`--night 3 --ticks 21600 --snapshot-every 60`) and verify elapsed wall-clock time is `<= 30s`.
5. Confirm invalid input returns exit code `2` with an error message on `stderr`.
6. Update `EVIDENCE.md` with the exact command output, rationale for any updated Phase 1 tests, and verification table before committing or tagging.
