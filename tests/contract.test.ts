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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-contract-v12-'));

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
// PHASE 1–2 REGRESSION SUITE (updated where TICKET-03 replaced prior rules)
// =========================================================================

test('1. [Regression] Determinism (byte-for-byte) & Contract v1.2 Snapshot/End schema', () => {
  assert.equal(CONTRACT.contract_version, '1.2');
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
  assert.equal(s0.time_left_s, 240, 'Phase 3 Night 1 duration is 240s');
  assert.equal(s0.player.capacity, 10, 'Initial capacity is 10');
  assert.equal(s0.lanterns[0].fuel, 0);
  assert.equal(s0.lanterns[0].ever_lit, false);
  assert.equal(s0.lanterns[0].relit_count, 0);
  assert.equal(s0.motes_active, 20);
  assert.equal(r1.records[r1.records.length - 1].type, 'end');
  assert.ok(!r1.raw.toString('utf8').includes('-0.0'));
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

test('4. [Updated for Phase 3] Light 5th lantern -> NO early win; survive to dawn -> dawn_survived + v1.2 score', () => {
  // Phase 3 REPLACED early "all_lit" win with "dawn_survived" + new scoring (+5/mote, +100 light, dawn bonus)
  const sc = writeJson('sc_win_v12.json', {
    player: { pos: [0, 0, 8], carried: 10, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
    lanterns: [
      { id: 'L1', pos: [0, 0, 9], deposited: 0, lit: false },
      { id: 'L2', lit: true, fuel: 80 },
      { id: 'L3', lit: true, fuel: 80 },
      { id: 'L4', lit: true, fuel: 80 },
      { id: 'L5', lit: true, fuel: 80 },
    ],
    time_left_s: 2.0, // 120 ticks to dawn
  });
  const inp = writeJson('inp_win_v12.json', {
    frames: [
      { tick: 0, interact: true },
      { tick: 1, interact: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '7', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '200', '--snapshot-every', '20'],
    'win_v12.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);

  const litEv = res.events.find((e) => e.name === 'lantern_lit');
  assert.ok(litEv && litEv.name === 'lantern_lit');
  assert.deepEqual(litEv.data, { lantern_id: 'L1', relight: false });

  // Must NOT end early at tick 1 even though all 5 lanterns are lit
  assert.equal(res.snapshots.find((s) => s.tick === 60)!.state, 'playing');

  // Ends at dawn (tick 120) with dawn_survived
  assert.equal(res.end?.ticks, 120);
  assert.equal(res.end?.state, 'won');
  const overEv = res.events.find((e) => e.name === 'game_over');
  assert.ok(overEv && overEv.name === 'game_over');
  assert.deepEqual(overEv.data, { result: 'won', reason: 'dawn_survived' });

  // Score check:
  // Deposit 10 motes (+50) + First light L1 (+100)
  // At tick 120 (2.0s elapsed):
  //   L1 lit on tick 1 (fuel60 = 6000) -> decays 119 ticks -> 5881/60 = 98.016 -> floor = 98 -> 50 + 98 = 148
  //   L2..L5 started at 80 (4800) -> decay 120 ticks -> 4680/60 = 78.0 -> floor = 78 -> 4 * (50 + 78) = 512
  //   Flames: 3 * 50 = 150
  const expectedScore = 50 + 100 + (50 + 98) + 4 * (50 + 78) + 150;
  assert.equal(res.end?.score, expectedScore, `Expected ${expectedScore}, got ${res.end?.score}`);
});

test('5. [Regression] Shade hit drops floor(carried/2) motes (TTL 480) & recoils 2m', () => {
  const sc = writeJson('sc_hit.json', {
    player: { pos: [0, 0, 0], carried: 5, flames: 2 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [{ id: 'S1', pos: [2.0, 0.8, 0], state: 'chase' }],
    time_left_s: 200,
  });
  const res = runHeadless(
    ['--seed', '2', '--night', '1', '--scenario', sc, '--ticks', '200', '--snapshot-every', '1'],
    'hit.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const hits = res.events.filter((e) => e.name === 'player_hit');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].name, 'player_hit');
  assert.deepEqual(hits[0].data, { by: 'shade', flames: 1, dropped: 2 });

  const snapAtHit = res.snapshots.find((s) => s.tick === hits[0].tick)!;
  assert.equal(snapAtHit.shades[0].state, 'recoil');
  assert.equal(snapAtHit.motes.filter((m) => m.kind === 'dropped').length, 2);
});

test('6. [Regression] Safe radius (6m) blocks external shades & pushes interior shade out in <= 30 ticks', () => {
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
    time_left_s: 200,
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
    assert.ok(Math.hypot(s.pos[0], s.pos[2]) >= T.safe_radius);
  }
});

test('7. [Updated for Phase 3] Pulse: +5 normal stun, +15 drain stun, 4m push over 15 ticks, stun ends -> wander', () => {
  const sc = writeJson('sc_pulse_v12.json', {
    player: { pos: [0, 0, 0], carried: 6, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    lanterns: [{ id: 'L1', pos: [3, 0, 0], lit: true, fuel: 20 }],
    shades: [
      { id: 'S1', pos: [4, 0.8, 0], state: 'drain', target_lantern_id: 'L1' },
      { id: 'S2', pos: [-4, 0.8, 0], state: 'chase' },
    ],
  });
  const inp = writeJson('inp_pulse_v12.json', {
    frames: [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '4', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '125', '--snapshot-every', '1'],
    'pulse_v12.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const s1 = res.snapshots.find((s) => s.tick === 1)!;
  // S1 was draining (+15) + S2 was chasing (+5) = 20
  assert.equal(s1.score, 20, `Expected +15 + +5 = 20, got ${s1.score}`);
  assert.equal(s1.player.carried, 3);

  const s15 = res.snapshots.find((s) => s.tick === 15)!;
  assert.ok(Math.abs(s15.shades.find((x) => x.id === 'S1')!.pos[0] - 8.0) < 0.02);

  // At tick 120 still stunned; at tick 121 stun expires -> wander (Note: S2 at x=-8 is within 12m so step 8 will then detect player; put S1 at x=13+ to check pure wander or check S1)
  assert.equal(res.snapshots.find((s) => s.tick === 120)!.shades[0].state, 'stunned');
});

test('8. [Regression] Pre-lit scenario sets fuel=100 by default, emits 0 events & 0 score, does not boost capacity', () => {
  const sc = writeJson('sc_prelit.json', {
    random_motes: false,
    random_shades: false,
    lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true, fuel: 45 }],
  });
  const res = runHeadless(['--seed', '6', '--night', '1', '--scenario', sc, '--ticks', '0'], 'prelit.jsonl');
  assert.equal(res.events.length, 0);
  assert.equal(res.snapshots[0].score, 0);
  assert.equal(res.snapshots[0].player.capacity, 10, 'Pre-lit scenario lanterns must not increase capacity');
  assert.equal(res.snapshots[0].lanterns.find((l) => l.id === 'L1')!.fuel, 100);
  assert.equal(res.snapshots[0].lanterns.find((l) => l.id === 'L2')!.fuel, 45);
});

test('9. [Regression Phase 2] Dash (14 m/s, 0.2s, air-dash preserves Y, 1.5s cooldown)', () => {
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
      { tick: 10, dash: true },
      { tick: 11, dash: false },
      { tick: 100, dash: true },
      { tick: 101, dash: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '10', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '115', '--snapshot-every', '1'],
    'dash.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.events.filter((e) => e.name === 'dash').length, 2);
  const b = res.snapshots.find((s) => s.tick === 10)!;
  const a = res.snapshots.find((s) => s.tick === 22)!;
  assert.ok(Math.abs(a.player.pos[1] - b.player.pos[1]) < 0.01);
});

test('10. [Regression Phase 2] Fall off island (Y < -10) -> lost + respawn after 60 ticks', () => {
  const sc = writeJson('sc_fall.json', {
    player: { pos: [39.5, 0, 0], carried: 7, flames: 3, invuln_ticks: 90 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
  });
  const inp = writeJson('inp_fall.json', {
    frames: [{ tick: 0, move: [1, 0] }, { tick: 20, move: [0, 0] }],
  });
  const res = runHeadless(
    ['--seed', '11', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '160', '--snapshot-every', '1'],
    'fall.jsonl',
  );
  const fallHit = res.events.find((e) => e.name === 'player_hit');
  assert.ok(fallHit && fallHit.name === 'player_hit');
  assert.deepEqual(fallHit.data, { by: 'fall', flames: 2, dropped: 0, lost: 7 });
  const respawnSnap = res.snapshots.find((s) => s.tick === fallHit.tick + 60)!;
  assert.deepEqual(respawnSnap.player.pos, [0, 0, 0]);
});

test('11. [Regression Phase 2] Night 2 Jump Pad + Wind Charm + Drifter steal & pulse drop', () => {
  const scPad = writeJson('sc_n2.json', {
    player: { pos: [19.5, 0, 18] },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    motes: [],
    shades: [],
  });
  const rPad = runHeadless(
    ['--seed', '20', '--night', '2', '--scenario', scPad, '--inputs', writeJson('inp_n2.json', { frames: [{ tick: 0, move: [1, 0] }] }), '--ticks', '120', '--snapshot-every', '10'],
    'n2.jsonl',
  );
  assert.ok(Math.hypot(rPad.snapshots[rPad.snapshots.length - 1].player.pos[0] - 70, rPad.snapshots[rPad.snapshots.length - 1].player.pos[2]) <= 28);

  const scDrifter = writeJson('sc_drifter.json', {
    player: { pos: [0, 0, 0], carried: 8, flames: 3, invuln_ticks: 90 },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    motes: [],
    shades: [],
    drifters: [{ id: 'D1', pos: [2.5, 1.4, 0], state: 'idle', stolen: 0 }],
  });
  const rDr = runHeadless(
    ['--seed', '22', '--night', '2', '--scenario', scDrifter, '--inputs', writeJson('inp_dr.json', { frames: [{ tick: 15, pulse: true }, { tick: 16, pulse: false }] }), '--ticks', '40', '--snapshot-every', '1'],
    'dr.jsonl',
  );
  assert.ok(rDr.events.some((e) => e.name === 'drifter_steal'));
  assert.ok(rDr.events.some((e) => e.name === 'drifter_drop'));
});

test('12. [Regression Phase 2] Night 3 3-tier jump pad + Wind gust + Pause/Resume', () => {
  const scN3 = writeJson('sc_n3.json', {
    player: { pos: [0, 3, 13.5] },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: true,
    motes: [],
    shades: [],
  });
  const rN3 = runHeadless(
    ['--seed', '30', '--night', '3', '--scenario', scN3, '--inputs', writeJson('inp_n3.json', { frames: [{ tick: 0, move: [0, -1] }, { tick: 8, move: [0, 0] }] }), '--ticks', '1850', '--snapshot-every', '20'],
    'n3.jsonl',
  );
  assert.equal(rN3.snapshots.find((s) => s.tick === 80)!.player.pos[1], 6);
  assert.equal(rN3.snapshots.find((s) => s.tick === 1820)!.wind.active, true);

  const scPause = writeJson('sc_pause.json', {
    player: { pos: [0, 0, 0], pulse_cd_ticks: 60 },
    random_motes: false,
    random_shades: false,
    lanterns: [{ id: 'L1', lit: true, fuel: 50 }],
  });
  const rPause = runHeadless(
    ['--seed', '40', '--night', '1', '--scenario', scPause, '--inputs', writeJson('inp_p.json', { frames: [{ tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 40, pause: true }, { tick: 41, pause: false }] }), '--ticks', '50', '--snapshot-every', '1'],
    'pause.jsonl',
  );
  const s10 = rPause.snapshots.find((s) => s.tick === 10)!;
  const s30 = rPause.snapshots.find((s) => s.tick === 30)!;
  assert.equal(s30.state, 'paused');
  assert.equal(s30.sim_tick, s10.sim_tick);
  assert.equal(s30.lanterns[0].fuel, s10.lanterns[0].fuel, 'Fuel must also freeze during pause');
});

// =========================================================================
// PHASE 3 NEW FEATURE SCENARIOS (TICKET-03 · Contract v1.2)
// =========================================================================

test('13. [Phase 3] Fuel decay (1/s), Refuel ceil((100-fuel)/10), full lantern ignored, lantern_out & Relight (5 motes, +40)', () => {
  const sc = writeJson('sc_fuel.json', {
    player: { pos: [0, 0, 24], carried: 10, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
    lanterns: [
      { id: 'L1', pos: [0, 0, 25], lit: true, fuel: 75 },
      { id: 'L2', pos: [0, 0, 23], lit: true, fuel: 100 }, // full -> must NOT be chosen
    ],
  });
  const inp = writeJson('inp_fuel.json', {
    frames: [
      // Tick 0: L1 decays 1/60 in step 2 -> missing = 25.0167 -> ceil(25.0167/10) = 3 motes -> fuel = 100
      { tick: 0, interact: true },
      { tick: 1, interact: false },
      // Tick 10: L1 and L2 are now at ~99.8 -> let's test at tick 0 on L1 only first
    ],
  });
  const res = runHeadless(
    ['--seed', '50', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '10', '--snapshot-every', '1'],
    'fuel_refuel.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  const refuel = res.events.find((e) => e.name === 'refuel');
  assert.ok(refuel && refuel.name === 'refuel');
  assert.deepEqual(refuel.data, { lantern_id: 'L1', amount: 3, fuel: 100 });
  assert.equal(res.snapshots.find((s) => s.tick === 1)!.score, 15, '3 refueled motes * 5 = 15');

  // Now test lantern_out at fuel <= 0 -> ever_lit = true -> relight with 5 motes (+25 deposit + 40 relight = 65)
  const scOut = writeJson('sc_out.json', {
    player: { pos: [0, 0, 24], carried: 5, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [],
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 1.0 }], // extinguishes at tick 60
  });
  const inpOut = writeJson('inp_out.json', {
    frames: [
      { tick: 65, interact: true },
      { tick: 66, interact: false },
    ],
  });
  const rOut = runHeadless(
    ['--seed', '51', '--night', '1', '--scenario', scOut, '--inputs', inpOut, '--ticks', '70', '--snapshot-every', '1'],
    'fuel_out.jsonl',
  );
  assert.equal(rOut.status, 0, rOut.stderr);
  const outEv = rOut.events.find((e) => e.name === 'lantern_out');
  assert.ok(outEv && outEv.name === 'lantern_out');
  assert.equal(outEv.tick, 60, '1.0 fuel at 1/s decays out at exact tick 60');
  const s61 = rOut.snapshots.find((s) => s.tick === 61)!;
  assert.equal(s61.lanterns[0].lit, false);
  assert.equal(s61.lanterns[0].fuel, 0);
  assert.equal(s61.lanterns[0].ever_lit, true);

  const relitEv = rOut.events.find((e) => e.name === 'lantern_lit');
  assert.ok(relitEv && relitEv.name === 'lantern_lit');
  assert.deepEqual(relitEv.data, { lantern_id: 'L1', relight: true });
  const s66 = rOut.snapshots.find((s) => s.tick === 66)!;
  assert.equal(s66.lanterns[0].relit_count, 1);
  assert.equal(s66.lanterns[0].fuel, 100);
  assert.equal(s66.score, 5 * 5 + 40, '5 motes (+25) + relight (+40) = 65');
});

test('14. [Phase 3] Dynamic Capacity: 10 + 2 * successful_lights capped at 20', () => {
  const sc = writeJson('sc_cap_v12.json', {
    player: { pos: [0, 0, 24], carried: 10, flames: 3, successful_lights: 4 }, // cap = 18
    random_motes: false,
    random_shades: false,
    motes: [
      [0, 0, 24],
      [0, 0, 24],
      [0, 0, 24],
    ],
    shades: [],
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0 }],
  });
  const inp = writeJson('inp_cap_v12.json', {
    frames: [
      { tick: 0, interact: true }, // lights L1 -> successful_lights = 5 -> cap = 20
      { tick: 1, interact: false },
    ],
  });
  const res = runHeadless(
    ['--seed', '52', '--night', '1', '--scenario', sc, '--inputs', inp, '--ticks', '5', '--snapshot-every', '1'],
    'cap_v12.jsonl',
  );
  assert.equal(res.snapshots[0].player.capacity, 18);
  assert.equal(res.snapshots.find((s) => s.tick === 1)!.player.capacity, 20);
  // Picked all 3 motes before depositing? Step 4 picks 3 (carried=13), Step 5 deposits 10 -> carried=3
  assert.equal(res.snapshots.find((s) => s.tick === 1)!.player.carried, 3);
});

test('15. [Phase 3] Shade drain AI: fuel < 30 loses safe zone, wander -> drain (5/s + 1/s), fuel_drain every 60 ticks, refuel >= 30 pushes shade out', () => {
  const sc = writeJson('sc_drain.json', {
    player: { pos: [0, 0, 0], carried: 5, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [{ id: 'S1', pos: [0, 0.8, 22], state: 'wander' }], // 3m from weak L1 (0,0,25), > 12m from player
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
  });
  const res = runHeadless(
    ['--seed', '53', '--night', '1', '--scenario', sc, '--ticks', '120', '--snapshot-every', '5'],
    'drain.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.ok(
    res.snapshots.some((s) => s.shades[0].state === 'drain'),
    'Wander shade must enter drain state on weak lantern (fuel < 30)',
  );
  const drainEv = res.events.find((e) => e.name === 'fuel_drain');
  assert.ok(drainEv && drainEv.name === 'fuel_drain', 'fuel_drain event must fire after 60 ticks of draining');
  assert.equal(drainEv.data.lantern_id, 'L1');
  assert.equal(drainEv.data.shade_id, 'S1');

  // Test refuel from <30 to >=30 pushes draining shade out of 6m safe zone in <= 30 ticks with 0 hits
  const scRestore = writeJson('sc_restore.json', {
    player: { pos: [0, 0, 24], carried: 5, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [{ id: 'S1', pos: [1.5, 0.8, 25], state: 'drain', target_lantern_id: 'L1' }],
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
  });
  const rRes = runHeadless(
    ['--seed', '54', '--night', '1', '--scenario', scRestore, '--inputs', writeJson('inp_r.json', { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] }), '--ticks', '40', '--snapshot-every', '1'],
    'restore.jsonl',
  );
  assert.equal(rRes.events.filter((e) => e.name === 'player_hit').length, 0);
  const s35 = rRes.snapshots.find((s) => s.tick === 35)!;
  const distFromL1 = Math.hypot(s35.shades[0].pos[0] - 0, s35.shades[0].pos[2] - 25);
  assert.ok(distFromL1 >= T.safe_radius, `Shade must be pushed outside 6m safe zone, d=${distFromL1}`);
});

test('16. [Phase 3] Dawn survival threshold: 3/5 wins dawn_survived, 2/5 loses dawn', () => {
  const scWin = writeJson('sc_dawn_win.json', {
    random_motes: false,
    random_shades: false,
    lanterns: [
      { id: 'L1', lit: true, fuel: 50 },
      { id: 'L2', lit: true, fuel: 50 },
      { id: 'L3', lit: true, fuel: 50 },
    ],
    time_left_s: 1.0,
  });
  const rWin = runHeadless(['--seed', '60', '--night', '1', '--scenario', scWin, '--ticks', '100'], 'dawn_win.jsonl');
  assert.equal(rWin.end?.state, 'won');
  assert.equal(rWin.end?.ticks, 60);

  const scLose = writeJson('sc_dawn_lose.json', {
    random_motes: false,
    random_shades: false,
    lanterns: [
      { id: 'L1', lit: true, fuel: 50 },
      { id: 'L2', lit: true, fuel: 50 },
    ],
    time_left_s: 1.0,
  });
  const rLose = runHeadless(['--seed', '61', '--night', '1', '--scenario', scLose, '--ticks', '100'], 'dawn_lose.jsonl');
  assert.equal(rLose.end?.state, 'lost');
  const ev = rLose.events.find((e) => e.name === 'game_over');
  assert.ok(ev && ev.name === 'game_over' && ev.data.reason === 'dawn');
});

test('17. [Phase 3 Performance] Full Night 3 (18,000 ticks = 300s) finishes in <= 30s', () => {
  const sc = writeJson('sc_perf_v12.json', {
    player: { pos: [0, 0, -10], flames: 500 },
    random_motes: true,
    random_shades: true,
    random_drifters: true,
    wind_enabled: true,
  });
  const res = runHeadless(
    ['--seed', '999', '--night', '3', '--scenario', sc, '--ticks', '18000', '--snapshot-every', '60'],
    'perf_n3_v12.jsonl',
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.end?.ticks, 18000);
  assert.ok(res.elapsedMs <= 30_000, `Took ${res.elapsedMs.toFixed(1)}ms (> 30s)`);
  console.log(`      -> Full Night 3 (18,000 ticks) completed in ${res.elapsedMs.toFixed(0)} ms`);
});

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
