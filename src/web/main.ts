import contractJson from '../../game.contract.json';
import { DT, SimulationEngine, distXZ } from '../sim/engine.ts';
import {
  createDefaultInput,
  type EventRecord,
  type GameContract,
  type GameOverReason,
  type NightNumber,
  type SimInput,
  type SnapshotRecord,
} from '../sim/types.ts';
import { SoundEffects } from './audio.ts';
import { GameRenderer } from './renderer.ts';
import {
  CHARACTERS,
  MAP_THEMES,
  NIGHT_STORIES,
  getCharacterConfig,
  getMapThemeConfig,
  type CharacterId,
  type MapThemeId,
} from './themes.ts';

const contract = contractJson as unknown as GameContract;
const tuning = contract.tuning;

// Persisted user settings (volume, sensitivity, colorblind mode)
const SETTINGS_KEY = 'ddl_settings_v1';
interface UserSettings {
  volume: number; // 0..1
  mouseSensitivity: number; // 0.2..2.5
  colorblindMode: boolean;
}

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.7,
        mouseSensitivity:
          typeof parsed.mouseSensitivity === 'number'
            ? Math.max(0.2, Math.min(2.5, parsed.mouseSensitivity))
            : 1.0,
        colorblindMode: Boolean(parsed.colorblindMode),
      };
    }
  } catch {
    // ignore storage errors
  }
  return { volume: 0.7, mouseSensitivity: 1.0, colorblindMode: false };
}

function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

const settings = loadSettings();

// DOM references
const canvasContainer = document.getElementById('canvas-container')!;
const hudEl = document.getElementById('hud')!;
const startOverlay = document.getElementById('start-overlay')!;
const introOverlay = document.getElementById('intro-overlay')!;
const pauseOverlay = document.getElementById('pause-overlay')!;
const settingsOverlay = document.getElementById('settings-overlay')!;
const gameoverOverlay = document.getElementById('gameover-overlay')!;
const offscreenArrowEl = document.getElementById('offscreen-arrow')!;
const offscreenLabelEl = document.getElementById('offscreen-label')!;

// Lobby Menu elements
const nightGrid = document.getElementById('night-grid')!;
const characterGrid = document.getElementById('character-grid')!;
const mapGrid = document.getElementById('map-grid')!;
const selectedNightPill = document.getElementById('selected-night-pill')!;
const selectedCharPill = document.getElementById('selected-char-pill')!;
const selectedThemePill = document.getElementById('selected-theme-pill')!;
const previewInfo = document.getElementById('preview-info')!;

// HUD elements
const hudFlames = document.getElementById('hud-flames')!;
const hudCharmPill = document.getElementById('hud-charm-pill')!;
const hudCharmTime = document.getElementById('hud-charm-time')!;
const hudWindPill = document.getElementById('hud-wind-pill')!;
const hudLowFuelPill = document.getElementById('hud-lowfuel-pill')!;
const hudFps = document.getElementById('hud-fps')!;
const hudClockCard = document.getElementById('hud-clock-card')!;
const hudClockWarn = document.getElementById('hud-clock-warn')!;
const hudNightLabel = document.getElementById('hud-night-label')!;
const hudTime = document.getElementById('hud-time')!;
const hudLanterns = document.getElementById('hud-lanterns')!;
const hudLanternTotal = document.getElementById('hud-lantern-total')!;
const hudLanternReq = document.getElementById('hud-lantern-req')!;
const hudScore = document.getElementById('hud-score')!;
const hudCarried = document.getElementById('hud-carried')!;
const hudCap = document.getElementById('hud-cap')!;
const moteSlotsEl = document.getElementById('mote-slots')!;
const hudDashStatus = document.getElementById('hud-dash-status')!;
const hudDashBar = document.getElementById('hud-dash-bar')!;
const hudPulseStatus = document.getElementById('hud-pulse-status')!;
const hudPulseBar = document.getElementById('hud-pulse-bar')!;
const interactPrompt = document.getElementById('interact-prompt')!;

