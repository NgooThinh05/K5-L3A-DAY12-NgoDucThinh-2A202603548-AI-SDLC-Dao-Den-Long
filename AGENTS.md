# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness · Phase 2 / Contract v1.1)

Operational rules and project invariants for AI coding agents working on **Đảo Đèn Lồng**.

## 1. Commands
- Install & build: `npm install && npm run build`
- Typecheck: `npm run typecheck`
- Automated Test Contract v1.1 suite: `npm test`
- Full verification gate: `npm run verify`
- Run 3D game locally: `npm run dev`
- Run headless simulation:
  `node dist/headless.js --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`

## 2. Hard Invariants (NEVER violate)
1. **Headless-First Separation:** `src/sim/` MUST have zero DOM, WebGL, Three.js, or browser dependencies. `src/web/` reads state from `SimulationEngine` and sends `SimInput` only.
2. **Single Source of Truth:** All balance constants MUST come from `game.contract.json` (`tuning`, Contract v1.1). Never hardcode divergent gameplay numbers in `src/sim/` or `src/web/`.
3. **Byte-for-Byte Determinism:** Never call `Math.random()` or `Date.now()` inside `src/sim/`. Always use `createPRNG(seed)` in `src/sim/prng.ts`.
4. **Contract v1.1 Compliance:**
   - Fixed step 60Hz (`dt = 1/60s`); exact 12-step tick order from `phase2.md`.
   - Coordinates rounded with `round3()` (max 3 decimals, no `-0`).
   - Angle convention on XZ plane: `x = r * cos(alpha)`, `z = r * sin(alpha)` (verified against Night 3 Tier 1 & ramps).
   - Score: `+10` per mote **deposited**, `+100` per lantern lit, `+5` per Shade hit by Pulse, win bonus `floor(time_left_s)*2 + 50*flames`.
   - Shade states strictly in `{"spawning", "wander", "chase", "recoil", "stunned"}`.
   - Pause freezes `sim_tick`, timers, spawns, and TTL while outer `tick` continues incrementing; snapshot `state` is `"paused"`.
   - Invalid `--inputs` / `--scenario` JSON, schema, types, or non-strictly-increasing `tick` MUST exit with code `2`.
   - Scenario setup NEVER emits events and NEVER adds score.
   - Full-night headless run (21,600 ticks) MUST complete in `<= 30s`.
5. **Creativity Isolation:** Custom characters, extra visual themes/ghost skins, and audio/VFX in `src/web/` MUST NOT change simulation state, coordinates, scores, or headless JSONL output. Default theme MUST follow the Phase 2 standard color palette.
6. **Evidence Gate:** Never claim a phase or task is complete until `npm run verify` exits `0` and `EVIDENCE.md` matches the actual command output.

## 3. Conventions & Workflow
- Keep commits small, focused, and scoped to one logical change.
- Update this file whenever an agent repeats a mistake or a new phase changes rules.
- When a new phase alters previous requirements (e.g., Phase 2 standardized `lantern_cost = 10`, deposit-based mote scoring, `fall_enabled = true`), update affected tests with explicit rationale in `EVIDENCE.md` — never silently disable tests.
- Never commit `.env`, API keys, or secrets.
- See `.agents/skills/verify-contract/SKILL.md` for the verification & proof collection procedure.
