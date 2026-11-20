---
name: verify-contract
description: Build the headless runner and 3D web app, run the full Test Contract v1.0 verification suite, check byte-for-byte determinism, and record proof outputs.
---

# Skill: Verify Test Contract & Collect Evidence

Use this skill before tagging any phase (`phase-1`..`phase-4`) or after any change to `src/sim/` or `game.contract.json`.

## Steps
1. Run `npm run verify` (`npm run typecheck && npm run build:headless && npm run build:web && npm test`).
2. Confirm exit code is `0` and every Test Contract assertion prints `PASS`.
3. Run a determinism check via CLI:
   ```bash
   node dist/headless.js --seed 42 --night 1 --ticks 600 --out docs/proof/phase-1/det_a.jsonl
   node dist/headless.js --seed 42 --night 1 --ticks 600 --out docs/proof/phase-1/det_b.jsonl
   ```
   Verify both files have identical SHA-256 hashes, then remove the duplicate file and keep the representative output if needed.
4. Confirm invalid input returns exit code `2` with an error message on `stderr`.
5. Update `EVIDENCE.md` with the exact command output and verification table before committing or tagging.