// Intro / Settings / GameOver elements
const introBadge = document.getElementById('intro-badge')!;
const introTitle = document.getElementById('intro-title')!;
const introQuote = document.getElementById('intro-quote')!;
const introHighlights = document.getElementById('intro-highlights')!;
const settingVol = document.getElementById('setting-vol') as HTMLInputElement;
const settingVolVal = document.getElementById('setting-vol-val')!;
const settingSens = document.getElementById('setting-sens') as HTMLInputElement;
const settingSensVal = document.getElementById('setting-sens-val')!;
const settingColorblind = document.getElementById('setting-colorblind') as HTMLInputElement;

const goBadge = document.getElementById('go-badge')!;
const goTitle = document.getElementById('go-title')!;
const goReason = document.getElementById('go-reason')!;
const goScore = document.getElementById('go-score')!;
const goTotalScore = document.getElementById('go-total-score')!;
const goLanterns = document.getElementById('go-lanterns')!;
const goTimeFlames = document.getElementById('go-time-flames')!;
const btnNextNight = document.getElementById('btn-next-night')!;
const btnHudZoomReset = document.getElementById('btn-hud-zoom-reset')!;
const btnMenuZoomReset = document.getElementById('btn-menu-zoom-reset')!;

function updateZoomLabels(): void {
  // Show magnifying percentage (1 / zoom factor so zooming closer shows > 100%)
  const pct = Math.round((1 / renderer.getZoom()) * 100);
  btnHudZoomReset.textContent = `${pct}%`;
  btnMenuZoomReset.textContent = `${pct}%`;
}

// Dynamic mote slot bar (supports capacity 10..20)
let renderedSlotCap = 0;
let moteSlotEls: HTMLDivElement[] = [];

function ensureMoteSlots(cap: number): void {
  if (renderedSlotCap === cap) return;
  renderedSlotCap = cap;
  hudCap.textContent = String(cap);
  moteSlotsEl.innerHTML = '';
  moteSlotsEl.style.gridTemplateColumns = `repeat(${Math.min(cap, 20)}, ${cap > 12 ? 14 : 22}px)`;
  moteSlotEls = [];
  for (let i = 0; i < cap; i++) {
    const slot = document.createElement('div');
    slot.className = 'mote-slot';
    moteSlotsEl.appendChild(slot);
    moteSlotEls.push(slot);
  }
}
ensureMoteSlots(tuning.carry_capacity);

// Engine, Renderer, Audio
const renderer = new GameRenderer(canvasContainer, tuning);
const sfx = new SoundEffects();
sfx.setVolume(settings.volume);

function applyColorblindSetting(): void {
  document.body.classList.toggle('colorblind', settings.colorblindMode);
  renderer.setColorblindMode(settings.colorblindMode);
}
applyColorblindSetting();

// Sync settings UI controls
settingVol.value = String(Math.round(settings.volume * 100));
settingVolVal.textContent = `${Math.round(settings.volume * 100)}%`;
settingSens.value = String(Math.round(settings.mouseSensitivity * 100));
settingSensVal.textContent = `${settings.mouseSensitivity.toFixed(1)}x`;
settingColorblind.checked = settings.colorblindMode;

// Selection & Campaign state
let selectedNight: NightNumber = 1;
let selectedCharacter: CharacterId = 'may';
let selectedTheme: MapThemeId = 'dao_ben';
let activeNight: NightNumber = 1;
let campaignTotalScore = 0;
let seedCounter = 2026;
let mode: 'menu' | 'intro' | 'playing' | 'paused' | 'gameover' = 'menu';
let settingsReturnTo: 'menu' | 'paused' = 'menu';

let engine = new SimulationEngine(tuning, { seed: seedCounter, night: 1 });
let pendingPauseToggle = false;
let lastCountdownSec = -1;
let lastWindWarnState = false;
let prevGrounded = true;

// Input state
const keys = new Set<string>();
let camYawDeg = 0;
let isDragging = false;
let lastMouseX = 0;

