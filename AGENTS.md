# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness · Phase 3 / Contract v1.2)

Operational rules and project invariants for AI coding agents working on **Đảo Đèn Lồng**.

## 1. Commands
- Install & build: `npm install && npm run build`
- Typecheck: `npm run typecheck`
- Automated Test Contract v1.2 suite: `npm test`
- Full verification gate: `npm run verify`
- Run 3D game locally: `npm run dev`
- Run headless simulation:
  `node dist/headless.js --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`

## 2. Hard Invariants (NEVER violate)
1. **Headless-First Separation:** `src/sim/` MUST have zero DOM, WebGL, Three.js, or browser dependencies. `src/web/` reads state from `SimulationEngine` and sends `SimInput` only.
2. **Single Source of Truth:** All balance constants MUST come from `game.contract.json` (`tuning`, Contract v1.2). Never hardcode divergent gameplay numbers in `src/sim/` or `src/web/`.
3. **Byte-for-Byte Determinism:** Never call `Math.random()` or `Date.now()` inside `src/sim/`. Always use `createPRNG(seed)` in `src/sim/prng.ts`. Store lantern fuel as integer `1/60` units (`fuel60`) to prevent float drift.
4. **Contract v1.2 Compliance:**
   - Fixed step 60Hz (`dt = 1/60s`); exact tick order: Step 2 deducts fuel (decay `1/60` + active drains `5/60` each) and extinguishes lanterns with `fuel <= 0` (`lantern_out`) immediately after Step 2.
   - Coordinates rounded with `round3()` (max 3 decimals, no `-0`); lantern `fuel` rounded to 1 decimal (`0` when unlit).
   - Angle convention on XZ plane: `x = r * cos(alpha)`, `z = r * sin(alpha)`.
   - Lantern fuel: max `100`, safe zone active only when `lit && fuel >= 30`, relight cost `5` when `ever_lit === true` else `10`.
   - Dynamic capacity: `min(20, 10 + 2 * successful_lights)` (resets each night; scenario pre-lit does not count).
   - Win/Loss: NO early win! At dawn (`time_left_s <= 0`), if `flames <= 0` -> `lost (no_flames)`; else if `lit >= ceil(0.6 * total)` -> `won (dawn_survived)`; else `lost (dawn)`.
   - Score v1.2: `+5` per mote deposited/refueled, `+100` first light, `+40` relight, `+5` normal stun / `+15` stun on `drain` shade, dawn win bonus `sum(50 + floor(fuel)) + 50 * flames` (NO time bonus).
   - Shade states strictly in `{"spawning", "wander", "chase", "recoil", "stunned", "drain"}`; after stun expires -> ALWAYS `"wander"`.
   - Invalid `--inputs` / `--scenario` JSON, schema, types, or non-strictly-increasing `tick` MUST exit with code `2`.
   - Scenario setup NEVER emits events and NEVER adds score.
   - Full-night headless run MUST complete in `<= 30s`.
5. **Creativity & Accessibility Isolation:** Custom characters, extra themes/ghost skins, colorblind mode (`#00B3FF` shades, `#FFFFFF` + `⚠` warnings), and audio/VFX in `src/web/` MUST NOT change simulation state, coordinates, scores, or headless JSONL output.
6. **Evidence Gate:** Never claim a phase or task is complete until `npm run verify` exits `0` and `EVIDENCE.md` matches the actual command output.

## 3. Conventions & Workflow
- Document breaking architectural changes in an ADR (`docs/ADR-*.md`) and `CHANGELOG.md`.
- When a Change Request replaces prior rules, update affected tests with explicit rationale in `EVIDENCE.md` — never silently skip tests.
- Never commit `.env`, API keys, or secrets.
- See `.agents/skills/verify-contract/SKILL.md` for the verification & proof collection procedure.
