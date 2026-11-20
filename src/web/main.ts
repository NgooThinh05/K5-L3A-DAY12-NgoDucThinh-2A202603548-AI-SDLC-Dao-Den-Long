import contractJson from '../../game.contract.json';
import { DT, SimulationEngine, distXZ } from '../sim/engine.ts';
import { createDefaultInput, type EventRecord, type GameContract, type SimInput, type SnapshotRecord } from '../sim/types.ts';
import { SoundEffects } from './audio.ts';
import { GameRenderer } from './renderer.ts';

const contract = contractJson as unknown as GameContract;
const tuning = contract.tuning;

// DOM references
const canvasContainer = document.getElementById('canvas-container')!;
const hudEl = document.getElementById('hud')!;
const startOverlay = document.getElementById('start-overlay')!;
const gameoverOverlay = document.getElementById('gameover-overlay')!;

const btnStart = document.getElementById('btn-start')!;
const btnRestart = document.getElementById('btn-restart')!;

const hudFlames = document.getElementById('hud-flames')!;
const hudCarried = document.getElementById('hud-carried')!;
const hudCap = document.getElementById('hud-cap')!;
const hudLanterns = document.getElementById('hud-lanterns')!;
const hudLanternTotal = document.getElementById('hud-lantern-total')!;
const hudTime = document.getElementById('hud-time')!;
const hudScore = document.getElementById('hud-score')!;
const hudPulseStatus = document.getElementById('hud-pulse-status')!;
const hudPulseBar = document.getElementById('hud-pulse-bar')!;
const interactPrompt = document.getElementById('interact-prompt')!;
const promptLanternId = document.getElementById('prompt-lantern-id')!;
const promptProgress = document.getElementById('prompt-progress')!;
const audioLabel = document.getElementById('audio-label')!;

const goBadge = document.getElementById('go-badge')!;
const goTitle = document.getElementById('go-title')!;
const goReason = document.getElementById('go-reason')!;
const goScore = document.getElementById('go-score')!;
const goLanterns = document.getElementById('go-lanterns')!;
const goTime = document.getElementById('go-time')!;
const goFlames = document.getElementById('go-flames')!;

hudCap.textContent = String(tuning.carry_capacity);
hudLanternTotal.textContent = String(tuning.lantern_count_night1);

const renderer = new GameRenderer(canvasContainer, tuning);
const sfx = new SoundEffects();

let seedCounter = 2026;
let engine = new SimulationEngine(tuning, { seed: seedCounter, night: 1 });
let started = false;
let gameOverShown = false;

// Input state
const keys = new Set<string>();
let camYawDeg = 0;
let isDragging = false;
let lastMouseX = 0;

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'KeyM' && !e.repeat) {
    const muted = sfx.toggleMute();
    audioLabel.textContent = muted ? 'Âm thanh: Tắt' : 'Âm thanh: Bật';
    return;
  }
  keys.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  isDragging = false;
});

canvasContainer.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
});

