import type {
  InputFrame,
  InputsFile,
  ScenarioFile,
  ScenarioLantern,
  ScenarioMote,
  ScenarioShade,
  Vec2,
  Vec3,
} from './types.ts';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
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
    for (const btn of ['jump', 'interact', 'pulse', 'dash'] as const) {
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
      if (!Number.isInteger(raw.player.carried) || (raw.player.carried as number) < 0) {
        throw new ValidationError('scenario.player.carried must be a non-negative integer');
      }
      scenario.player.carried = raw.player.carried as number;
    }
    if (raw.player.flames !== undefined) {
      if (!Number.isInteger(raw.player.flames) || (raw.player.flames as number) < 0) {
        throw new ValidationError('scenario.player.flames must be a non-negative integer');
      }
      scenario.player.flames = raw.player.flames as number;
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== 'boolean') {
      throw new ValidationError('scenario.random_motes must be a boolean');
    }
    scenario.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== 'boolean') {
      throw new ValidationError('scenario.random_shades must be a boolean');
    }
    scenario.random_shades = raw.random_shades;
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
        motes.push(m.id ? { id: m.id, pos } : { pos });
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
      if (s.state !== undefined && s.state !== 'chase' && s.state !== 'stunned') {
        throw new ValidationError(`scenario.shades[${i}].state must be "chase" or "stunned"`);
      }
      const shade: ScenarioShade = { pos };
      if (s.id !== undefined) shade.id = s.id;
      if (s.state !== undefined) shade.state = s.state;
      shades.push(shade);
    }
    scenario.shades = shades;
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
        if (!Number.isInteger(l.deposited) || (l.deposited as number) < 0) {
          throw new ValidationError(`scenario.lanterns[${i}].deposited must be a non-negative integer`);
        }
        entry.deposited = l.deposited as number;
      }
      if (l.lit !== undefined) {
        if (typeof l.lit !== 'boolean') {
          throw new ValidationError(`scenario.lanterns[${i}].lit must be a boolean`);
        }
        entry.lit = l.lit;
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