function renderMenuChoices(): void {
  const charCfg = getCharacterConfig(selectedCharacter);
  const themeCfg = getMapThemeConfig(selectedTheme);
  const story = NIGHT_STORIES[selectedNight];

  selectedNightPill.textContent = story.islandName;
  selectedCharPill.textContent = charCfg.name;
  selectedThemePill.textContent = `${themeCfg.name} · ${themeCfg.ghostName}`;
  previewInfo.textContent = `${story.islandName} · ${charCfg.name} · Ma: ${themeCfg.ghostName}`;

  nightGrid.innerHTML = '';
  for (const n of [1, 2, 3] as NightNumber[]) {
    const ns = NIGHT_STORIES[n];
    const req = Math.ceil(tuning.win_ratio * ns.lanternCount);
    const btn = document.createElement('button');
    btn.className = `choice-card ${selectedNight === n ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="choice-name">Đêm ${n}</div>
      <div class="choice-sub">${ns.islandName.split('—')[1]?.trim() ?? ''}</div>
      <div class="choice-desc">Giữ ≥${req}/${ns.lanternCount} đèn · ${ns.durationS}s</div>
    `;
    btn.addEventListener('click', () => {
      selectedNight = n;
      applyPreviewScene();
      renderMenuChoices();
    });
    nightGrid.appendChild(btn);
  }

  characterGrid.innerHTML = '';
  for (const ch of CHARACTERS) {
    const btn = document.createElement('button');
    btn.className = `choice-card ${selectedCharacter === ch.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="choice-top">
        <span class="choice-swatch" style="background:${ch.badgeColor};color:${ch.badgeColor}"></span>
        <span class="choice-name">${ch.name}</span>
      </div>
      <div class="choice-sub">${ch.title}</div>
      <div class="choice-desc">${ch.desc}</div>
    `;
    btn.addEventListener('click', () => {
      selectedCharacter = ch.id;
      applyPreviewScene();
      renderMenuChoices();
    });
    characterGrid.appendChild(btn);
  }

  mapGrid.innerHTML = '';
  for (const th of MAP_THEMES) {
    const btn = document.createElement('button');
    btn.className = `choice-card ${selectedTheme === th.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="choice-top">
        <span class="choice-swatch" style="background:${th.badgeColor};color:${th.badgeColor}"></span>
        <span class="choice-name">${th.name}</span>
      </div>
      <div class="choice-sub">${th.subtitle}</div>
      <div class="choice-desc">${th.desc}</div>
      <span class="ghost-badge">👻 Ma: ${th.ghostName}</span>
    `;
    btn.addEventListener('click', () => {
      selectedTheme = th.id;
      applyPreviewScene();
      renderMenuChoices();
    });
    mapGrid.appendChild(btn);
  }
}

function applyPreviewScene(): void {
  engine = new SimulationEngine(tuning, { seed: seedCounter, night: selectedNight });
  renderer.setSceneConfig(selectedNight, selectedCharacter, selectedTheme);
  renderer.setMenuPreviewVisible(true);
}

function openNightIntro(night: NightNumber): void {
  activeNight = night;
  mode = 'intro';
  const story = NIGHT_STORIES[night];
  introBadge.textContent = `ĐÊM ${night} / 3`;
  introTitle.textContent = story.islandName;
  introQuote.textContent = story.ongDangQuote;
  introHighlights.innerHTML = story.highlights.map((h) => `<li>${h}</li>`).join('');

  startOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  hudEl.classList.add('hidden');
  introOverlay.classList.remove('hidden');

  engine = new SimulationEngine(tuning, { seed: ++seedCounter, night });
  renderer.setSceneConfig(night, selectedCharacter, selectedTheme);
  renderer.setMenuPreviewVisible(false);
}

