import contractJson from '../../game.contract.json';
import { DT, SimulationEngine, distXZ } from '../sim/engine.ts';
import {
  addLeaderboardEntry,
  isValidPlayerName,
  sortAndTrimLeaderboard,
  type LeaderboardData,
  type LeaderboardEntry,
} from '../sim/leaderboard.ts';
import {
  createDefaultInput,
  type EventRecord,
  type GameContract,
  type GameOverReason,
  type NightNumber,
  type SimInput,
  type SnapshotRecord,
  type Vec3,
} from '../sim/types.ts';
import { SoundEffects } from './audio.ts';
import { runBenchmarkMode } from './bench_mode.ts';
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

// Keybinding configuration (all 9 rebindable actions)
type ActionId =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'pulse'
  | 'pause';

type KeyBindings = Record<ActionId, string>;

const ACTION_LABELS: Record<ActionId, string> = {
  moveUp: 'Đi lên',
  moveDown: 'Đi xuống',
  moveLeft: 'Sang trái',
  moveRight: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Tương tác',
  pulse: 'Tỏa Sáng',
  pause: 'Tạm dừng',
};

const DEFAULT_KEYS: KeyBindings = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'KeyP',
};

function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  return code;
}

// Persisted user settings & local leaderboard fallback
const SETTINGS_KEY = 'ddl_settings_v2';
const LB_LOCAL_KEY = 'ddl_leaderboard_v1';

interface UserSettings {
  volume: number;
  mouseSensitivity: number;
  colorblindMode: boolean;
  reduceMotion: boolean;
  largeText: boolean;
  keys: KeyBindings;
}

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UserSettings>;
      return {
        volume: typeof p.volume === 'number' ? Math.max(0, Math.min(1, p.volume)) : 0.7,
        mouseSensitivity:
          typeof p.mouseSensitivity === 'number'
            ? Math.max(0.2, Math.min(2.5, p.mouseSensitivity))
            : 1.0,
        colorblindMode: Boolean(p.colorblindMode),
        reduceMotion: Boolean(p.reduceMotion),
        largeText: Boolean(p.largeText),
        keys: { ...DEFAULT_KEYS, ...(p.keys ?? {}) },
      };
    }
  } catch {
    // ignore
  }
  return {
    volume: 0.7,
    mouseSensitivity: 1.0,
    colorblindMode: false,
    reduceMotion: false,
    largeText: false,
    keys: { ...DEFAULT_KEYS },
  };
}

function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function loadLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LB_LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LeaderboardData>;
      if (Array.isArray(parsed.entries)) return sortAndTrimLeaderboard(parsed.entries);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveLocalLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(LB_LOCAL_KEY, JSON.stringify({ entries: sortAndTrimLeaderboard(entries) }));
  } catch {
    // ignore
  }
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      const data = (await res.json()) as LeaderboardData;
      if (Array.isArray(data.entries)) {
        saveLocalLeaderboard(data.entries);
        return data.entries;
      }
    }
  } catch {
    // offline / static file fallback
  }
  return loadLocalLeaderboard();
}

async function submitLeaderboardScore(entry: {
  name: string;
  score: number;
  nights_won: number;
  seed: number;
}): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = (await res.json()) as LeaderboardData;
      if (Array.isArray(data.entries)) {
        saveLocalLeaderboard(data.entries);
        return data.entries;
      }
    }
  } catch {
    // fallback localStorage
  }
  const updated = addLeaderboardEntry(loadLocalLeaderboard(), entry);
  saveLocalLeaderboard(updated);
  return updated;
}

const canvasContainer = document.getElementById('canvas-container')!;
const renderer = new GameRenderer(canvasContainer, tuning);

// Check Benchmark Mode (?bench=1&seed=42&duration=30) BEFORE mounting normal UI
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('bench') === '1') {
  const benchSeed = Number.parseInt(urlParams.get('seed') ?? '42', 10) || 42;
  const benchDur = Number.parseFloat(urlParams.get('duration') ?? '30') || 30;
  runBenchmarkMode(renderer, tuning, benchSeed, benchDur);
} else {
  bootInteractiveGame();
}

