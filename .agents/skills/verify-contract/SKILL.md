---
name: verify-contract
description: Build the headless runner, release CLIs, and 3D web app, run the full Test Contract v1.3 verification suite (Phase 1-3 regressions + Phase 4 soak/leaderboard), run real 3D benchmark and 10-night soak checks, and verify evidence outputs.
---

# Skill: Verify Test Contract v1.3 & Collect Release Evidence

Use this skill before tagging `phase-4` / releasing `v1.0.0` or after any change to `src/sim/`, `src/web/bench_mode.ts`, or `game.contract.json`.

## Steps
1. Run `npm run verify` (`npm run typecheck && npm run build:headless && npm run build:cli && npm run build:web && npm test`).
2. Confirm exit code is `0` and all 19 Contract v1.3 assertions print `PASS` (Phase 1–3 regressions + full Night 3 performance `<= 30s` + Phase 4 soak + leaderboard validation & `--export-leaderboard`).
3. Run the official 10-night soak test:
   ```bash
   node dist/soak.js --seed 7 --nights 10 --out soak.json
   ```
   Verify `crashes === 0` and `mem_end_mb <= 1.2 * mem_start_mb`.
4. Run the official 30-second 3D benchmark:
   ```bash
   node dist/bench.js --seed 42 --duration 30 --out bench.json
   ```
   Verify exit code `0`, `contract_version === "1.3"`, `avg_fps >= 60`, `p1_low_fps >= 30`, and `load_ms <= 10000`.
5. Confirm `EVIDENCE.md`, `CHANGELOG.md`, `README.md`, `CREDITS.md`, and `docs/RETRO.md` match actual measured results.