function beginActiveNight(): void {
  sfx.unlock();
  sfx.startNightMusic();
  engine = new SimulationEngine(tuning, { seed: ++seedCounter, night: activeNight });
  renderer.setSceneConfig(activeNight, selectedCharacter, selectedTheme);
  renderer.setMenuPreviewVisible(false);
  camYawDeg = 0;
  pendingPauseToggle = false;
  lastCountdownSec = -1;
  lastWindWarnState = false;
  prevGrounded = true;
  keys.clear();

  mode = 'playing';
  introOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  hudEl.classList.remove('hidden');
  hudNightLabel.textContent = NIGHT_STORIES[activeNight].islandName;
  hudLanternTotal.textContent = String(NIGHT_STORIES[activeNight].lanternCount);
  hudLanternReq.textContent = String(engine.getWinThreshold());
  updateHud(engine.getSnapshot());
}

function triggerPauseToggle(): void {
  if (mode !== 'playing' && mode !== 'paused') return;
  pendingPauseToggle = true;
}

function openSettings(returnTo: 'menu' | 'paused'): void {
  settingsReturnTo = returnTo;
  settingsOverlay.classList.remove('hidden');
  if (returnTo === 'paused') pauseOverlay.classList.add('hidden');
}

function closeSettings(): void {
  settingsOverlay.classList.add('hidden');
  if (settingsReturnTo === 'paused') pauseOverlay.classList.remove('hidden');
}

function returnToMainMenu(): void {
  sfx.stopNightMusic();
  mode = 'menu';
  keys.clear();
  hudEl.classList.add('hidden');
  introOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  offscreenArrowEl.classList.add('hidden');
  startOverlay.classList.remove('hidden');
  applyPreviewScene();
  renderMenuChoices();
}

// Button bindings
document.getElementById('btn-start')!.addEventListener('click', () => {
  sfx.unlock();
  campaignTotalScore = 0;
  openNightIntro(selectedNight);
});
document.getElementById('btn-begin-night')!.addEventListener('click', beginActiveNight);
document.getElementById('btn-hud-pause')!.addEventListener('click', triggerPauseToggle);
document.getElementById('btn-resume')!.addEventListener('click', triggerPauseToggle);
document.getElementById('btn-pause-restart')!.addEventListener('click', beginActiveNight);
document.getElementById('btn-pause-settings')!.addEventListener('click', () => openSettings('paused'));
document.getElementById('btn-pause-menu')!.addEventListener('click', returnToMainMenu);
document.getElementById('btn-menu-settings')!.addEventListener('click', () => openSettings('menu'));
document.getElementById('btn-settings-close')!.addEventListener('click', closeSettings);
document.getElementById('btn-restart')!.addEventListener('click', beginActiveNight);
document.getElementById('btn-back-menu')!.addEventListener('click', returnToMainMenu);
btnNextNight.addEventListener('click', () => {
  if (activeNight < 3) {
    openNightIntro((activeNight + 1) as NightNumber);
  }
});

// Zoom button bindings (HUD & Menu Preview)
document.getElementById('btn-hud-zoom-in')!.addEventListener('click', () => {
  renderer.adjustZoom(-0.18);
  updateZoomLabels();
});
document.getElementById('btn-hud-zoom-out')!.addEventListener('click', () => {
  renderer.adjustZoom(0.18);
  updateZoomLabels();
});
btnHudZoomReset.addEventListener('click', () => {
  renderer.setZoom(1.0);
  updateZoomLabels();
});
document.getElementById('btn-menu-zoom-in')!.addEventListener('click', () => {
  renderer.adjustZoom(-0.18);
  updateZoomLabels();
});
document.getElementById('btn-menu-zoom-out')!.addEventListener('click', () => {
  renderer.adjustZoom(0.18);
  updateZoomLabels();
});
btnMenuZoomReset.addEventListener('click', () => {
  renderer.setZoom(1.0);
  updateZoomLabels();
});

settingVol.addEventListener('input', () => {
  const pct = Number(settingVol.value);
  settings.volume = pct / 100;
  settingVolVal.textContent = `${pct}%`;
  sfx.setVolume(settings.volume);
  saveSettings(settings);
});

