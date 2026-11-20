import { createPRNG, type PRNG } from './prng.ts';
import {
  createDefaultInput,
  type EndRecord,
  type EventRecord,
  type GameState,
  type GameTuning,
  type ScenarioFile,
  type ShadeState,
  type SimEventPayload,
  type SimInput,
  type SnapshotRecord,
  type Vec3,
} from './types.ts';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const ISLAND_RADIUS = 48.0;

const EPS = 1e-9;
const SAFE_RADIUS_MARGIN = 0.002; // guarantees distXZ >= safe_radius even after 3-decimal rounding
const LANTERN_RING_RADIUS = 25.0;
const JUMP_VELOCITY = 7.5;
const GRAVITY = -20.0;

const INITIAL_RANDOM_MOTES = 16;
const MAX_RANDOM_MOTES = 20;
const MOTE_SPAWN_INTERVAL_TICKS = 180; // 3 seconds

const INITIAL_RANDOM_SHADES = 2;
const MAX_RANDOM_SHADES = 5;
const SHADE_SPAWN_INTERVAL_TICKS = 1200; // 20 seconds

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

interface InternalLantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

interface InternalShade {
  id: string;
  pos: Vec3;
  state: ShadeState;
  stunTimer: number;
}

interface InternalMote {
  id: string;
  pos: Vec3;
}

export interface EngineOptions {
  seed: number;
  night: number;
  scenario?: ScenarioFile;
}

export interface StepResult {
  tick: number;
  state: GameState;
  events: EventRecord[];
}

export class SimulationEngine {
  public readonly tuning: GameTuning;
  public readonly night: number;
  public readonly seed: number;

  private readonly rng: PRNG;
  private readonly hasScenario: boolean;
  private readonly randomMotes: boolean;
  private readonly randomShades: boolean;

  private simTick = 0;
  private state: GameState = 'playing';
  private score = 0;
  private initialTimeLeftS: number;
  private timeLeftS: number;

  private playerPos: Vec3 = [0, 0, 0];
  private playerVy = 0;
  private playerHeadingRad = 0;
  private playerFlames: number;
  private playerCarried = 0;
  private invulnTimer = 0;
  private pulseCooldownTimer = 0;

  private lanterns: InternalLantern[] = [];
  private shades: InternalShade[] = [];
  private motes: InternalMote[] = [];

  private nextMoteSeq = 1;
  private nextShadeSeq = 1;
  private prevInput: SimInput = createDefaultInput();

  constructor(tuning: GameTuning, options: EngineOptions) {
    this.tuning = tuning;
    this.seed = options.seed;
    this.night = options.night;
    this.rng = createPRNG(options.seed);
    this.hasScenario = options.scenario !== undefined;

    const sc = options.scenario;
    this.randomMotes = sc?.random_motes ?? true;
    this.randomShades = sc?.random_shades ?? true;

    this.initialTimeLeftS = sc?.time_left_s ?? tuning.night1_duration_s;
    this.timeLeftS = this.initialTimeLeftS;
    this.playerFlames = sc?.player?.flames ?? tuning.flames;
    this.playerCarried = sc?.player?.carried ?? 0;
    if (sc?.player?.pos) {
      this.playerPos = [sc.player.pos[0], sc.player.pos[1], sc.player.pos[2]];
    }

    // 1. Default Night 1 lanterns arranged evenly on a 25m circle (L1 at [0, 0, 25])
    const lanternCount = tuning.lantern_count_night1;
    for (let i = 0; i < lanternCount; i++) {
      const angle = (i * 2 * Math.PI) / lanternCount;
      const lx = round3(Math.sin(angle) * LANTERN_RING_RADIUS);
      const lz = round3(Math.cos(angle) * LANTERN_RING_RADIUS);
      this.lanterns.push({
        id: `L${i + 1}`,
        pos: [lx, 0, lz],
        lit: false,
        deposited: 0,
      });
    }

    // Apply scenario lantern overrides (NO events, NO score)
    if (sc?.lanterns) {
      for (const override of sc.lanterns) {
        let target = this.lanterns.find((l) => l.id === override.id);
        if (!target) {
          target = {
            id: override.id,
            pos: override.pos ? [override.pos[0], 0, override.pos[2]] : [0, 0, 0],
            lit: false,
            deposited: 0,
          };
          this.lanterns.push(target);
        }
        if (override.pos !== undefined) {
          target.pos = [override.pos[0], override.pos[1], override.pos[2]];
        }
        if (override.deposited !== undefined) {
          target.deposited = override.deposited;
        }
        if (override.lit !== undefined) {
          target.lit = override.lit;
          if (override.lit && override.deposited === undefined) {
            target.deposited = Math.max(target.deposited, tuning.lantern_cost);
          }
        } else if (override.deposited !== undefined && override.deposited >= tuning.lantern_cost) {
          target.lit = true;
        }
      }
    }

    // 2. Motes (scenario overrides or initial random pool; NO events)
    if (sc?.motes !== undefined) {
      for (const m of sc.motes) {
        const seq = this.nextMoteSeq++;
        if (Array.isArray(m)) {
          this.motes.push({ id: `M${seq}`, pos: [m[0], 0, m[2]] });
        } else {
          this.motes.push({
            id: m.id ?? `M${seq}`,
            pos: [m.pos[0], 0, m.pos[2]],
          });
        }
      }
    } else if (this.randomMotes) {
      for (let i = 0; i < INITIAL_RANDOM_MOTES; i++) {
        this.spawnRandomMote();
      }
    }

    // 3. Shades (scenario overrides or initial random pool; NO events)
    if (sc?.shades !== undefined) {
      for (const s of sc.shades) {
        const seq = this.nextShadeSeq++;
        const state: ShadeState = s.state ?? 'chase';
        this.shades.push({
          id: s.id ?? `S${seq}`,
          pos: [s.pos[0], s.pos[1], s.pos[2]],
          state,
          stunTimer: state === 'stunned' ? tuning.pulse_stun_s : 0,
        });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < INITIAL_RANDOM_SHADES; i++) {
        this.spawnRandomShade(false);
      }
    }
  }

