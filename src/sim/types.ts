export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type GameState = 'playing' | 'won' | 'lost';
export type ShadeState = 'chase' | 'stunned';
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
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
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
}

export interface InputFrame {
  tick: number;
  move?: Vec2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
}

export type ScenarioMote = Vec3 | { id?: string; pos: Vec3 };

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: ShadeState;
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
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface PlayerSnapshot {
  pos: Vec3;
  flames: number;
  carried: number;
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
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  state: GameState;
  time_left_s: number;
  score: number;
  player: PlayerSnapshot;
  lanterns: LanternSnapshot[];
  shades: ShadeSnapshot[];
  motes: MoteSnapshot[];
  motes_active: number;
}

export type SimEventPayload =
  | { name: 'mote_picked'; data: { carried: number } }
  | { name: 'deposit'; data: { lantern_id: string; amount: number; deposited: number } }
  | { name: 'lantern_lit'; data: { lantern_id: string } }
  | { name: 'pulse'; data: { stunned_ids: string[] } }
  | { name: 'player_hit'; data: { by: 'shade' | 'fall'; flames: number; dropped: number } }
  | { name: 'shade_spawned'; data: { id: string } }
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
  };
}