settingSens.addEventListener('input', () => {
  const val = Number(settingSens.value) / 100;
  settings.mouseSensitivity = val;
  settingSensVal.textContent = `${val.toFixed(1)}x`;
  saveSettings(settings);
});

settingColorblind.addEventListener('change', () => {
  settings.colorblindMode = settingColorblind.checked;
  applyColorblindSetting();
  saveSettings(settings);
});

// Keyboard & Mouse bindings
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (!settingsOverlay.classList.contains('hidden')) {
      closeSettings();
      return;
    }
    triggerPauseToggle();
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) {
    sfx.toggleMute();
    return;
  }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') {
    renderer.adjustZoom(-0.14);
    updateZoomLabels();
    return;
  }
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    renderer.adjustZoom(0.14);
    updateZoomLabels();
    return;
  }
  if (e.code === 'Digit0' || e.code === 'Numpad0') {
    renderer.setZoom(1.0);
    updateZoomLabels();
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
  if (!isDragging || (mode !== 'playing' && mode !== 'menu')) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  camYawDeg = (camYawDeg - dx * 0.35 * settings.mouseSensitivity + 360) % 360;
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

// Mouse wheel smooth Zoom In / Zoom Out (active on 3D canvas & menu preview)
window.addEventListener(
  'wheel',
  (e) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.menu-panel, .modal-card')) {
      return; // allow normal scrolling inside the left menu panel
    }
    e.preventDefault();
    const step = Math.sign(e.deltaY) * 0.12;
    renderer.adjustZoom(step);
    updateZoomLabels();
  },
  { passive: false },
);

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function buildInput(pulsePauseEdge: boolean): SimInput {
  const input = createDefaultInput();
  let mx = 0;
  let mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA')) mx += 1;
  if (keys.has('KeyD')) mx -= 1;

  input.move = [mx, mz];
  input.cam_yaw_deg = camYawDeg;
  input.jump = keys.has('Space');
  input.interact = keys.has('KeyE') || keys.has('KeyF');
  input.pulse = keys.has('KeyQ');
  input.dash = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.pause = pulsePauseEdge;
  return input;
}