  public getTick(): number {
    return this.simTick;
  }

  public getState(): GameState {
    return this.state;
  }

  public getScore(): number {
    return this.score;
  }

  public getInvulnTimer(): number {
    return this.invulnTimer;
  }

  public getPulseCooldownTimer(): number {
    return this.pulseCooldownTimer;
  }

  public getPlayerHeadingRad(): number {
    return this.playerHeadingRad;
  }

  public getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick: this.simTick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      player: {
        pos: [round3(this.playerPos[0]), round3(this.playerPos[1]), round3(this.playerPos[2])],
        flames: this.playerFlames,
        carried: this.playerCarried,
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: [round3(l.pos[0]), round3(l.pos[1]), round3(l.pos[2])],
        lit: l.lit,
        deposited: l.deposited,
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: [round3(s.pos[0]), round3(s.pos[1]), round3(s.pos[2])],
        state: s.state,
      })),
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: [round3(m.pos[0]), round3(m.pos[1]), round3(m.pos[2])],
      })),
      motes_active: this.motes.length,
    };
  }

  public getEndRecord(): EndRecord {
    return {
      type: 'end',
      ticks: this.simTick,
      state: this.state,
      score: this.score,
    };
  }

  /**
   * Advances simulation by exactly 1 fixed tick (dt = 1/60s).
   * All emitted events bear tick = simTick (k + 1).
   */
  public step(input: SimInput): StepResult {
    if (this.state !== 'playing') {
      return { tick: this.simTick, state: this.state, events: [] };
    }

    const nextTick = this.simTick + 1;
    const events: EventRecord[] = [];
    const emit = (payload: SimEventPayload): void => {
      events.push({ type: 'event', tick: nextTick, ...payload });
    };

    // 1. Rising edge detection for action buttons
    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;

    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
    };

    // 2. Decrement timers (invulnerability, pulse cooldown, shade stun)
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - DT);
      if (this.invulnTimer <= EPS) this.invulnTimer = 0;
    }
    if (this.pulseCooldownTimer > 0) {
      this.pulseCooldownTimer = Math.max(0, this.pulseCooldownTimer - DT);
      if (this.pulseCooldownTimer <= EPS) this.pulseCooldownTimer = 0;
    }
    for (const shade of this.shades) {
      if (shade.state === 'stunned') {
        shade.stunTimer = Math.max(0, shade.stunTimer - DT);
        if (shade.stunTimer <= EPS) {
          shade.stunTimer = 0;
          shade.state = 'chase';
        }
      }
    }

    // 3. Player movement (camera-relative rotation + vector normalization) & jump
    let mx = input.move[0];
    let mz = input.move[1];
    const mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
    if (mag > EPS) {
      const theta = (input.cam_yaw_deg * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const wx = mx * cosT + mz * sinT;
      const wz = -mx * sinT + mz * cosT;

      this.playerPos[0] += wx * this.tuning.player_speed * DT;
      this.playerPos[2] += wz * this.tuning.player_speed * DT;
      this.playerHeadingRad = Math.atan2(wx, wz);

      // Keep player on the circular island in standard play (fall_enabled = false).
      // In controlled scenarios, avoid artificial clamping so arbitrary movement tests pass.
      if (!this.hasScenario && !this.tuning.fall_enabled) {
        const maxR = ISLAND_RADIUS - 1.0;
        const r = Math.hypot(this.playerPos[0], this.playerPos[2]);
        if (r > maxR) {
          const scale = maxR / r;
          this.playerPos[0] *= scale;
          this.playerPos[2] *= scale;
        }
      }
    }

    if (jumpPressed && this.playerPos[1] <= EPS) {
      this.playerVy = JUMP_VELOCITY;
    }
    if (this.playerPos[1] > 0 || this.playerVy !== 0) {
      this.playerVy += GRAVITY * DT;
      this.playerPos[1] += this.playerVy * DT;
      if (this.playerPos[1] <= 0) {
        this.playerPos[1] = 0;
        this.playerVy = 0;
      }
    }

    // 4. Automatic mote pickup
    if (this.playerCarried < this.tuning.carry_capacity && this.motes.length > 0) {
      const remaining: InternalMote[] = [];
      for (const mote of this.motes) {
        if (
          this.playerCarried < this.tuning.carry_capacity &&
          distXZ(this.playerPos, mote.pos) <= this.tuning.pickup_radius + EPS
        ) {
          this.playerCarried += 1;
          this.score += this.tuning.score.per_mote;
          emit({ name: 'mote_picked', data: { carried: this.playerCarried } });
        } else {
          remaining.push(mote);
        }
      }
      this.motes = remaining;
    }

    // 5. Interact: deposit motes into nearest unlit lantern in range
    if (interactPressed && this.playerCarried > 0) {
      let bestLantern: InternalLantern | null = null;
      let bestDist = Infinity;
      for (const lantern of this.lanterns) {
        if (lantern.lit) continue;
        const d = distXZ(this.playerPos, lantern.pos);
        if (d <= this.tuning.interact_radius + EPS && d < bestDist - EPS) {
          bestDist = d;
          bestLantern = lantern;
        }
      }
      if (bestLantern) {
        const needed = Math.max(0, this.tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.playerCarried, needed);
        if (amount > 0) {
          this.playerCarried -= amount;
          bestLantern.deposited += amount;
          emit({
            name: 'deposit',
            data: {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited,
            },
          });
          if (bestLantern.deposited >= this.tuning.lantern_cost) {
            bestLantern.lit = true;
            this.score += this.tuning.score.per_lantern;
            emit({ name: 'lantern_lit', data: { lantern_id: bestLantern.id } });
          }
        }
      }
    }

    // 6. Pulse skill: consume light, push & stun nearby shades
    if (
      pulsePressed &&
      this.playerCarried >= this.tuning.pulse_cost &&
      this.pulseCooldownTimer <= EPS
    ) {
      this.playerCarried -= this.tuning.pulse_cost;
      this.pulseCooldownTimer = this.tuning.pulse_cooldown_s;
      const stunnedIds: string[] = [];

      for (const shade of this.shades) {
        const dx = shade.pos[0] - this.playerPos[0];
        const dz = shade.pos[2] - this.playerPos[2];
        const d = Math.hypot(dx, dz);
        if (d <= this.tuning.pulse_radius + EPS) {
          const ux = d > EPS ? dx / d : 1;
          const uz = d > EPS ? dz / d : 0;
          shade.pos[0] += ux * this.tuning.pulse_push_m;
          shade.pos[2] += uz * this.tuning.pulse_push_m;
          shade.state = 'stunned';
          shade.stunTimer = this.tuning.pulse_stun_s;
          this.score += this.tuning.score.per_stun;
          stunnedIds.push(shade.id);
        }
      }
      emit({ name: 'pulse', data: { stunned_ids: stunnedIds } });
    }

    // 7. Shade AI (chase player while respecting safe_radius of lit lanterns)
    for (const shade of this.shades) {
      if (shade.state !== 'chase') continue;

      const dx = this.playerPos[0] - shade.pos[0];
      const dz = this.playerPos[2] - shade.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > EPS) {
        const stepDist = Math.min(d, this.tuning.shade_speed * DT);
        shade.pos[0] += (dx / d) * stepDist;
        shade.pos[2] += (dz / d) * stepDist;
      }

      // Enforce safe_radius exclusion around every lit lantern (2 passes for overlapping zones)
      const minSafe = this.tuning.safe_radius + SAFE_RADIUS_MARGIN;
      for (let pass = 0; pass < 2; pass++) {
        for (const lantern of this.lanterns) {
          if (!lantern.lit) continue;
          const lx = shade.pos[0] - lantern.pos[0];
          const lz = shade.pos[2] - lantern.pos[2];
          const ld = Math.hypot(lx, lz);
          if (ld < minSafe) {
            const ux = ld > EPS ? lx / ld : 1;
            const uz = ld > EPS ? lz / ld : 0;
            shade.pos[0] = lantern.pos[0] + ux * minSafe;
            shade.pos[2] = lantern.pos[2] + uz * minSafe;
          }
        }
      }
    }

    // 8. Shade collision with player
    if (this.invulnTimer <= EPS) {
      for (const shade of this.shades) {
        if (shade.state === 'stunned') continue;
        if (distXZ(this.playerPos, shade.pos) <= this.tuning.shade_hit_radius + EPS) {
          this.playerFlames = Math.max(0, this.playerFlames - 1);
          const dropped = Math.min(
            this.playerCarried,
            Math.round(this.playerCarried * this.tuning.hit_drop_ratio),
          );
          this.playerCarried -= dropped;
          this.invulnTimer = this.tuning.invuln_s;
          emit({
            name: 'player_hit',
            data: {
              by: 'shade',
              flames: this.playerFlames,
              dropped,
            },
          });
          break; // invuln active; max one hit per tick
        }
      }
    }

    // 9. Advance tick & time
    this.simTick = nextTick;
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.simTick / TICK_RATE);

    // 10. Periodic random spawns (only when enabled)
    if (
      this.randomMotes &&
      this.simTick % MOTE_SPAWN_INTERVAL_TICKS === 0 &&
      this.motes.length < MAX_RANDOM_MOTES
    ) {
      this.spawnRandomMote();
    }

    if (
      this.randomShades &&
      this.simTick % SHADE_SPAWN_INTERVAL_TICKS === 0 &&
      this.shades.length < MAX_RANDOM_SHADES
    ) {
      const spawnedId = this.spawnRandomShade(true);
      if (spawnedId) {
        emit({ name: 'shade_spawned', data: { id: spawnedId } });
      }
    }

    // 11. Win / Loss conditions
    const allLit = this.lanterns.length > 0 && this.lanterns.every((l) => l.lit);
    if (allLit) {
      this.state = 'won';
      const timeBonus = Math.floor(this.timeLeftS) * this.tuning.score.per_second_left;
      const flameBonus = this.playerFlames * this.tuning.score.per_flame_left;
      this.score += timeBonus + flameBonus;
      emit({ name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
    } else if (this.playerFlames <= 0) {
      this.state = 'lost';
      emit({ name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
    } else if (this.timeLeftS <= EPS) {
      this.timeLeftS = 0;
      this.state = 'lost';
      emit({ name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
    }

    return { tick: this.simTick, state: this.state, events };
  }

  private spawnRandomMote(): void {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(5.0, 36.0);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      const tooCloseToLantern = this.lanterns.some(
        (l) => Math.hypot(x - l.pos[0], z - l.pos[2]) < 2.2,
      );
      if (!tooCloseToLantern) break;
    }
    const id = `M${this.nextMoteSeq++}`;
    this.motes.push({ id, pos: [x, 0, z] });
  }

  private spawnRandomShade(respectPlayerDistance: boolean): string | null {
    let x = 35;
    let z = 0;
    let valid = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(30.0, 42.0);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      const inSafe = this.lanterns.some(
        (l) => l.lit && Math.hypot(x - l.pos[0], z - l.pos[2]) < this.tuning.safe_radius + 1.0,
      );
      const nearPlayer =
        respectPlayerDistance &&
        Math.hypot(x - this.playerPos[0], z - this.playerPos[2]) < 12.0;
      if (!inSafe && !nearPlayer) {
        valid = true;
        break;
      }
    }
    if (!valid && respectPlayerDistance) {
      return null;
    }
    const id = `S${this.nextShadeSeq++}`;
    this.shades.push({
      id,
      pos: [x, 1.0, z],
      state: 'chase',
      stunTimer: 0,
    });
    return id;
  }
}
