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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-contract-test-'));

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
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
  const proc = spawnSync(process.execPath, fullArgs, {
    cwd: ROOT,
    encoding: 'utf8',
  });

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

// 1. Determinism (byte-for-byte) & JSONL schema
test('1. Determinism (byte-for-byte identical output) & Snapshot/End schema', () => {
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

  assert.ok(r1.snapshots.length >= 2, 'Expected multiple snapshots');
  assert.equal(r1.snapshots[0].tick, 0, 'First snapshot must be tick 0');
  assert.equal(r1.snapshots[0].sim_tick, 0, 'sim_tick must equal tick');
  assert.equal(r1.snapshots[0].lanterns.length, T.lantern_count_night1);
  assert.equal(r1.snapshots[0].motes_active, r1.snapshots[0].motes.length);
  assert.equal(r1.records[r1.records.length - 1].type, 'end', 'Last record must be end');
  assert.ok(r1.end, 'Missing end record');
  assert.ok(!r1.raw.toString('utf8').includes('-0.0'), 'Must not contain -0');
});

// 2. Exit code 2 on invalid inputs / scenario
test('2. Exit code 2 on invalid --inputs / --scenario (bad JSON, non-increasing tick, wrong types)', () => {
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
  const badType = writeJson('bad_type.json', {
    frames: [{ tick: 0, move: 'forward' }],
  });
  const badScenario = writeJson('bad_scenario.json', {
    random_motes: 'no',
  });

  for (const [label, args] of [
    ['decreasing tick', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', decTick]],
    ['duplicate tick', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', dupTick]],
    ['malformed inputs JSON', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', badJson]],
    ['wrong inputs field type', ['--seed', '1', '--night', '1', '--ticks', '20', '--inputs', badType]],
    ['wrong scenario field type', ['--seed', '1', '--night', '1', '--ticks', '20', '--scenario', badScenario]],
  ] as const) {
    const res = runHeadless([...args], `err_${label.replace(/\s+/g, '_')}.jsonl`);
    assert.equal(res.status, 2, `${label}: expected exit code 2, got ${res.status}`);
    assert.ok(res.stderr.trim().length > 0, `${label}: expected error message on stderr`);
  }

  // Missing required CLI flag -> non-zero exit code
  const missingFlag = spawnSync(process.execPath, [HEADLESS_JS, '--seed', '1'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(missingFlag.status, 0, 'Missing flags must exit non-zero');
});

// 3. Movement: cam_yaw_deg = 0, cam_yaw_deg = 90, diagonal normalization > 1, rising-edge jump
test('3. Movement rotation (cam_yaw_deg = 0 & 90), vector normalization (>1), rising-edge jump', () => {
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

  const s10 = res.snapshots.find((s) => s.tick === 10)!;
  assert.ok(s10.player.pos[1] > 0, `Expected player airborne at tick 10, y=${s10.player.pos[1]}`);

  const s60 = res.snapshots.find((s) => s.tick === 60)!;
  assert.ok(Math.abs(s60.player.pos[0] - 0) < 0.01, `tick 60 x=${s60.player.pos[0]}`);
  assert.ok(Math.abs(s60.player.pos[2] - T.player_speed) < 0.01, `tick 60 z=${s60.player.pos[2]}`);
  assert.equal(s60.player.pos[1], 0, 'Holding jump=true must not re-jump after landing');

  const s120 = res.snapshots.find((s) => s.tick === 120)!;
  assert.ok(
    Math.abs(s120.player.pos[0] - T.player_speed) < 0.01,
    `tick 120 (yaw=90) expected x=${T.player_speed}, got ${s120.player.pos[0]}`,
  );
  assert.ok(
    Math.abs(s120.player.pos[2] - T.player_speed) < 0.01,
    `tick 120 (yaw=90) expected z=${T.player_speed}, got ${s120.player.pos[2]}`,
  );

  const s180 = res.snapshots.find((s) => s.tick === 180)!;
  const diagDist = Math.hypot(
    s180.player.pos[0] - s120.player.pos[0],
    s180.player.pos[2] - s120.player.pos[2],
  );
  assert.ok(
    Math.abs(diagDist - T.player_speed) < 0.02,
    `Normalized [1,1] for 1s should move ${T.player_speed}m, moved ${diagDist.toFixed(4)}m`,
  );
});

// 4. Mote pickup -> deposit -> lantern_lit -> win (all_lit) + bonus score
test('4. Pickup motes -> deposit -> lantern_lit -> win (all_lit) & exact bonus score', () => {
  const sc = writeJson('sc_win.json', {
    player: { pos: [0, 0, 0], carried: 0, flames: 3 },
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
  // Walk +Z at 6 m/s for 90 ticks (9m -> arrives at [0,0,9]), then interact at tick 90
  const inp = writeJson('inp_win.json', {
    frames: [
      { tick: 0, move: [0, 1] },
      { tick: 90, move: [0, 0], interact: true },
      { tick: 91, interact: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '7', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '500', '--snapshot-every', '10'],
    'win.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);

  const pickedEvents = res.events.filter((e) => e.name === 'mote_picked');
  assert.equal(pickedEvents.length, 5, `Expected 5 mote_picked events, got ${pickedEvents.length}`);

  const depositEv = res.events.find((e) => e.name === 'deposit');
  assert.ok(depositEv && depositEv.name === 'deposit');
  assert.deepEqual(depositEv.data, { lantern_id: 'L1', amount: 5, deposited: 5 });

  const litEv = res.events.find((e) => e.name === 'lantern_lit');
  assert.ok(litEv && litEv.name === 'lantern_lit');
  assert.deepEqual(litEv.data, { lantern_id: 'L1' });

  const overEv = res.events.find((e) => e.name === 'game_over');
  assert.ok(overEv && overEv.name === 'game_over');
  assert.deepEqual(overEv.data, { result: 'won', reason: 'all_lit' });

  assert.ok(res.end);
  assert.equal(res.end.state, 'won');
  assert.equal(res.end.ticks, 91, 'Should stop immediately upon winning at tick 91');

  const timeLeftAtWin = 200 - 91 / 60;
  const expectedScore =
    5 * T.score.per_mote +
    1 * T.score.per_lantern +
    Math.floor(timeLeftAtWin) * T.score.per_second_left +
    3 * T.score.per_flame_left;
  assert.equal(res.end.score, expectedScore, `Expected score ${expectedScore}, got ${res.end.score}`);
});

// 5. Shade chase -> player_hit -> invuln_s -> loss (no_flames)
test('5. Shade chase -> player_hit (mote drop) -> invuln_s -> loss (no_flames)', () => {
  const sc = writeJson('sc_hit.json', {
    player: { pos: [0, 0, 0], carried: 4, flames: 2 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [{ id: 'S1', pos: [2.5, 0, 0] }],
    time_left_s: 300,
  });
  const res = runHeadless(
    ['--seed', '2', '--night', '1', '--scenario', sc, '--ticks', '300', '--snapshot-every', '10'],
    'hit.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);

  const hits = res.events.filter((e) => e.name === 'player_hit');
  assert.equal(hits.length, 2, `Expected 2 player_hit events, got ${hits.length}`);
  assert.equal(hits[0].name, 'player_hit');
  assert.deepEqual(hits[0].data, { by: 'shade', flames: 1, dropped: 2 });
  assert.equal(hits[1].name, 'player_hit');
  assert.deepEqual(hits[1].data, { by: 'shade', flames: 0, dropped: 1 });

  const tickDiff = hits[1].tick - hits[0].tick;
  const expectedInvulnTicks = Math.round(T.invuln_s * 60);
  assert.ok(
    tickDiff >= expectedInvulnTicks,
    `Second hit must respect invuln_s (${expectedInvulnTicks} ticks), gap was ${tickDiff}`,
  );

  const overEv = res.events.find((e) => e.name === 'game_over');
  assert.ok(overEv && overEv.name === 'game_over');
  assert.deepEqual(overEv.data, { result: 'lost', reason: 'no_flames' });
  assert.equal(res.end?.state, 'lost');
  assert.equal(res.end?.ticks, hits[1].tick, 'Should terminate immediately on 0 flames');
});

// 6. Shade blocked by safe_radius of a lit lantern
test('6. Shade cannot enter safe_radius of a lit lantern', () => {
  const sc = writeJson('sc_safe.json', {
    player: { pos: [0, 0, 0], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [{ id: 'S1', pos: [8, 0, 0] }],
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
    time_left_s: 300,
  });
  const res = runHeadless(
    ['--seed', '3', '--night', '1', '--scenario', sc, '--ticks', '300', '--snapshot-every', '5'],
    'safe.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);

  const hits = res.events.filter((e) => e.name === 'player_hit');
  assert.equal(hits.length, 0, 'Player inside lit lantern safe_radius must not be hit');

  for (const snap of res.snapshots) {
    const s1 = snap.shades.find((s) => s.id === 'S1')!;
    const d = Math.hypot(s1.pos[0], s1.pos[2]);
    assert.ok(
      d >= T.safe_radius,
      `Tick ${snap.tick}: shade distance ${d} violated safe_radius ${T.safe_radius}`,
    );
  }
});

// 7. Pulse consumes motes, pushes by pulse_push_m, stuns for pulse_stun_s, respects cooldown
test('7. Pulse cost, pulse_push_m, stunned for pulse_stun_s, cooldown & empty pulse', () => {
  const sc = writeJson('sc_pulse.json', {
    player: { pos: [0, 0, 0], carried: 4, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [
      { id: 'S1', pos: [4, 0, 0] },
      { id: 'S2', pos: [20, 0, 0] },
    ],
    time_left_s: 300,
  });
  const cooldownTicks = Math.round(T.pulse_cooldown_s * 60);
  const inp = writeJson('inp_pulse.json', {
    frames: [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
      // Attempt during cooldown (should be ignored)
      { tick: 60, pulse: true },
      { tick: 61, pulse: false },
      // Attempt right after cooldown expires (S1 and S2 are now beyond 6m or wait: check S2)
      { tick: cooldownTicks, pulse: true },
      { tick: cooldownTicks + 1, pulse: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '4', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '300', '--snapshot-every', '1'],
    'pulse.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);

  const pulseEvents = res.events.filter((e) => e.name === 'pulse');
  assert.equal(pulseEvents.length, 2, `Expected 2 pulse events (1 ignored on cooldown), got ${pulseEvents.length}`);
  assert.equal(pulseEvents[0].tick, 1);
  assert.deepEqual(pulseEvents[0].data, { stunned_ids: ['S1'] });

  const snap1 = res.snapshots.find((s) => s.tick === 1)!;
  assert.equal(snap1.player.carried, 4 - T.pulse_cost);
  assert.equal(snap1.score, T.score.per_stun);
  const s1After = snap1.shades.find((s) => s.id === 'S1')!;
  const s2After = snap1.shades.find((s) => s.id === 'S2')!;
  assert.equal(s1After.state, 'stunned');
  assert.ok(
    Math.abs(s1After.pos[0] - (4 + T.pulse_push_m)) < 0.01,
    `Expected S1 pushed to ${4 + T.pulse_push_m}, got ${s1After.pos[0]}`,
  );
  assert.equal(s2After.state, 'chase', 'S2 outside pulse_radius must not be stunned');

  const stunTicks = Math.round(T.pulse_stun_s * 60);
  const snapStillStunned = res.snapshots.find((s) => s.tick === stunTicks)!;
  assert.equal(
    snapStillStunned.shades.find((s) => s.id === 'S1')!.state,
    'stunned',
    `S1 should still be stunned at tick ${stunTicks}`,
  );
  const snapRecovered = res.snapshots.find((s) => s.tick === stunTicks + 1)!;
  assert.equal(
    snapRecovered.shades.find((s) => s.id === 'S1')!.state,
    'chase',
    `S1 should recover to chase at tick ${stunTicks + 1}`,
  );
});

// 8. Dawn timeout loss
test('8. Dawn timeout loss (time_left_s <= 0 -> reason: dawn)', () => {
  const sc = writeJson('sc_dawn.json', {
    player: { pos: [0, 0, 0], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
    time_left_s: 2.0,
  });
  const res = runHeadless(
    ['--seed', '5', '--night', '1', '--scenario', sc, '--ticks', '300', '--snapshot-every', '30'],
    'dawn.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.end?.state, 'lost');
  assert.equal(res.end?.ticks, 120, '2.0s at 60Hz must end at exactly tick 120');
  const overEv = res.events.find((e) => e.name === 'game_over');
  assert.ok(overEv && overEv.name === 'game_over');
  assert.deepEqual(overEv.data, { result: 'lost', reason: 'dawn' });
});

// 9. Pre-lit scenario emits NO events and adds NO score
test('9. Scenario pre-lit lanterns emit 0 events and add 0 score', () => {
  const sc = writeJson('sc_prelit.json', {
    player: { pos: [0, 0, 0], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [[0, 0, 10]],
    shades: [{ id: 'S1', pos: [20, 0, 0] }],
    lanterns: [
      { id: 'L1', lit: true },
      { id: 'L2', lit: true },
      { id: 'L3', lit: true },
      { id: 'L4', lit: true },
    ],
  });
  const res = runHeadless(
    ['--seed', '6', '--night', '1', '--scenario', sc, '--ticks', '0', '--snapshot-every', '10'],
    'prelit.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.events.length, 0, 'Scenario setup must emit 0 events');
  assert.equal(res.snapshots[0].score, 0, 'Scenario setup must add 0 score');
  assert.equal(res.snapshots[0].lanterns.filter((l) => l.lit).length, 4);
  assert.equal(res.end?.score, 0);
});

// 10. Carry capacity cap respected
test('10. Carry capacity cap stops automatic mote pickup at carry_capacity', () => {
  const sc = writeJson('sc_cap.json', {
    player: { pos: [0, 0, 0], carried: T.carry_capacity - 1, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [
      [0, 0, 0.5],
      [0, 0, 0.8],
    ],
    shades: [],
  });
  const res = runHeadless(
    ['--seed', '8', '--night', '1', '--scenario', sc, '--ticks', '5', '--snapshot-every', '5'],
    'cap.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const picks = res.events.filter((e) => e.name === 'mote_picked');
  assert.equal(picks.length, 1, 'Only 1 mote should be picked before hitting carry_capacity');
  const snap5 = res.snapshots.find((s) => s.tick === 5)!;
  assert.equal(snap5.player.carried, T.carry_capacity);
  assert.equal(snap5.motes_active, 1);
});

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