function handleEvents(events: EventRecord[], snap: SnapshotRecord): void {
  for (const ev of events) {
    switch (ev.name) {
      case 'mote_picked':
        sfx.playMotePickup(ev.data.carried);
        renderer.spawnBurst(snap.player.pos, 0xfff6c2, 10);
        break;
      case 'deposit':
      case 'refuel': {
        sfx.playDeposit();
        const l = snap.lanterns.find((x) => x.id === ev.data.lantern_id);
        if (l) renderer.spawnBurst(l.pos, 0xffb347, 14);
        break;
      }
      case 'lantern_lit': {
        sfx.playLanternLit();
        const l = snap.lanterns.find((x) => x.id === ev.data.lantern_id);
        if (l) renderer.spawnBurst(l.pos, 0xffe9b0, 26);
        break;
      }
      case 'lantern_out': {
        sfx.playHit();
        const l = snap.lanterns.find((x) => x.id === ev.data.lantern_id);
        if (l) renderer.spawnBurst(l.pos, 0x5b5f6e, 16);
        break;
      }
      case 'pulse':
        sfx.playPulse();
        renderer.spawnPulseRing(snap.player.pos);
        break;
      case 'dash':
        sfx.playDash();
        renderer.spawnBurst(snap.player.pos, 0x9effe0, 8);
        break;
      case 'charm_picked':
        sfx.playCharmPickup();
        renderer.spawnBurst(snap.player.pos, 0xc8102e, 16);
        break;
      case 'shade_spawned':
        sfx.playShadeSpawn();
        break;
      case 'drifter_steal':
        sfx.playDrifterSteal();
        break;
      case 'player_hit':
        sfx.playHit();
        renderer.spawnBurst(snap.player.pos, settings.colorblindMode ? 0x00b3ff : 0x7a3cff, 18);
        break;
      case 'paused':
        mode = 'paused';
        pauseOverlay.classList.remove('hidden');
        break;
      case 'resumed':
        mode = 'playing';
        pauseOverlay.classList.add('hidden');
        settingsOverlay.classList.add('hidden');
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
  // Flames
  let flamesHtml = '';
  for (let i = 0; i < tuning.flames; i++) {
    flamesHtml += `<span class="flame-icon ${i < snap.player.flames ? '' : 'lost'}">🔥</span>`;
  }
  hudFlames.innerHTML = flamesHtml;

  // Charm & Wind status pills
  if (snap.player.charm_s > 0.01) {
    hudCharmPill.classList.remove('hidden');
    hudCharmTime.textContent = `${snap.player.charm_s.toFixed(1)}s`;
  } else {
    hudCharmPill.classList.add('hidden');
  }

  const windWarn = engine.isWindWarning();
  if (snap.wind.active) {
    hudWindPill.classList.remove('hidden');
    hudWindPill.textContent = `🌪️ Gió mạnh (${Math.round(snap.wind.dir_deg)}°)`;
  } else if (windWarn) {
    hudWindPill.classList.remove('hidden');
    hudWindPill.textContent = '🍃 Gió mạnh sắp thổi!';
    if (!lastWindWarnState) sfx.playWindWarning();
  } else {
    hudWindPill.classList.add('hidden');
  }
  lastWindWarnState = windWarn;

  // Low fuel lantern alert pill (with ⚠ for accessibility & colorblind mode)
  const weakLanterns = snap.lanterns.filter(
    (l) => l.lit && l.fuel < tuning.low_fuel_threshold,
  );
  if (weakLanterns.length > 0 && snap.state === 'playing') {
    hudLowFuelPill.classList.remove('hidden');
    hudLowFuelPill.textContent = `⚠ Sắp hết dầu: ${weakLanterns.map((l) => `${l.id} (${Math.ceil(l.fuel)}%)`).join(', ')}`;
  } else {
    hudLowFuelPill.classList.add('hidden');
  }

  // Clock + <= 30s danger blink (with ⚠ in colorblind mode) + last 10s audio ticks
  hudTime.textContent = formatTime(snap.time_left_s);
  const isDangerTime = snap.time_left_s <= 30 && snap.state === 'playing';
  hudClockCard.classList.toggle('danger', isDangerTime);
  hudClockWarn.classList.toggle('hidden', !isDangerTime);

  const ceilSec = Math.ceil(snap.time_left_s);
  if (ceilSec <= 10 && ceilSec > 0 && ceilSec !== lastCountdownSec && snap.state === 'playing') {
    lastCountdownSec = ceilSec;
    sfx.playCountdownTick();
  }

  // Lanterns & Score
  const litCount = snap.lanterns.filter((l) => l.lit).length;
  hudLanterns.textContent = String(litCount);
  hudScore.textContent = String(snap.score);

  // Dynamic capacity mote bar (10..20)
  ensureMoteSlots(snap.player.capacity);
  hudCarried.textContent = String(snap.player.carried);
  for (let i = 0; i < moteSlotEls.length; i++) {
    moteSlotEls[i].classList.toggle('filled', i < snap.player.carried);
  }

  // Dash cooldown
  if (snap.player.charm_s > 0.01) {
    hudDashStatus.textContent = 'Không hồi chiêu!';
    hudDashBar.style.width = '100%';
  } else if (snap.player.dash_cd_s > 0.01) {
    hudDashStatus.textContent = `${snap.player.dash_cd_s.toFixed(1)}s`;
    const pct = Math.max(
      0,
      Math.min(100, ((tuning.dash_cooldown_s - snap.player.dash_cd_s) / tuning.dash_cooldown_s) * 100),
    );
    hudDashBar.style.width = `${pct}%`;
  } else {
    hudDashStatus.textContent = 'Sẵn sàng';
    hudDashBar.style.width = '100%';
  }

  // Pulse cooldown
  if (snap.player.pulse_cd_s > 0.01) {
    hudPulseStatus.textContent = `${snap.player.pulse_cd_s.toFixed(1)}s`;
    const pct = Math.max(
      0,
      Math.min(100, ((tuning.pulse_cooldown_s - snap.player.pulse_cd_s) / tuning.pulse_cooldown_s) * 100),
    );
    hudPulseBar.style.width = `${pct}%`;
  } else if (snap.player.carried < tuning.pulse_cost) {
    hudPulseStatus.textContent = `Cần ${tuning.pulse_cost}`;
    hudPulseBar.style.width = `${(snap.player.carried / tuning.pulse_cost) * 100}%`;
  } else {
    hudPulseStatus.textContent = 'Sẵn sàng';
    hudPulseBar.style.width = '100%';
  }

  // Contextual lantern prompt (deposit / relight / refuel)
  let nearEligible = null;
  let bestD = Infinity;
  for (const l of snap.lanterns) {
    if (l.lit && l.fuel >= tuning.fuel_max) continue;
    const d = distXZ(snap.player.pos, l.pos);
    if (d <= tuning.interact_radius && Math.abs(snap.player.pos[1] - l.pos[1]) <= 2.5 && d < bestD) {
      bestD = d;
      nearEligible = l;
    }
  }
  if (nearEligible && snap.state === 'playing') {
    interactPrompt.classList.remove('hidden');
    if (nearEligible.lit) {
      interactPrompt.textContent = `E — Châm dầu ${nearEligible.id} (${Math.round(nearEligible.fuel)}%)`;
    } else if (nearEligible.ever_lit) {
      interactPrompt.textContent = `E — Thắp lại ${nearEligible.id} (${nearEligible.deposited}/${tuning.relight_cost})`;
    } else {
      interactPrompt.textContent = `E — Nạp ánh sáng (${nearEligible.deposited}/${tuning.lantern_cost})`;
    }
  } else {
    interactPrompt.classList.add('hidden');
  }
}

function showGameOver(
  result: 'won' | 'lost',
  reason: GameOverReason,
  snap: SnapshotRecord,
): void {
  mode = 'gameover';
  offscreenArrowEl.classList.add('hidden');
  gameoverOverlay.classList.remove('hidden');

  const litCount = snap.lanterns.filter((l) => l.lit).length;
  const reqCount = engine.getWinThreshold();

  if (result === 'won' && reason === 'dawn_survived') {
    campaignTotalScore += snap.score;
    if (activeNight === 3) {
      goBadge.textContent = '☀️ BÌNH MINH TRÊN QUẦN ĐẢO';
      goTitle.textContent = 'Giữ Sáng Thành Công 3 Đêm!';
      goReason.textContent =
        'Bạn đã giữ vững ngọn lửa qua cả Đảo Bến, Đảo Cau và Đảo Chuông cho tới tận Bình Minh!';
      btnNextNight.classList.add('hidden');
    } else {
      goBadge.textContent = `VƯỢT QUA ĐÊM ${activeNight}`;
      goTitle.textContent = `Bình Minh Đã Tới (${litCount}/${snap.lanterns.length} đèn sáng)!`;
      goReason.textContent = `Bạn đã giữ đảo sáng vượt ngưỡng ${reqCount}/${snap.lanterns.length} tới bình minh. Sẵn sàng sang Đêm ${activeNight + 1}!`;
      btnNextNight.classList.remove('hidden');
      btnNextNight.textContent = `Tiếp tục sang Đêm ${activeNight + 1} →`;
    }
  } else {
    btnNextNight.classList.add('hidden');
    if (reason === 'no_flames') {
      goBadge.textContent = `THẤT BẠI · ĐÊM ${activeNight}`;
      goTitle.textContent = 'Ngọn Lửa Đã Tắt';
      goReason.textContent =
        'Mây đã hết Ngọn Lửa. Hãy giữ đèn trên 30 dầu để duy trì vùng an toàn và tận dụng Lướt / Tỏa Sáng!';
    } else {
      goBadge.textContent = `BÌNH MINH QUÁ TỐI · ĐÊM ${activeNight}`;
      goTitle.textContent = `Chỉ còn ${litCount}/${snap.lanterns.length} Đèn Sáng`;
      goReason.textContent = `Cần giữ ít nhất ${reqCount}/${snap.lanterns.length} đèn đang sáng tại lúc bình minh. Hãy châm dầu kịp thời và đẩy lùi Bóng Mực hút dầu!`;
    }
  }

  goScore.textContent = String(snap.score);
  goTotalScore.textContent = String(campaignTotalScore);
  goLanterns.textContent = `${litCount} / ${snap.lanterns.length} (≥${reqCount})`;
  goTimeFlames.textContent = `${formatTime(snap.time_left_s)} · ${snap.player.flames}🔥`;
}

// Initialize Lobby Menu
applyPreviewScene();
renderMenuChoices();

// Fixed-timestep 60Hz loop + FPS tracker
let lastTime = performance.now();
let accumulator = 0;
let fpsFrames = 0;
let fpsTimer = 0;

function animate(now: number): void {
  requestAnimationFrame(animate);
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  fpsFrames++;
  fpsTimer += frameDt;
  if (fpsTimer >= 0.5) {
    hudFps.textContent = String(Math.round(fpsFrames / fpsTimer));
    fpsFrames = 0;
    fpsTimer = 0;
  }

  if (mode === 'playing' || mode === 'paused') {
    if (mode === 'playing') {
      if (keys.has('ArrowLeft'))
        camYawDeg = (camYawDeg + 115 * settings.mouseSensitivity * frameDt) % 360;
      if (keys.has('ArrowRight'))
        camYawDeg = (camYawDeg - 115 * settings.mouseSensitivity * frameDt + 360) % 360;
    }

    accumulator += frameDt;
    let stepsThisFrame = 0;
    while (accumulator >= DT && stepsThisFrame < 5 && (mode === 'playing' || mode === 'paused')) {
      const pausePulse = pendingPauseToggle;
      pendingPauseToggle = false;
      const input = buildInput(pausePulse);
      const res = engine.step(input);
      accumulator -= DT;
      stepsThisFrame++;

      const snapAfter = engine.getSnapshot();
      if (prevGrounded && !snapAfter.player.grounded && snapAfter.player.vel[1] > 1) {
        sfx.playJump();
      }
      prevGrounded = snapAfter.player.grounded;

      if (res.events.length > 0) {
        handleEvents(res.events, snapAfter);
      }
      if (pausePulse) break;
    }

    const snap = engine.getSnapshot();
    updateHud(snap);
    const isMoving =
      mode === 'playing' &&
      (keys.has('KeyW') ||
        keys.has('KeyS') ||
        keys.has('KeyA') ||
        keys.has('KeyD') ||
        keys.has('ArrowUp') ||
        keys.has('ArrowDown'));

    const arrow = renderer.render(
      snap,
      engine.getCharmVisuals(),
      camYawDeg,
      engine.getPlayerHeadingRad(),
      engine.getInvulnTimer(),
      isMoving,
      engine.isWindWarning(),
      engine.getWindDirDeg(),
      frameDt,
    );

    if (mode === 'playing' && arrow.visible) {
      offscreenArrowEl.classList.remove('hidden');
      offscreenArrowEl.style.left = `${arrow.x}px`;
      offscreenArrowEl.style.top = `${arrow.y}px`;
      offscreenArrowEl.querySelector<HTMLElement>('.arrow-head')!.style.transform = `rotate(${arrow.angleDeg}deg)`;
      offscreenLabelEl.textContent = arrow.lanternId;
    } else {
      offscreenArrowEl.classList.add('hidden');
    }
  } else {
    camYawDeg = (camYawDeg + 12 * frameDt) % 360;
    renderer.render(
      engine.getSnapshot(),
      engine.getCharmVisuals(),
      camYawDeg,
      engine.getPlayerHeadingRad(),
      0,
      false,
      false,
      0,
      frameDt,
    );
  }
}

requestAnimationFrame(animate);
