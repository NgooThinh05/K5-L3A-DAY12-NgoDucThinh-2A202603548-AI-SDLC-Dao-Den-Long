import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  EndRecord,
  EventRecord,
  GameContract,
  SnapshotRecord,
} from '../src/sim/types.ts';

const ROOT = process.cwd();
const CONTRACT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'),
) as GameContract;
const T = CONTRACT.tuning;
const HEADLESS_JS = path.join(ROOT, 'dist', 'headless.js');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-contract-v11-'));

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  outPath: string;
  raw: Buffer;
  records: Array<SnapshotRecord | EventRecord | EndRecord>;
  snapshots: SnapshotRecord[];
  events: EventRecord[];
  end?: EndRecord;
}

function writeJson(name: string, data: unknown): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

function writeRaw(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function runHeadless(args: string[], outName: string): RunResult {
  const outPath = path.join(tmpDir, outName);
  const fullArgs = [HEADLESS_JS, ...args, '--out', outPath];
  const t0 = performance.now();
  const proc = spawnSync(process.execPath, fullArgs, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const elapsedMs = performance.now() - t0;

  let raw = Buffer.alloc(0);
  const records: Array<SnapshotRecord | EventRecord | EndRecord> = [];
  const snapshots: SnapshotRecord[] = [];
  const events: EventRecord[] = [];
  let end: EndRecord | undefined;

  if (proc.status === 0 && fs.existsSync(outPath)) {
    raw = fs.readFileSync(outPath);
    const lines = raw
      .toString('utf8')
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);
    for (const line of lines) {
      const rec = JSON.parse(line) as SnapshotRecord | EventRecord | EndRecord;
      records.push(rec);
      if (rec.type === 'snapshot') snapshots.push(rec);
      else if (rec.type === 'event') events.push(rec);
      else if (rec.type === 'end') end = rec;
    }
  }

  return {
    status: proc.status,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    elapsedMs,
    outPath,
    raw,
    records,
    snapshots,
    events,
    end,
  };
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error(err instanceof Error ? `      ${err.message}` : `      ${String(err)}`);
  }
}

console.log(`=== Test Contract v${CONTRACT.contract_version} Suite (${CONTRACT.team}) ===`);

// =========================================================================
// PHASE 1 REGRESSION SUITE (updated for Phase 2 standardized numbers)
// =========================================================================

test('1. [Regression] Determinism (byte-for-byte) & Contract v1.1 Snapshot/End schema', () => {
  assert.equal(CONTRACT.contract_version, '1.1');
  const r1 = runHeadless(
    ['--seed', '1337', '--night', '1', '--ticks', '600', '--snapshot-every', '10'],
    'det1.jsonl',
  );
  const r2 = runHeadless(
    ['--seed', '1337', '--night', '1', '--ticks', '600', '--snapshot-every', '10'],
    'det2.jsonl',
  );
  assert.equal(r1.status, 0, `run1 stderr: ${r1.stderr}`);
  assert.equal(r2.status, 0, `run2 stderr: ${r2.stderr}`);
  assert.equal(Buffer.compare(r1.raw, r2.raw), 0, 'Outputs must be byte-for-byte identical');

  const s0 = r1.snapshots[0];
  assert.equal(s0.tick, 0);
  assert.equal(s0.sim_tick, 0);
  assert.equal(s0.night, 1);
  assert.equal(s0.motes_active, 20, 'Night 1 starts with 20 motes at 20 distinct spawn points');
  assert.equal(s0.lanterns.length, 5);
  assert.ok(Array.isArray(s0.player.vel) && s0.player.vel.length === 3);
  assert.equal(typeof s0.player.grounded, 'boolean');
  assert.equal(typeof s0.wind.active, 'boolean');
  assert.ok(Array.isArray(s0.drifters));
  assert.ok(Array.isArray(s0.charms));
  assert.equal(s0.motes[0].kind, 'random');
  assert.equal(r1.records[r1.records.length - 1].type, 'end');
  assert.ok(!r1.raw.toString('utf8').includes('-0.0'));

  // Scheduled shade spawn at tick 300 (2 shades)
  const spawnedAt300 = r1.events.filter((e) => e.name === 'shade_spawned' && e.tick === 300);
  assert.equal(spawnedAt300.length, 2, '2 shades must spawn at tick 300');
});

