import {
  getNightMapDef,
  getTerrainHeight,
  resolveHorizontalMove,
  type NightMapDef,
} from './maps.ts';
import { createPRNG, type PRNG } from './prng.ts';
import {
  createDefaultInput,
  type DrifterState,
  type EndRecord,
  type EventRecord,
  type GameState,
  type GameTuning,
  type MoteKind,
  type NightNumber,
  type ScenarioFile,
  type ShadeState,
  type SimEventPayload,
  type SimInput,
  type SnapshotRecord,
  type Vec2,
  type Vec3,
} from './types.ts';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const ISLAND_RADIUS = 40.0;

const EPS = 1e-9;
const SAFE_RADIUS_MARGIN = 0.002;
const JUMP_VELOCITY = 7.0;
const GRAVITY = -20.0;
const FALL_Y_THRESHOLD = -10.0;
const RESPAWN_WAIT_TICKS = 60;
const INVULN_RESPAWN_TICKS = 90;

const INITIAL_RANDOM_MOTES = 20;
const MAX_ACTIVE_MOTES = 30;
const MOTE_SPAWN_INTERVAL_TICKS = 240;
const DROPPED_MOTE_TTL_TICKS = 480;

const SHADE_FIRST_SPAWN_TICK = 300;
const SHADE_SPAWN_STATE_TICKS = 30;
const SHADE_DETECT_RADIUS = 12.0;
const SHADE_LOSE_RADIUS = 18.0;
const SHADE_WANDER_SPEED = 1.8;
const SHADE_RECOIL_TICKS = 60;
const SHADE_RECOIL_DIST = 2.0;
const PULSE_PUSH_TICKS = 15;
const SAFE_PUSH_MAX_TICKS = 30;

const DRIFTER_SPAWN_INTERVAL_TICKS = 1200;
const MAX_DRIFTERS = 2;
const DRIFTER_IDLE_SPEED = 2.0;
const DRIFTER_FAST_SPEED = 7.0;
const DRIFTER_DETECT_RADIUS = 15.0;
const DRIFTER_STEAL_RADIUS = 1.2;
const DRIFTER_MIN_CARRIED = 5;
const DRIFTER_FLEE_TICKS = 240;
const DRIFTER_DROP_FLEE_TICKS = 120;

const CHARM_DURATION_TICKS = 600;
const CHARM_RESPAWN_TICKS = 2700;
const CHARM_PLAYER_SPEED = 7.2;

const WIND_PERIOD_TICKS = 1800; // 30s
const WIND_DURATION_TICKS = 300; // 5s
const WIND_WARNING_TICKS = 120; // 2s
const WIND_PUSH_SPEED = 2.0;

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
  stateTicksLeft: number;
  wanderAngle: number;
  wanderChangeTicks: number;
  recoilDir: Vec2;
  pushTicksLeft: number;
  pushStep: Vec2;
  safePushing: boolean;
  safePushTicksLeft: number;
  safePushTargetLanternId: string | null;
  safePushStepDist: number;
  spawnTick: number;
}

interface InternalMote {
  id: string;
  pos: Vec3;
  kind: MoteKind;
  ttlTicks: number | null;
  spawnTick: number;
}

interface InternalDrifter {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
  fleeTicksLeft: number;
  wanderAngle: number;
  wanderChangeTicks: number;
  spawnTick: number;
}

interface InternalCharm {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicks: number;
}

export interface EngineOptions {
  seed: number;
  night: NightNumber;
  scenario?: ScenarioFile;
}

export interface StepResult {
  tick: number;
  simTick: number;
  state: GameState;
  events: EventRecord[];
}

export interface CharmVisualInfo {
  id: string;
  pos: Vec3;
  available: boolean;
  respawn_s: number;
}

export class SimulationEngine {
  public readonly tuning: GameTuning;
  public readonly night: NightNumber;
  public readonly seed: number;
  public readonly mapDef: NightMapDef;

  private readonly rng: PRNG;
  private readonly randomMotes: boolean;
  private readonly randomShades: boolean;
  private readonly randomDrifters: boolean;
  private readonly windEnabled: boolean;

  private wallTick = 0;
  private simTick = 0;
  private nightStartEmitted = false;
  private state: GameState = 'playing';
  private score = 0;
  private initialTimeLeftS: number;
  private timeLeftS: number;

  // Player state
  private playerPos: Vec3;
  private playerVel: Vec3 = [0, 0, 0];
  private playerGrounded = true;
  private playerHeadingRad = 0;
  private playerFlames: number;
  private playerCarried = 0;
  private invulnTicks = 0;
  private dashTicks = 0;
  private dashCdTicks = 0;
  private dashDir: Vec2 = [0, 1];
  private pulseCdTicks = 0;
  private charmTicks = 0;
  private respawnTicks = 0;
  private launching = false;
  private launchVel: Vec2 = [0, 0];

  // Wind state (Night 3)
  private windActive = false;
  private windWarning = false;
  private windDirDeg = 0;

  // Entities
  private lanterns: InternalLantern[] = [];
  private shades: InternalShade[] = [];
  private motes: InternalMote[] = [];
  private drifters: InternalDrifter[] = [];
  private charms: InternalCharm[] = [];

  private nextMoteSeq = 1;
  private nextShadeSeq = 1;
  private nextDrifterSeq = 1;
  private prevInput: SimInput = createDefaultInput();

