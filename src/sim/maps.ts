import type { NightNumber, Vec2, Vec3 } from './types.ts';

export interface JumpPadDef {
  pos: Vec3;
  radius: number;
  launchVy: number;
  launchHorizSpeed: number;
  /** Unit horizontal direction [dx, dz] */
  dirXZ: Vec2;
}

export interface CharmDef {
  id: string;
  pos: Vec3;
}

export interface LanternDef {
  id: string;
  pos: Vec3;
}

export interface NightMapDef {
  night: NightNumber;
  name: string;
  spawnPos: Vec3;
  spawnHeadingRad: number; // 0 = +Z
  lanterns: LanternDef[];
  moteSpawnPoints: Vec3[];
  shadeSpawnPoints: Vec3[];
  shadeSpawnIntervalTicks: number;
  maxShades: number;
  shadeSpeed: number;
  jumpPads: JumpPadDef[];
  charms: CharmDef[];
  driftersEnabled: boolean;
  windEnabled: boolean;
}

function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Angle convention from TICKET-02 Phần 2:
 * Measured from +X, counter-clockwise on XZ: x = r*cos(a), z = r*sin(a).
 * Verified by Night 3 Tier 1 (z > 0) having ramps at 30° & 150° and motes at 20°..160°.
 */
function ringPoints(
  cx: number,
  cz: number,
  y: number,
  radius: number,
  anglesDeg: number[],
): Vec3[] {
  return anglesDeg.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return [round3(cx + Math.cos(rad) * radius), y, round3(cz + Math.sin(rad) * radius)];
  });
}

function uniformAngles(count: number, startDeg = 0): number[] {
  const step = 360 / count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(startDeg + i * step);
  return out;
}