window.addEventListener('pointermove', (e) => {
  if (!isDragging || !started) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  camYawDeg = (camYawDeg - dx * 0.35 + 360) % 360;
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function buildInput(): SimInput {
  const input = createDefaultInput();
  let mx = 0;
  let mz = 0;
  // Camera-relative right-handed mapping matching Test Contract rotation
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA')) mx += 1;
  if (keys.has('KeyD')) mx -= 1;

  input.move = [mx, mz];
  input.cam_yaw_deg = camYawDeg;
  input.jump = keys.has('Space');
  input.interact = keys.has('KeyE') || keys.has('KeyF');
  input.pulse = keys.has('KeyQ') || keys.has('ShiftLeft') || keys.has('ShiftRight');
  return input;
}

function handleEvents(events: EventRecord[], snap: SnapshotRecord): void {
  for (const ev of events) {
    switch (ev.name) {
      case 'mote_picked':
        sfx.playMotePickup(ev.data.carried);
        renderer.spawnBurst(snap.player.pos, 0xffd26a, 10);
        break;
      case 'deposit': {
        sfx.playDeposit();
        const l = snap.lanterns.find((x) => x.id === ev.data.lantern_id);
        if (l) renderer.spawnBurst(l.pos, 0xffb347, 14);
        break;
      }
      case 'lantern_lit': {
        sfx.playLanternLit();
        const l = snap.lanterns.find((x) => x.id === ev.data.lantern_id);
        if (l) renderer.spawnBurst(l.pos, 0xffe58f, 28);
        break;
      }
      case 'pulse':
        sfx.playPulse();
        renderer.spawnPulseRing(snap.player.pos);
        break;
      case 'player_hit':
        sfx.playHit();
        renderer.spawnBurst(snap.player.pos, 0xc75bff, 18);
        break;
      case 'game_over':
        sfx.playGameOver(ev.data.result === 'won');
        showGameOver(ev.data.result, ev.data.reason, snap);
        break;
      default:
        break;
    }
  }
}

function updateHud(snap: SnapshotRecord): void {
  // Flames icons
  let flamesHtml = '';
  for (let i = 0; i < tuning.flames; i++) {
    const alive = i < snap.player.flames;
    flamesHtml += `<span class="flame-icon ${alive ? '' : 'lost'}">🔥</span>`;
  }
  hudFlames.innerHTML = flamesHtml;

  hudCarried.textContent = String(snap.player.carried);
  const litCount = snap.lanterns.filter((l) => l.lit).length;
  hudLanterns.textContent = String(litCount);
  hudTime.textContent = formatTime(snap.time_left_s);
  hudScore.textContent = String(snap.score);

  // Pulse status & cooldown bar
  const cd = engine.getPulseCooldownTimer();
  if (cd > 0.01) {
    hudPulseStatus.textContent = `Hồi chiêu ${cd.toFixed(1)}s`;
    const pct = Math.max(0, Math.min(100, ((tuning.pulse_cooldown_s - cd) / tuning.pulse_cooldown_s) * 100));
    hudPulseBar.style.width = `${pct}%`;
  } else if (snap.player.carried < tuning.pulse_cost) {
    hudPulseStatus.textContent = `Cần ${tuning.pulse_cost} đom đóm`;
    hudPulseBar.style.width = `${(snap.player.carried / tuning.pulse_cost) * 100}%`;
  } else {
    hudPulseStatus.textContent = 'Sẵn sàng!';
    hudPulseBar.style.width = '100%';
  }

  // Contextual lantern deposit prompt
  let nearUnlit = null;
  for (const l of snap.lanterns) {
    if (!l.lit && distXZ(snap.player.pos, l.pos) <= tuning.interact_radius) {
      nearUnlit = l;
      break;
    }
  }
  if (nearUnlit && snap.state === 'playing') {
    interactPrompt.classList.remove('hidden');
    promptLanternId.textContent = nearUnlit.id;
    promptProgress.textContent = `${nearUnlit.deposited}/${tuning.lantern_cost}`;
  } else {
    interactPrompt.classList.add('hidden');
  }
}

function showGameOver(
  result: 'won' | 'lost',
  reason: 'all_lit' | 'dawn' | 'no_flames',
  snap: SnapshotRecord,
): void {
  if (gameOverShown) return;
  gameOverShown = true;
  gameoverOverlay.classList.remove('hidden');

  if (result === 'won') {
    goBadge.textContent = 'HOÀN THÀNH ĐÊM 1';
    goTitle.textContent = 'Đảo Bến Rực Sáng!';
    goReason.textContent = 'Mây đã thắp sáng toàn bộ 5 Đèn Lồng Lớn, xua tan màn sương đêm trước bình minh.';
  } else if (reason === 'no_flames') {
    goBadge.textContent = 'THẤT BẠI';
    goTitle.textContent = 'Ngọn Lửa Đã Tắt';
    goReason.textContent = 'Mây đã mất hết ngọn lửa trước Bóng Mực. Hãy tận dụng vùng an toàn quanh đèn đã thắp và kỹ năng Tỏa sáng!';
  } else {
    goBadge.textContent = 'HẾT GIỜ';
    goTitle.textContent = 'Bình Minh Đã Đến';
    goReason.textContent = 'Thời gian Đêm 1 đã hết trước khi cả 5 Đèn Lồng Lớn kịp sáng.';
  }

  const litCount = snap.lanterns.filter((l) => l.lit).length;
  goScore.textContent = String(snap.score);
  goLanterns.textContent = `${litCount} / ${snap.lanterns.length}`;
  goTime.textContent = formatTime(snap.time_left_s);
  goFlames.textContent = `${snap.player.flames} / ${tuning.flames}`;
}

function startGame(): void {
  sfx.unlock();
  seedCounter += 1;
  engine = new SimulationEngine(tuning, { seed: seedCounter, night: 1 });
  renderer.resetVisuals();
  camYawDeg = 0;
  gameOverShown = false;
  started = true;
  startOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  hudEl.classList.remove('hidden');
  updateHud(engine.getSnapshot());
}

btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', startGame);

// Fixed-timestep main loop (60Hz logic matching headless simulation)
let lastTime = performance.now();
let accumulator = 0;

function animate(now: number): void {
  requestAnimationFrame(animate);
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (started && engine.getState() === 'playing') {
    // Keyboard camera yaw controls
    if (keys.has('ArrowLeft')) camYawDeg = (camYawDeg + 110 * frameDt) % 360;
    if (keys.has('ArrowRight')) camYawDeg = (camYawDeg - 110 * frameDt + 360) % 360;

    accumulator += frameDt;
    const input = buildInput();
    let stepsThisFrame = 0;
    while (accumulator >= DT && stepsThisFrame < 5 && engine.getState() === 'playing') {
      const res = engine.step(input);
      accumulator -= DT;
      stepsThisFrame++;
      if (res.events.length > 0) {
        handleEvents(res.events, engine.getSnapshot());
      }
    }
    const snap = engine.getSnapshot();
    updateHud(snap);
    const isMoving = Math.hypot(input.move[0], input.move[1]) > 0.01;
    renderer.render(
      snap,
      camYawDeg,
      engine.getPlayerHeadingRad(),
      engine.getInvulnTimer(),
      isMoving,
      frameDt,
    );
  } else {
    // Gentle orbit preview on start / game-over screen
    camYawDeg = (camYawDeg + 10 * frameDt) % 360;
    renderer.render(
      engine.getSnapshot(),
      camYawDeg,
      engine.getPlayerHeadingRad(),
      0,
      false,
      frameDt,
    );
  }
}

requestAnimationFrame(animate);