  constructor(tuning: GameTuning, options: EngineOptions) {
    this.tuning = tuning;
    this.seed = options.seed;
    this.night = options.night;
    this.mapDef = getNightMapDef(options.night);
    this.rng = createPRNG(options.seed);

    const sc = options.scenario;
    this.randomMotes = sc?.random_motes ?? true;
    this.randomShades = sc?.random_shades ?? true;
    this.randomDrifters = sc?.random_drifters ?? this.mapDef.driftersEnabled;
    this.windEnabled = sc?.wind_enabled ?? this.mapDef.windEnabled;

    const defaultDur =
      options.night === 1
        ? tuning.night1_duration_s
        : options.night === 2
          ? tuning.night2_duration_s
          : tuning.night3_duration_s;
    this.initialTimeLeftS = sc?.time_left_s ?? defaultDur;
    this.timeLeftS = this.initialTimeLeftS;

    this.playerPos = [...this.mapDef.spawnPos];
    this.playerHeadingRad = this.mapDef.spawnHeadingRad;
    this.playerFlames = sc?.player?.flames ?? tuning.flames;
    this.playerCarried = sc?.player?.carried ?? 0;
    this.invulnTicks = sc?.player?.invuln_ticks ?? 0;
    this.dashCdTicks = sc?.player?.dash_cd_ticks ?? 0;
    this.pulseCdTicks = sc?.player?.pulse_cd_ticks ?? 0;
    this.charmTicks = sc?.player?.charm_ticks ?? 0;

    if (sc?.player?.pos) {
      this.playerPos = [sc.player.pos[0], sc.player.pos[1], sc.player.pos[2]];
      const th = getTerrainHeight(this.night, this.playerPos[0], this.playerPos[2]);
      this.playerGrounded = th !== null && Math.abs(this.playerPos[1] - th) <= 0.15;
    }

    // 1. Default lanterns for the night
    for (const l of this.mapDef.lanterns) {
      this.lanterns.push({
        id: l.id,
        pos: [l.pos[0], l.pos[1], l.pos[2]],
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
            pos: override.pos ? [override.pos[0], override.pos[1], override.pos[2]] : [0, 0, 0],
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

    // 2. Motes (scenario overrides or 20 distinct map spawn points; NO events)
    if (sc?.motes !== undefined) {
      for (const m of sc.motes) {
        const seq = this.nextMoteSeq++;
        if (Array.isArray(m)) {
          this.motes.push({
            id: `M${seq}`,
            pos: [m[0], m[1], m[2]],
            kind: 'random',
            ttlTicks: null,
            spawnTick: 0,
          });
        } else {
          const kind: MoteKind = m.kind ?? 'random';
          const ttlTicks =
            m.ttl_s !== undefined
              ? m.ttl_s === null
                ? null
                : Math.round(m.ttl_s * TICK_RATE)
              : kind === 'dropped'
                ? DROPPED_MOTE_TTL_TICKS
                : null;
          this.motes.push({
            id: m.id ?? `M${seq}`,
            pos: [m.pos[0], m.pos[1], m.pos[2]],
            kind,
            ttlTicks,
            spawnTick: 0,
          });
        }
      }
    } else if (this.randomMotes) {
      // Pick 20 distinct spawn points deterministically using Fisher-Yates shuffle
      const pool = this.mapDef.moteSpawnPoints.map((p) => [...p] as Vec3);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      const count = Math.min(INITIAL_RANDOM_MOTES, pool.length);
      for (let i = 0; i < count; i++) {
        const seq = this.nextMoteSeq++;
        this.motes.push({
          id: `M${seq}`,
          pos: pool[i],
          kind: 'random',
          ttlTicks: null,
          spawnTick: 0,
        });
      }
    }

    // 3. Shades (scenario overrides; default random shades spawn at tick 300 per TICKET-02!)
    if (sc?.shades !== undefined) {
      for (const s of sc.shades) {
        const seq = this.nextShadeSeq++;
        const dist = distXZ(s.pos, this.playerPos);
        const defaultState: ShadeState = dist <= SHADE_DETECT_RADIUS + EPS ? 'chase' : 'wander';
        const state: ShadeState = s.state ?? defaultState;
        const defaultTicks =
          state === 'stunned'
            ? Math.round(tuning.pulse_stun_s * TICK_RATE)
            : state === 'recoil'
              ? SHADE_RECOIL_TICKS
              : state === 'spawning'
                ? SHADE_SPAWN_STATE_TICKS
                : 0;
        this.shades.push({
          id: s.id ?? `S${seq}`,
          pos: [s.pos[0], s.pos[1], s.pos[2]],
          state,
          stateTicksLeft: s.state_ticks_left ?? defaultTicks,
          wanderAngle: this.rng.range(0, Math.PI * 2),
          wanderChangeTicks: 120,
          recoilDir: [1, 0],
          pushTicksLeft: 0,
          pushStep: [0, 0],
          safePushing: false,
          safePushTicksLeft: 0,
          safePushTargetLanternId: null,
          safePushStepDist: 0,
          spawnTick: 0,
        });
      }
    }

    // 4. Drifters (scenario overrides; default spawns at tick 1200, 2400...)
    if (sc?.drifters !== undefined) {
      for (const d of sc.drifters) {
        const seq = this.nextDrifterSeq++;
        const state: DrifterState = d.state ?? 'idle';
        this.drifters.push({
          id: d.id ?? `D${seq}`,
          pos: [d.pos[0], d.pos[1], d.pos[2]],
          state,
          stolen: d.stolen ?? 0,
          fleeTicksLeft: state === 'flee' ? DRIFTER_FLEE_TICKS : 0,
          wanderAngle: this.rng.range(0, Math.PI * 2),
          wanderChangeTicks: 90,
          spawnTick: 0,
        });
      }
    }

    // 5. Charms (scenario overrides or map defaults)
    if (sc?.charms !== undefined) {
      for (let i = 0; i < sc.charms.length; i++) {
        const c = sc.charms[i];
        this.charms.push({
          id: c.id ?? `C${i + 1}`,
          pos: [c.pos[0], c.pos[1], c.pos[2]],
          available: c.available ?? true,
          respawnTicks: c.respawn_s !== undefined ? Math.round(c.respawn_s * TICK_RATE) : 0,
        });
      }
    } else {
      for (const c of this.mapDef.charms) {
        this.charms.push({
          id: c.id,
          pos: [c.pos[0], c.pos[1], c.pos[2]],
          available: true,
          respawnTicks: 0,
        });
      }
    }
  }

  public getTick(): number {
    return this.wallTick;
  }

  public getSimTick(): number {
    return this.simTick;
  }

  public getState(): GameState {
    return this.state;
  }

  public getScore(): number {
    return this.score;
  }

  public getInvulnTimer(): number {
    return this.invulnTicks / TICK_RATE;
  }

  public getPulseCooldownTimer(): number {
    return this.pulseCdTicks / TICK_RATE;
  }

  public getDashCooldownTimer(): number {
    return this.dashCdTicks / TICK_RATE;
  }

  public getCharmTimer(): number {
    return this.charmTicks / TICK_RATE;
  }

  public getRespawnTimer(): number {
    return this.respawnTicks / TICK_RATE;
  }

  public getPlayerHeadingRad(): number {
    return this.playerHeadingRad;
  }

  public isWindWarning(): boolean {
    return this.windWarning;
  }

  public getWindDirDeg(): number {
    return this.windDirDeg;
  }

  public getCharmVisuals(): CharmVisualInfo[] {
    return this.charms.map((c) => ({
      id: c.id,
      pos: [round3(c.pos[0]), round3(c.pos[1]), round3(c.pos[2])],
      available: c.available,
      respawn_s: round3(c.respawnTicks / TICK_RATE),
    }));
  }

  public getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick: this.wallTick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      wind: {
        active: this.windActive,
        dir_deg: this.windActive ? round3(this.windDirDeg) : 0,
      },
      player: {
        pos: [round3(this.playerPos[0]), round3(this.playerPos[1]), round3(this.playerPos[2])],
        vel: [round3(this.playerVel[0]), round3(this.playerVel[1]), round3(this.playerVel[2])],
        grounded: this.playerGrounded,
        flames: this.playerFlames,
        carried: this.playerCarried,
        invuln: this.invulnTicks > 0,
        dash_cd_s: round3(this.dashCdTicks / TICK_RATE),
        pulse_cd_s: round3(this.pulseCdTicks / TICK_RATE),
        charm_s: round3(this.charmTicks / TICK_RATE),
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
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / TICK_RATE),
      })),
      motes_active: this.motes.length,
      drifters: this.drifters.map((d) => ({
        id: d.id,
        pos: [round3(d.pos[0]), round3(d.pos[1]), round3(d.pos[2])],
        state: d.state,
        stolen: d.stolen,
      })),
      charms: this.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE),
      })),
    };
  }

  public getEndRecord(): EndRecord {
    return {
      type: 'end',
      ticks: this.wallTick,
      state: this.state,
      score: this.score,
    };
  }

  /**
   * Advances simulation by 1 tick following exact TICKET-02 12-step order.
   */
  public step(input: SimInput): StepResult {
    if (this.state === 'won' || this.state === 'lost') {
      return { tick: this.wallTick, simTick: this.simTick, state: this.state, events: [] };
    }

    const nextWallTick = this.wallTick + 1;
    const events: EventRecord[] = [];
    const emit = (payload: SimEventPayload): void => {
      events.push({ type: 'event', tick: nextWallTick, ...payload });
    };

    // === STEP 1: Read input & handle pause ===
    const pausePressed = input.pause && !this.prevInput.pause;
    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;
    const dashPressed = input.dash && !this.prevInput.dash;

    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
      pause: input.pause,
    };

    if (this.state === 'playing' && pausePressed) {
      this.state = 'paused';
      this.wallTick = nextWallTick;
      emit({ name: 'paused', data: {} });
      return { tick: this.wallTick, simTick: this.simTick, state: this.state, events };
    }

    if (this.state === 'paused') {
      if (!pausePressed) {
        this.wallTick = nextWallTick;
        return { tick: this.wallTick, simTick: this.simTick, state: this.state, events };
      }
      this.state = 'playing';
      emit({ name: 'resumed', data: {} });
    }

    this.wallTick = nextWallTick;
    const nextSimTick = this.simTick + 1;
    this.simTick = nextSimTick;

    if (!this.nightStartEmitted) {
      this.nightStartEmitted = true;
      emit({ name: 'night_start', data: { night: this.night } });
    }

    // === STEP 2: Decrement timers (time, cooldowns, invuln, stun, charm, dropped TTL, charm respawn, wind) ===
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.simTick / TICK_RATE);

    if (this.invulnTicks > 0) this.invulnTicks--;
    if (this.dashCdTicks > 0) this.dashCdTicks--;
    if (this.pulseCdTicks > 0) this.pulseCdTicks--;
    if (this.charmTicks > 0) this.charmTicks--;

    if (this.respawnTicks > 0) {
      this.respawnTicks--;
      if (this.respawnTicks === 0) {
        this.playerPos = [...this.mapDef.spawnPos];
        this.playerVel = [0, 0, 0];
        this.playerGrounded = true;
        this.launching = false;
        this.dashTicks = 0;
        this.invulnTicks = INVULN_RESPAWN_TICKS;
      }
    }

    // Shade timers
    for (const shade of this.shades) {
      if (shade.state === 'spawning' || shade.state === 'stunned' || shade.state === 'recoil') {
        if (shade.stateTicksLeft > 0) {
          shade.stateTicksLeft--;
        }
        if (shade.stateTicksLeft === 0) {
          const d = distXZ(shade.pos, this.playerPos);
          shade.state = d <= SHADE_LOSE_RADIUS + EPS ? 'chase' : 'wander';
          shade.pushTicksLeft = 0;
        }
      }
    }

    // Dropped mote TTL expiration
    if (this.motes.length > 0) {
      const aliveMotes: InternalMote[] = [];
      for (const m of this.motes) {
        if (m.ttlTicks !== null) {
          m.ttlTicks--;
          if (m.ttlTicks <= 0) continue;
        }
        aliveMotes.push(m);
      }
      this.motes = aliveMotes;
    }

    // Charm respawn
    for (const charm of this.charms) {
      if (!charm.available && charm.respawnTicks > 0) {
        charm.respawnTicks--;
        if (charm.respawnTicks === 0) {
          charm.available = true;
        }
      }
    }

    // Night 3 Wind cycle (every 30s = 1800 ticks, warns 2s prior, lasts 5s = 300 ticks)
    if (this.windEnabled) {
      const phase = this.simTick % WIND_PERIOD_TICKS;
      if (this.simTick >= WIND_PERIOD_TICKS - WIND_WARNING_TICKS && phase === WIND_PERIOD_TICKS - WIND_WARNING_TICKS) {
        this.windDirDeg = round3(this.rng.range(0, 360));
      }
      this.windWarning =
        this.simTick >= WIND_PERIOD_TICKS - WIND_WARNING_TICKS &&
        phase >= WIND_PERIOD_TICKS - WIND_WARNING_TICKS;
      this.windActive = this.simTick >= WIND_PERIOD_TICKS && phase < WIND_DURATION_TICKS;
    } else {
      this.windActive = false;
      this.windWarning = false;
    }

    // === STEP 3: Move Player (jump, dash, jump pads, wind) & check fall ===
    if (this.respawnTicks === 0) {
      // Compute normalized camera-rotated move vector
      let mx = input.move[0];
      let mz = input.move[1];
      const mag = Math.hypot(mx, mz);
      if (mag > 1) {
        mx /= mag;
        mz /= mag;
      }
      let wx = 0;
      let wz = 0;
      if (mag > EPS) {
        const theta = (input.cam_yaw_deg * Math.PI) / 180;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        wx = mx * cosT + mz * sinT;
        wz = -mx * sinT + mz * cosT;
        this.playerHeadingRad = Math.atan2(wx, wz);
      }

      // Trigger Dash (rising edge, ignored if already dashing or on cooldown)
      if (dashPressed && this.dashTicks === 0 && this.dashCdTicks === 0) {
        if (mag > EPS) {
          const wLen = Math.hypot(wx, wz) || 1;
          this.dashDir = [wx / wLen, wz / wLen];
        } else {
          this.dashDir = [Math.sin(this.playerHeadingRad), Math.cos(this.playerHeadingRad)];
        }
        this.dashTicks = Math.max(1, Math.round(this.tuning.dash_duration_s * TICK_RATE));
        this.dashCdTicks =
          this.charmTicks > 0 ? 0 : Math.round(this.tuning.dash_cooldown_s * TICK_RATE);
        this.launching = false;
        this.playerVel[1] = 0;
        emit({ name: 'dash', data: {} });
      }

      // Trigger Jump (grounded only, not dashing, not launching)
      if (jumpPressed && this.playerGrounded && this.dashTicks === 0 && !this.launching) {
        this.playerVel[1] = JUMP_VELOCITY;
        this.playerGrounded = false;
      }

      // Compute horizontal velocity
      const isDashingNow = this.dashTicks > 0;
      let vx = 0;
      let vz = 0;
      if (isDashingNow) {
        vx = this.dashDir[0] * this.tuning.dash_speed;
        vz = this.dashDir[1] * this.tuning.dash_speed;
        this.playerVel[1] = 0;
        this.dashTicks--;
      } else if (this.launching) {
        vx = this.launchVel[0];
        vz = this.launchVel[1];
      } else {
        const speed = this.charmTicks > 0 ? CHARM_PLAYER_SPEED : this.tuning.player_speed;
        vx = wx * speed;
        vz = wz * speed;
      }

      // Wind gust push (Night 3)
      if (this.windActive && !isDashingNow) {
        const wRad = (this.windDirDeg * Math.PI) / 180;
        vx += Math.cos(wRad) * WIND_PUSH_SPEED;
        vz += Math.sin(wRad) * WIND_PUSH_SPEED;
      }

      this.playerVel[0] = vx;
      this.playerVel[2] = vz;

      const resolved = resolveHorizontalMove(
        this.night,
        this.playerPos[0],
        this.playerPos[2],
        this.playerPos[1],
        this.playerPos[0] + vx * DT,
        this.playerPos[2] + vz * DT,
      );
      this.playerPos[0] = resolved.x;
      this.playerPos[2] = resolved.z;

      // Vertical physics (airborne dash holds Y constant)
      if (!isDashingNow) {
        const terrainH = getTerrainHeight(this.night, this.playerPos[0], this.playerPos[2]);
        if (
          this.playerGrounded &&
          this.playerVel[1] <= 0 &&
          terrainH !== null &&
          Math.abs(terrainH - this.playerPos[1]) <= 0.65
        ) {
          this.playerPos[1] = terrainH;
          this.playerVel[1] = 0;
          this.playerGrounded = true;
        } else {
          this.playerGrounded = false;
          const prevY = this.playerPos[1];
          this.playerVel[1] += GRAVITY * DT;
          this.playerPos[1] += this.playerVel[1] * DT;
          if (
            terrainH !== null &&
            this.playerVel[1] <= 0 &&
            prevY >= terrainH - 0.15 &&
            this.playerPos[1] <= terrainH + 1e-6
          ) {
            this.playerPos[1] = terrainH;
            this.playerVel[1] = 0;
            this.playerGrounded = true;
            this.launching = false;
          }
        }
      }

      // Check Jump Pads (after updating foot position)
      if (!this.launching && !isDashingNow && this.playerVel[1] <= 0.01) {
        for (const pad of this.mapDef.jumpPads) {
          if (
            distXZ(this.playerPos, pad.pos) <= pad.radius + EPS &&
            Math.abs(this.playerPos[1] - pad.pos[1]) <= 0.35
          ) {
            this.playerVel[1] = pad.launchVy;
            this.launchVel = [
              pad.dirXZ[0] * pad.launchHorizSpeed,
              pad.dirXZ[1] * pad.launchHorizSpeed,
            ];
            this.playerVel[0] = this.launchVel[0];
            this.playerVel[2] = this.launchVel[1];
            this.launching = true;
            this.playerGrounded = false;
            break;
          }
        }
      }

      // Check Fall off island (Y < -10)
      if (this.tuning.fall_enabled && this.playerPos[1] < FALL_Y_THRESHOLD) {
        this.playerFlames = Math.max(0, this.playerFlames - 1);
        const lost = this.playerCarried;
        this.playerCarried = 0;
        this.playerVel = [0, 0, 0];
        this.launching = false;
        this.dashTicks = 0;
        emit({
          name: 'player_hit',
          data: { by: 'fall', flames: this.playerFlames, dropped: 0, lost },
        });
        if (this.playerFlames > 0) {
          this.respawnTicks = RESPAWN_WAIT_TICKS;
        }
      }
    }

    // === STEP 4: Pickup motes and charms ===
    if (this.respawnTicks === 0 && this.playerFlames > 0) {
      if (this.playerCarried < this.tuning.carry_capacity && this.motes.length > 0) {
        const remaining: InternalMote[] = [];
        for (const mote of this.motes) {
          if (
            this.playerCarried < this.tuning.carry_capacity &&
            mote.spawnTick < this.simTick &&
            distXZ(this.playerPos, mote.pos) <= this.tuning.pickup_radius + EPS &&
            Math.abs(this.playerPos[1] - mote.pos[1]) <= 1.5 + EPS
          ) {
            this.playerCarried += 1;
            emit({ name: 'mote_picked', data: { carried: this.playerCarried } });
          } else {
            remaining.push(mote);
          }
        }
        this.motes = remaining;
      }

      for (const charm of this.charms) {
        if (
          charm.available &&
          distXZ(this.playerPos, charm.pos) <= this.tuning.pickup_radius + EPS &&
          Math.abs(this.playerPos[1] - charm.pos[1]) <= 1.5 + EPS
        ) {
          charm.available = false;
          charm.respawnTicks = CHARM_RESPAWN_TICKS;
          this.charmTicks = CHARM_DURATION_TICKS;
          this.dashCdTicks = 0;
          emit({
            name: 'charm_picked',
            data: { charm_id: charm.id, charm_ticks: CHARM_DURATION_TICKS },
          });
        }
      }
    }

    // === STEP 5: Interact with lanterns ===
    const newlyLitLanternIds = new Set<string>();
    if (this.respawnTicks === 0 && this.playerFlames > 0 && interactPressed && this.playerCarried > 0) {
      let bestLantern: InternalLantern | null = null;
      let bestDist = Infinity;
      for (const lantern of this.lanterns) {
        if (lantern.lit) continue;
        const d = distXZ(this.playerPos, lantern.pos);
        const dy = Math.abs(this.playerPos[1] - lantern.pos[1]);
        if (d <= this.tuning.interact_radius + EPS && dy <= 2.5 + EPS) {
          if (
            bestLantern === null ||
            d < bestDist - EPS ||
            (Math.abs(d - bestDist) <= EPS && lantern.id < bestLantern.id)
          ) {
            bestDist = d;
            bestLantern = lantern;
          }
        }
      }
      if (bestLantern) {
        const needed = Math.max(0, this.tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.playerCarried, needed);
        if (amount > 0) {
          this.playerCarried -= amount;
          bestLantern.deposited += amount;
          // Phase 2 standardized score: +10 per mote deposited
          this.score += amount * this.tuning.score.per_mote;
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
            newlyLitLanternIds.add(bestLantern.id);
            this.score += this.tuning.score.per_lantern;
            emit({ name: 'lantern_lit', data: { lantern_id: bestLantern.id } });
          }
        }
      }
    }

    // === STEP 6: Update safe zones (push shades trapped inside newly lit lanterns over <= 30 ticks) ===
    const safeEdge = this.tuning.safe_radius + SAFE_RADIUS_MARGIN;
    for (const shade of this.shades) {
      if (newlyLitLanternIds.size > 0) {
        for (const lantern of this.lanterns) {
          if (!newlyLitLanternIds.has(lantern.id)) continue;
          const d = distXZ(shade.pos, lantern.pos);
          if (d < this.tuning.safe_radius) {
            shade.safePushing = true;
            shade.safePushTicksLeft = SAFE_PUSH_MAX_TICKS;
            shade.safePushTargetLanternId = lantern.id;
            shade.safePushStepDist = (safeEdge - d) / SAFE_PUSH_MAX_TICKS;
            break;
          }
        }
      }
      if (shade.safePushing && shade.safePushTargetLanternId) {
        const l = this.lanterns.find((x) => x.id === shade.safePushTargetLanternId);
        if (!l || !l.lit) {
          shade.safePushing = false;
          shade.safePushTicksLeft = 0;
        } else {
          const lx = shade.pos[0] - l.pos[0];
          const lz = shade.pos[2] - l.pos[2];
          const ld = Math.hypot(lx, lz);
          const ux = ld > EPS ? lx / ld : 1;
          const uz = ld > EPS ? lz / ld : 0;
          const stepOut = Math.max(shade.safePushStepDist, (safeEdge - ld) / Math.max(1, shade.safePushTicksLeft));
          const nextD = Math.min(safeEdge, ld + stepOut);
          shade.pos[0] = l.pos[0] + ux * nextD;
          shade.pos[2] = l.pos[2] + uz * nextD;
          shade.safePushTicksLeft--;
          if (nextD >= this.tuning.safe_radius || shade.safePushTicksLeft <= 0) {
            if (nextD < safeEdge) {
              shade.pos[0] = l.pos[0] + ux * safeEdge;
              shade.pos[2] = l.pos[2] + uz * safeEdge;
            }
            shade.safePushing = false;
            shade.safePushTicksLeft = 0;
          }
        }
      }
    }

    // === STEP 7: Pulse (Tỏa Sáng) ===
    if (
      this.respawnTicks === 0 &&
      this.playerFlames > 0 &&
      pulsePressed &&
      this.playerCarried >= this.tuning.pulse_cost &&
      this.pulseCdTicks === 0
    ) {
      this.playerCarried -= this.tuning.pulse_cost;
      this.pulseCdTicks = Math.round(this.tuning.pulse_cooldown_s * TICK_RATE);
      const pulseCenter: Vec3 = [this.playerPos[0], this.playerPos[1] + 0.8, this.playerPos[2]];
      const stunnedIds: string[] = [];

      // Shades in 3D radius <= 5m
      for (const shade of this.shades) {
        if (shade.spawnTick >= this.simTick) continue;
        const d3 = dist3D(pulseCenter, shade.pos);
        if (d3 <= this.tuning.pulse_radius + EPS) {
          const dx = shade.pos[0] - this.playerPos[0];
          const dz = shade.pos[2] - this.playerPos[2];
          const dXZ = Math.hypot(dx, dz);
          const ux = dXZ > EPS ? dx / dXZ : 1;
          const uz = dXZ > EPS ? dz / dXZ : 0;
          shade.state = 'stunned';
          shade.stateTicksLeft = Math.round(this.tuning.pulse_stun_s * TICK_RATE);
          shade.pushTicksLeft = PULSE_PUSH_TICKS;
          shade.pushStep = [
            (ux * this.tuning.pulse_push_m) / PULSE_PUSH_TICKS,
            (uz * this.tuning.pulse_push_m) / PULSE_PUSH_TICKS,
          ];
          this.score += this.tuning.score.per_stun;
          stunnedIds.push(shade.id);
        }
      }

      // Drifters in 3D radius <= 5m
      for (const drifter of this.drifters) {
        if (drifter.spawnTick >= this.simTick) continue;
        const d3 = dist3D(pulseCenter, drifter.pos);
        if (d3 <= this.tuning.pulse_radius + EPS) {
          if (drifter.state === 'chase') {
            drifter.state = 'flee';
            drifter.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          } else if (drifter.state === 'flee' && drifter.stolen > 0) {
            const amount = drifter.stolen;
            const groundY = getTerrainHeight(this.night, drifter.pos[0], drifter.pos[2]) ?? 0;
            for (let i = 0; i < amount; i++) {
              const a = (i / amount) * Math.PI * 2;
              const r = amount === 1 ? 0 : 0.6;
              this.spawnDroppedMote(
                drifter.pos[0] + Math.cos(a) * r,
                groundY,
                drifter.pos[2] + Math.sin(a) * r,
              );
            }
            drifter.stolen = 0;
            drifter.fleeTicksLeft = DRIFTER_DROP_FLEE_TICKS;
            emit({
              name: 'drifter_drop',
              data: { drifter_id: drifter.id, amount },
            });
          }
        }
      }

      emit({ name: 'pulse', data: { stunned_ids: stunnedIds } });
    }

    // === STEP 8: Move Shades and Drifters ===
    const shadeSpeed =
      this.night === 3 && this.tuning.shade_speed_night3 !== undefined
        ? this.tuning.shade_speed_night3
        : this.tuning.shade_speed;

    for (const shade of this.shades) {
      if (shade.safePushing) continue;

      if (shade.state === 'spawning') {
        continue;
      }

      if (shade.state === 'stunned') {
        if (shade.pushTicksLeft > 0) {
          const moved = resolveHorizontalMove(
            this.night,
            shade.pos[0],
            shade.pos[2],
            Math.max(0, shade.pos[1] - 0.8),
            shade.pos[0] + shade.pushStep[0],
            shade.pos[2] + shade.pushStep[1],
          );
          shade.pos[0] = moved.x;
          shade.pos[2] = moved.z;
          shade.pushTicksLeft--;
          if (moved.blocked) {
            shade.pushTicksLeft = 0;
          }
        }
        continue;
      }

      if (shade.state === 'recoil') {
        const stepDist = SHADE_RECOIL_DIST / SHADE_RECOIL_TICKS;
        shade.pos[0] += shade.recoilDir[0] * stepDist;
        shade.pos[2] += shade.recoilDir[1] * stepDist;
        this.clampShadeOutsideSafeZones(shade);
        continue;
      }

      // Detection / lose-aggro transition between wander and chase
      const dToPlayer = distXZ(shade.pos, this.playerPos);
      if (shade.state === 'wander' && dToPlayer <= SHADE_DETECT_RADIUS + EPS && this.respawnTicks === 0) {
        shade.state = 'chase';
      } else if (shade.state === 'chase' && (dToPlayer > SHADE_LOSE_RADIUS + EPS || this.respawnTicks > 0)) {
        shade.state = 'wander';
      }

      if (shade.state === 'chase') {
        const dx = this.playerPos[0] - shade.pos[0];
        const dz = this.playerPos[2] - shade.pos[2];
        if (dToPlayer > EPS) {
          const stepDist = Math.min(dToPlayer, shadeSpeed * DT);
          shade.pos[0] += (dx / dToPlayer) * stepDist;
          shade.pos[2] += (dz / dToPlayer) * stepDist;
        }
        // Smooth vertical tracking toward player height + 0.8
        const targetY = this.playerPos[1] + 0.8;
        const dy = targetY - shade.pos[1];
        if (Math.abs(dy) > EPS) {
          shade.pos[1] += Math.sign(dy) * Math.min(Math.abs(dy), 3.0 * DT);
        }
      } else {
        // wander
        shade.wanderChangeTicks--;
        if (shade.wanderChangeTicks <= 0) {
          shade.wanderAngle = this.rng.range(0, Math.PI * 2);
          shade.wanderChangeTicks = 120;
        }
        const nx = shade.pos[0] + Math.cos(shade.wanderAngle) * SHADE_WANDER_SPEED * DT;
        const nz = shade.pos[2] + Math.sin(shade.wanderAngle) * SHADE_WANDER_SPEED * DT;
        if (getTerrainHeight(this.night, nx, nz) !== null) {
          shade.pos[0] = nx;
          shade.pos[2] = nz;
        } else {
          shade.wanderAngle = (shade.wanderAngle + Math.PI) % (Math.PI * 2);
        }
      }

      this.clampShadeOutsideSafeZones(shade);
    }

    // Move Drifters
    const activeDrifters: InternalDrifter[] = [];
    for (const d of this.drifters) {
      if (d.state === 'flee') {
        const dx = d.pos[0] - this.playerPos[0];
        const dz = d.pos[2] - this.playerPos[2];
        const dist = Math.hypot(dx, dz);
        const ux = dist > EPS ? dx / dist : 1;
        const uz = dist > EPS ? dz / dist : 0;
        d.pos[0] += ux * DRIFTER_FAST_SPEED * DT;
        d.pos[2] += uz * DRIFTER_FAST_SPEED * DT;
        d.fleeTicksLeft--;
        if (d.fleeTicksLeft > 0) {
          activeDrifters.push(d);
        }
        continue;
      }

      const dToPlayer = distXZ(d.pos, this.playerPos);
      const shouldChase =
        this.respawnTicks === 0 &&
        this.playerCarried >= DRIFTER_MIN_CARRIED &&
        dToPlayer <= DRIFTER_DETECT_RADIUS + EPS;

      if (d.state === 'idle' && shouldChase) {
        d.state = 'chase';
      } else if (d.state === 'chase' && !shouldChase) {
        d.state = 'idle';
      }

      if (d.state === 'chase') {
        const dx = this.playerPos[0] - d.pos[0];
        const dz = this.playerPos[2] - d.pos[2];
        if (dToPlayer > EPS) {
          const stepDist = Math.min(dToPlayer, DRIFTER_FAST_SPEED * DT);
          d.pos[0] += (dx / dToPlayer) * stepDist;
          d.pos[2] += (dz / dToPlayer) * stepDist;
        }
      } else {
        d.wanderChangeTicks--;
        if (d.wanderChangeTicks <= 0) {
          d.wanderAngle = this.rng.range(0, Math.PI * 2);
          d.wanderChangeTicks = 90;
        }
        const nx = d.pos[0] + Math.cos(d.wanderAngle) * DRIFTER_IDLE_SPEED * DT;
        const nz = d.pos[2] + Math.sin(d.wanderAngle) * DRIFTER_IDLE_SPEED * DT;
        if (getTerrainHeight(this.night, nx, nz) !== null) {
          d.pos[0] = nx;
          d.pos[2] = nz;
        } else {
          d.wanderAngle = (d.wanderAngle + Math.PI) % (Math.PI * 2);
        }
      }
      activeDrifters.push(d);
    }
    this.drifters = activeDrifters;

    // === STEP 9: Contacts — Drifters steal FIRST, then Shades hit (sorted by ascending id) ===
    if (this.respawnTicks === 0 && this.playerFlames > 0) {
      // Drifters (ignore invuln, ignore safe zone, steal once)
      const sortedDrifters = [...this.drifters].sort((a, b) => a.id.localeCompare(b.id));
      for (const drifter of sortedDrifters) {
        if (drifter.spawnTick >= this.simTick) continue;
        if (drifter.state !== 'chase' || drifter.stolen > 0) continue;
        if (distXZ(this.playerPos, drifter.pos) <= DRIFTER_STEAL_RADIUS + EPS) {
          const amount = Math.min(3, this.playerCarried);
          if (amount > 0) {
            this.playerCarried -= amount;
            drifter.stolen = amount;
            drifter.state = 'flee';
            drifter.fleeTicksLeft = DRIFTER_FLEE_TICKS;
            emit({
              name: 'drifter_steal',
              data: {
                drifter_id: drifter.id,
                amount,
                carried: this.playerCarried,
              },
            });
          }
        }
      }

      // Shades (max 1 flame lost per tick; ignore if player invuln, shade stunned/recoil/spawning/safePushing)
      if (this.invulnTicks === 0) {
        const sortedShades = [...this.shades].sort((a, b) => a.id.localeCompare(b.id));
        for (const shade of sortedShades) {
          if (shade.spawnTick >= this.simTick) continue;
          if (
            shade.state === 'stunned' ||
            shade.state === 'recoil' ||
            shade.state === 'spawning' ||
            shade.safePushing
          ) {
            continue;
          }
          const dXZ = distXZ(this.playerPos, shade.pos);
          const dy = Math.abs(this.playerPos[1] - (shade.pos[1] - 0.8));
          // Also check direct Y diff in case scenario placed shade at y=0
          const effectiveDy = Math.min(dy, Math.abs(this.playerPos[1] - shade.pos[1]));
          if (dXZ <= this.tuning.shade_hit_radius + EPS && effectiveDy <= 1.5 + EPS) {
            this.playerFlames = Math.max(0, this.playerFlames - 1);
            const dropped = Math.floor(this.playerCarried * this.tuning.hit_drop_ratio);
            this.playerCarried -= dropped;
            this.invulnTicks = Math.round(this.tuning.invuln_s * TICK_RATE);

            // Spawn dropped motes on 1.5-2.5m ring around player (TTL 480 ticks, pickable from next tick)
            for (let i = 0; i < dropped; i++) {
              const angle = this.rng.range(0, Math.PI * 2);
              const radius = this.rng.range(1.5, 2.5);
              const dx = this.playerPos[0] + Math.cos(angle) * radius;
              const dz = this.playerPos[2] + Math.sin(angle) * radius;
              const h = getTerrainHeight(this.night, dx, dz);
              const mx = h !== null ? dx : this.playerPos[0];
              const mz = h !== null ? dz : this.playerPos[2];
              const my = h !== null ? h : this.playerPos[1];
              this.spawnDroppedMote(mx, my, mz);
            }

            // Shade enters recoil (retreats 2m over 60 ticks)
            const rx = shade.pos[0] - this.playerPos[0];
            const rz = shade.pos[2] - this.playerPos[2];
            const rLen = Math.hypot(rx, rz);
            shade.recoilDir = rLen > EPS ? [rx / rLen, rz / rLen] : [1, 0];
            shade.state = 'recoil';
            shade.stateTicksLeft = SHADE_RECOIL_TICKS;

            emit({
              name: 'player_hit',
              data: { by: 'shade', flames: this.playerFlames, dropped },
            });
            break;
          }
        }
      }
    }

    // === STEP 10: Scheduled spawns (interactive starting NEXT tick) ===
    if (
      this.randomMotes &&
      this.simTick % MOTE_SPAWN_INTERVAL_TICKS === 0 &&
      this.motes.length < MAX_ACTIVE_MOTES
    ) {
      this.spawnRandomMoteAtFreePoint();
    }

    if (this.randomShades) {
      if (this.simTick === SHADE_FIRST_SPAWN_TICK) {
        for (let i = 0; i < 2; i++) {
          if (this.shades.length < this.mapDef.maxShades) {
            const id = this.spawnScheduledShade();
            if (id) emit({ name: 'shade_spawned', data: { id } });
          }
        }
      } else if (
        this.simTick > SHADE_FIRST_SPAWN_TICK &&
        (this.simTick - SHADE_FIRST_SPAWN_TICK) % this.mapDef.shadeSpawnIntervalTicks === 0 &&
        this.shades.length < this.mapDef.maxShades
      ) {
        const id = this.spawnScheduledShade();
        if (id) emit({ name: 'shade_spawned', data: { id } });
      }
    }

    if (
      this.randomDrifters &&
      this.simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0 &&
      this.drifters.length < MAX_DRIFTERS
    ) {
      this.spawnScheduledDrifter();
    }

    // === STEP 11: Win / Loss conditions (exact TICKET-02 priority) ===
    const allLit = this.lanterns.length > 0 && this.lanterns.every((l) => l.lit);
    if (this.playerFlames <= 0) {
      this.state = 'lost';
      emit({ name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
    } else if (allLit) {
      this.state = 'won';
      const timeBonus = Math.floor(this.timeLeftS) * this.tuning.score.per_second_left;
      const flameBonus = this.playerFlames * this.tuning.score.per_flame_left;
      this.score += timeBonus + flameBonus;
      emit({ name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
    } else if (this.timeLeftS <= EPS) {
      this.timeLeftS = 0;
      this.state = 'lost';
      emit({ name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
    }

    return { tick: this.wallTick, simTick: this.simTick, state: this.state, events };
  }

  private clampShadeOutsideSafeZones(shade: InternalShade): void {
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

  private spawnDroppedMote(x: number, y: number, z: number): void {
    const id = `M${this.nextMoteSeq++}`;
    this.motes.push({
      id,
      pos: [x, y, z],
      kind: 'dropped',
      ttlTicks: DROPPED_MOTE_TTL_TICKS,
      spawnTick: this.simTick,
    });
  }

  private spawnRandomMoteAtFreePoint(): void {
    const freePoints = this.mapDef.moteSpawnPoints.filter(
      (pt) => !this.motes.some((m) => distXZ(m.pos, pt) < 0.5 && Math.abs(m.pos[1] - pt[1]) < 0.5),
    );
    if (freePoints.length === 0) return;
    const idx = Math.floor(this.rng.next() * freePoints.length);
    const chosen = freePoints[idx];
    const id = `M${this.nextMoteSeq++}`;
    this.motes.push({
      id,
      pos: [chosen[0], chosen[1], chosen[2]],
      kind: 'random',
      ttlTicks: null,
      spawnTick: this.simTick,
    });
  }

  private spawnScheduledShade(): string | null {
    const validPoints = this.mapDef.shadeSpawnPoints.filter((pt) => {
      if (distXZ(pt, this.playerPos) < 15.0 - EPS) return false;
      const inSafe = this.lanterns.some(
        (l) => l.lit && distXZ(pt, l.pos) < this.tuning.safe_radius + 0.5,
      );
      if (inSafe) return false;
      const occupied = this.shades.some((s) => distXZ(s.pos, pt) < 1.0);
      return !occupied;
    });
    if (validPoints.length === 0) return null;
    const idx = Math.floor(this.rng.next() * validPoints.length);
    const pt = validPoints[idx];
    const id = `S${this.nextShadeSeq++}`;
    this.shades.push({
      id,
      pos: [pt[0], pt[1] + 0.8, pt[2]],
      state: 'spawning',
      stateTicksLeft: SHADE_SPAWN_STATE_TICKS,
      wanderAngle: this.rng.range(0, Math.PI * 2),
      wanderChangeTicks: 120,
      recoilDir: [1, 0],
      pushTicksLeft: 0,
      pushStep: [0, 0],
      safePushing: false,
      safePushTicksLeft: 0,
      safePushTargetLanternId: null,
      safePushStepDist: 0,
      spawnTick: this.simTick,
    });
    return id;
  }

  private spawnScheduledDrifter(): void {
    const pts = this.mapDef.shadeSpawnPoints;
    if (pts.length === 0) return;
    const idx = Math.floor(this.rng.next() * pts.length);
    const pt = pts[idx];
    const id = `D${this.nextDrifterSeq++}`;
    this.drifters.push({
      id,
      pos: [pt[0], pt[1] + 1.4, pt[2]],
      state: 'idle',
      stolen: 0,
      fleeTicksLeft: 0,
      wanderAngle: this.rng.range(0, Math.PI * 2),
      wanderChangeTicks: 90,
      spawnTick: this.simTick,
    });
  }
}