function bootInteractiveGame(): void {
  const settings = loadSettings();
  const sfx = new SoundEffects();
  sfx.setVolume(settings.volume);

  // DOM references
  const hitFlashEl = document.getElementById('hit-flash')!;
  const hudEl = document.getElementById('hud')!;
  const startOverlay = document.getElementById('start-overlay')!;
  const introOverlay = document.getElementById('intro-overlay')!;
  const pauseOverlay = document.getElementById('pause-overlay')!;
  const settingsOverlay = document.getElementById('settings-overlay')!;
  const leaderboardOverlay = document.getElementById('leaderboard-overlay')!;
  const gameoverOverlay = document.getElementById('gameover-overlay')!;
  const offscreenArrowEl = document.getElementById('offscreen-arrow')!;
  const offscreenLabelEl = document.getElementById('offscreen-label')!;
  const shadeArrowEl = document.getElementById('shade-arrow')!;
  const shadeArrowLabelEl = document.getElementById('shade-arrow-label')!;
  const subtitleBarEl = document.getElementById('subtitle-bar')!;

  const nightGrid = document.getElementById('night-grid')!;
  const characterGrid = document.getElementById('character-grid')!;
  const mapGrid = document.getElementById('map-grid')!;
  const selectedNightPill = document.getElementById('selected-night-pill')!;
  const selectedCharPill = document.getElementById('selected-char-pill')!;
  const selectedThemePill = document.getElementById('selected-theme-pill')!;
  const previewInfo = document.getElementById('preview-info')!;

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
  const hudControlsLegend = document.getElementById('hud-controls-legend')!;
  const lblKeyDash = document.getElementById('lbl-key-dash')!;
  const lblKeyPulse = document.getElementById('lbl-key-pulse')!;
  const hudDashStatus = document.getElementById('hud-dash-status')!;
  const hudDashBar = document.getElementById('hud-dash-bar')!;
  const hudPulseStatus = document.getElementById('hud-pulse-status')!;
  const hudPulseBar = document.getElementById('hud-pulse-bar')!;
  const interactPrompt = document.getElementById('interact-prompt')!;

  const introBadge = document.getElementById('intro-badge')!;
  const introTitle = document.getElementById('intro-title')!;
  const introQuote = document.getElementById('intro-quote')!;
  const introHighlights = document.getElementById('intro-highlights')!;
  const settingVol = document.getElementById('setting-vol') as HTMLInputElement;
  const settingVolVal = document.getElementById('setting-vol-val')!;
  const settingSens = document.getElementById('setting-sens') as HTMLInputElement;
  const settingSensVal = document.getElementById('setting-sens-val')!;
  const settingColorblind = document.getElementById('setting-colorblind') as HTMLInputElement;
  const settingReduceMotion = document.getElementById('setting-reduce-motion') as HTMLInputElement;
  const settingLargeText = document.getElementById('setting-large-text') as HTMLInputElement;
  const keybindList = document.getElementById('keybind-list')!;
  const keybindError = document.getElementById('keybind-error')!;
  const leaderboardBody = document.getElementById('leaderboard-body')!;

  const goBadge = document.getElementById('go-badge')!;
  const goTitle = document.getElementById('go-title')!;
  const goReason = document.getElementById('go-reason')!;
  const goScore = document.getElementById('go-score')!;
  const goTotalScore = document.getElementById('go-total-score')!;
  const goLanterns = document.getElementById('go-lanterns')!;
  const goTimeFlames = document.getElementById('go-time-flames')!;
  const saveScoreBox = document.getElementById('save-score-box')!;
  const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;
  const btnSaveScore = document.getElementById('btn-save-score') as HTMLButtonElement;
  const saveScoreMsg = document.getElementById('save-score-msg')!;
  const btnNextNight = document.getElementById('btn-next-night')!;
  const btnHudZoomReset = document.getElementById('btn-hud-zoom-reset')!;
  const btnMenuZoomReset = document.getElementById('btn-menu-zoom-reset')!;

  function updateZoomLabels(): void {
    const pct = Math.round((1 / renderer.getZoom()) * 100);
    btnHudZoomReset.textContent = `${pct}%`;
    btnMenuZoomReset.textContent = `${pct}%`;
  }

  // Dynamic mote slot bar
  let renderedSlotCap = 0;
  let moteSlotEls: HTMLDivElement[] = [];
  function ensureMoteSlots(cap: number): void {
    if (renderedSlotCap === cap) return;
    renderedSlotCap = cap;
    hudCap.textContent = String(cap);
    moteSlotsEl.innerHTML = '';
    moteSlotsEl.style.gridTemplateColumns = `repeat(${Math.min(cap, 20)}, ${cap > 12 ? 15 : 22}px)`;
    moteSlotEls = [];
    for (let i = 0; i < cap; i++) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      moteSlotsEl.appendChild(slot);
      moteSlotEls.push(slot);
    }
  }
  ensureMoteSlots(tuning.carry_capacity);

  // Accessibility application
  function applyAccessibilitySettings(): void {
    document.body.classList.toggle('colorblind', settings.colorblindMode);
    document.body.classList.toggle('reduce-motion', settings.reduceMotion);
    document.body.classList.toggle('large-text', settings.largeText);
    renderer.setColorblindMode(settings.colorblindMode);
    renderer.setReduceMotion(settings.reduceMotion);

    const k = settings.keys;
    lblKeyDash.textContent = formatKeyCode(k.dash);
    lblKeyPulse.textContent = formatKeyCode(k.pulse);
    hudControlsLegend.innerHTML = `
      <span><kbd>${formatKeyCode(k.moveUp)}${formatKeyCode(k.moveLeft)}${formatKeyCode(k.moveDown)}${formatKeyCode(k.moveRight)}</kbd> Đi</span>
      <span><kbd>${formatKeyCode(k.jump)}</kbd> Nhảy</span>
      <span><kbd>${formatKeyCode(k.interact)}</kbd> Nạp/Châm dầu</span>
      <span><kbd>${formatKeyCode(k.pause)}</kbd> Dừng</span>
    `;
  }

  // Subtitle system (Visual accessibility captions)
  let subtitleTimeout: number | null = null;
  function showSubtitle(text: string, durationMs = 2800): void {
    subtitleBarEl.textContent = text;
    subtitleBarEl.classList.remove('hidden');
    if (subtitleTimeout !== null) window.clearTimeout(subtitleTimeout);
    subtitleTimeout = window.setTimeout(() => {
      subtitleBarEl.classList.add('hidden');
    }, durationMs);
  }

  // Newly spawned shade indicator tracking
  let spawnedShadePos: Vec3 | null = null;
  let spawnedShadeTimer = 0;
  let spawnedShadeLabel = '👻 Bóng Mực';

  // Key rebinding state
  let listeningAction: ActionId | null = null;

  function renderKeybindList(): void {
    keybindList.innerHTML = '';
    for (const action of Object.keys(ACTION_LABELS) as ActionId[]) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const isListening = listeningAction === action;
      row.innerHTML = `<span>${ACTION_LABELS[action]}</span>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn-key ${isListening ? 'listening' : ''}`;
      btn.textContent = isListening ? 'Nhấn phím...' : formatKeyCode(settings.keys[action]);
      btn.addEventListener('click', () => {
        listeningAction = isListening ? null : action;
        keybindError.classList.add('hidden');
        renderKeybindList();
      });
      row.appendChild(btn);
      keybindList.appendChild(row);
    }
  }

  // Sync Settings UI
  settingVol.value = String(Math.round(settings.volume * 100));
  settingVolVal.textContent = `${Math.round(settings.volume * 100)}%`;
  settingSens.value = String(Math.round(settings.mouseSensitivity * 100));
  settingSensVal.textContent = `${settings.mouseSensitivity.toFixed(1)}x`;
  settingColorblind.checked = settings.colorblindMode;
  settingReduceMotion.checked = settings.reduceMotion;
  settingLargeText.checked = settings.largeText;
  applyAccessibilitySettings();
  renderKeybindList();

  // Campaign state
  let selectedNight: NightNumber = 1;
  let selectedCharacter: CharacterId = 'may';
  let selectedTheme: MapThemeId = 'dao_ben';
  let activeNight: NightNumber = 1;
  let campaignTotalScore = 0;
  let campaignNightsWon = 0;
  let campaignSeed = 2026;
  let seedCounter = 2026;
  let scoreSavedForRun = false;
  let mode: 'menu' | 'intro' | 'playing' | 'paused' | 'gameover' = 'menu';
  let settingsReturnTo: 'menu' | 'paused' = 'menu';

  let engine = new SimulationEngine(tuning, { seed: seedCounter, night: 1 });
  let pendingPauseToggle = false;
  let lastCountdownSec = -1;
  let lastWindWarnState = false;
  let lastLowFuelAlertIds = '';
  let prevGrounded = true;

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
        <div class="choice-desc">≥${req}/${ns.lanternCount} đèn · ${ns.durationS}s</div>
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
        <span class="ghost-badge">👻 ${th.ghostName}</span>
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

  async function openLeaderboardModal(): Promise<void> {
    leaderboardOverlay.classList.remove('hidden');
    leaderboardBody.innerHTML = '<p>Đang tải bảng xếp hạng...</p>';
    const entries = await fetchLeaderboard();
    if (entries.length === 0) {
      leaderboardBody.innerHTML = '<p class="modal-desc">Chưa có kỷ lục nào. Hãy chơi và lưu điểm đầu tiên!</p>';
      return;
    }
    const rows = entries
      .map(
        (e, i) => `
        <tr>
          <td class="mono">#${i + 1}</td>
          <td><strong>${e.name}</strong></td>
          <td class="mono gold">${e.score}</td>
          <td class="mono">${e.nights_won}/3</td>
          <td class="mono">${e.seed}</td>
        </tr>`,
      )
      .join('');
    leaderboardBody.innerHTML = `
      <table class="lb-table">
        <thead>
          <tr><th>Hạng</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Seed</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
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
    lastLowFuelAlertIds = '';
    spawnedShadePos = null;
    spawnedShadeTimer = 0;
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
    listeningAction = null;
    keybindError.classList.add('hidden');
    renderKeybindList();
    settingsOverlay.classList.remove('hidden');
    if (returnTo === 'paused') pauseOverlay.classList.add('hidden');
  }

  function closeSettings(): void {
    listeningAction = null;
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
    shadeArrowEl.classList.add('hidden');
    subtitleBarEl.classList.add('hidden');
    startOverlay.classList.remove('hidden');
    applyPreviewScene();
    renderMenuChoices();
  }

  // Button bindings
  document.getElementById('btn-start')!.addEventListener('click', () => {
    sfx.unlock();
    campaignTotalScore = 0;
    campaignNightsWon = 0;
    campaignSeed = seedCounter + 1;
    scoreSavedForRun = false;
    openNightIntro(selectedNight);
  });
  document.getElementById('btn-begin-night')!.addEventListener('click', beginActiveNight);
  document.getElementById('btn-hud-pause')!.addEventListener('click', triggerPauseToggle);
  document.getElementById('btn-resume')!.addEventListener('click', triggerPauseToggle);
  document.getElementById('btn-pause-restart')!.addEventListener('click', beginActiveNight);
  document.getElementById('btn-pause-settings')!.addEventListener('click', () => openSettings('paused'));
  document.getElementById('btn-pause-menu')!.addEventListener('click', returnToMainMenu);
  document.getElementById('btn-menu-settings')!.addEventListener('click', () => openSettings('menu'));
  document.getElementById('btn-menu-leaderboard')!.addEventListener('click', () => void openLeaderboardModal());
  document.getElementById('btn-lb-close')!.addEventListener('click', () => leaderboardOverlay.classList.add('hidden'));
  document.getElementById('btn-settings-close')!.addEventListener('click', closeSettings);
  document.getElementById('btn-restart')!.addEventListener('click', beginActiveNight);
  document.getElementById('btn-back-menu')!.addEventListener('click', returnToMainMenu);
  btnNextNight.addEventListener('click', () => {
    if (activeNight < 3) openNightIntro((activeNight + 1) as NightNumber);
  });

  document.getElementById('btn-reset-keys')!.addEventListener('click', () => {
    settings.keys = { ...DEFAULT_KEYS };
    listeningAction = null;
    keybindError.classList.add('hidden');
    saveSettings(settings);
    applyAccessibilitySettings();
    renderKeybindList();
  });

  btnSaveScore.addEventListener('click', async () => {
    if (scoreSavedForRun) return;
    const rawName = playerNameInput.value.trim();
    if (!isValidPlayerName(rawName)) {
      saveScoreMsg.className = 'save-score-msg error';
      saveScoreMsg.textContent = '⚠ Tên phải dài 3–12 ký tự (chữ cái, số hoặc _).';
      return;
    }
    try {
      await submitLeaderboardScore({
        name: rawName,
        score: campaignTotalScore,
        nights_won: campaignNightsWon,
        seed: campaignSeed,
      });
      scoreSavedForRun = true;
      btnSaveScore.disabled = true;
      saveScoreMsg.className = 'save-score-msg';
      saveScoreMsg.textContent = `✓ Đã lưu "${rawName}" (${campaignTotalScore} điểm) vào Bảng xếp hạng!`;
    } catch (err) {
      saveScoreMsg.className = 'save-score-msg error';
      saveScoreMsg.textContent = err instanceof Error ? err.message : 'Lỗi lưu điểm.';
    }
  });

  // Zoom controls
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

  // Settings sliders & toggles
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
    applyAccessibilitySettings();
    saveSettings(settings);
  });
  settingReduceMotion.addEventListener('change', () => {
    settings.reduceMotion = settingReduceMotion.checked;
    applyAccessibilitySettings();
    saveSettings(settings);
  });
  settingLargeText.addEventListener('change', () => {
    settings.largeText = settingLargeText.checked;
    applyAccessibilitySettings();
    saveSettings(settings);
  });

  // Keyboard & Mouse bindings
  window.addEventListener('keydown', (e) => {
    // Allow typing freely in the leaderboard name input
    if (document.activeElement === playerNameInput) return;

    // Capture key rebinding if active
    if (listeningAction !== null) {
      e.preventDefault();
      const newCode = e.code;
      const conflict = (Object.keys(settings.keys) as ActionId[]).find(
        (act) => act !== listeningAction && settings.keys[act] === newCode,
      );
      if (conflict) {
        keybindError.classList.remove('hidden');
        keybindError.textContent = `⚠ Phím [${formatKeyCode(newCode)}] bị trùng với "${ACTION_LABELS[conflict]}"! Hãy chọn phím khác.`;
        return;
      }
      settings.keys[listeningAction] = newCode;
      listeningAction = null;
      keybindError.classList.add('hidden');
      saveSettings(settings);
      applyAccessibilitySettings();
      renderKeybindList();
      return;
    }

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if ((e.code === 'Escape' || e.code === settings.keys.pause) && !e.repeat) {
      if (!settingsOverlay.classList.contains('hidden')) {
        closeSettings();
        return;
      }
      if (!leaderboardOverlay.classList.contains('hidden')) {
        leaderboardOverlay.classList.add('hidden');
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

  window.addEventListener('keyup', (e) => keys.delete(e.code));
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

  window.addEventListener(
    'wheel',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.menu-panel, .modal-card')) return;
      e.preventDefault();
      renderer.adjustZoom(Math.sign(e.deltaY) * 0.12);
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
    const k = settings.keys;
    let mx = 0;
    let mz = 0;
    if (keys.has(k.moveUp) || keys.has('ArrowUp')) mz += 1;
    if (keys.has(k.moveDown) || keys.has('ArrowDown')) mz -= 1;
    if (keys.has(k.moveLeft)) mx += 1;
    if (keys.has(k.moveRight)) mx -= 1;

    input.move = [mx, mz];
    input.cam_yaw_deg = camYawDeg;
    input.jump = keys.has(k.jump);
    input.interact = keys.has(k.interact);
    input.pulse = keys.has(k.pulse);
    input.dash =
      keys.has(k.dash) || (k.dash === 'ShiftLeft' && keys.has('ShiftRight'));
    input.pause = pulsePauseEdge;
    return input;
  }

  function triggerHitFlash(): void {
    if (settings.reduceMotion) return;
    hitFlashEl.classList.remove('hidden');
    hitFlashEl.style.animation = 'none';
    void hitFlashEl.offsetHeight;
    hitFlashEl.style.animation = '';
    window.setTimeout(() => hitFlashEl.classList.add('hidden'), 320);
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
          showSubtitle(`⚠ Đèn ${ev.data.lantern_id} đã tắt hết dầu!`);
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
          showSubtitle('🧧 Đã nhặt Bùa Gió — Chạy nhanh & Lướt không hồi chiêu!');
          renderer.spawnBurst(snap.player.pos, 0xc8102e, 16);
          break;
        case 'shade_spawned': {
          sfx.playShadeSpawn();
          const spawned = snap.shades.find((s) => s.id === ev.data.id);
          if (spawned) {
            spawnedShadePos = spawned.pos;
            spawnedShadeTimer = 3.2;
            spawnedShadeLabel = `👻 ${ev.data.id}`;
          }
          showSubtitle(`👻 Bóng Mực ${ev.data.id} vừa xuất hiện!`);
          break;
        }
        case 'drifter_steal':
          sfx.playDrifterSteal();
          showSubtitle(`💨 Gió Lạc đã cướp ${ev.data.amount} đom đóm!`);
          break;
        case 'player_hit':
          sfx.playHit();
          renderer.triggerHitShake();
          triggerHitFlash();
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
    let flamesHtml = '';
    for (let i = 0; i < tuning.flames; i++) {
      flamesHtml += `<span class="flame-icon ${i < snap.player.flames ? '' : 'lost'}">🔥</span>`;
    }
    hudFlames.innerHTML = flamesHtml;

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
      if (!lastWindWarnState) {
        sfx.playWindWarning();
        showSubtitle('🍃 Cảnh báo: Cơn gió mạnh sắp thổi tới!');
      }
    } else {
      hudWindPill.classList.add('hidden');
    }
    lastWindWarnState = windWarn;

    const weakLanterns = snap.lanterns.filter(
      (l) => l.lit && l.fuel < tuning.low_fuel_threshold,
    );
    const weakKey = weakLanterns.map((l) => l.id).join(',');
    if (weakLanterns.length > 0 && snap.state === 'playing') {
      hudLowFuelPill.classList.remove('hidden');
      hudLowFuelPill.textContent = `⚠ Sắp hết dầu: ${weakLanterns.map((l) => `${l.id} (${Math.ceil(l.fuel)}%)`).join(', ')}`;
      if (weakKey !== lastLowFuelAlertIds) {
        showSubtitle(`⚠ Đèn ${weakKey} dưới 30% dầu — sắp mất vùng an toàn!`);
      }
    } else {
      hudLowFuelPill.classList.add('hidden');
    }
    lastLowFuelAlertIds = weakKey;

    hudTime.textContent = formatTime(snap.time_left_s);
    const isDangerTime = snap.time_left_s <= 30 && snap.state === 'playing';
    hudClockCard.classList.toggle('danger', isDangerTime);
    hudClockWarn.classList.toggle('hidden', !isDangerTime);

    const ceilSec = Math.ceil(snap.time_left_s);
    if (ceilSec <= 10 && ceilSec > 0 && ceilSec !== lastCountdownSec && snap.state === 'playing') {
      lastCountdownSec = ceilSec;
      sfx.playCountdownTick();
      showSubtitle(`⏳ Còn ${ceilSec} giây tới bình minh!`, 1100);
    }

    const litCount = snap.lanterns.filter((l) => l.lit).length;
    hudLanterns.textContent = String(litCount);
    hudScore.textContent = String(snap.score);

    ensureMoteSlots(snap.player.capacity);
    hudCarried.textContent = String(snap.player.carried);
    for (let i = 0; i < moteSlotEls.length; i++) {
      moteSlotEls[i].classList.toggle('filled', i < snap.player.carried);
    }

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
    const keyLabel = formatKeyCode(settings.keys.interact);
    if (nearEligible && snap.state === 'playing') {
      interactPrompt.classList.remove('hidden');
      if (nearEligible.lit) {
        interactPrompt.textContent = `${keyLabel} — Châm dầu ${nearEligible.id} (${Math.round(nearEligible.fuel)}%)`;
      } else if (nearEligible.ever_lit) {
        interactPrompt.textContent = `${keyLabel} — Thắp lại ${nearEligible.id} (${nearEligible.deposited}/${tuning.relight_cost})`;
      } else {
        interactPrompt.textContent = `${keyLabel} — Nạp ánh sáng (${nearEligible.deposited}/${tuning.lantern_cost})`;
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
    shadeArrowEl.classList.add('hidden');
    subtitleBarEl.classList.add('hidden');
    gameoverOverlay.classList.remove('hidden');

    const litCount = snap.lanterns.filter((l) => l.lit).length;
    const reqCount = engine.getWinThreshold();
    let allowSaveScore = false;

    if (result === 'won' && reason === 'dawn_survived') {
      campaignTotalScore += snap.score;
      campaignNightsWon = Math.min(3, campaignNightsWon + 1);
      if (activeNight === 3) {
        goBadge.textContent = '☀️ BÌNH MINH TRÊN QUẦN ĐẢO';
        goTitle.textContent = 'Giữ Sáng Thành Công 3 Đêm!';
        goReason.textContent =
          'Bạn đã giữ vững ngọn lửa qua cả Đảo Bến, Đảo Cau và Đảo Chuông cho tới tận Bình Minh!';
        btnNextNight.classList.add('hidden');
        allowSaveScore = true;
      } else {
        goBadge.textContent = `VƯỢT QUA ĐÊM ${activeNight}`;
        goTitle.textContent = `Bình Minh Đã Tới (${litCount}/${snap.lanterns.length} đèn)!`;
        goReason.textContent = `Vượt ngưỡng ${reqCount}/${snap.lanterns.length} đèn sáng tới bình minh. Sẵn sàng sang Đêm ${activeNight + 1}!`;
        btnNextNight.classList.remove('hidden');
        btnNextNight.textContent = `Tiếp tục sang Đêm ${activeNight + 1} →`;
      }
    } else {
      btnNextNight.classList.add('hidden');
      allowSaveScore = true;
      if (reason === 'no_flames') {
        goBadge.textContent = `THẤT BẠI · ĐÊM ${activeNight}`;
        goTitle.textContent = 'Ngọn Lửa Đã Tắt';
        goReason.textContent =
          'Mây đã hết Ngọn Lửa. Hãy giữ đèn trên 30 dầu để duy trì vùng an toàn và tận dụng Lướt / Tỏa Sáng!';
      } else {
        goBadge.textContent = `BÌNH MINH QUÁ TỐI · ĐÊM ${activeNight}`;
        goTitle.textContent = `Chỉ còn ${litCount}/${snap.lanterns.length} Đèn Sáng`;
        goReason.textContent = `Cần giữ ít nhất ${reqCount}/${snap.lanterns.length} đèn sáng lúc bình minh.`;
      }
    }

    if (allowSaveScore) {
      saveScoreBox.classList.remove('hidden');
      scoreSavedForRun = false;
      btnSaveScore.disabled = false;
      saveScoreMsg.textContent = '';
    } else {
      saveScoreBox.classList.add('hidden');
    }

    goScore.textContent = String(snap.score);
    goTotalScore.textContent = String(campaignTotalScore);
    goLanterns.textContent = `${litCount} / ${snap.lanterns.length} (≥${reqCount})`;
    goTimeFlames.textContent = `${formatTime(snap.time_left_s)} · ${snap.player.flames}🔥`;
  }

  applyPreviewScene();
  renderMenuChoices();

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
      const k = settings.keys;
      const isMoving =
        mode === 'playing' &&
        (keys.has(k.moveUp) ||
          keys.has(k.moveDown) ||
          keys.has(k.moveLeft) ||
          keys.has(k.moveRight) ||
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

      if (mode === 'playing' && spawnedShadePos && spawnedShadeTimer > 0) {
        spawnedShadeTimer -= frameDt;
        const sArrow = renderer.projectWorldToEdgeArrow(spawnedShadePos, spawnedShadeLabel);
        shadeArrowEl.classList.remove('hidden');
        shadeArrowEl.style.left = `${sArrow.x}px`;
        shadeArrowEl.style.top = `${sArrow.y}px`;
        shadeArrowEl.querySelector<HTMLElement>('.arrow-head')!.style.transform = `rotate(${sArrow.angleDeg}deg)`;
        shadeArrowLabelEl.textContent = sArrow.lanternId;
      } else {
        shadeArrowEl.classList.add('hidden');
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
}
