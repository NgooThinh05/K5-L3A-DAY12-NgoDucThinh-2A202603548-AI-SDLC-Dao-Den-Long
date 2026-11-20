import type {
  DrifterState,
  InputFrame,
  InputsFile,
  MoteKind,
  ScenarioCharm,
  ScenarioDrifter,
  ScenarioFile,
  ScenarioLantern,
  ScenarioMote,
  ScenarioShade,
  ShadeState,
  Vec2,
  Vec3,
} from './types.ts';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const VALID_SHADE_STATES = new Set<ShadeState>([
  'spawning',
  'wander',
  'chase',
  'recoil',
  'stunned',
  'drain',
]);
const VALID_DRIFTER_STATES = new Set<DrifterState>(['idle', 'chase', 'flee']);
const VALID_MOTE_KINDS = new Set<MoteKind>(['random', 'dropped']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function assertNonNegInt(v: unknown, label: string): number {
  if (!Number.isInteger(v) || (v as number) < 0) {
    throw new ValidationError(`${label} must be a non-negative integer`);
  }
  return v as number;
}

function assertVec2(v: unknown, label: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2 || !isFiniteNumber(v[0]) || !isFiniteNumber(v[1])) {
    throw new ValidationError(`${label} must be an array of 2 finite numbers`);
  }
  return [v[0], v[1]];
}

function assertVec3(v: unknown, label: string): Vec3 {
  if (
    !Array.isArray(v) ||
    v.length !== 3 ||
    !isFiniteNumber(v[0]) ||
    !isFiniteNumber(v[1]) ||
    !isFiniteNumber(v[2])
  ) {
    throw new ValidationError(`${label} must be an array of 3 finite numbers`);
  }
  return [v[0], v[1], v[2]];
}

export function validateInputsFile(raw: unknown): InputsFile {
  if (!isPlainObject(raw)) {
    throw new ValidationError('inputs file root must be a JSON object');
  }
  if (!Array.isArray(raw.frames)) {
    throw new ValidationError('inputs.frames must be an array');
  }

  const frames: InputFrame[] = [];
  let prevTick = -1;

  for (let i = 0; i < raw.frames.length; i++) {
    const f = raw.frames[i];
    const prefix = `inputs.frames[${i}]`;
    if (!isPlainObject(f)) {
      throw new ValidationError(`${prefix} must be an object`);
    }
    if (typeof f.tick !== 'number' || !Number.isInteger(f.tick) || f.tick < 0) {
      throw new ValidationError(`${prefix}.tick must be a non-negative integer`);
    }
    if (f.tick <= prevTick) {
      throw new ValidationError(
        `${prefix}.tick (${f.tick}) must be strictly greater than previous tick (${prevTick})`,
      );
    }
    prevTick = f.tick;

    const frame: InputFrame = { tick: f.tick };
    if (f.move !== undefined) {
      frame.move = assertVec2(f.move, `${prefix}.move`);
    }
    if (f.cam_yaw_deg !== undefined) {
      if (!isFiniteNumber(f.cam_yaw_deg)) {
        throw new ValidationError(`${prefix}.cam_yaw_deg must be a finite number`);
      }
      frame.cam_yaw_deg = f.cam_yaw_deg;
    }
    for (const btn of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (f[btn] !== undefined) {
        if (typeof f[btn] !== 'boolean') {
          throw new ValidationError(`${prefix}.${btn} must be a boolean`);
        }
        frame[btn] = f[btn] as boolean;
      }
    }
    frames.push(frame);
  }

  return { frames };
}

