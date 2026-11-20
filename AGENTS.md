# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness · v1.0.0 / Contract v1.3)

Operational rules and project invariants for AI coding agents working on **Đảo Đèn Lồng**.

## 1. Commands
- Install & build: `npm install && npm run build`
- Run production game server (with disk-persisted leaderboard): `node dist/run.js`
- Export local leaderboard JSON: `node dist/run.js --export-leaderboard out.json`
- Typecheck: `npm run typecheck`
- Automated Test Contract v1.3 suite (19 tests): `npm test`
- Full verification gate: `npm run verify`
- Run 3D game in dev mode: `npm run dev`
- Run headless simulation:
  `node dist/headless.js --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`
- Run 3D benchmark (`1280×720`, 200 Shades, 100 Motes):
  `node dist/bench.js --seed 42 --duration 30 --out bench.json`
- Run multi-night headless soak test:
  `node dist/soak.js --seed 7 --nights 10 --out soak.json`

## 2. Hard Invariants (NEVER violate)
1. **Headless-First Separation:** `src/sim/` MUST have zero DOM, WebGL, Three.js, or browser dependencies. `src/web/` reads state from `SimulationEngine` and sends `SimInput` only.
2. **Single Source of Truth:** All balance constants MUST come from `game.contract.json` (`tuning`, Contract v1.3). Never hardcode divergent gameplay numbers in `src/sim/` or `src/web/`.
3. **Byte-for-Byte Determinism:** Never call `Math.random()` or `Date.now()` inside `src/sim/engine.ts`. Always use `createPRNG(seed)` in `src/sim/prng.ts`. Store lantern fuel as integer `1/60` units (`fuel60`) to prevent float drift.
4. **Contract v1.3 Compliance:**
   - Fixed step 60Hz (`dt = 1/60s`); exact tick order: Step 2 deducts fuel (decay `1/60` + active drains `5/60` each) and extinguishes lanterns with `fuel <= 0` (`lantern_out`) immediately after Step 2.
   - Coordinates rounded with `round3()` (max 3 decimals, no `-0`); lantern `fuel` rounded to 1 decimal (`0` when unlit).
   - Angle convention on XZ plane: `x = r * cos(alpha)`, `z = r * sin(alpha)`.
   - Lantern fuel: max `100`, safe zone active only when `lit && fuel >= 30`, relight cost `5` when `ever_lit === true` else `10`.
   - Dynamic capacity: `min(20, 10 + 2 * successful_lights)` (resets each night; scenario pre-lit does not count).
   - Win/Loss: NO early win! At dawn (`time_left_s <= 0`), if `flames <= 0` -> `lost (no_flames)`; else if `lit >= ceil(0.6 * total)` -> `won (dawn_survived)`; else `lost (dawn)`.
   - Score v1.2/v1.3: `+5` per mote deposited/refueled, `+100` first light, `+40` relight, `+5` normal stun / `+15` stun on `drain` shade, dawn win bonus `sum(50 + floor(fuel)) + 50 * flames` (NO time bonus).
   - Shade states strictly in `{"spawning", "wander", "chase", "recoil", "stunned", "drain"}`; after stun expires -> ALWAYS `"wander"`.
   - Invalid `--inputs` / `--scenario` JSON, schema, types, or non-strictly-increasing `tick` MUST exit with code `2`.
   - Scenario setup NEVER emits events and NEVER adds score.
   - Full-night headless run MUST complete in `<= 30s`.
   - Benchmark (`bench_cmd`) MUST render standard Night 1 (no extra creative skins/effects) at `1280×720`, `200` wandering Shades, `100` Motes, `L1`–`L3` lit (`fuel=100`), `3s` warmup + `--duration` measured, exit `0`, outputting valid `bench.json` (`avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`).
   - Soak (`soak_cmd`) MUST run `N` consecutive nights cycling `1→2→3` in one process with `crashes === 0` and `mem_end_mb <= 1.2 * mem_start_mb`.
   - Leaderboard export (`<run_cmd> --export-leaderboard out.json`) MUST output `{"entries": [...]}` sorted by `score` desc, tie-break earlier `achieved_at`, top 10.
5. **Creativity & Accessibility Isolation:** Custom characters, extra themes/ghost skins, key rebinding, subtitles, reduce motion, large text (`×1.25`), colorblind mode (`#00B3FF` shades, `#FFFFFF` + `⚠` warnings), and audio/VFX in `src/web/` MUST NOT change simulation state, coordinates, scores, headless JSONL output, or standard benchmark visuals.
6. **Evidence Gate:** Never claim a phase or task is complete until `npm run verify` exits `0` and `EVIDENCE.md`, `bench.json`, and `soak.json` match the actual command outputs.

## 3. Conventions & Workflow
- Document breaking architectural changes in an ADR (`docs/ADR-*.md`) and `CHANGELOG.md`.
- When a Change Request replaces prior rules, update affected tests with explicit rationale in `EVIDENCE.md` — never silently skip tests.
- Never commit `.env`, API keys, secrets, or local `data/leaderboard.json` user saves.
- See `.agents/skills/verify-contract/SKILL.md` for the verification & proof collection procedure.
