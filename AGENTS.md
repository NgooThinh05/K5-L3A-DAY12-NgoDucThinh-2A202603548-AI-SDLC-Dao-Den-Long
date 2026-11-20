# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness)

Operational rules and project invariants for AI coding agents working on **Đảo Đèn Lồng**.

## 1. Commands
- Install & build: `npm install && npm run build`
- Typecheck: `npm run typecheck`
- Automated Test Contract suite: `npm test`
- Full verification gate: `npm run verify`
- Run 3D game locally: `npm run dev`
- Run headless simulation: `node dist/headless.js --seed <int> --night 1 --ticks <int> --out <file.jsonl>`

## 2. Hard Invariants (NEVER violate)
1. **Headless-First Separation:** `src/sim/` MUST have zero DOM, WebGL, Three.js, or browser dependencies. `src/web/` reads state from `SimulationEngine` and sends `SimInput` only.
2. **Single Source of Truth:** All balance constants MUST come from `game.contract.json` (`tuning`). Never hardcode duplicate gameplay numbers in `src/sim/` or `src/web/`.
3. **Byte-for-Byte Determinism:** Never call `Math.random()` or `Date.now()` inside `src/sim/`. Always use `createPRNG(seed)` in `src/sim/prng.ts`.
4. **Contract Compliance:**
   - Fixed step $\Delta t = 1/60$s, XZ-plane distances with `d <= r + 1e-9`.
   - Coordinates rounded with `round3()` (max 3 decimals, no `-0`).
   - Invalid `--inputs` / `--scenario` JSON, schema, types, or non-strictly-increasing `tick` MUST exit with code `2`.
   - Scenario setup NEVER emits events and NEVER adds score.
5. **Creativity Isolation:** Any visual/audio enhancement in `src/web/` MUST NOT change simulation state, coordinates, scores, or headless JSONL output.
6. **Evidence Gate:** Never claim a phase or task is complete until `npm run verify` exits `0` and `EVIDENCE.md` matches the actual command output.

## 3. Conventions & Workflow
- Keep commits small, focused, and scoped to one logical change.
- Update this file whenever an agent repeats a mistake or a new phase changes rules.
- When a new phase alters previous requirements, update or remove affected tests with explicit rationale in `EVIDENCE.md` — never silently disable tests.
- Never commit `.env`, API keys, or secrets.
- See `.agents/skills/verify-contract/SKILL.md` for the verification & proof collection procedure.