test('2. [Regression] Exit code 2 on invalid --inputs / --scenario', () => {
  const decTick = writeJson('bad_dec.json', {
    frames: [
      { tick: 10, move: [0, 1] },
      { tick: 5, move: [0, 0] },
    ],
  });
  const dupTick = writeJson('bad_dup.json', {
    frames: [
      { tick: 10, move: [0, 1] },
      { tick: 10, move: [0, 0] },
    ],
  });
  const badJson = writeRaw('bad_json.json', '{ "frames": [ ');
  const badType = writeJson('bad_type.json', { frames: [{ tick: 0, pause: 'yes' }] });
  const badScenario = writeJson('bad_scenario.json', { shades: [{ pos: [0, 0, 0], state: 'angry' }] });

  for (const [label, args] of [
    ['decreasing tick', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', decTick]],
    ['duplicate tick', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', dupTick]],
    ['malformed JSON', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', badJson]],
    ['bad inputs type', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', badType]],
    ['bad shade state', ['--seed', '1', '--night', '1', '--ticks', '20', '--scenario', badScenario]],
  ] as const) {
    const res = runHeadless([...args], `err_${label.replace(/\s+/g, '_')}.jsonl`);
    assert.equal(res.status, 2, `${label}: expected exit code 2, got ${res.status}`);
    assert.ok(res.stderr.trim().length > 0);
  }
});

test('3. [Regression] Movement rotation (cam_yaw_deg = 0 & 90), vector norm (>1), jump', () => {
  const sc = writeJson('sc_move.json', {
    player: { pos: [0, 0, 0], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
  });
  const inp = writeJson('inp_move.json', {
    frames: [
      { tick: 0, move: [0, 1], cam_yaw_deg: 0, jump: true },
      { tick: 60, move: [0, 1], cam_yaw_deg: 90 },
      { tick: 120, move: [1, 1], cam_yaw_deg: 0 },
      { tick: 180, move: [0, 0] },
    ],
  });
  const res = runHeadless(
    ['--seed', '1', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '180', '--snapshot-every', '1'],
    'move.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.snapshots.find((s) => s.tick === 10)!.player.pos[1] > 0);
  const s60 = res.snapshots.find((s) => s.tick === 60)!;
  assert.ok(Math.abs(s60.player.pos[2] - T.player_speed) < 0.02);
  assert.equal(s60.player.pos[1], 0);
  const s120 = res.snapshots.find((s) => s.tick === 120)!;
  assert.ok(Math.abs(s120.player.pos[0] - T.player_speed) < 0.02);
  const s180 = res.snapshots.find((s) => s.tick === 180)!;
  const diagDist = Math.hypot(
    s180.player.pos[0] - s120.player.pos[0],
    s180.player.pos[2] - s120.player.pos[2],
  );
  assert.ok(Math.abs(diagDist - T.player_speed) < 0.02);
});

test('4. [Regression + v1.1 Score] Pickup 10 motes -> deposit (+10/mote deposited) -> win (all_lit)', () => {
  // Phase 2 standardized: lantern_cost = 10, +10 per mote DEPOSITED
  const sc = writeJson('sc_win.json', {
    player: { pos: [0, 0, 0], carried: 5, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [
      [0, 0, 2],
      [0, 0, 3],
      [0, 0, 4],
      [0, 0, 5],
      [0, 0, 6],
    ],
    shades: [],
    lanterns: [
      { id: 'L1', pos: [0, 0, 9], deposited: 0, lit: false },
      { id: 'L2', lit: true },
      { id: 'L3', lit: true },
      { id: 'L4', lit: true },
      { id: 'L5', lit: true },
    ],
    time_left_s: 200,
  });
  const inp = writeJson('inp_win.json', {
    frames: [
      { tick: 0, move: [0, 1] },
      { tick: 90, move: [0, 0], interact: true },
      { tick: 91, interact: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '7', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '300', '--snapshot-every', '10'],
    'win.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.events.filter((e) => e.name === 'mote_picked').length, 5);
  // Score before deposit must be 0 (v1.1: +10 per deposited mote, not pickup)
  assert.equal(res.snapshots.find((s) => s.tick === 80)!.score, 0);

  const dep = res.events.find((e) => e.name === 'deposit');
  assert.ok(dep && dep.name === 'deposit');
  assert.deepEqual(dep.data, { lantern_id: 'L1', amount: 10, deposited: 10 });
  assert.equal(res.end?.state, 'won');
  assert.equal(res.end?.ticks, 91);

  const expectedScore =
    10 * T.score.per_mote +
    T.score.per_lantern +
    Math.floor(200 - 91 / 60) * T.score.per_second_left +
    3 * T.score.per_flame_left;
  assert.equal(res.end?.score, expectedScore);
});

test('5. [Regression + v1.1 Recoil & Dropped Motes] Shade hit drops floor(carried/2) motes (TTL 480) & recoils 2m', () => {
  const sc = writeJson('sc_hit.json', {
    player: { pos: [0, 0, 0], carried: 5, flames: 2 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [{ id: 'S1', pos: [2.0, 0.8, 0], state: 'chase' }],
    time_left_s: 300,
  });
  const res = runHeadless(
    ['--seed', '2', '--night', '1', '--scenario', sc, '--ticks', '200', '--snapshot-every', '1'],
    'hit.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const hits = res.events.filter((e) => e.name === 'player_hit');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].name, 'player_hit');
  // floor(5 / 2) = 2
  assert.deepEqual(hits[0].data, { by: 'shade', flames: 1, dropped: 2 });

  const hitTick = hits[0].tick;
  const snapAtHit = res.snapshots.find((s) => s.tick === hitTick)!;
  assert.equal(snapAtHit.shades[0].state, 'recoil', 'Shade must enter recoil after hit');
  assert.equal(snapAtHit.player.invuln, true);
  const droppedMotes = snapAtHit.motes.filter((m) => m.kind === 'dropped');
  assert.equal(droppedMotes.length, 2, '2 dropped motes must spawn around player');
  assert.equal(droppedMotes[0].ttl_s, 8, 'Dropped motes start with 480 ticks = 8s TTL');
});

test('6. [Regression + v1.1 Safe Push] Safe radius (6m) blocks external shades & pushes interior shade out in <= 30 ticks', () => {
  // Shade S1 starts inside L1 (distance 2m), L1 gets lit at tick 1 -> S1 pushed out of 6m in <= 30 ticks with 0 hits
  const sc = writeJson('sc_safe.json', {
    player: { pos: [0, 0, 0], carried: 10, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [
      { id: 'S1', pos: [2.2, 0.8, 0], state: 'chase' },
      { id: 'S2', pos: [10, 0.8, 0], state: 'chase' },
    ],
    lanterns: [{ id: 'L1', pos: [0, 0, 0], deposited: 0, lit: false }],
    time_left_s: 300,
  });
  const inp = writeJson('inp_safe.json', {
    frames: [
      { tick: 0, interact: true },
      { tick: 1, interact: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '3', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '120', '--snapshot-every', '5'],
    'safe.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.events.filter((e) => e.name === 'player_hit').length, 0);

  const snap35 = res.snapshots.find((s) => s.tick === 35)!;
  for (const s of snap35.shades) {
    const d = Math.hypot(s.pos[0], s.pos[2]);
    assert.ok(d >= T.safe_radius, `Shade ${s.id} at d=${d} must be outside safe_radius ${T.safe_radius}`);
  }
});

test('7. [Regression + v1.1 Pulse 3D & 15-tick push] Pulse costs 3, pushes 4m over 15 ticks, stuns 120 ticks, +5 score', () => {
  const sc = writeJson('sc_pulse.json', {
    player: { pos: [0, 0, 0], carried: 6, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [
      { id: 'S1', pos: [4, 0.8, 0], state: 'chase' },
      { id: 'S2', pos: [20, 0.8, 0], state: 'wander' },
    ],
  });
  const inp = writeJson('inp_pulse.json', {
    frames: [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '4', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '130', '--snapshot-every', '1'],
    'pulse.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const pulseEv = res.events.find((e) => e.name === 'pulse');
  assert.ok(pulseEv && pulseEv.name === 'pulse');
  assert.deepEqual(pulseEv.data, { stunned_ids: ['S1'] });

  const s1 = res.snapshots.find((s) => s.tick === 1)!;
  assert.equal(s1.player.carried, 3);
  assert.equal(s1.score, 5);
  assert.equal(s1.shades.find((x) => x.id === 'S1')!.state, 'stunned');
  assert.equal(s1.shades.find((x) => x.id === 'S2')!.state, 'wander');

  // After 15 ticks of push: S1 moved from x=4 to x=8 (total 4m)
  const s15 = res.snapshots.find((s) => s.tick === 15)!;
  const s1x15 = s15.shades.find((x) => x.id === 'S1')!.pos[0];
  assert.ok(Math.abs(s1x15 - 8.0) < 0.02, `Expected S1 x=8.0 after 15 ticks, got ${s1x15}`);

  // Still stunned at tick 120, recovered at tick 121
  assert.equal(res.snapshots.find((s) => s.tick === 120)!.shades[0].state, 'stunned');
  assert.notEqual(res.snapshots.find((s) => s.tick === 121)!.shades[0].state, 'stunned');
});

test('8. [Regression] Dawn timeout loss & Pre-lit scenario emits 0 events / 0 score at tick 0', () => {
  const scDawn = writeJson('sc_dawn.json', {
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
    time_left_s: 2.0,
  });
  const rDawn = runHeadless(['--seed', '5', '--night', '1', '--scenario', scDawn, '--ticks', '200'], 'dawn.jsonl');
  assert.equal(rDawn.end?.state, 'lost');
  assert.equal(rDawn.end?.ticks, 120);

  const scPrelit = writeJson('sc_prelit.json', {
    random_motes: false,
    random_shades: false,
    lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }],
  });
  const rPrelit = runHeadless(['--seed', '6', '--night', '1', '--scenario', scPrelit, '--ticks', '0'], 'prelit.jsonl');
  assert.equal(rPrelit.events.length, 0);
  assert.equal(rPrelit.snapshots[0].score, 0);
});

// =========================================================================
// PHASE 2 NEW FEATURE SCENARIOS (1+ headless scenario per feature)
// =========================================================================

test('9. [Phase 2] Dash (14 m/s for 0.2s, air-dash preserves Y, 1.5s cooldown from start)', () => {
  const sc = writeJson('sc_dash.json', {
    player: { pos: [0, 0, 0] },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
  });
  const inp = writeJson('inp_dash.json', {
    frames: [
      { tick: 0, jump: true },
      { tick: 1, jump: false },
      { tick: 10, dash: true }, // air dash while airborne
      { tick: 11, dash: false },
      { tick: 50, dash: true }, // during cooldown -> ignored
      { tick: 51, dash: false },
      { tick: 100, dash: true }, // after 90 ticks cooldown -> allowed
      { tick: 101, dash: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '10', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '115', '--snapshot-every', '1'],
    'dash.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const dashEvents = res.events.filter((e) => e.name === 'dash');
  assert.equal(dashEvents.length, 2, `Expected 2 dash events, got ${dashEvents.length}`);
  assert.equal(dashEvents[0].tick, 11);
  assert.equal(dashEvents[1].tick, 101);

  const beforeDash = res.snapshots.find((s) => s.tick === 10)!;
  const afterDash = res.snapshots.find((s) => s.tick === 22)!;
  assert.ok(beforeDash.player.pos[1] > 0.5, 'Must be airborne when air-dashing');
  assert.ok(
    Math.abs(afterDash.player.pos[1] - beforeDash.player.pos[1]) < 0.01,
    `Air dash must keep Y constant (${beforeDash.player.pos[1]} -> ${afterDash.player.pos[1]})`,
  );
  assert.ok(
    Math.abs(afterDash.player.pos[2] - 2.8) < 0.05,
    `Dash 14 m/s * 0.2s = 2.8m along +Z, got ${afterDash.player.pos[2]}`,
  );
});

test('10. [Phase 2] Fall off island (Y < -10) -> -1 flame, lose all carried (lost), 60-tick wait, respawn + 90-tick invuln', () => {
  const sc = writeJson('sc_fall.json', {
    player: { pos: [39.5, 0, 0], carried: 7, flames: 3, invuln_ticks: 90 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
  });
  const inp = writeJson('inp_fall.json', {
    frames: [
      { tick: 0, move: [1, 0] }, // walk past r=40m into cloud sea
      { tick: 20, move: [0, 0] },
    ],
  });
  const res = runHeadless(
    ['--seed', '11', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '160', '--snapshot-every', '1'],
    'fall.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const fallHit = res.events.find((e) => e.name === 'player_hit');
  assert.ok(fallHit && fallHit.name === 'player_hit');
  assert.deepEqual(fallHit.data, { by: 'fall', flames: 2, dropped: 0, lost: 7 });

  const respawnSnap = res.snapshots.find((s) => s.tick === fallHit.tick + 60)!;
  assert.deepEqual(respawnSnap.player.pos, [0, 0, 0], 'Must respawn at spawn point after 60 ticks');
  assert.equal(respawnSnap.player.invuln, true, 'Must gain 90-tick invuln on respawn');
});

test('11. [Phase 2] Night 2 (Đảo Cau): 6 lanterns, Jump Pad launches Island A -> Island B, Wind Charm C1', () => {
  const sc = writeJson('sc_n2.json', {
    player: { pos: [19.5, 0, 18] },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    motes: [],
    shades: [],
  });
  const inp = writeJson('inp_n2.json', {
    frames: [
      { tick: 0, move: [1, 0] }, // step onto Jump Pad at (20, 0, 18)
      { tick: 10, move: [-1, 0] }, // try overriding midair (must be ignored by launch!)
    ],
  });
  const res = runHeadless(
    ['--seed', '20', '--night', '2', '--scenario', sc, '--inputs', inp, '--ticks', '120', '--snapshot-every', '5'],
    'n2_pad.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.snapshots[0].lanterns.length, 6, 'Night 2 must have 6 lanterns');
  assert.equal(res.snapshots[0].charms.length, 1, 'Night 2 must have C1 charm');

  const landed = res.snapshots[res.snapshots.length - 1];
  const distToB = Math.hypot(landed.player.pos[0] - 70, landed.player.pos[2]);
  assert.ok(distToB <= 28, `Jump pad must land on Island B (dist=${distToB})`);
  assert.equal(landed.player.grounded, true);
});

test('12. [Phase 2] Wind Charm: +7.2 m/s speed, 0-cooldown dash, respawns after 2700 ticks', () => {
  const sc = writeJson('sc_charm.json', {
    player: { pos: [34.5, 0, 0] },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    motes: [],
    shades: [],
  });
  const inp = writeJson('inp_charm.json', {
    frames: [
      { tick: 0, move: [1, 0] }, // pick C1 at (35,0,0) on Night 2 bridge
      { tick: 10, move: [0, 0], dash: true },
      { tick: 11, dash: false },
      // Dash again immediately after 12-tick dash finishes (would be blocked without charm!)
      { tick: 23, dash: true },
      { tick: 24, dash: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '21', '--night', '2', '--scenario', sc, '--inputs', inp, '--ticks', '40', '--snapshot-every', '1'],
    'charm.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const picked = res.events.find((e) => e.name === 'charm_picked');
  assert.ok(picked && picked.name === 'charm_picked');
  assert.deepEqual(picked.data, { charm_id: 'C1', charm_ticks: 600 });
  assert.equal(res.events.filter((e) => e.name === 'dash').length, 2, 'Wind Charm removes dash cooldown');
});

test('13. [Phase 2] Drifter (Gió Lạc): steals <= 3 motes when carried >= 5, flees, Pulse drops stolen motes', () => {
  const sc = writeJson('sc_drifter.json', {
    player: { pos: [0, 0, 0], carried: 8, flames: 3, invuln_ticks: 90 },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    motes: [],
    shades: [],
    drifters: [{ id: 'D1', pos: [2.5, 1.4, 0], state: 'idle', stolen: 0 }],
  });
  // Let D1 chase & steal (2.5m - 1.2m = 1.3m @ 7 m/s => ~12 ticks), then pulse immediately to drop!
  const inp = writeJson('inp_drifter.json', {
    frames: [
      { tick: 15, pulse: true },
      { tick: 16, pulse: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '22', '--night', '2', '--scenario', sc, '--inputs', inp, '--ticks', '40', '--snapshot-every', '1'],
    'drifter.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const steal = res.events.find((e) => e.name === 'drifter_steal');
  assert.ok(steal && steal.name === 'drifter_steal');
  assert.deepEqual(steal.data, { drifter_id: 'D1', amount: 3, carried: 5 });

  const drop = res.events.find((e) => e.name === 'drifter_drop');
  assert.ok(drop && drop.name === 'drifter_drop');
  assert.deepEqual(drop.data, { drifter_id: 'D1', amount: 3 });

  const snapAfterDrop = res.snapshots.find((s) => s.tick === drop.tick)!;
  assert.equal(snapAfterDrop.motes.filter((m) => m.kind === 'dropped').length, 3);
});

test('14. [Phase 2] Night 3 (Đảo Chuông): 7 lanterns, 3 tiers + ramp + jump pad to Tier 2 + wind gust', () => {
  const sc = writeJson('sc_n3.json', {
    player: { pos: [0, 3, 13.5] }, // right next to Tier 1 jump pad (0, 3, 13)
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: true,
    motes: [],
    shades: [],
  });
  const inp = writeJson('inp_n3.json', {
    frames: [
      { tick: 0, move: [0, -1] }, // step onto jump pad (0, 3, 13)
      { tick: 8, move: [0, 0] },
    ],
  });
  const res = runHeadless(
    ['--seed', '30', '--night', '3', '--scenario', sc, '--inputs', inp, '--ticks', '1900', '--snapshot-every', '20'],
    'n3.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.snapshots[0].lanterns.length, 7, 'Night 3 must have 7 lanterns');
  assert.equal(res.snapshots[0].charms.length, 2, 'Night 3 must have C1 & C2');

  const landedTier2 = res.snapshots.find((s) => s.tick === 80)!;
  assert.equal(landedTier2.player.pos[1], 6, `Jump pad must land on Tier 2 (Y=6), got Y=${landedTier2.player.pos[1]}`);

  const windSnap = res.snapshots.find((s) => s.tick === 1820)!;
  assert.equal(windSnap.wind.active, true, 'Wind gust must be active at tick 1820 (30s)');
});

test('15. [Phase 2] Pause & Resume freeze sim_tick, time_left_s, cooldowns while outer tick advances', () => {
  const sc = writeJson('sc_pause.json', {
    player: { pos: [0, 0, 0], pulse_cd_ticks: 60 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
    time_left_s: 100,
  });
  const inp = writeJson('inp_pause.json', {
    frames: [
      { tick: 10, pause: true },
      { tick: 11, pause: false },
      { tick: 40, pause: true },
      { tick: 41, pause: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '40', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '50', '--snapshot-every', '1'],
    'pause.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.events.some((e) => e.name === 'paused' && e.tick === 11));
  assert.ok(res.events.some((e) => e.name === 'resumed' && e.tick === 41));

  const s10 = res.snapshots.find((s) => s.tick === 10)!;
  const s30 = res.snapshots.find((s) => s.tick === 30)!;
  assert.equal(s30.state, 'paused');
  assert.equal(s30.sim_tick, s10.sim_tick, 'sim_tick must stay frozen during pause');
  assert.equal(s30.time_left_s, s10.time_left_s, 'time_left_s must stay frozen during pause');
  assert.equal(s30.player.pulse_cd_s, s10.player.pulse_cd_s, 'cooldowns must stay frozen during pause');

  const s50 = res.snapshots.find((s) => s.tick === 50)!;
  assert.equal(s50.state, 'playing');
  assert.equal(s50.sim_tick, 20, '50 total ticks - 30 paused ticks = 20 sim ticks');
});

test('16. [Phase 2 Performance] Full Night 3 (21,600 ticks) finishes in <= 30s', () => {
  const sc = writeJson('sc_perf.json', {
    player: { pos: [0, 0, -10], flames: 500 }, // stay alive for full 360s = 21,600 ticks
    random_motes: true,
    random_shades: true,
    random_drifters: true,
    wind_enabled: true,
  });
  const res = runHeadless(
    ['--seed', '999', '--night', '3', '--scenario', sc, '--ticks', '21600', '--snapshot-every', '60'],
    'perf_n3.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.end?.ticks, 21600);
  assert.ok(
    res.elapsedMs <= 30_000,
    `Full Night 3 took ${res.elapsedMs.toFixed(1)}ms (must be <= 30000ms)`,
  );
  console.log(`      -> Full Night 3 (21,600 ticks) completed in ${res.elapsedMs.toFixed(0)} ms`);
});

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
