export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type NightNumber = 1 | 2 | 3;
export type GameState = 'playing' | 'paused' | 'won' | 'lost';
export type ShadeState = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned';
export type DrifterState = 'idle' | 'chase' | 'flee';
export type MoteKind = 'random' | 'dropped';
export type GameOverReason = 'all_lit' | 'dawn' | 'no_flames';

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

export interface GameTuning {
  player_speed: number;
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  lantern_count_night2?: number;
  lantern_count_night3?: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_speed_night3?: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export interface GameContract {
  contract_version: string;
  team: string;
  build_cmd: string;
  run_cmd: string;
  headless_cmd: string;
  tuning: GameTuning;
}

export interface SimInput {
  move: Vec2;
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export interface InputFrame {
  tick: number;
  move?: Vec2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
  pause?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
  invuln_ticks?: number;
  dash_cd_ticks?: number;
  pulse_cd_ticks?: number;
  charm_ticks?: number;
}

export type ScenarioMote =
  | Vec3
  | { id?: string; pos: Vec3; kind?: MoteKind; ttl_s?: number | null };

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: ShadeState;
  state_ticks_left?: number;
}

export interface ScenarioDrifter {
  id?: string;
  pos: Vec3;
  state?: DrifterState;
  stolen?: number;
}

export interface ScenarioCharm {
  id?: string;
  pos: Vec3;
  available?: boolean;
  respawn_s?: number;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioFile {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  drifters?: ScenarioDrifter[];
  charms?: ScenarioCharm[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface WindSnapshot {
  active: boolean;
  dir_deg: number;
}

export interface PlayerSnapshot {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  flames: number;
  carried: number;
  invuln: boolean;
  dash_cd_s: number;
  pulse_cd_s: number;
  charm_s: number;
}

export interface LanternSnapshot {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface ShadeSnapshot {
  id: string;
  pos: Vec3;
  state: ShadeState;
}

export interface MoteSnapshot {
  id: string;
  pos: Vec3;
  kind: MoteKind;
  ttl_s: number | null;
}

export interface DrifterSnapshot {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
}

export interface CharmSnapshot {
  id: string;
  available: boolean;
  respawn_s: number;
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  night: NightNumber;
  state: GameState;
  time_left_s: number;
  score: number;
  wind: WindSnapshot;
  player: PlayerSnapshot;
  lanterns: LanternSnapshot[];
  shades: ShadeSnapshot[];
  motes: MoteSnapshot[];
  motes_active: number;
  drifters: DrifterSnapshot[];
  charms: CharmSnapshot[];
}

export type SimEventPayload =
  | { name: 'night_start'; data: { night: NightNumber } }
  | { name: 'mote_picked'; data: { carried: number } }
  | { name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { name: 'lantern_lit'; data: { lantern_id: string } }
  | { name: 'pulse'; data: { stunned_ids: string[] } }
  | { name: 'dash'; data: Record<string, never> }
  | { name: 'charm_picked'; data: { charm_id: string; charm_ticks: number } }
  | { name: 'drifter_steal'; data: { drifter_id: string; amount: number; carried: number } }
  | { name: 'drifter_drop'; data: { drifter_id: string; amount: number } }
  | {
      name: 'player_hit';
      data: { by: 'shade' | 'fall'; flames: number; dropped: number; lost?: number };
    }
  | { name: 'shade_spawned'; data: { id: string } }
  | { name: 'paused'; data: Record<string, never> }
  | { name: 'resumed'; data: Record<string, never> }
  | { name: 'game_over'; data: { result: 'won' | 'lost'; reason: GameOverReason } };

export type EventRecord = {
  type: 'event';
  tick: number;
} & SimEventPayload;

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GameState;
  score: number;
}

export function createDefaultInput(): SimInput {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };
}