export function validateScenarioFile(raw: unknown): ScenarioFile {
  if (!isPlainObject(raw)) {
    throw new ValidationError('scenario file root must be a JSON object');
  }

  const scenario: ScenarioFile = {};

  if (raw.player !== undefined) {
    if (!isPlainObject(raw.player)) {
      throw new ValidationError('scenario.player must be an object');
    }
    scenario.player = {};
    if (raw.player.pos !== undefined) {
      scenario.player.pos = assertVec3(raw.player.pos, 'scenario.player.pos');
    }
    if (raw.player.carried !== undefined) {
      scenario.player.carried = assertNonNegInt(raw.player.carried, 'scenario.player.carried');
    }
    if (raw.player.flames !== undefined) {
      scenario.player.flames = assertNonNegInt(raw.player.flames, 'scenario.player.flames');
    }
    if (raw.player.invuln_ticks !== undefined) {
      scenario.player.invuln_ticks = assertNonNegInt(
        raw.player.invuln_ticks,
        'scenario.player.invuln_ticks',
      );
    }
    if (raw.player.dash_cd_ticks !== undefined) {
      scenario.player.dash_cd_ticks = assertNonNegInt(
        raw.player.dash_cd_ticks,
        'scenario.player.dash_cd_ticks',
      );
    }
    if (raw.player.pulse_cd_ticks !== undefined) {
      scenario.player.pulse_cd_ticks = assertNonNegInt(
        raw.player.pulse_cd_ticks,
        'scenario.player.pulse_cd_ticks',
      );
    }
    if (raw.player.charm_ticks !== undefined) {
      scenario.player.charm_ticks = assertNonNegInt(
        raw.player.charm_ticks,
        'scenario.player.charm_ticks',
      );
    }
    if (raw.player.successful_lights !== undefined) {
      scenario.player.successful_lights = assertNonNegInt(
        raw.player.successful_lights,
        'scenario.player.successful_lights',
      );
    }
  }

  for (const flag of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'] as const) {
    if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== 'boolean') {
        throw new ValidationError(`scenario.${flag} must be a boolean`);
      }
      scenario[flag] = raw[flag] as boolean;
    }
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ValidationError('scenario.motes must be an array');
    }
    const motes: ScenarioMote[] = [];
    for (let i = 0; i < raw.motes.length; i++) {
      const m = raw.motes[i];
      if (Array.isArray(m)) {
        motes.push(assertVec3(m, `scenario.motes[${i}]`));
      } else if (isPlainObject(m)) {
        const pos = assertVec3(m.pos, `scenario.motes[${i}].pos`);
        if (m.id !== undefined && (typeof m.id !== 'string' || m.id.length === 0)) {
          throw new ValidationError(`scenario.motes[${i}].id must be a non-empty string`);
        }
        if (m.kind !== undefined && !VALID_MOTE_KINDS.has(m.kind as MoteKind)) {
          throw new ValidationError(`scenario.motes[${i}].kind must be "random" or "dropped"`);
        }
        if (m.ttl_s !== undefined && m.ttl_s !== null && (!isFiniteNumber(m.ttl_s) || m.ttl_s < 0)) {
          throw new ValidationError(`scenario.motes[${i}].ttl_s must be null or a non-negative number`);
        }
        const entry: { id?: string; pos: Vec3; kind?: MoteKind; ttl_s?: number | null } = { pos };
        if (m.id !== undefined) entry.id = m.id;
        if (m.kind !== undefined) entry.kind = m.kind as MoteKind;
        if (m.ttl_s !== undefined) entry.ttl_s = m.ttl_s as number | null;
        motes.push(entry);
      } else {
        throw new ValidationError(`scenario.motes[${i}] must be a [x,y,z] array or {pos} object`);
      }
    }
    scenario.motes = motes;
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ValidationError('scenario.shades must be an array');
    }
    const shades: ScenarioShade[] = [];
    for (let i = 0; i < raw.shades.length; i++) {
      const s = raw.shades[i];
      if (!isPlainObject(s)) {
        throw new ValidationError(`scenario.shades[${i}] must be an object`);
      }
      const pos = assertVec3(s.pos, `scenario.shades[${i}].pos`);
      if (s.id !== undefined && (typeof s.id !== 'string' || s.id.length === 0)) {
        throw new ValidationError(`scenario.shades[${i}].id must be a non-empty string`);
      }
      if (s.state !== undefined && !VALID_SHADE_STATES.has(s.state as ShadeState)) {
        throw new ValidationError(
          `scenario.shades[${i}].state must be one of spawning|wander|chase|recoil|stunned|drain`,
        );
      }
      if (s.target_lantern_id !== undefined && (typeof s.target_lantern_id !== 'string' || s.target_lantern_id.length === 0)) {
        throw new ValidationError(`scenario.shades[${i}].target_lantern_id must be a non-empty string`);
      }
      const shade: ScenarioShade = { pos };
      if (s.id !== undefined) shade.id = s.id;
      if (s.state !== undefined) shade.state = s.state as ShadeState;
      if (s.state_ticks_left !== undefined) {
        shade.state_ticks_left = assertNonNegInt(
          s.state_ticks_left,
          `scenario.shades[${i}].state_ticks_left`,
        );
      }
      if (s.target_lantern_id !== undefined) {
        shade.target_lantern_id = s.target_lantern_id;
      }
      shades.push(shade);
    }
    scenario.shades = shades;
  }

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ValidationError('scenario.drifters must be an array');
    }
    const drifters: ScenarioDrifter[] = [];
    for (let i = 0; i < raw.drifters.length; i++) {
      const d = raw.drifters[i];
      if (!isPlainObject(d)) {
        throw new ValidationError(`scenario.drifters[${i}] must be an object`);
      }
      const pos = assertVec3(d.pos, `scenario.drifters[${i}].pos`);
      if (d.id !== undefined && (typeof d.id !== 'string' || d.id.length === 0)) {
        throw new ValidationError(`scenario.drifters[${i}].id must be a non-empty string`);
      }
      if (d.state !== undefined && !VALID_DRIFTER_STATES.has(d.state as DrifterState)) {
        throw new ValidationError(`scenario.drifters[${i}].state must be idle|chase|flee`);
      }
      const drifter: ScenarioDrifter = { pos };
      if (d.id !== undefined) drifter.id = d.id;
      if (d.state !== undefined) drifter.state = d.state as DrifterState;
      if (d.stolen !== undefined) {
        drifter.stolen = assertNonNegInt(d.stolen, `scenario.drifters[${i}].stolen`);
      }
      drifters.push(drifter);
    }
    scenario.drifters = drifters;
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ValidationError('scenario.charms must be an array');
    }
    const charms: ScenarioCharm[] = [];
    for (let i = 0; i < raw.charms.length; i++) {
      const c = raw.charms[i];
      if (!isPlainObject(c)) {
        throw new ValidationError(`scenario.charms[${i}] must be an object`);
      }
      const pos = assertVec3(c.pos, `scenario.charms[${i}].pos`);
      if (c.id !== undefined && (typeof c.id !== 'string' || c.id.length === 0)) {
        throw new ValidationError(`scenario.charms[${i}].id must be a non-empty string`);
      }
      const charm: ScenarioCharm = { pos };
      if (c.id !== undefined) charm.id = c.id;
      if (c.available !== undefined) {
        if (typeof c.available !== 'boolean') {
          throw new ValidationError(`scenario.charms[${i}].available must be a boolean`);
        }
        charm.available = c.available;
      }
      if (c.respawn_s !== undefined) {
        if (!isFiniteNumber(c.respawn_s) || c.respawn_s < 0) {
          throw new ValidationError(`scenario.charms[${i}].respawn_s must be a non-negative finite number`);
        }
        charm.respawn_s = c.respawn_s;
      }
      charms.push(charm);
    }
    scenario.charms = charms;
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ValidationError('scenario.lanterns must be an array');
    }
    const lanterns: ScenarioLantern[] = [];
    for (let i = 0; i < raw.lanterns.length; i++) {
      const l = raw.lanterns[i];
      if (!isPlainObject(l)) {
        throw new ValidationError(`scenario.lanterns[${i}] must be an object`);
      }
      if (typeof l.id !== 'string' || l.id.length === 0) {
        throw new ValidationError(`scenario.lanterns[${i}].id must be a non-empty string`);
      }
      const entry: ScenarioLantern = { id: l.id };
      if (l.pos !== undefined) {
        entry.pos = assertVec3(l.pos, `scenario.lanterns[${i}].pos`);
      }
      if (l.deposited !== undefined) {
        entry.deposited = assertNonNegInt(l.deposited, `scenario.lanterns[${i}].deposited`);
      }
      if (l.lit !== undefined) {
        if (typeof l.lit !== 'boolean') {
          throw new ValidationError(`scenario.lanterns[${i}].lit must be a boolean`);
        }
        entry.lit = l.lit;
      }
      if (l.fuel !== undefined) {
        if (!isFiniteNumber(l.fuel) || l.fuel < 0) {
          throw new ValidationError(`scenario.lanterns[${i}].fuel must be a non-negative finite number`);
        }
        entry.fuel = l.fuel;
      }
      if (l.ever_lit !== undefined) {
        if (typeof l.ever_lit !== 'boolean') {
          throw new ValidationError(`scenario.lanterns[${i}].ever_lit must be a boolean`);
        }
        entry.ever_lit = l.ever_lit;
      }
      lanterns.push(entry);
    }
    scenario.lanterns = lanterns;
  }

  if (raw.time_left_s !== undefined) {
    if (!isFiniteNumber(raw.time_left_s) || raw.time_left_s < 0) {
      throw new ValidationError('scenario.time_left_s must be a non-negative finite number');
    }
    scenario.time_left_s = raw.time_left_s;
  }

  return scenario;
}