function unitDirXZ(fromX: number, fromZ: number, toX: number, toZ: number): Vec2 {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

export function getNightMapDef(night: NightNumber): NightMapDef {
  if (night === 1) {
    return {
      night: 1,
      name: 'Đảo Bến',
      spawnPos: [0, 0, 0],
      spawnHeadingRad: 0,
      lanterns: [
        { id: 'L1', pos: [0, 0, 25] },
        { id: 'L2', pos: [23.8, 0, 7.7] },
        { id: 'L3', pos: [14.7, 0, -20.2] },
        { id: 'L4', pos: [-14.7, 0, -20.2] },
        { id: 'L5', pos: [-23.8, 0, 7.7] },
      ],
      moteSpawnPoints: [
        ...ringPoints(0, 0, 0, 12, uniformAngles(8, 0)),
        ...ringPoints(0, 0, 0, 33, uniformAngles(16, 0)),
      ],
      shadeSpawnPoints: ringPoints(0, 0, 0, 37, uniformAngles(12, 15)),
      shadeSpawnIntervalTicks: 480, // 8s
      maxShades: 6,
      shadeSpeed: 4.0,
      jumpPads: [],
      charms: [],
      driftersEnabled: false,
      windEnabled: false,
    };
  }

  if (night === 2) {
    return {
      night: 2,
      name: 'Đảo Cau',
      spawnPos: [0, 0, 0],
      spawnHeadingRad: 0,
      lanterns: [
        { id: 'L1', pos: [0, 0, 20] },
        { id: 'L2', pos: [17, 0, -10] },
        { id: 'L3', pos: [-17, 0, -10] },
        { id: 'L4', pos: [70, 0, 20] },
        { id: 'L5', pos: [87, 0, -10] },
        { id: 'L6', pos: [53, 0, -10] },
      ],
      moteSpawnPoints: [
        ...ringPoints(0, 0, 0, 10, [0, 90, 180, 270]),
        ...ringPoints(0, 0, 0, 22, uniformAngles(8, 0)),
        ...ringPoints(70, 0, 0, 10, [0, 90, 180, 270]),
        ...ringPoints(70, 0, 0, 22, uniformAngles(8, 0)),
      ],
      shadeSpawnPoints: [
        ...ringPoints(0, 0, 0, 26, uniformAngles(8, 22.5)),
        ...ringPoints(70, 0, 0, 26, uniformAngles(8, 22.5)),
      ],
      shadeSpawnIntervalTicks: 420, // 7s
      maxShades: 8,
      shadeSpeed: 4.0,
      jumpPads: [
        {
          pos: [20, 0, 18],
          radius: 1.0,
          launchVy: 14.0,
          launchHorizSpeed: 24.0,
          dirXZ: unitDirXZ(20, 18, 70, 0),
        },
        {
          pos: [50, 0, -18],
          radius: 1.0,
          launchVy: 14.0,
          launchHorizSpeed: 24.0,
          dirXZ: unitDirXZ(50, -18, 0, 0),
        },
      ],
      charms: [{ id: 'C1', pos: [35, 0, 0] }],
      driftersEnabled: true,
      windEnabled: false,
    };
  }

  // Night 3: Đảo Chuông
  return {
    night: 3,
    name: 'Đảo Chuông',
    // Spawn on Tier 0 clear of Tier 2 (r=8) and Bell Tower (r=2)
    spawnPos: [0, 0, -10],
    spawnHeadingRad: 0,
    lanterns: [
      { id: 'L1', pos: [0, 6, 6] },
      { id: 'L2', pos: [18, 3, 10] },
      { id: 'L3', pos: [-18, 3, 10] },
      { id: 'L4', pos: [35, 0, -10] },
      { id: 'L5', pos: [-35, 0, -10] },
      { id: 'L6', pos: [20, 0, -35] },
      { id: 'L7', pos: [-20, 0, -35] },
    ],
    moteSpawnPoints: [
      ...ringPoints(0, 0, 0, 34, uniformAngles(18, 0)),
      ...ringPoints(0, 0, 3, 18, [20, 40, 60, 80, 100, 120, 140, 160]),
      ...ringPoints(0, 0, 6, 5, [45, 135, 225, 315]),
    ],
    shadeSpawnPoints: ringPoints(0, 0, 0, 43, uniformAngles(16, 0)),
    shadeSpawnIntervalTicks: 360, // 6s
    maxShades: 10,
    shadeSpeed: 4.5,
    jumpPads: [
      {
        pos: [0, 3, 13],
        radius: 1.0,
        launchVy: 12.0,
        launchHorizSpeed: 8.0,
        dirXZ: [0, -1], // -Z toward Tier 2
      },
    ],
    charms: [
      { id: 'C1', pos: [30, 0, 25] },
      { id: 'C2', pos: [-30, 0, 25] },
    ],
    driftersEnabled: true,
    windEnabled: true,
  };
}

const RAMP_ANGLES_RAD = [(30 * Math.PI) / 180, (150 * Math.PI) / 180];
const RAMP_HALF_WIDTH = 1.5;
const RAMP_INNER_R = 24.0;
const RAMP_OUTER_R = 30.0;
const BELL_TOWER_RADIUS = 2.0;

/**
 * Returns the ramp surface height at (x, z) on Night 3 if inside either ramp, else null.
 */
function getNight3RampHeight(x: number, z: number): number | null {
  for (const rad of RAMP_ANGLES_RAD) {
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const along = x * cosA + z * sinA;
    const perp = Math.abs(-x * sinA + z * cosA);
    if (perp <= RAMP_HALF_WIDTH + 1e-6 && along >= RAMP_INNER_R - 1e-6 && along <= RAMP_OUTER_R + 1e-6) {
      const t = Math.max(0, Math.min(1, (RAMP_OUTER_R - along) / (RAMP_OUTER_R - RAMP_INNER_R)));
      return 3.0 * t;
    }
  }
  return null;
}

/**
 * Returns the solid terrain top surface height at (x, z), or null if over the cloud sea (void).
 */
export function getTerrainHeight(night: NightNumber, x: number, z: number): number | null {
  if (night === 1) {
    return Math.hypot(x, z) <= 40.0 + 1e-6 ? 0 : null;
  }

  if (night === 2) {
    const onA = Math.hypot(x, z) <= 28.0 + 1e-6;
    const onB = Math.hypot(x - 70, z) <= 28.0 + 1e-6;
    const onBridge = x >= 26.0 - 1e-6 && x <= 44.0 + 1e-6 && z >= -2.0 - 1e-6 && z <= 2.0 + 1e-6;
    return onA || onB || onBridge ? 0 : null;
  }

  // Night 3: Đảo Chuông
  const r = Math.hypot(x, z);
  if (r > 45.0 + 1e-6) return null;

  // Tier 2: radius <= 8 at Y = 6 (Bell tower at r <= 2 is an unwalkable obstacle)
  if (r <= 8.0 + 1e-6) {
    return 6.0;
  }

  // Tier 1: annulus 12 <= r <= 24 with z > 0 at Y = 3
  if (r >= 12.0 - 1e-6 && r <= 24.0 + 1e-6 && z >= -1e-6) {
    return 3.0;
  }

  // Ramps from r = 30 (Y = 0) to r = 24 (Y = 3) at 30° and 150°
  const rampH = getNight3RampHeight(x, z);
  if (rampH !== null) {
    return rampH;
  }

  return 0.0;
}

/**
 * Checks if moving horizontally from (fromX, fromZ) at height currentY to (toX, toZ)
 * is blocked by a vertical cliff or the Night 3 Bell Tower.
 */
export function isBlockedByObstacle(
  night: NightNumber,
  currentY: number,
  toX: number,
  toZ: number,
): boolean {
  if (night !== 3) return false;

  // Bell tower cylinder at center (radius 2m, Y in [6, 14])
  if (Math.hypot(toX, toZ) < BELL_TOWER_RADIUS - 1e-6 && currentY < 14.0) {
    return true;
  }

  const targetH = getTerrainHeight(3, toX, toZ);
  if (targetH !== null && targetH > currentY + 0.65) {
    return true;
  }

  return false;
}

/**
 * Resolves horizontal movement against vertical walls / Bell Tower on Night 3
 * with clean sliding fallback.
 */
export function resolveHorizontalMove(
  night: NightNumber,
  fromX: number,
  fromZ: number,
  currentY: number,
  targetX: number,
  targetZ: number,
): { x: number; z: number; blocked: boolean } {
  if (night !== 3) {
    return { x: targetX, z: targetZ, blocked: false };
  }

  if (!isBlockedByObstacle(night, currentY, targetX, targetZ)) {
    return { x: targetX, z: targetZ, blocked: false };
  }

  // Try sliding along X or Z independently
  const xOk = !isBlockedByObstacle(night, currentY, targetX, fromZ);
  const zOk = !isBlockedByObstacle(night, currentY, fromX, targetZ);
  if (xOk && !zOk) return { x: targetX, z: fromZ, blocked: true };
  if (zOk && !xOk) return { x: fromX, z: targetZ, blocked: true };

  // Also push radially out of Bell Tower if right on the cylinder edge
  const r = Math.hypot(targetX, targetZ);
  if (r < BELL_TOWER_RADIUS && r > 1e-6) {
    const pushX = (targetX / r) * (BELL_TOWER_RADIUS + 0.01);
    const pushZ = (targetZ / r) * (BELL_TOWER_RADIUS + 0.01);
    if (!isBlockedByObstacle(night, currentY, pushX, pushZ)) {
      return { x: pushX, z: pushZ, blocked: true };
    }
  }

  return { x: fromX, z: fromZ, blocked: true };
}
