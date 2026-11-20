import { DT, distXZ } from '../sim/engine.ts';
import { getNightMapDef } from '../sim/maps.ts';
import { createPRNG } from '../sim/prng.ts';
import type { GameTuning, Vec3 } from '../sim/types.ts';
import type { GameRenderer } from './renderer.ts';

interface BenchShade {
  x: number;
  y: number;
  z: number;
  angle: number;
  changeTicks: number;
}

interface BenchMote {
  x: number;
  z: number;
  phase: number;
}

const SHADE_COUNT = 200;
const MOTE_COUNT = 100;
const ISLAND_R = 39.2;
const WANDER_SPEED = 2.4;
const WARMUP_S = 3.0;
const ORBIT_RADIUS = 30.0;
const ORBIT_Y = 15.0;
const ORBIT_PERIOD_S = 15.0;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function runBenchmarkMode(
  renderer: GameRenderer,
  tuning: GameTuning,
  seed: number,
  durationS: number,
): void {
  // Hide all interactive UI / menus so the benchmark scene is 100% pure
  for (const id of [
    'start-overlay',
    'hud',
    'intro-overlay',
    'pause-overlay',
    'settings-overlay',
    'gameover-overlay',
    'leaderboard-overlay',
    'offscreen-arrow',
    'shade-arrow',
    'subtitle-bar',
  ]) {
    document.getElementById(id)?.classList.add('hidden');
  }

  // Standard Night 1 Đảo Bến + standard Mây + standard Phase 2/3 palette (no extra creative skins)
  renderer.setSceneConfig(1, 'may', 'dao_ben');
  renderer.setMenuPreviewVisible(false);

  const mapDef = getNightMapDef(1);
  const lanterns = mapDef.lanterns.map((l, idx) => ({
    id: l.id,
    pos: [...l.pos] as Vec3,
    lit: idx < 3, // L1..L3 lit with fuel=100; L4..L5 unlit
    fuel: idx < 3 ? 100 : 0,
    deposited: idx < 3 ? 10 : 0,
    ever_lit: idx < 3,
    relit_count: 0,
  }));
  const litLanterns = lanterns.filter((l) => l.lit);

  const rng = createPRNG(seed);

  // Spawn exactly 200 Shades in wander state evenly distributed across island (outside L1..L3 safe_radius)
  const shades: BenchShade[] = [];
  for (let i = 0; i < SHADE_COUNT; i++) {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      // Uniform disk distribution via sqrt(u)
      const r = Math.sqrt(rng.next()) * ISLAND_R;
      const a = rng.range(0, Math.PI * 2);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      const inSafe = litLanterns.some((l) => distXZ([x, 0, z], l.pos) < tuning.safe_radius + 0.5);
      if (!inSafe) break;
    }
    shades.push({
      x,
      y: 0.8,
      z,
      angle: rng.range(0, Math.PI * 2),
      changeTicks: Math.floor(rng.range(1, 120)),
    });
  }

  // Spawn exactly 100 Motes spread across island
  const motes: BenchMote[] = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    const r = 3.0 + Math.sqrt(rng.next()) * (ISLAND_R - 3.5);
    const a = rng.range(0, Math.PI * 2);
    motes.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      phase: a,
    });
  }

  renderer.setupBenchScene(lanterns, SHADE_COUNT, MOTE_COUNT);

  // Subtle corner status banner for visibility
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;top:12px;left:12px;z-index:50;padding:8px 14px;border-radius:10px;background:rgba(14,20,48,0.78);border:1px solid rgba(242,193,78,0.45);color:#f5f1e6;font:700 14px system-ui,sans-serif;pointer-events:none;';
  banner.textContent = `BENCHMARK · Seed ${seed} · 200 Shades · 100 Motes`;
  document.body.appendChild(banner);

  let firstFrameSent = false;
  let benchStartMs = 0;
  let measureStartMs = 0;
  let lastFrameMs = performance.now();
  let lastBannerMs = 0;
  let simAcc = 0;
  let elapsedSimS = 0;
  const wantCapture = new URLSearchParams(window.location.search).get('capture') === '1';
  const frameDts: number[] = [];
  let finished = false;

  const stepWanderShades = (): void => {
    const safeMin = tuning.safe_radius + 0.05;
    for (let i = 0; i < shades.length; i++) {
      const s = shades[i];
      s.changeTicks--;
      if (s.changeTicks <= 0) {
        s.angle = rng.range(0, Math.PI * 2);
        s.changeTicks = 120;
      }
      const nx = s.x + Math.cos(s.angle) * WANDER_SPEED * DT;
      const nz = s.z + Math.sin(s.angle) * WANDER_SPEED * DT;
      if (Math.hypot(nx, nz) <= ISLAND_R) {
        s.x = nx;
        s.z = nz;
      } else {
        s.angle = (s.angle + Math.PI) % (Math.PI * 2);
      }
      // Respect safe_radius of L1..L3
      for (let j = 0; j < litLanterns.length; j++) {
        const l = litLanterns[j];
        const lx = s.x - l.pos[0];
        const lz = s.z - l.pos[2];
        const ld = Math.hypot(lx, lz);
        if (ld < safeMin) {
          const ux = ld > 1e-6 ? lx / ld : 1;
          const uz = ld > 1e-6 ? lz / ld : 0;
          s.x = l.pos[0] + ux * safeMin;
          s.z = l.pos[2] + uz * safeMin;
          s.angle = Math.atan2(uz, ux);
        }
      }
    }
  };

  const loop = (now: number): void => {
    if (finished) return;
    requestAnimationFrame(loop);

    const rawDtMs = Math.max(0.01, now - lastFrameMs);
    lastFrameMs = now;
    const frameDt = Math.min(0.1, rawDtMs / 1000);

    if (benchStartMs === 0) {
      benchStartMs = now;
    }

    // Advance fixed-60Hz shade wander
    simAcc += frameDt;
    let steps = 0;
    while (simAcc >= DT && steps < 4) {
      stepWanderShades();
      simAcc -= DT;
      elapsedSimS += DT;
      steps++;
    }

    // Orbit camera: center (0,0,0), radius 30m, Y=15m, start (30,15,0), CCW from above, 15s/rev
    const orbitAngle = ((now - benchStartMs) / 1000 / ORBIT_PERIOD_S) * Math.PI * 2;
    const camPos: Vec3 = [
      Math.cos(orbitAngle) * ORBIT_RADIUS,
      ORBIT_Y,
      -Math.sin(orbitAngle) * ORBIT_RADIUS,
    ];

    renderer.renderBenchFrame(shades, motes, camPos, elapsedSimS, frameDt);

    if (!firstFrameSent) {
      firstFrameSent = true;
      void fetch('/api/bench-first-frame', { method: 'POST' }).catch(() => {});
      return;
    }

    const totalElapsedS = (now - benchStartMs) / 1000;
    if (totalElapsedS < WARMUP_S) {
      if (now - lastBannerMs >= 500) {
        lastBannerMs = now;
        banner.textContent = `BENCHMARK WARMUP ${(WARMUP_S - totalElapsedS).toFixed(1)}s · 200 Shades · 100 Motes`;
      }
      return;
    }

    if (measureStartMs === 0) {
      measureStartMs = now;
      lastBannerMs = now;
      banner.textContent = `BENCHMARK 0.0s / ${durationS}s · Measuring...`;
      return;
    }

    frameDts.push(rawDtMs);
    const measuredS = (now - measureStartMs) / 1000;
    if (now - lastBannerMs >= 1000) {
      lastBannerMs = now;
      banner.textContent = `BENCHMARK ${measuredS.toFixed(0)}s / ${durationS}s · ${frameDts.length} frames`;
    }

    if (measuredS >= durationS) {
      finished = true;
      // Capture screenshot AFTER measurement finishes so toDataURL never stalls measured frames
      const screenshotDataUrl = wantCapture ? renderer.captureScreenshotDataUrl() : undefined;

      const n = frameDts.length;
      const sumDt = frameDts.reduce((a, b) => a + b, 0);
      const avgFps = round1((1000 * n) / Math.max(1, sumDt));

      const desc = [...frameDts].sort((a, b) => b - a);
      const k = Math.max(1, Math.ceil(0.01 * n));
      let sumWorst = 0;
      for (let i = 0; i < k; i++) sumWorst += desc[i];
      const p1LowFps = round1(1000 / Math.max(0.01, sumWorst / k));

      const asc = [...frameDts].sort((a, b) => a - b);
      const p95Idx = Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1));
      const frameMsP95 = round1(asc[p95Idx]);

      const payload = {
        frames: n,
        avg_fps: avgFps,
        p1_low_fps: p1LowFps,
        frame_ms_p95: frameMsP95,
        renderer: renderer.getRendererInfo(),
        screenshot_data_url: screenshotDataUrl,
      };

      banner.textContent = `DONE · avg=${avgFps} FPS · 1%low=${p1LowFps} FPS · p95=${frameMsP95} ms`;
      void fetch('/api/bench-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  };

  requestAnimationFrame(loop);
}
