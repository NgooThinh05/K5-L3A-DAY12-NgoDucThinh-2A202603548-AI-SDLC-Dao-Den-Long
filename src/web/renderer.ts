import * as THREE from 'three';
import type { CharmVisualInfo } from '../sim/engine.ts';
import { getNightMapDef } from '../sim/maps.ts';
import type { GameTuning, NightNumber, SnapshotRecord, Vec3 } from '../sim/types.ts';
import {
  getCharacterConfig,
  getMapThemeConfig,
  type CharacterConfig,
  type CharacterId,
  type GhostKind,
  type MapThemeConfig,
  type MapThemeId,
} from './themes.ts';

interface LanternVisual {
  group: THREE.Group;
  paperMesh: THREE.Mesh;
  paperMat: THREE.MeshStandardMaterial;
  tearGroup: THREE.Group;
  fuelBarGroup: THREE.Group;
  fuelFillMesh: THREE.Mesh;
  fuelFillMat: THREE.MeshBasicMaterial;
  pointLight: THREE.PointLight;
  safeRing: THREE.Mesh;
  progressRing: THREE.Mesh;
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  eyeLeftMat: THREE.MeshBasicMaterial;
  eyeRightMat: THREE.MeshBasicMaterial;
  orbitRing: THREE.Mesh | null;
  stunHalo: THREE.Mesh;
  normalBodyColor: number;
  normalBodyEmissive: number;
  normalEyeColor: number;
}

interface DrifterVisual {
  group: THREE.Group;
  ribbonMat: THREE.MeshStandardMaterial;
  stolenOrb: THREE.Mesh;
}

interface CharmVisual {
  group: THREE.Group;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface PulseRingEffect {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
  maxRadius: number;
}

export interface OffscreenArrowState {
  visible: boolean;
  x: number;
  y: number;
  angleDeg: number;
  lanternId: string;
}

export class GameRenderer {
  private readonly container: HTMLElement;
  private readonly tuning: GameTuning;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly fog: THREE.FogExp2;

  private readonly ambientLight: THREE.AmbientLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly dirLight: THREE.DirectionalLight;

  private envGroup: THREE.Group | null = null;
  private themeDecorGroup: THREE.Group | null = null;
  private cloudGroup: THREE.Group | null = null;
  private previewGhostGroup: THREE.Group | null = null;
  private windLeavesGroup: THREE.Group;
  private windLeaves: THREE.Mesh[] = [];

  private characterCfg: CharacterConfig = getCharacterConfig('may');
  private mapCfg: MapThemeConfig = getMapThemeConfig('dao_ben');
  private colorblindMode = false;
  private reduceMotion = false;
  private hitShakeTimer = 0;

  // Instanced meshes for high-FPS 200-shade + 100-mote benchmark mode
  private benchShadeBodies: THREE.InstancedMesh | null = null;
  private benchShadeEyes: THREE.InstancedMesh | null = null;
  private benchMotes: THREE.InstancedMesh | null = null;
  private readonly benchDummy = new THREE.Object3D();

  // Player
  private readonly playerGroup = new THREE.Group();
  private playerBodyGroup = new THREE.Group();
  private leftArmPivot: THREE.Group | null = null;
  private handLanternPivot: THREE.Group | null = null;
  private hatLanternLight: THREE.PointLight | null = null;
  private readonly carriedOrbsGroup = new THREE.Group();
  private readonly carriedOrbs: THREE.Mesh[] = [];
  private readonly compassGroup: THREE.Group;

  // Dynamic entities
  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteMeshes = new Map<string, THREE.Mesh>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();
  private readonly drifterVisuals = new Map<string, DrifterVisual>();
  private readonly charmVisuals = new Map<string, CharmVisual>();

  // Transient VFX
  private readonly particles: BurstParticle[] = [];
  private readonly pulseRings: PulseRingEffect[] = [];

  private readonly moteGeo = new THREE.OctahedronGeometry(0.3, 1);
  private readonly moteMat = new THREE.MeshStandardMaterial({
    color: 0xfff6c2,
    emissive: 0xffe58a,
    emissiveIntensity: 1.7,
    roughness: 0.2,
  });
  private readonly droppedMoteMat = new THREE.MeshStandardMaterial({
    color: 0xffd175,
    emissive: 0xff8c38,
    emissiveIntensity: 2.0,
    roughness: 0.2,
  });
  private readonly particleGeo = new THREE.SphereGeometry(0.11, 6, 6);

  private clockTime = 0;
  private currentLitRatio = 0;
  private targetZoom = 1.0;
  private currentZoom = 1.0;
  private camCurrentPos = new THREE.Vector3(0, 7.5, -11);
  private camLookTarget = new THREE.Vector3(0, 1.4, 0);

  constructor(container: HTMLElement, tuning: GameTuning) {
    this.container = container;
    this.tuning = tuning;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.mapCfg.skyDark);
    this.fog = new THREE.FogExp2(this.mapCfg.fogColor, this.mapCfg.fogDarkDensity);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      320,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    // Phase 2 standard progressive ambient light: 0.15 + 0.55 * (lit / total)
    this.ambientLight = new THREE.AmbientLight(0xd9e0ff, 0.15);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(
      this.mapCfg.hemiDarkColor,
      this.mapCfg.hemiGroundColor,
      0.5,
    );
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(this.mapCfg.dirDarkColor, 0.6);
    this.dirLight.position.set(28, 48, -22);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 160;
    const d = 60;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    // Carried motes orbiting player
    this.carriedOrbsGroup.position.y = 1.15;
    this.playerGroup.add(this.carriedOrbsGroup);
    const orbGeo = new THREE.SphereGeometry(0.075, 6, 6);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2 });
    for (let i = 0; i < this.tuning.capacity_max; i++) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.visible = false;
      this.carriedOrbsGroup.add(orb);
      this.carriedOrbs.push(orb);
    }
    this.scene.add(this.playerGroup);

    // Diegetic ground compass
    this.compassGroup = this.buildCompass();
    this.scene.add(this.compassGroup);

    // Wind leaves visual pool (Night 3 wind warning & active gust)
    this.windLeavesGroup = new THREE.Group();
    const leafGeo = new THREE.BoxGeometry(0.26, 0.04, 0.14);
    const leafMat = new THREE.MeshBasicMaterial({ color: 0xd9f2b4, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 40; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set((i % 10) * 3 - 15, 0.8 + (i % 5) * 0.9, Math.floor(i / 10) * 6 - 12);
      this.windLeavesGroup.add(leaf);
      this.windLeaves.push(leaf);
    }
    this.windLeavesGroup.visible = false;
    this.scene.add(this.windLeavesGroup);

    this.setSceneConfig(1, 'may', 'dao_ben');
    window.addEventListener('resize', this.handleResize);
  }

  public setSceneConfig(night: NightNumber, characterId: CharacterId, mapId: MapThemeId): void {
    this.characterCfg = getCharacterConfig(characterId);
    this.mapCfg = getMapThemeConfig(mapId);

    this.moteMat.color.setHex(this.mapCfg.moteColor);
    this.moteMat.emissive.setHex(this.mapCfg.moteEmissive);

    if (this.envGroup) this.scene.remove(this.envGroup);
    if (this.cloudGroup) this.scene.remove(this.cloudGroup);

    this.envGroup = this.buildNightMap(night, this.mapCfg);
    this.scene.add(this.envGroup);

    this.cloudGroup = this.buildCloudSea(night, this.mapCfg);
    this.scene.add(this.cloudGroup);

    // Rebuild player model
    this.playerGroup.remove(this.playerBodyGroup);
    const built = this.buildPlayerBody(this.characterCfg);
    this.playerBodyGroup = built.body;
    this.leftArmPivot = built.leftArmPivot;
    this.handLanternPivot = built.handLanternPivot;
    this.hatLanternLight = built.hatLight;
    this.playerGroup.add(this.playerBodyGroup);

    // Rebuild menu preview ghost
    if (this.previewGhostGroup) this.scene.remove(this.previewGhostGroup);
    const previewVis = this.buildGhostMesh(this.mapCfg.ghostKind);
    this.previewGhostGroup = previewVis.group;
    this.scene.add(this.previewGhostGroup);

    this.resetVisuals();
    this.currentLitRatio = 0;
  }

  public setMenuPreviewVisible(visible: boolean): void {
    if (this.previewGhostGroup) this.previewGhostGroup.visible = visible;
  }

  public setColorblindMode(enabled: boolean): void {
    this.colorblindMode = enabled;
  }

  public setReduceMotion(enabled: boolean): void {
    this.reduceMotion = enabled;
    if (enabled) this.hitShakeTimer = 0;
  }

  public triggerHitShake(): void {
    if (!this.reduceMotion) {
      this.hitShakeTimer = 0.25;
    }
  }

  public getRendererInfo(): string {
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return `Three.js r${THREE.REVISION} / WebGL2 (${gpu})`;
  }

  public captureScreenshotDataUrl(): string {
    return this.renderer.domElement.toDataURL('image/png');
  }

  public projectWorldToEdgeArrow(worldPos: Vec3, label: string): OffscreenArrowState {
    const v = new THREE.Vector3(worldPos[0], worldPos[1] + 1.5, worldPos[2]);
    const ndc = v.project(this.camera);
    const isBehind = ndc.z > 1;
    let sx = isBehind ? -ndc.x : ndc.x;
    let sy = isBehind ? -ndc.y : ndc.y;
    const len = Math.hypot(sx, sy) || 1;
    sx /= len;
    sy /= len;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const pad = 52;
    return {
      visible: true,
      x: Math.max(pad, Math.min(w - pad, (sx * 0.45 + 0.5) * w)),
      y: Math.max(pad + 44, Math.min(h - pad - 44, (-sy * 0.45 + 0.5) * h)),
      angleDeg: (Math.atan2(sx, sy) * 180) / Math.PI,
      lanternId: label,
    };
  }

  public setupBenchScene(
    lanterns: Array<{ id: string; pos: Vec3; lit: boolean; fuel: number }>,
    shadeCount: number,
    moteCount: number,
  ): void {
    // Render at exact native 1280x720 resolution in benchmark mode regardless of OS HiDPI scaling
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.resetVisuals();
    if (this.themeDecorGroup) this.themeDecorGroup.visible = false;
    this.compassGroup.visible = false;
    this.windLeavesGroup.visible = false;
    this.playerGroup.position.set(0, 0, 0);
    this.playerBodyGroup.rotation.y = 0;

    // Create 5 standard Night 1 lanterns (L1-L3 lit with full fuel=100)
    let litCount = 0;
    for (const l of lanterns) {
      const vis = this.createLanternVisual(l.id, l.pos);
      if (l.lit) {
        litCount++;
        vis.paperMesh.scale.set(1, 1, 1);
        vis.tearGroup.visible = false;
        vis.paperMat.color.setHex(this.mapCfg.lanternCoreColor);
        vis.paperMat.emissive.setHex(this.mapCfg.lanternLitColor);
        vis.paperMat.emissiveIntensity = 1.9;
        vis.pointLight.intensity = 16;
        vis.safeRing.visible = true;
        vis.progressRing.visible = false;
        vis.fuelBarGroup.visible = true;
      } else {
        vis.paperMesh.scale.set(1, 0.8, 1);
        vis.tearGroup.visible = true;
        vis.safeRing.visible = false;
        vis.progressRing.visible = true;
        vis.fuelBarGroup.visible = false;
      }
    }

    const litRatio = litCount / Math.max(1, lanterns.length);
    this.ambientLight.intensity = 0.15 + 0.55 * litRatio;
    const skyColor = new THREE.Color(this.mapCfg.skyDark).lerp(
      new THREE.Color(this.mapCfg.skyLit),
      litRatio,
    );
    this.scene.background = skyColor;
    this.fog.color.setHex(this.mapCfg.fogColor).lerp(skyColor, litRatio * 0.5);
    this.fog.density =
      this.mapCfg.fogDarkDensity + (this.mapCfg.fogLitDensity - this.mapCfg.fogDarkDensity) * litRatio;

    // GPU-instanced 200 Shades + 100 Motes for crisp 60+ FPS at 1280x720
    const shadeBodyGeo = new THREE.ConeGeometry(0.62, 1.85, 8);
    const shadeBodyMat = new THREE.MeshStandardMaterial({
      color: 0x120a1a,
      emissive: 0x7a3cff,
      emissiveIntensity: 0.65,
      roughness: 0.4,
    });
    this.benchShadeBodies = new THREE.InstancedMesh(shadeBodyGeo, shadeBodyMat, shadeCount);
    this.benchShadeBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.benchShadeBodies);

    const eyeGeo = new THREE.SphereGeometry(0.11, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd9a8ff });
    this.benchShadeEyes = new THREE.InstancedMesh(eyeGeo, eyeMat, shadeCount * 2);
    this.benchShadeEyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.benchShadeEyes);

    this.benchMotes = new THREE.InstancedMesh(this.moteGeo, this.moteMat, moteCount);
    this.benchMotes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.benchMotes);
  }

  public renderBenchFrame(
    shades: Array<{ x: number; y: number; z: number; angle: number }>,
    motes: Array<{ x: number; z: number; phase: number }>,
    camPos: Vec3,
    elapsedS: number,
    frameDt: number,
  ): void {
    this.clockTime += frameDt;
    if (this.cloudGroup) this.cloudGroup.rotation.y += frameDt * 0.012;

    if (this.benchShadeBodies && this.benchShadeEyes) {
      for (let i = 0; i < shades.length; i++) {
        const s = shades[i];
        const hover = Math.sin(elapsedS * 4 + s.x) * 0.14;
        const yaw = Math.atan2(Math.cos(s.angle), Math.sin(s.angle));
        this.benchDummy.position.set(s.x, s.y + 0.25 + hover, s.z);
        this.benchDummy.rotation.set(0, yaw, 0);
        this.benchDummy.scale.set(1, 1, 1);
        this.benchDummy.updateMatrix();
        this.benchShadeBodies.setMatrixAt(i, this.benchDummy.matrix);

        const sinY = Math.sin(yaw);
        const cosY = Math.cos(yaw);
        for (let e = 0; e < 2; e++) {
          const sx = e === 0 ? -0.18 : 0.18;
          const sz = 0.36;
          this.benchDummy.position.set(
            s.x + sx * cosY + sz * sinY,
            s.y + 0.5 + hover,
            s.z - sx * sinY + sz * cosY,
          );
          this.benchDummy.rotation.set(0, 0, 0);
          this.benchDummy.updateMatrix();
          this.benchShadeEyes.setMatrixAt(i * 2 + e, this.benchDummy.matrix);
        }
      }
      this.benchShadeBodies.instanceMatrix.needsUpdate = true;
      this.benchShadeEyes.instanceMatrix.needsUpdate = true;
    }

    if (this.benchMotes) {
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        this.benchDummy.position.set(
          m.x,
          0.72 + Math.sin(elapsedS * 3.2 + m.phase) * 0.2,
          m.z,
        );
        this.benchDummy.rotation.set(0, elapsedS * 1.8 + m.phase, 0);
        this.benchDummy.scale.set(1, 1, 1);
        this.benchDummy.updateMatrix();
        this.benchMotes.setMatrixAt(i, this.benchDummy.matrix);
      }
      this.benchMotes.instanceMatrix.needsUpdate = true;
    }

    for (const vis of this.lanternVisuals.values()) {
      if (vis.fuelBarGroup.visible) {
        vis.fuelBarGroup.lookAt(camPos[0], camPos[1], camPos[2]);
      }
    }

    this.camera.position.set(camPos[0], camPos[1], camPos[2]);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  public adjustZoom(delta: number): number {
    this.targetZoom = Math.max(0.26, Math.min(2.3, this.targetZoom + delta));
    return this.targetZoom;
  }

  public setZoom(zoom: number): number {
    this.targetZoom = Math.max(0.26, Math.min(2.3, zoom));
    return this.targetZoom;
  }

  public getZoom(): number {
    return this.targetZoom;
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private buildIslandDisk(
    cx: number,
    cz: number,
    radius: number,
    cfg: MapThemeConfig,
    topY = 0,
  ): THREE.Group {
    const g = new THREE.Group();
    g.position.set(cx, topY, cz);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.94, 3.0, 48),
      new THREE.MeshStandardMaterial({ color: cfg.groundColor, roughness: 0.88 }),
    );
    top.position.y = -1.5;
    top.receiveShadow = true;
    g.add(top);

    // Sandy edge ring (#C9B48A)
    const sandRingGeo = new THREE.RingGeometry(radius - 2.2, radius, 48);
    sandRingGeo.rotateX(-Math.PI / 2);
    const sandRing = new THREE.Mesh(
      sandRingGeo,
      new THREE.MeshStandardMaterial({ color: cfg.sandColor, roughness: 0.92 }),
    );
    sandRing.position.y = 0.02;
    sandRing.receiveShadow = true;
    g.add(sandRing);

    const under = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.92, 14, 18),
      new THREE.MeshStandardMaterial({ color: cfg.undersideColor, roughness: 0.95 }),
    );
    under.rotation.x = Math.PI;
    under.position.y = -10.0;
    g.add(under);

    return g;
  }

  private buildJumpPadMesh(pos: Vec3): THREE.Group {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.15, 0.22, 16),
      new THREE.MeshStandardMaterial({
        color: 0x6b4a2f,
        roughness: 0.7,
      }),
    );
    base.position.y = 0.11;
    g.add(base);

    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: 0x9effe0,
        emissive: 0x3de8b0,
        emissiveIntensity: 1.6,
      }),
    );
    glow.position.y = 0.23;
    g.add(glow);

    const ringGeo = new THREE.RingGeometry(0.95, 1.12, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x9effe0, side: THREE.DoubleSide }),
    );
    ring.position.y = 0.26;
    g.add(ring);

    return g;
  }

  private buildNightMap(night: NightNumber, cfg: MapThemeConfig): THREE.Group {
    const group = new THREE.Group();
    const mapDef = getNightMapDef(night);

    if (night === 1) {
      // Đêm 1: Đảo Bến (radius 40m)
      group.add(this.buildIslandDisk(0, 0, 40, cfg, 0));

      const plaza = new THREE.Mesh(
        new THREE.CylinderGeometry(4.0, 4.3, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: cfg.plazaColor, roughness: 0.88 }),
      );
      plaza.position.y = 0.03;
      plaza.receiveShadow = true;
      group.add(plaza);

      this.addPerimeterProps(group, 0, 0, 38.5, 24, cfg);
    } else if (night === 2) {
      // Đêm 2: Đảo Cau — Island A (0,0) r=28, Island B (70,0) r=28, Bamboo Bridge x in [26,44], z in [-2,2]
      group.add(this.buildIslandDisk(0, 0, 28, cfg, 0));
      group.add(this.buildIslandDisk(70, 0, 28, cfg, 0));

      // Bamboo Bridge (no railings per spec)
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.36, 4.0),
        new THREE.MeshStandardMaterial({ color: cfg.woodColor, roughness: 0.85 }),
      );
      bridge.position.set(35, -0.16, 0);
      bridge.receiveShadow = true;
      bridge.castShadow = true;
      group.add(bridge);

      // Decorative bamboo slats on bridge
      const slatMat = new THREE.MeshStandardMaterial({ color: cfg.sandColor, roughness: 0.8 });
      for (let x = 26.8; x <= 43.4; x += 1.2) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 3.85), slatMat);
        slat.position.set(x, 0.03, 0);
        group.add(slat);
      }

      this.addPerimeterProps(group, 0, 0, 26.8, 12, cfg, (x, z) => x > 22 && Math.abs(z) < 4);
      this.addPerimeterProps(group, 70, 0, 26.8, 12, cfg, (x, z) => x < 48 && Math.abs(z) < 4);
    } else {
      // Đêm 3: Đảo Chuông — 3 tiers + 2 ramps + Bell Tower
      group.add(this.buildIslandDisk(0, 0, 45, cfg, 0));

      // Tier 1 (Y = 3): semicircular annulus r=12..24 with z > 0
      const tier1Shape = new THREE.Shape();
      tier1Shape.absarc(0, 0, 24, 0, Math.PI, false);
      tier1Shape.absarc(0, 0, 12, Math.PI, 0, true);
      const tier1Geo = new THREE.ExtrudeGeometry(tier1Shape, {
        depth: 3.0,
        bevelEnabled: false,
        curveSegments: 32,
      });
      // Rotate so shape (x, y) maps to world (x, z) with shape +y -> world +z
      tier1Geo.rotateX(Math.PI / 2);
      const tier1Mat = new THREE.MeshStandardMaterial({ color: cfg.groundColor, roughness: 0.86 });
      const tier1 = new THREE.Mesh(tier1Geo, tier1Mat);
      tier1.position.y = 3.0;
      tier1.receiveShadow = true;
      tier1.castShadow = true;
      group.add(tier1);

      // Tier 2 (Y = 6): disk radius 8 at center
      const tier2 = new THREE.Mesh(
        new THREE.CylinderGeometry(8.0, 8.2, 6.0, 32),
        new THREE.MeshStandardMaterial({ color: cfg.plazaColor, roughness: 0.82 }),
      );
      tier2.position.y = 3.0;
      tier2.receiveShadow = true;
      tier2.castShadow = true;
      group.add(tier2);

      // 2 Straight Ramps at 30° and 150°: width 3m, r=30 (Y=0) to r=24 (Y=3)
      const rampLen = Math.hypot(6.0, 3.0);
      const rampPitch = Math.atan2(3.0, 6.0);
      const rampMat = new THREE.MeshStandardMaterial({ color: cfg.woodColor, roughness: 0.82 });
      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const midR = 27.0;
        const rampHolder = new THREE.Group();
        rampHolder.position.set(Math.cos(rad) * midR, 1.5, Math.sin(rad) * midR);
        // Align local +Z pointing radially inward toward origin
        rampHolder.rotation.y = Math.atan2(-Math.cos(rad), -Math.sin(rad));
        const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.35, rampLen), rampMat);
        rampMesh.rotation.x = -rampPitch;
        rampMesh.receiveShadow = true;
        rampMesh.castShadow = true;
        rampHolder.add(rampMesh);
        group.add(rampHolder);
      }

      // Bell Tower (Tháp chuông): cylinder radius 2m, height 8m on Tier 2 (Y=6..14)
      const towerBase = new THREE.Mesh(
        new THREE.CylinderGeometry(2.0, 2.0, 8.0, 12),
        new THREE.MeshStandardMaterial({ color: cfg.woodColor, roughness: 0.78 }),
      );
      towerBase.position.set(0, 10.0, 0);
      towerBase.castShadow = true;
      group.add(towerBase);

      const towerRoof = new THREE.Mesh(
        new THREE.ConeGeometry(3.2, 2.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x261d2e, roughness: 0.7 }),
      );
      towerRoof.position.set(0, 15.0, 0);
      group.add(towerRoof);

      const bell = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 1.2, 12),
        new THREE.MeshStandardMaterial({
          color: 0xf2c14e,
          emissive: 0x7d5312,
          emissiveIntensity: 0.6,
          metalness: 0.55,
          roughness: 0.35,
        }),
      );
      bell.position.set(0, 12.6, 0);
      group.add(bell);

      this.addPerimeterProps(group, 0, 0, 43.2, 24, cfg);
    }

    // Jump pads for this night
    for (const pad of mapDef.jumpPads) {
      group.add(this.buildJumpPadMesh(pad.pos));
    }

    // Rich theme-specific 3D props & scenery across the island (isolated from benchmark mode)
    this.themeDecorGroup = this.buildThemeDecorations(night, cfg, mapDef);
    group.add(this.themeDecorGroup);

    // Starfield dome
    const count = 240;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = ((i * 73.13) % 360) * (Math.PI / 180);
      const phi = Math.acos(0.15 + ((i * 0.6180339) % 0.85));
      const r = 165;
      positions[i * 3] = (night === 2 ? 35 : 0) + r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 12;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    group.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: cfg.starColor, size: 0.85, transparent: true, opacity: 0.85 }),
      ),
    );

    return group;
  }

  private addPerimeterProps(
    group: THREE.Group,
    cx: number,
    cz: number,
    r: number,
    count: number,
    cfg: MapThemeConfig,
    skipFn?: (x: number, z: number) => boolean,
  ): void {
    const postMat = new THREE.MeshStandardMaterial({ color: cfg.rimPostColor, roughness: 0.8 });
    const darkRoofMat = new THREE.MeshStandardMaterial({ color: 0x24171f, roughness: 0.65 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: cfg.propStyle === 'snow_peaks' ? 0xd9f0ff : 0x3db87a,
      roughness: 0.62,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: cfg.lanternCoreColor,
      emissive: cfg.lanternLitColor,
      emissiveIntensity: 1.35,
      roughness: 0.25,
    });

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (skipFn && skipFn(x, z)) continue;

      if (cfg.propStyle === 'standard') {
        // Wooden dock bollard + every 3rd post has a small glowing harbor lantern
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.05, 8), postMat);
        post.position.set(x, 0.52, z);
        group.add(post);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.12, 8), darkRoofMat);
        cap.position.set(x, 1.08, z);
        group.add(cap);

        if (i % 3 === 0) {
          const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glowMat);
          orb.position.set(x, 1.26, z);
          group.add(orb);
        }
      } else if (cfg.propStyle === 'bamboo_grove') {
        // Multi-stalk bamboo clump with node rings & layered emerald canopy
        for (let b = 0; b < 3; b++) {
          const ox = Math.cos(a + b * 2.1) * (b === 0 ? 0 : 0.42);
          const oz = Math.sin(a + b * 2.1) * (b === 0 ? 0 : 0.42);
          const h = 3.6 + ((i + b) % 3) * 1.15;
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, h, 7), postMat);
          stalk.position.set(x + ox, h / 2, z + oz);
          stalk.rotation.z = (b - 1) * 0.04;
          group.add(stalk);

          const crown = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.35, 7), leafMat);
          crown.position.set(x + ox, h + 0.35, z + oz);
          group.add(crown);
        }
      } else if (cfg.propStyle === 'snow_peaks') {
        // Multi-tiered snow-laden pine tree + glowing ice crystal shard at base
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.24, 0.9, 7),
          new THREE.MeshStandardMaterial({ color: 0x4a382e, roughness: 0.85 }),
        );
        trunk.position.set(x, 0.45, z);
        group.add(trunk);

        for (let tier = 0; tier < 3; tier++) {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(1.18 - tier * 0.26, 1.45 - tier * 0.2, 8),
            leafMat,
          );
          cone.position.set(x, 1.15 + tier * 0.82, z);
          group.add(cone);
        }
      } else {
        // Crimson shrine pillar with crossbeam & hanging festival red lantern
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 3.2, 10), postMat);
        pillar.position.set(x, 1.6, z);
        group.add(pillar);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.55), darkRoofMat);
        cap.position.set(x, 3.28, z);
        cap.rotation.y = -a;
        group.add(cap);

        if (i % 2 === 0) {
          const lantern = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 10, 8),
            new THREE.MeshStandardMaterial({
              color: 0xff5a4d,
              emissive: 0xff3b2f,
              emissiveIntensity: 1.5,
              roughness: 0.3,
            }),
          );
          lantern.scale.set(0.9, 1.25, 0.9);
          lantern.position.set(x - Math.cos(a) * 0.35, 2.75, z - Math.sin(a) * 0.35);
          group.add(lantern);
        }
      }
    }
  }

  /**
   * Builds rich, theme-specific 3D decorative scenery across the island interior & shoreline.
   * Carefully avoids spawn (0,0,0), lantern shrines, jump pads, charms, bridge, and ramps.
   */
  private buildThemeDecorations(
    night: NightNumber,
    cfg: MapThemeConfig,
    mapDef: ReturnType<typeof getNightMapDef>,
  ): THREE.Group {
    const decor = new THREE.Group();

    // Helper: check if candidate (x, z) is safely away from all interactive gameplay objects
    const isSafeSpot = (x: number, z: number, minLanternDist = 4.6): boolean => {
      // Keep central spawn plaza clear
      if (Math.hypot(x, z) < 6.2) return false;
      // Night 2 bridge corridor & second island center
      if (night === 2) {
        if (x > 20 && x < 50 && Math.abs(z) < 5.5) return false;
        if (Math.hypot(x - 70, z) < 5.5) return false;
      }
      // Night 3 tier boundaries & ramps (30° and 150°)
      if (night === 3) {
        const r0 = Math.hypot(x, z);
        if (r0 < 26.5) return false; // Keep upper tiers & ramp landings clear
        const deg = ((Math.atan2(z, x) * 180) / Math.PI + 360) % 360;
        if (Math.abs(deg - 30) < 14 || Math.abs(deg - 150) < 14) return false;
      }
      for (const l of mapDef.lanterns) {
        if (Math.hypot(x - l.pos[0], z - l.pos[2]) < minLanternDist) return false;
      }
      for (const p of mapDef.jumpPads) {
        if (Math.hypot(x - p.pos[0], z - p.pos[2]) < 4.2) return false;
      }
      for (const c of mapDef.charms) {
        if (Math.hypot(x - c.pos[0], z - c.pos[2]) < 4.0) return false;
      }
      return true;
    };

    // Collect island centers & radii for the current night
    const islands: Array<{ cx: number; cz: number; maxR: number }> =
      night === 1
        ? [{ cx: 0, cz: 0, maxR: 35.5 }]
        : night === 2
          ? [
              { cx: 0, cz: 0, maxR: 23.5 },
              { cx: 70, cz: 0, maxR: 23.5 },
            ]
          : [{ cx: 0, cz: 0, maxR: 39.5 }];

    if (cfg.propStyle === 'standard') {
      // --- CHỦ ĐỀ 1: CỔ TÍCH CHUẨN (Đảo Bến Nước Việt Nam: Cây cổ thụ treo đèn, Hồ sen, Đèn đá, Thuyền nan) ---
      const barkMat = new THREE.MeshStandardMaterial({ color: 0x5c3e28, roughness: 0.85 });
      const foliageDarkMat = new THREE.MeshStandardMaterial({ color: 0x26634d, roughness: 0.7 });
      const foliageLightMat = new THREE.MeshStandardMaterial({ color: 0x3b8a68, roughness: 0.65 });
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7c827a, roughness: 0.88 });
      const lotusPetalMat = new THREE.MeshStandardMaterial({
        color: 0xffa6c9,
        emissive: 0xd94c86,
        emissiveIntensity: 0.55,
        roughness: 0.4,
      });
      const lotusPadMat = new THREE.MeshStandardMaterial({ color: 0x2e7d52, roughness: 0.72 });
      const warmOrbMat = new THREE.MeshStandardMaterial({
        color: 0xfff0b8,
        emissive: 0xffad3b,
        emissiveIntensity: 1.8,
      });

      for (const isl of islands) {
        // 1. Banyan / Fairy Lantern Trees & Stone Garden Lanterns
        const treeCount = night === 2 ? 7 : 12;
        for (let i = 0; i < treeCount; i++) {
          const a = (i / treeCount) * Math.PI * 2 + 0.37;
          const r = (i % 2 === 0 ? 0.44 : 0.78) * isl.maxR;
          const x = isl.cx + Math.cos(a) * r;
          const z = isl.cz + Math.sin(a) * r;
          if (!isSafeSpot(x, z)) continue;

          const tree = new THREE.Group();
          tree.position.set(x, 0, z);
          tree.rotation.y = a;

          // Curved trunk + root base
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 2.3, 8), barkMat);
          trunk.position.y = 1.15;
          trunk.castShadow = true;
          tree.add(trunk);

          // 3 layered rounded foliage puffs
          for (const [ox, oy, oz, rad, mat] of [
            [0, 2.65, 0, 1.35, foliageDarkMat],
            [0.65, 2.35, 0.35, 0.95, foliageLightMat],
            [-0.6, 2.4, -0.3, 0.9, foliageLightMat],
          ] as const) {
            const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), mat);
            canopy.scale.set(1.1, 0.72, 1.1);
            canopy.position.set(ox, oy, oz);
            canopy.castShadow = true;
            tree.add(canopy);
          }

          // Hanging tiny glowing lantern from branch
          const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), barkMat);
          cord.position.set(0.75, 1.85, 0.25);
          tree.add(cord);

          const miniLantern = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), warmOrbMat);
          miniLantern.scale.set(0.9, 1.2, 0.9);
          miniLantern.position.set(0.75, 1.52, 0.25);
          tree.add(miniLantern);

          // Mossy rocks & glowing lotus blossom at base
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), stoneMat);
          rock.scale.set(1.2, 0.65, 0.95);
          rock.position.set(-0.55, 0.18, 0.35);
          tree.add(rock);

          const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 12), lotusPadMat);
          pad.position.set(0.55, 0.03, -0.45);
          tree.add(pad);

          const lotus = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 1), lotusPetalMat);
          lotus.scale.set(1.2, 0.75, 1.2);
          lotus.position.set(0.55, 0.12, -0.45);
          tree.add(lotus);

          decor.add(tree);
        }

        // 2. Moored Traditional Wooden Sampan Boats (Thuyền nan đậu bến nước) at shoreline
        const boatAngles = night === 2 ? [1.2, 4.3] : [0.55, 2.15, 3.75, 5.25];
        for (const ba of boatAngles) {
          const bx = isl.cx + Math.cos(ba) * (isl.maxR + 3.4);
          const bz = isl.cz + Math.sin(ba) * (isl.maxR + 3.4);
          const boat = new THREE.Group();
          boat.position.set(bx, -0.25, bz);
          boat.rotation.y = -ba + Math.PI / 2;

          const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.2, 6, 12), barkMat);
          hull.rotation.z = Math.PI / 2;
          hull.scale.set(1.0, 0.48, 0.85);
          boat.add(hull);

          const canopy = new THREE.Mesh(
            new THREE.CylinderGeometry(0.52, 0.52, 1.15, 10, 1, false, 0, Math.PI),
            new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.85, side: THREE.DoubleSide }),
          );
          canopy.rotation.z = Math.PI / 2;
          canopy.position.y = 0.22;
          boat.add(canopy);

          const bowLight = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), warmOrbMat);
          bowLight.position.set(1.35, 0.36, 0);
          boat.add(bowLight);

          decor.add(boat);
        }
      }
    } else if (cfg.propStyle === 'bamboo_grove') {
      // --- CHỦ ĐỀ 2: RỪNG TRÚC SƯƠNG (Khóm trúc ngọc, Nấm linh chi phát sáng, Đèn đá Tōrō rêu phong, Cổng tre) ---
      const bambooMat = new THREE.MeshStandardMaterial({ color: 0x2e8559, roughness: 0.65 });
      const bambooNodeMat = new THREE.MeshStandardMaterial({ color: 0x62c48d, roughness: 0.55 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x45c988, roughness: 0.6 });
      const stoneMossMat = new THREE.MeshStandardMaterial({ color: 0x4b695b, roughness: 0.88 });
      const mushroomStemMat = new THREE.MeshStandardMaterial({ color: 0xd9f7e8, roughness: 0.6 });
      const mushroomCapMat = new THREE.MeshStandardMaterial({
        color: 0x5effc8,
        emissive: 0x18c98d,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      });

      for (const isl of islands) {
        const spotCount = night === 2 ? 9 : 15;
        for (let i = 0; i < spotCount; i++) {
          const a = (i / spotCount) * Math.PI * 2 + 0.24;
          const r = (i % 3 === 0 ? 0.38 : i % 3 === 1 ? 0.64 : 0.84) * isl.maxR;
          const x = isl.cx + Math.cos(a) * r;
          const z = isl.cz + Math.sin(a) * r;
          if (!isSafeSpot(x, z)) continue;

          const cluster = new THREE.Group();
          cluster.position.set(x, 0, z);
          cluster.rotation.y = a;

          if (i % 2 === 0) {
            // Multi-stalk bamboo grove with node rings + glowing bioluminescent mushrooms at base
            for (let s = 0; s < 4; s++) {
              const sx = (s - 1.5) * 0.36;
              const sz = ((s % 2) - 0.5) * 0.34;
              const h = 3.4 + (s % 3) * 1.1;
              const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.12, h, 8), bambooMat);
              stalk.position.set(sx, h / 2, sz);
              stalk.rotation.z = (s - 1.5) * 0.045;
              stalk.castShadow = true;
              cluster.add(stalk);

              // Bamboo joint rings
              for (let ny = 0.9; ny < h - 0.3; ny += 0.95) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 12), bambooNodeMat);
                ring.rotation.x = Math.PI / 2;
                ring.position.set(sx, ny, sz);
                cluster.add(ring);
              }

              const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 7), leafMat);
              foliage.position.set(sx, h + 0.35, sz);
              cluster.add(foliage);
            }

            // Glowing mushroom trio at bamboo roots
            for (const [mx, mz, sc] of [
              [0.52, 0.4, 1.0],
              [0.78, 0.22, 0.68],
              [-0.48, 0.42, 0.82],
            ] as const) {
              const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05 * sc, 0.08 * sc, 0.36 * sc, 8),
                mushroomStemMat,
              );
              stem.position.set(mx, 0.18 * sc, mz);
              cluster.add(stem);

              const cap = new THREE.Mesh(
                new THREE.SphereGeometry(0.24 * sc, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
                mushroomCapMat,
              );
              cap.position.set(mx, 0.32 * sc, mz);
              cluster.add(cap);
            }
          } else {
            // Mossy Stone Garden Lantern (Đèn đá rêu phong phát sáng ngọc lục bảo) + boulder
            const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.44, 0.35, 6), stoneMossMat);
            ped.position.y = 0.175;
            cluster.add(ped);

            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.85, 6), stoneMossMat);
            post.position.y = 0.75;
            cluster.add(post);

            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.38, 6), mushroomCapMat);
            core.position.y = 1.35;
            cluster.add(core);

            const roof = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.42, 6), stoneMossMat);
            roof.position.y = 1.72;
            cluster.add(roof);

            const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), stoneMossMat);
            boulder.scale.set(1.3, 0.72, 1.0);
            boulder.position.set(0.68, 0.24, -0.25);
            cluster.add(boulder);
          }

          decor.add(cluster);
        }
      }
    } else if (cfg.propStyle === 'snow_peaks') {
      // --- CHỦ ĐỀ 3: ĐỈNH TUYẾT BĂNG (Thông tuyết nhiều tầng, Cụm tinh thể pha lê băng phát sáng, Người tuyết đội nón lá) ---
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.55 });
      const pineDarkMat = new THREE.MeshStandardMaterial({ color: 0x386685, roughness: 0.7 });
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0xa6ecff,
        emissive: 0x29b6f6,
        emissiveIntensity: 1.35,
        roughness: 0.18,
        metalness: 0.25,
        transparent: true,
        opacity: 0.88,
      });
      const scarfRedMat = new THREE.MeshStandardMaterial({ color: 0xd92b3a, roughness: 0.5 });
      const hatStrawMat = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.72 });

      for (const isl of islands) {
        const spotCount = night === 2 ? 9 : 15;
        for (let i = 0; i < spotCount; i++) {
          const a = (i / spotCount) * Math.PI * 2 + 0.19;
          const r = (i % 3 === 0 ? 0.4 : i % 3 === 1 ? 0.65 : 0.83) * isl.maxR;
          const x = isl.cx + Math.cos(a) * r;
          const z = isl.cz + Math.sin(a) * r;
          if (!isSafeSpot(x, z)) continue;

          const node = new THREE.Group();
          node.position.set(x, 0, z);
          node.rotation.y = a;

          if (i % 3 === 0) {
            // Glowing Aurora Ice Crystal Cluster (Cụm tinh thể băng cực quang)
            const snowDrift = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), snowMat);
            snowDrift.scale.set(1.2, 0.35, 1.1);
            snowDrift.position.y = 0.08;
            node.add(snowDrift);

            for (const [cx, cz, h, rad, tiltX, tiltZ] of [
              [0, 0, 2.3, 0.32, 0.06, -0.05],
              [0.36, 0.18, 1.55, 0.22, 0.28, -0.22],
              [-0.34, 0.2, 1.4, 0.2, -0.24, 0.26],
              [0.12, -0.35, 1.15, 0.18, -0.32, -0.15],
            ] as const) {
              const shard = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6), crystalMat);
              shard.position.set(cx, h * 0.45, cz);
              shard.rotation.set(tiltX, 0, tiltZ);
              node.add(shard);
            }
          } else if (i % 3 === 1) {
            // Tall Multi-tiered Snow-covered Pine Tree
            for (let t = 0; t < 4; t++) {
              const tierPine = new THREE.Mesh(
                new THREE.ConeGeometry(1.35 - t * 0.26, 1.35 - t * 0.15, 8),
                t % 2 === 0 ? snowMat : pineDarkMat,
              );
              tierPine.position.y = 0.9 + t * 0.72;
              tierPine.castShadow = true;
              node.add(tierPine);
            }
          } else {
            // Cute Vietnamese Snowman wearing Nón Lá & Red Scarf (Người tuyết đội nón lá!)
            const bottomBall = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 12), snowMat);
            bottomBall.scale.set(1.05, 0.92, 1.05);
            bottomBall.position.y = 0.45;
            node.add(bottomBall);

            const topBall = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), snowMat);
            topBall.position.y = 1.12;
            node.add(topBall);

            const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.065, 8, 18), scarfRedMat);
            scarf.rotation.x = Math.PI / 2;
            scarf.position.y = 0.85;
            node.add(scarf);

            const hat = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.32, 18), hatStrawMat);
            hat.position.y = 1.48;
            node.add(hat);
          }

          decor.add(node);
        }
      }
    } else {
      // --- CHỦ ĐỀ 4: ĐỀN ĐỎ CHẠNG VẠNG (Cổng Torii/Tam Quan sơn son, Cây hoa anh đào/đào đỏ, Trụ đèn lễ hội) ---
      const crimsonWoodMat = new THREE.MeshStandardMaterial({ color: 0xb81d2a, roughness: 0.55 });
      const darkTileMat = new THREE.MeshStandardMaterial({ color: 0x21131a, roughness: 0.62 });
      const goldTrimMat = new THREE.MeshStandardMaterial({
        color: 0xf2c14e,
        metalness: 0.5,
        roughness: 0.3,
      });
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b1f26, roughness: 0.82 });
      const blossomMat = new THREE.MeshStandardMaterial({
        color: 0xff7a9c,
        emissive: 0xc92a52,
        emissiveIntensity: 0.55,
        roughness: 0.5,
      });
      const redLanternMat = new THREE.MeshStandardMaterial({
        color: 0xff5e4d,
        emissive: 0xff331f,
        emissiveIntensity: 1.65,
        roughness: 0.25,
      });

      for (const isl of islands) {
        const spotCount = night === 2 ? 8 : 14;
        for (let i = 0; i < spotCount; i++) {
          const a = (i / spotCount) * Math.PI * 2 + 0.31;
          const r = (i % 3 === 0 ? 0.42 : i % 3 === 1 ? 0.68 : 0.82) * isl.maxR;
          const x = isl.cx + Math.cos(a) * r;
          const z = isl.cz + Math.sin(a) * r;
          if (!isSafeSpot(x, z)) continue;

          const item = new THREE.Group();
          item.position.set(x, 0, z);
          item.rotation.y = -a + Math.PI / 2;

          if (i % 3 === 0) {
            // Traditional Crimson Shrine Gate (Cổng Tam Quan / Torii sơn đỏ thếp vàng + đèn lồng treo)
            for (const side of [-1, 1]) {
              const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.4, 10), darkTileMat);
              base.position.set(side * 1.15, 0.2, 0);
              item.add(base);

              const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 3.2, 12), crimsonWoodMat);
              col.position.set(side * 1.15, 1.8, 0);
              col.castShadow = true;
              item.add(col);

              const goldRing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 12), goldTrimMat);
              goldRing.position.set(side * 1.15, 3.2, 0);
              item.add(goldRing);
            }

            // Lower tie beam (Nuki) & Upper curved lintel (Kasagi)
            const lowerBeam = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 0.22), crimsonWoodMat);
            lowerBeam.position.y = 2.75;
            item.add(lowerBeam);

            const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.36), crimsonWoodMat);
            upperBeam.position.y = 3.38;
            item.add(upperBeam);

            const roofCap = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.16, 0.48), darkTileMat);
            roofCap.position.y = 3.55;
            item.add(roofCap);

            // Center golden plaque & two hanging glowing red festival lanterns
            const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.26), goldTrimMat);
            plaque.position.y = 3.06;
            item.add(plaque);

            for (const side of [-1, 1]) {
              const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), redLanternMat);
              lantern.scale.set(0.9, 1.25, 0.9);
              lantern.position.set(side * 0.65, 2.38, 0);
              item.add(lantern);
            }
          } else if (i % 3 === 1) {
            // Twilight Cherry / Peach Blossom Tree (Cây đào đỏ nở rộ)
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 2.1, 8), trunkMat);
            trunk.position.y = 1.05;
            trunk.castShadow = true;
            item.add(trunk);

            for (const [ox, oy, oz, rad] of [
              [0, 2.45, 0, 1.25],
              [0.62, 2.18, 0.28, 0.88],
              [-0.58, 2.22, -0.25, 0.85],
            ] as const) {
              const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), blossomMat);
              crown.scale.set(1.15, 0.72, 1.15);
              crown.position.set(ox, oy, oz);
              crown.castShadow = true;
              item.add(crown);
            }
          } else {
            // Tall Festival Lantern Stand (Trụ treo cặp đèn lồng lễ hội đỏ vàng)
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.8, 8), crimsonWoodMat);
            pole.position.y = 1.4;
            item.add(pole);

            const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.12), darkTileMat);
            arm.position.y = 2.68;
            item.add(arm);

            for (const side of [-1, 1]) {
              const globe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), redLanternMat);
              globe.scale.set(0.88, 1.28, 0.88);
              globe.position.set(side * 0.42, 2.32, 0);
              item.add(globe);
            }
          }

          decor.add(item);
        }
      }
    }

    return decor;
  }

  private buildCloudSea(night: NightNumber, cfg: MapThemeConfig): THREE.Group {
    const group = new THREE.Group();
    const cx = night === 2 ? 35 : 0;
    group.position.set(cx, 0, 0);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: cfg.cloudColor,
      emissive: cfg.cloudEmissive,
      roughness: 1.0,
      transparent: true,
      opacity: 0.8,
    });
    const sphereGeo = new THREE.IcosahedronGeometry(1, 1);
    const baseDist = night === 2 ? 78 : 54;

    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const dist = baseDist + (i % 4) * 12;
      const puff = new THREE.Mesh(sphereGeo, cloudMat);
      const sx = 9 + (i % 5) * 2.8;
      const sy = 2.8 + (i % 3) * 0.9;
      puff.scale.set(sx, sy, sx * 0.85);
      puff.position.set(Math.cos(a) * dist, -10.5 - (i % 3) * 1.5, Math.sin(a) * dist);
      group.add(puff);
    }
    return group;
  }

  /**
   * Builds a smooth, organic spline-interpolated LatheGeometry from [radius, y] control points.
   * Eliminates stiff cylindrical/conical edges on character outfits.
   */
  private createSmoothLathe(
    profile: Array<[number, number]>,
    segments = 28,
    phiStart = 0,
    phiLength = Math.PI * 2,
  ): THREE.LatheGeometry {
    const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
    const pts = curve.getPoints(22);
    const geo = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Generates a procedural pearl-white silk texture with golden lotus blossoms,
   * stems, side motifs, and traditional Ao Dai diagonal collar piping (matching reference image).
   */
  private createWhiteAoDaiLotusTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Warm pearl-white silk base
    ctx.fillStyle = '#FAF7F0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Helper to draw a multi-petal golden lotus blossom at (cx, cy) with radius r
    const drawGoldenLotus = (cx: number, cy: number, r: number, withLeaf = false): void => {
      ctx.save();
      ctx.translate(cx, cy);

      // Soft gold glow / shadow under petals
      ctx.fillStyle = '#D6A138';
      ctx.strokeStyle = '#B88220';
      ctx.lineWidth = Math.max(1.5, r * 0.05);

      // Outer & inner lotus petals (fan of pointed oval petals)
      const angles = [-1.15, -0.78, -0.42, 0.42, 0.78, 1.15, 0];
      for (const a of angles) {
        ctx.save();
        ctx.rotate(a);
        const len = a === 0 ? r * 1.05 : r * (1.0 - Math.abs(a) * 0.16);
        const wid = r * 0.27;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-wid, -len * 0.35, -wid * 0.85, -len * 0.8, 0, -len);
        ctx.bezierCurveTo(wid * 0.85, -len * 0.8, wid, -len * 0.35, 0, 0);
        ctx.closePath();
        ctx.fillStyle = Math.abs(a) < 0.5 ? '#ECC05B' : '#D9A73E';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Base small horizontal petals
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * r * 0.45, r * 0.06, r * 0.36, r * 0.14, side * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#D29E36';
        ctx.fill();
        ctx.stroke();
      }

      if (withLeaf) {
        // Lotus pad & curved stem beneath blossom
        ctx.beginPath();
        ctx.ellipse(r * 0.15, r * 0.46, r * 0.55, r * 0.16, -0.08, 0, Math.PI * 2);
        ctx.fillStyle = '#DFB24C';
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    };

    // Helper for ornate golden cloud/floral scroll on side edges
    const drawSideScroll = (cx: number, cy: number, scaleX: number, r: number): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scaleX, 1);
      ctx.strokeStyle = '#DFB14B';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, i * r * 0.45, r * (0.55 - i * 0.1), -Math.PI * 0.4, Math.PI * 0.75);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Note: In front-facing camera (+Z looking toward origin):
    // u = 0.5 (x = 256) is front center (+Z);
    // u > 0.5 (x > 256, +X) is viewer's LEFT (lantern-arm side);
    // u < 0.5 (x < 256, -X) is viewer's RIGHT (free-arm side).

    // 1. Traditional diagonal Ao Dai seam piping (from center collar curving toward lantern-arm shoulder on viewer's left)
    ctx.strokeStyle = '#E5BA54';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(256, 34);
    ctx.quadraticCurveTo(335, 58, 418, 145);
    ctx.stroke();

    // 2. Upper chest lotus blossom (viewer's right chest, x < 256) + lotus leaf pad beneath
    drawGoldenLotus(190, 210, 58, true);

    // 3. Mid-waist lotus blossom + curving stem
    ctx.strokeStyle = '#D9A73E';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(264, 365);
    ctx.quadraticCurveTo(238, 445, 275, 525);
    ctx.stroke();
    drawGoldenLotus(264, 360, 66, false);

    // 4. Side waist/hip golden floral scrolls
    drawSideScroll(378, 515, -1, 58);
    drawSideScroll(134, 625, 1, 58);

    // 5. Twin large lotus blossoms along the lower hem of the front flap with graceful arched stems
    for (const lx of [185, 328]) {
      ctx.strokeStyle = '#DFB14B';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.arc(lx, 835, 78, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      drawGoldenLotus(lx, 885, 68, false);
    }

    // Subtle golden bottom hem border line
    ctx.strokeStyle = '#E5BA54';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(60, 965);
    ctx.lineTo(452, 965);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  private buildPlayerBody(cfg: CharacterConfig): {
    body: THREE.Group;
    leftArmPivot: THREE.Group;
    handLanternPivot: THREE.Group;
    hatLight: THREE.PointLight;
  } {
    const body = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf7dec4, roughness: 0.62 });
    const cloakMat = new THREE.MeshStandardMaterial({
      color: cfg.cloakColor,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const scarfMat = new THREE.MeshStandardMaterial({
      color: cfg.scarfColor,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: cfg.hairColor, roughness: 0.72 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      metalness: 0.5,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    // Soft neck connecting torso to head
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.1, 6, 12), skinMat);
    neck.position.set(0, 1.15, 0);
    body.add(neck);

    let sleeveMat: THREE.Material = cloakMat;
    let cuffMat: THREE.Material = scarfMat;

    if (cfg.id === 'may') {
      // --- MÂY: Áo Dài Trắng Việt Nam thêu Hoa Sen Vàng (chuẩn theo ảnh mẫu) ---
      const lotusTex = this.createWhiteAoDaiLotusTexture();
      const aoDaiWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xfaf7f0,
        roughness: 0.46,
        side: THREE.DoubleSide,
      });
      const aoDaiFrontMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: lotusTex,
        roughness: 0.44,
        side: THREE.DoubleSide,
      });
      const silkPantsMat = new THREE.MeshStandardMaterial({
        color: 0xeeeAE0,
        roughness: 0.52,
        side: THREE.DoubleSide,
      });
      sleeveMat = aoDaiWhiteMat;
      cuffMat = aoDaiWhiteMat;

      // Wide-leg white/cream silk trousers (quần lụa ống rộng lộ rõ dưới tà áo & hai bên xẻ tà) + dark shoes
      const pantGeo = this.createSmoothLathe(
        [
          [0.118, 0.045],
          [0.132, 0.08],
          [0.128, 0.25],
          [0.115, 0.48],
          [0.102, 0.72],
        ],
        22,
      );
      const shoeMat = new THREE.MeshStandardMaterial({ color: 0x3b1515, roughness: 0.55 });
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(pantGeo, silkPantsMat);
        leg.position.set(side * 0.11, 0, 0);
        leg.castShadow = true;
        body.add(leg);

        const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), shoeMat);
        shoe.scale.set(0.95, 0.65, 1.35);
        shoe.position.set(side * 0.11, 0.032, 0.035);
        body.add(shoe);
      }

      // Upper torso inner core (closes the sides/back from waist y=0.68 to neck y=1.12)
      const innerTorsoGeo = this.createSmoothLathe(
        [
          [0.152, 0.68],
          [0.144, 0.79],
          [0.186, 0.95],
          [0.166, 1.06],
          [0.102, 1.12],
        ],
        28,
      );
      const innerTorso = new THREE.Mesh(innerTorsoGeo, aoDaiWhiteMat);
      innerTorso.scale.set(1.03, 1, 0.87);
      innerTorso.castShadow = true;
      body.add(innerTorso);

      // Continuous Front Áo Dài Panel (from bottom hem y=0.14 up to collar y=1.12, centered on +Z at phi=0)
      // Side slits sit on left/right hips (phi = -PI/2 and +PI/2) so wide silk trousers show on both sides!
      const frontPanelGeo = this.createSmoothLathe(
        [
          [0.235, 0.14],
          [0.218, 0.3],
          [0.192, 0.5],
          [0.162, 0.67],
          [0.147, 0.79],
          [0.191, 0.95],
          [0.17, 1.06],
          [0.105, 1.12],
        ],
        28,
        -Math.PI / 2 + 0.18,
        Math.PI - 0.36,
      );
      const frontPanel = new THREE.Mesh(frontPanelGeo, aoDaiFrontMat);
      frontPanel.scale.set(1.04, 1, 0.89);
      frontPanel.castShadow = true;
      body.add(frontPanel);

      // Flowing Back Áo Dài Panel (centered on -Z at phi=PI, from bottom hem y=0.14 to waist y=0.78)
      const backPanelGeo = this.createSmoothLathe(
        [
          [0.24, 0.14],
          [0.22, 0.3],
          [0.194, 0.5],
          [0.164, 0.67],
          [0.147, 0.78],
        ],
        24,
        Math.PI / 2 + 0.18,
        Math.PI - 0.36,
      );
      const backPanel = new THREE.Mesh(backPanelGeo, aoDaiWhiteMat);
      backPanel.scale.set(1.04, 1, 0.9);
      backPanel.castShadow = true;
      body.add(backPanel);

      // Standing Mandarin collar (cổ tàu có khe chữ V nhỏ phía trước cổ tại phi=0)
      const collarGeo = this.createSmoothLathe(
        [
          [0.106, 1.105],
          [0.1, 1.15],
          [0.102, 1.185],
        ],
        24,
        0.22,
        Math.PI * 2 - 0.44,
      );
      const collar = new THREE.Mesh(collarGeo, aoDaiWhiteMat);
      body.add(collar);
    } else if (cfg.id === 'linh') {
      // --- LINH: Hanbok Hàn Quốc (Váy Chima bầu phồng mềm mại + Áo Jeogori bo tròn) ---
      const jeogoriMat = new THREE.MeshStandardMaterial({
        color: 0xfff5f2,
        roughness: 0.48,
        side: THREE.DoubleSide,
      });
      const chimaMat = new THREE.MeshStandardMaterial({
        color: 0xd93860,
        roughness: 0.52,
        side: THREE.DoubleSide,
      });
      const ribbonMat = new THREE.MeshStandardMaterial({
        color: 0x9e193d,
        roughness: 0.42,
        side: THREE.DoubleSide,
      });
      sleeveMat = jeogoriMat;
      cuffMat = ribbonMat;

      // Tulip/Bell-curved Chima skirt (phồng tròn mềm mại, thu nhẹ ở gấu váy)
      const chimaGeo = this.createSmoothLathe(
        [
          [0.44, 0.03],
          [0.54, 0.12],
          [0.56, 0.3],
          [0.48, 0.52],
          [0.34, 0.74],
          [0.19, 0.88],
        ],
        32,
      );
      const chima = new THREE.Mesh(chimaGeo, chimaMat);
      chima.castShadow = true;
      body.add(chima);

      // Soft golden embroidery wave band along Chima lower curve
      const hemTrim = new THREE.Mesh(new THREE.TorusGeometry(0.542, 0.016, 10, 32), goldMat);
      hemTrim.rotation.x = Math.PI / 2;
      hemTrim.position.y = 0.14;
      body.add(hemTrim);

      // Rounded Empire-line Jeogori upper jacket
      const jeogoriGeo = this.createSmoothLathe(
        [
          [0.21, 0.85],
          [0.225, 0.96],
          [0.185, 1.07],
          [0.11, 1.13],
        ],
        26,
      );
      const jeogori = new THREE.Mesh(jeogoriGeo, jeogoriMat);
      jeogori.scale.set(1.05, 1, 0.92);
      jeogori.castShadow = true;
      body.add(jeogori);

      // Crossed white Dongjeong V-collar
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.16, 6, 10), scarfMat);
        lapel.position.set(side * 0.055, 1.03, 0.175);
        lapel.rotation.z = side * 0.42;
        lapel.rotation.x = -0.25;
        body.add(lapel);
      }

      // Sculpted Otgoreum bow & two curved flowing silk ribbons
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), ribbonMat);
      knot.position.set(0.04, 0.91, 0.21);
      body.add(knot);

      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.018, 8, 16), ribbonMat);
      loop.position.set(-0.02, 0.91, 0.215);
      loop.rotation.z = 0.25;
      body.add(loop);

      for (const [ox, rotZ, len] of [
        [0.05, 0.16, 0.34],
        [0.11, 0.32, 0.28],
      ] as const) {
        const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, len, 6, 10), ribbonMat);
        tail.scale.set(1.3, 1, 0.45);
        tail.position.set(ox, 0.7 - len * 0.25, 0.31);
        tail.rotation.x = -0.38;
        tail.rotation.z = rotZ;
        body.add(tail);
      }
    } else if (cfg.id === 'moc') {
      // --- MỘC: Trang phục Tinh Linh Rừng (Đầm hoa lá uốn cong & Cánh bướm tinh linh) ---
      const leafDarkMat = new THREE.MeshStandardMaterial({
        color: 0x1e6b47,
        roughness: 0.52,
        side: THREE.DoubleSide,
      });
      const leafBrightMat = new THREE.MeshStandardMaterial({
        color: 0x4be08e,
        emissive: 0x165936,
        emissiveIntensity: 0.35,
        roughness: 0.45,
        side: THREE.DoubleSide,
      });
      sleeveMat = leafBrightMat;
      cuffMat = goldMat;

      // Slender elf legs with leaf-wrapped boots
      const bootGeo = this.createSmoothLathe(
        [
          [0.045, 0.02],
          [0.068, 0.12],
          [0.058, 0.32],
          [0.072, 0.52],
        ],
        16,
      );
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(bootGeo, leafDarkMat);
        leg.position.set(side * 0.1, 0, 0);
        leg.castShadow = true;
        body.add(leg);
      }

      // Contoured hourglass forest bodice
      const bodiceGeo = this.createSmoothLathe(
        [
          [0.165, 0.62],
          [0.135, 0.78],
          [0.19, 0.95],
          [0.16, 1.07],
          [0.105, 1.13],
        ],
        26,
      );
      const bodice = new THREE.Mesh(bodiceGeo, leafDarkMat);
      bodice.scale.set(1.03, 1, 0.88);
      bodice.castShadow = true;
      body.add(bodice);

      // Curved blossom-bell inner skirt + 8 cupped organic leaf petals
      const innerBellGeo = this.createSmoothLathe(
        [
          [0.34, 0.3],
          [0.29, 0.46],
          [0.21, 0.62],
          [0.14, 0.76],
        ],
        24,
      );
      const innerSkirt = new THREE.Mesh(innerBellGeo, leafDarkMat);
      innerSkirt.castShadow = true;
      body.add(innerSkirt);

      // Soft cupped petal shells arching around the waist like an inverted flower
      const petalArcGeo = this.createSmoothLathe(
        [
          [0.38, 0.24],
          [0.34, 0.4],
          [0.25, 0.58],
          [0.145, 0.76],
        ],
        10,
        -0.34,
        0.68,
      );
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const petal = new THREE.Mesh(petalArcGeo, i % 2 === 0 ? leafBrightMat : leafDarkMat);
        petal.rotation.y = a;
        petal.position.y = (i % 2) * 0.03;
        petal.castShadow = true;
        body.add(petal);
      }

      // Golden vine belt & soft leaf collar
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.022, 10, 24), goldMat);
      belt.rotation.x = Math.PI / 2;
      belt.position.y = 0.76;
      body.add(belt);

      // Curved translucent Fairy / Elf Wings
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0xb0ffe4,
        emissive: 0x3de8a5,
        emissiveIntensity: 0.95,
        transparent: true,
        opacity: 0.64,
        side: THREE.DoubleSide,
      });
      for (const side of [-1, 1]) {
        const upperWing = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), wingMat);
        upperWing.scale.set(1.25, 0.55, 0.08);
        upperWing.position.set(side * 0.38, 1.05, -0.22);
        upperWing.rotation.y = side * -0.42;
        upperWing.rotation.z = side * 0.42;
        body.add(upperWing);

        const lowerWing = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), wingMat);
        lowerWing.scale.set(1.15, 0.52, 0.08);
        lowerWing.position.set(side * 0.28, 0.78, -0.21);
        lowerWing.rotation.y = side * -0.35;
        lowerWing.rotation.z = side * -0.28;
        body.add(lowerWing);
      }
    } else {
      // --- SAO: Công Chúa Băng Giá (Đầm dạ hội eo thon xòe chuông & Áo choàng băng uốn lượn) ---
      const iceBodiceMat = new THREE.MeshStandardMaterial({
        color: 0x66ccff,
        emissive: 0x1c659c,
        emissiveIntensity: 0.4,
        roughness: 0.22,
        metalness: 0.2,
        side: THREE.DoubleSide,
      });
      const iceGownMat = new THREE.MeshStandardMaterial({
        color: 0x3b96db,
        emissive: 0x164a7a,
        emissiveIntensity: 0.32,
        roughness: 0.28,
        side: THREE.DoubleSide,
      });
      const frostSheerMat = new THREE.MeshStandardMaterial({
        color: 0xe3f9ff,
        emissive: 0x70d6ff,
        emissiveIntensity: 0.68,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
      });
      sleeveMat = frostSheerMat;
      cuffMat = iceBodiceMat;

      // Graceful S-curved princess ballgown skirt (pinched waist -> rounded hip -> flared hem)
      const gownGeo = this.createSmoothLathe(
        [
          [0.58, 0.03],
          [0.52, 0.18],
          [0.41, 0.42],
          [0.29, 0.64],
          [0.145, 0.78],
        ],
        32,
      );
      const gown = new THREE.Mesh(gownGeo, iceGownMat);
      gown.castShadow = true;
      body.add(gown);

      // Curved translucent crystal peplum overskirt around hips
      const peplumGeo = this.createSmoothLathe(
        [
          [0.41, 0.44],
          [0.33, 0.6],
          [0.15, 0.78],
        ],
        28,
      );
      const peplum = new THREE.Mesh(peplumGeo, frostSheerMat);
      body.add(peplum);

      // Contoured royal corset bodice
      const bodiceGeo = this.createSmoothLathe(
        [
          [0.145, 0.77],
          [0.195, 0.95],
          [0.17, 1.07],
          [0.105, 1.13],
        ],
        28,
      );
      const bodice = new THREE.Mesh(bodiceGeo, iceBodiceMat);
      bodice.scale.set(1.04, 1, 0.88);
      bodice.castShadow = true;
      body.add(bodice);

      // Shimmering waist belt & snowflake gem brooch
      const iceBelt = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 10, 24), frostSheerMat);
      iceBelt.rotation.x = Math.PI / 2;
      iceBelt.position.y = 0.78;
      body.add(iceBelt);

      const iceGem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.055, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      iceGem.position.set(0, 0.98, 0.19);
      body.add(iceGem);

      // Billowing curved translucent frost cape wrapping behind shoulders
      const capeGeo = this.createSmoothLathe(
        [
          [0.56, 0.08],
          [0.45, 0.36],
          [0.31, 0.72],
          [0.18, 1.07],
        ],
        22,
        Math.PI * 0.62,
        Math.PI * 0.76,
      );
      const cape = new THREE.Mesh(capeGeo, frostSheerMat);
      body.add(cape);
    }

    // Head (chibi doll oval face matching reference image)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.35, 0);
    body.add(headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), skinMat);
    head.scale.set(1.02, 0.98, 0.96);
    head.castShadow = true;
    headGroup.add(head);

    // --- FACE: Cute Round Button Eyes, Rosy Cheeks, Tiny Button Nose, Red U-Smile ---
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x120c0e, roughness: 0.15 });
    const eyeGeo = new THREE.SphereGeometry(0.038, 12, 12);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(1.0, 1.05, 0.55);
      eye.position.set(side * 0.095, 0.018, 0.232);
      headGroup.add(eye);

      // Cute horizontal oval pink blush right below outer eye
      const cheek = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xf095a2, transparent: true, opacity: 0.68 }),
      );
      cheek.scale.set(1.35, 0.65, 0.35);
      cheek.position.set(side * 0.145, -0.036, 0.214);
      headGroup.add(cheek);
    }

    // Small cute button nose between eyes
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9ad8f, roughness: 0.65 }),
    );
    nose.scale.set(0.88, 0.95, 1.1);
    nose.position.set(0, -0.012, 0.255);
    headGroup.add(nose);

    // Happy U-shaped red smile
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.042, 0.012, 8, 18, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xb82e35, roughness: 0.42 }),
    );
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.064, 0.228);
    headGroup.add(mouth);

    // --- HAIR: Center-Parted Swept Forehead Hair, Thick Rounded Side Locks & Low Back Bun ---
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.272, 20, 16), hairMat);
    hairCap.scale.set(1.03, 1.0, 1.0);
    hairCap.position.set(0, 0.035, -0.028);
    hairCap.castShadow = true;
    headGroup.add(hairCap);

    for (const side of [-1, 1]) {
      // Smooth center-parted hair sweep across forehead under hat brim
      const bangSweep = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.16, 8, 12), hairMat);
      bangSweep.scale.set(1.0, 1.0, 0.58);
      bangSweep.position.set(side * 0.11, 0.125, 0.185);
      bangSweep.rotation.z = side * 1.18;
      bangSweep.rotation.y = side * -0.28;
      headGroup.add(bangSweep);

      // Thick cute rounded side hair locks hanging beside cheeks (matching reference image)
      const sideLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.17, 8, 12), hairMat);
      sideLock.scale.set(0.92, 1.0, 0.85);
      sideLock.position.set(side * 0.235, -0.055, 0.065);
      sideLock.rotation.z = side * 0.06;
      headGroup.add(sideLock);
    }

    // Neat low bun / ponytail at back of neck
    for (let i = 0; i < 3; i++) {
      const r = 0.125 - i * 0.02;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), hairMat);
      puff.position.set(0, -0.08 - i * 0.1, -0.21 - i * 0.02);
      headGroup.add(puff);
    }

    // --- LEFT ARM (Rounded Shoulder Puff, Tapered Sleeve & Wrist Cuff) ---
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.23, 1.01, 0.0);
    body.add(leftArmPivot);

    const leftShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.086, 12, 10), sleeveMat);
    leftShoulder.position.set(-0.02, -0.01, 0);
    leftArmPivot.add(leftShoulder);

    const leftSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.23, 8, 14), sleeveMat);
    leftSleeve.position.set(-0.065, -0.17, 0.015);
    leftSleeve.rotation.z = -0.16;
    leftSleeve.castShadow = true;
    leftArmPivot.add(leftSleeve);

    const leftCuff = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.016, 8, 16), cuffMat);
    leftCuff.rotation.x = Math.PI / 2;
    leftCuff.position.set(-0.09, -0.3, 0.02);
    leftArmPivot.add(leftCuff);

    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), skinMat);
    leftHand.position.set(-0.098, -0.365, 0.025);
    leftArmPivot.add(leftHand);

    // --- RIGHT ARM HOLDING COMPACT DARK-WOOD STICK & ROUND GLOWING LANTERN ---
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x21140f, roughness: 0.65 });
    const smallLanternMat = new THREE.MeshStandardMaterial({
      color: cfg.lanternColor,
      emissive: cfg.lanternEmissive,
      emissiveIntensity: 2.2,
      roughness: 0.22,
    });

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.23, 1.01, 0.02);
    body.add(rightArmPivot);

    const rightShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.086, 12, 10), sleeveMat);
    rightShoulder.position.set(0.02, -0.01, 0);
    rightArmPivot.add(rightShoulder);

    const rightSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.22, 8, 14), sleeveMat);
    rightSleeve.position.set(0.075, -0.1, 0.12);
    rightSleeve.rotation.x = Math.PI / 3.1;
    rightSleeve.rotation.z = 0.25;
    rightSleeve.castShadow = true;
    rightArmPivot.add(rightSleeve);

    const rightCuff = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.016, 8, 16), cuffMat);
    rightCuff.rotation.x = Math.PI / 2 - Math.PI / 3.1;
    rightCuff.position.set(0.11, -0.17, 0.22);
    rightArmPivot.add(rightCuff);

    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), skinMat);
    rightHand.position.set(0.125, -0.2, 0.27);
    rightArmPivot.add(rightHand);

    // Compact dark wooden stick held forward in right hand (matching reference image)
    const handleStick = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.22, 6, 10), darkWoodMat);
    handleStick.rotation.x = Math.PI / 2.15;
    handleStick.rotation.z = -0.12;
    handleStick.position.set(0.14, -0.19, 0.36);
    rightArmPivot.add(handleStick);

    // Hanging lantern assembly pivoting at tip of the compact stick
    const handLanternPivot = new THREE.Group();
    handLanternPivot.position.set(0.155, -0.18, 0.46);
    rightArmPivot.add(handLanternPivot);

    const hangCord = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 8), darkWoodMat);
    hangCord.position.y = -0.06;
    handLanternPivot.add(hangCord);

    const capTopRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.045, 0.018, 12),
      new THREE.MeshStandardMaterial({ color: 0xf7e7b4, emissive: 0xffc866, emissiveIntensity: 0.8 }),
    );
    capTopRing.position.y = -0.125;
    handLanternPivot.add(capTopRing);

    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.115, 0.055, 16), darkWoodMat);
    capTop.position.y = -0.155;
    handLanternPivot.add(capTop);

    const lanternBody = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), smallLanternMat);
    lanternBody.scale.set(1.0, 1.05, 1.0);
    lanternBody.position.y = -0.285;
    handLanternPivot.add(lanternBody);

    const capBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.045, 0.04, 14), darkWoodMat);
    capBottom.position.y = -0.42;
    handLanternPivot.add(capBottom);

    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.11, 8), darkWoodMat);
    tassel.position.y = -0.49;
    handLanternPivot.add(tassel);

    const hatLight = new THREE.PointLight(cfg.lightColor, 3.2, 15, 1.55);
    hatLight.position.set(0, -0.285, 0);
    handLanternPivot.add(hatLight);

    // --- CHARACTER HATS / HEADGEAR ---
    const hatMat = new THREE.MeshStandardMaterial({
      color: cfg.hatColor,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });

    if (cfg.hatStyle === 'non_la') {
      // Mây: Crisp conical Vietnamese nón lá matching reference image
      const nonLaGeo = this.createSmoothLathe(
        [
          [0.008, 0.36],
          [0.24, 0.24],
          [0.48, 0.12],
          [0.72, 0.0],
        ],
        32,
      );
      const hat = new THREE.Mesh(nonLaGeo, hatMat);
      hat.position.set(0, 1.48, -0.02);
      hat.rotation.x = -0.08;
      hat.castShadow = true;
      body.add(hat);
    } else if (cfg.hatStyle === 'scholar') {
      // Linh (Hanbok): Rounded Korean Jokduri coronet + golden Binyeo hairpin through soft low bun
      const jokduri = new THREE.Mesh(
        new THREE.SphereGeometry(0.115, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x241526, roughness: 0.45 }),
      );
      jokduri.scale.set(1.0, 0.82, 1.0);
      jokduri.position.set(0, 1.63, 0.02);
      body.add(jokduri);

      const jewel = new THREE.Mesh(
        new THREE.SphereGeometry(0.036, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff6b9a }),
      );
      jewel.position.set(0, 1.64, 0.13);
      body.add(jewel);

      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), hairMat);
      bun.position.set(0, 1.25, -0.28);
      body.add(bun);

      const binyeo = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.44, 6, 10), goldMat);
      binyeo.rotation.z = Math.PI / 2;
      binyeo.position.set(0, 1.25, -0.29);
      body.add(binyeo);
    } else if (cfg.hatStyle === 'ranger') {
      // Mộc (Tinh Linh): Smooth Tapered Elf Ears + Glowing Floral Leaf Wreath
      for (const side of [-1, 1]) {
        const elfEar = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 10), skinMat);
        elfEar.scale.set(0.65, 1, 1);
        elfEar.position.set(side * 0.29, 1.35, 0.02);
        elfEar.rotation.z = side * -1.15;
        elfEar.rotation.y = side * -0.25;
        body.add(elfEar);
      }

      const crownRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.255, 0.026, 10, 24),
        new THREE.MeshStandardMaterial({ color: 0x3ad18c, roughness: 0.48 }),
      );
      crownRing.rotation.x = Math.PI / 2 + 0.12;
      crownRing.position.set(0, 1.54, 0.0);
      body.add(crownRing);

      const blossomMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2 });
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + (i / 4) * 1.8;
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), blossomMat);
        flower.position.set(Math.sin(a) * 0.265, 1.56, Math.cos(a) * 0.265);
        body.add(flower);
      }
    } else {
      // Sao (Công Chúa Băng Giá): Curved Silver-Ice Tiara with smooth crystal teardrops
      const tiaraMat = new THREE.MeshStandardMaterial({
        color: 0xd9f7ff,
        emissive: 0x5cc8ff,
        emissiveIntensity: 0.85,
        metalness: 0.6,
        roughness: 0.2,
      });
      const tiaraBand = new THREE.Mesh(
        new THREE.TorusGeometry(0.235, 0.02, 10, 24, Math.PI * 1.2),
        tiaraMat,
      );
      tiaraBand.rotation.x = Math.PI / 2;
      tiaraBand.rotation.z = -Math.PI * 0.1;
      tiaraBand.position.set(0, 1.55, 0.02);
      body.add(tiaraBand);

      const centerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 1), tiaraMat);
      centerGem.scale.set(0.65, 1.55, 0.55);
      centerGem.position.set(0, 1.66, 0.235);
      body.add(centerGem);

      for (const side of [-1, 1]) {
        const sideGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 1), tiaraMat);
        sideGem.scale.set(0.65, 1.4, 0.55);
        sideGem.position.set(side * 0.125, 1.62, 0.2);
        sideGem.rotation.z = side * -0.25;
        body.add(sideGem);
      }
    }

    return { body, leftArmPivot, handLanternPivot, hatLight };
  }

  private buildCompass(): THREE.Group {
    const group = new THREE.Group();
    const arrowGeo = new THREE.ConeGeometry(0.22, 0.55, 4);
    arrowGeo.rotateX(Math.PI / 2);
    const arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.75 }),
    );
    arrow.position.set(0, 0.14, 1.45);
    group.add(arrow);
    return group;
  }

  private createLanternVisual(id: string, pos: Vec3): LanternVisual {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.82, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: this.mapCfg.plazaColor, roughness: 0.85 }),
    );
    base.position.y = 0.225;
    base.castShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 2.3, 8),
      new THREE.MeshStandardMaterial({ color: this.mapCfg.woodColor, roughness: 0.8 }),
    );
    pillar.position.y = 1.5;
    pillar.castShadow = true;
    group.add(pillar);

    const paperMat = new THREE.MeshStandardMaterial({
      color: this.mapCfg.lanternUnlitColor,
      emissive: 0x1a1e30,
      emissiveIntensity: 0.3,
      roughness: 0.45,
    });
    const paperMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 1.15, 8), paperMat);
    paperMesh.position.y = 3.1;
    paperMesh.castShadow = true;
    group.add(paperMesh);

    // Non-color distinction for unlit lanterns: dark tear/crack strips on paper body
    const tearGroup = new THREE.Group();
    tearGroup.position.y = 3.1;
    const tearMat = new THREE.MeshBasicMaterial({ color: 0x161822 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      const tear = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.04), tearMat);
      tear.position.set(Math.sin(a) * 0.62, (i % 2 === 0 ? 0.08 : -0.1), Math.cos(a) * 0.62);
      tear.rotation.y = a;
      tear.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.28;
      tearGroup.add(tear);
    }
    group.add(tearGroup);

    // Floating 3D Fuel Bar above lit lantern
    const fuelBarGroup = new THREE.Group();
    fuelBarGroup.position.y = 4.65;
    const fuelBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x111528, side: THREE.DoubleSide }),
    );
    const fuelFillMat = new THREE.MeshBasicMaterial({ color: 0xf2c14e, side: THREE.DoubleSide });
    const fuelFillMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14), fuelFillMat);
    fuelFillMesh.position.z = 0.015;
    fuelBarGroup.add(fuelBg, fuelFillMesh);
    fuelBarGroup.visible = false;
    group.add(fuelBarGroup);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.05, 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b2538, roughness: 0.7 }),
    );
    roof.position.y = 3.92;
    group.add(roof);

    const pointLight = new THREE.PointLight(this.mapCfg.lanternLightColor, 0, 24, 1.5);
    pointLight.position.y = 3.2;
    group.add(pointLight);

    const safeGeo = new THREE.RingGeometry(
      Math.max(0.1, this.tuning.safe_radius - 0.14),
      this.tuning.safe_radius,
      48,
    );
    safeGeo.rotateX(-Math.PI / 2);
    const safeRing = new THREE.Mesh(
      safeGeo,
      new THREE.MeshBasicMaterial({
        color: this.mapCfg.safeRingColor,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      }),
    );
    safeRing.position.y = 0.06;
    safeRing.visible = false;
    group.add(safeRing);

    const progGeo = new THREE.RingGeometry(
      this.tuning.interact_radius - 0.08,
      this.tuning.interact_radius,
      36,
    );
    progGeo.rotateX(-Math.PI / 2);
    const progressRing = new THREE.Mesh(
      progGeo,
      new THREE.MeshBasicMaterial({
        color: 0x8ea4d2,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
    );
    progressRing.position.y = 0.05;
    group.add(progressRing);

    this.scene.add(group);
    const vis: LanternVisual = {
      group,
      paperMesh,
      paperMat,
      tearGroup,
      fuelBarGroup,
      fuelFillMesh,
      fuelFillMat,
      pointLight,
      safeRing,
      progressRing,
    };
    this.lanternVisuals.set(id, vis);
    return vis;
  }

  private buildGhostMesh(kind: GhostKind): ShadeVisual {
    const group = new THREE.Group();

    // Standard Phase 2 colors for Bóng Mực: body #120A1A, rim/emissive #7A3CFF, stunned #3A3450
    let normalBodyColor = 0x120a1a;
    let normalBodyEmissive = 0x7a3cff;
    let normalEyeColor = 0xd9a8ff;
    let orbitRing: THREE.Mesh | null = null;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: normalBodyColor,
      emissive: normalBodyEmissive,
      emissiveIntensity: 0.65,
      roughness: 0.4,
      transparent: true,
      opacity: 0.93,
    });
    const eyeGeo = new THREE.SphereGeometry(0.095, 6, 6);
    const eyeLeftMat = new THREE.MeshBasicMaterial({ color: normalEyeColor });
    const eyeRightMat = new THREE.MeshBasicMaterial({ color: normalEyeColor });

    if (kind === 'ink_shade') {
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.85, 8), bodyMat);
      body.position.y = 0.25;
      body.castShadow = true;
      group.add(body);
      const eyeL = new THREE.Mesh(eyeGeo, eyeLeftMat);
      eyeL.position.set(-0.18, 0.5, 0.36);
      const eyeR = new THREE.Mesh(eyeGeo, eyeRightMat);
      eyeR.position.set(0.18, 0.5, 0.36);
      group.add(eyeL, eyeR);
    } else if (kind === 'wisp_phantom') {
      normalBodyColor = 0x0b382c;
      normalBodyEmissive = 0x17a878;
      normalEyeColor = 0xa8ffda;
      bodyMat.color.setHex(normalBodyColor);
      bodyMat.emissive.setHex(normalBodyEmissive);
      eyeLeftMat.color.setHex(normalEyeColor);
      eyeRightMat.color.setHex(normalEyeColor);

      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.58, 1), bodyMat);
      core.scale.set(0.85, 1.35, 0.85);
      core.position.y = 0.4;
      group.add(core);
      orbitRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.06, 6, 20),
        new THREE.MeshStandardMaterial({ color: 0x3ef2b2, emissive: 0x1bb880, emissiveIntensity: 1.2 }),
      );
      orbitRing.position.y = 0.4;
      orbitRing.rotation.x = Math.PI / 3;
      group.add(orbitRing);
      const eyeL = new THREE.Mesh(eyeGeo, eyeLeftMat);
      eyeL.position.set(-0.18, 0.5, 0.45);
      const eyeR = new THREE.Mesh(eyeGeo, eyeRightMat);
      eyeR.position.set(0.18, 0.5, 0.45);
      group.add(eyeL, eyeR);
    } else if (kind === 'frost_wraith') {
      normalBodyColor = 0x1e4c73;
      normalBodyEmissive = 0x3298db;
      normalEyeColor = 0xc2f6ff;
      bodyMat.color.setHex(normalBodyColor);
      bodyMat.emissive.setHex(normalBodyEmissive);
      eyeLeftMat.color.setHex(normalEyeColor);
      eyeRightMat.color.setHex(normalEyeColor);

      const torso = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), bodyMat);
      torso.scale.set(0.8, 1.65, 0.75);
      torso.position.y = 0.4;
      group.add(torso);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x9beaff, emissive: 0x45b8f5 });
      const wingGeo = new THREE.ConeGeometry(0.26, 1.35, 4);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.position.set(-0.75, 0.6, -0.1);
      wingL.rotation.z = 0.65;
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      wingR.position.set(0.75, 0.6, -0.1);
      wingR.rotation.z = -0.65;
      group.add(wingL, wingR);
      const eyeL = new THREE.Mesh(eyeGeo, eyeLeftMat);
      eyeL.position.set(-0.17, 0.6, 0.42);
      const eyeR = new THREE.Mesh(eyeGeo, eyeRightMat);
      eyeR.position.set(0.17, 0.6, 0.42);
      group.add(eyeL, eyeR);
    } else {
      normalBodyColor = 0x4f0e1b;
      normalBodyEmissive = 0x9e1b2d;
      normalEyeColor = 0xff5a5f;
      bodyMat.color.setHex(normalBodyColor);
      bodyMat.emissive.setHex(normalBodyEmissive);
      eyeLeftMat.color.setHex(normalEyeColor);
      eyeRightMat.color.setHex(normalEyeColor);

      const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.68, 1.7, 8), bodyMat);
      robe.position.y = 0.2;
      group.add(robe);
      const mask = new THREE.Mesh(
        new THREE.SphereGeometry(0.36, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xf7e6d4 }),
      );
      mask.scale.set(0.95, 1.15, 0.65);
      mask.position.set(0, 0.65, 0.22);
      group.add(mask);
      const eyeL = new THREE.Mesh(eyeGeo, eyeLeftMat);
      eyeL.position.set(-0.14, 0.7, 0.44);
      const eyeR = new THREE.Mesh(eyeGeo, eyeRightMat);
      eyeR.position.set(0.14, 0.7, 0.44);
      group.add(eyeL, eyeR);
    }

    const haloGeo = new THREE.TorusGeometry(0.55, 0.055, 6, 18);
    haloGeo.rotateX(Math.PI / 2);
    const stunHalo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
    stunHalo.position.y = 1.45;
    stunHalo.visible = false;
    group.add(stunHalo);

    return {
      group,
      bodyMat,
      eyeLeftMat,
      eyeRightMat,
      orbitRing,
      stunHalo,
      normalBodyColor,
      normalBodyEmissive,
      normalEyeColor,
    };
  }

  private createDrifterVisual(id: string): DrifterVisual {
    // Gió Lạc: Flowing grey-blue silk ribbon (#8FA3B8)
    const group = new THREE.Group();
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0x8fa3b8,
      emissive: 0x45607d,
      emissiveIntensity: 0.7,
      roughness: 0.3,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.14, 1.9), ribbonMat);
    group.add(body);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 4), ribbonMat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -1.2;
    group.add(tail);

    const stolenOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff6c2 }),
    );
    stolenOrb.position.set(0, 0.35, 0.2);
    stolenOrb.visible = false;
    group.add(stolenOrb);

    this.scene.add(group);
    const vis: DrifterVisual = { group, ribbonMat, stolenOrb };
    this.drifterVisuals.set(id, vis);
    return vis;
  }

  private createCharmVisual(id: string, pos: Vec3): CharmVisual {
    // Bùa Gió: Red talisman (#C8102E) with gold border (#F2C14E)
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1] + 1.0, pos[2]);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.92, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0xf2c14e,
        emissive: 0xb88418,
        emissiveIntensity: 0.9,
      }),
    );
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.78, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xc8102e,
        emissive: 0x8f0b20,
        emissiveIntensity: 0.8,
      }),
    );
    group.add(border, core);
    this.scene.add(group);
    const vis: CharmVisual = { group };
    this.charmVisuals.set(id, vis);
    return vis;
  }

  public spawnBurst(pos: Vec3, colorHex: number, count = 12): void {
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, mat.clone());
      mesh.position.set(pos[0], pos[1] + 0.9, pos[2]);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 2.0 + Math.random() * 3.5;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * spd, 2.5 + Math.random() * 3.0, Math.sin(a) * spd),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.3,
      });
    }
  }

  public spawnPulseRing(pos: Vec3): void {
    const geo = new THREE.RingGeometry(0.75, 1.0, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: this.characterCfg.lightColor,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1] + 0.25, pos[2]);
    this.scene.add(mesh);
    this.pulseRings.push({
      mesh,
      age: 0,
      duration: 0.38,
      maxRadius: this.tuning.pulse_radius,
    });
  }

  public resetVisuals(): void {
    for (const vis of this.lanternVisuals.values()) this.scene.remove(vis.group);
    this.lanternVisuals.clear();
    for (const mesh of this.moteMeshes.values()) this.scene.remove(mesh);
    this.moteMeshes.clear();
    for (const vis of this.shadeVisuals.values()) this.scene.remove(vis.group);
    this.shadeVisuals.clear();
    for (const vis of this.drifterVisuals.values()) this.scene.remove(vis.group);
    this.drifterVisuals.clear();
    for (const vis of this.charmVisuals.values()) this.scene.remove(vis.group);
    this.charmVisuals.clear();
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0;
    for (const r of this.pulseRings) this.scene.remove(r.mesh);
    this.pulseRings.length = 0;
    if (this.benchShadeBodies) {
      this.scene.remove(this.benchShadeBodies);
      this.benchShadeBodies = null;
    }
    if (this.benchShadeEyes) {
      this.scene.remove(this.benchShadeEyes);
      this.benchShadeEyes = null;
    }
    if (this.benchMotes) {
      this.scene.remove(this.benchMotes);
      this.benchMotes = null;
    }
  }

  public render(
    snapshot: SnapshotRecord,
    charmInfos: CharmVisualInfo[],
    camYawDeg: number,
    playerHeadingRad: number,
    invulnTimer: number,
    isMoving: boolean,
    windWarning: boolean,
    windDirDeg: number,
    frameDt: number,
  ): OffscreenArrowState {
    this.clockTime += frameDt;

    // 1. Update player
    const [px, py, pz] = snapshot.player.pos;
    this.playerGroup.position.set(px, py, pz);
    this.playerBodyGroup.rotation.y = playerHeadingRad;
    this.playerBodyGroup.position.y =
      snapshot.player.grounded && isMoving ? Math.abs(Math.sin(this.clockTime * 11)) * 0.14 : 0;

    // Natural arm swing & gentle hand-held lantern sway
    if (this.leftArmPivot) {
      this.leftArmPivot.rotation.x = isMoving ? Math.sin(this.clockTime * 11) * 0.45 : Math.sin(this.clockTime * 2) * 0.05;
    }
    if (this.handLanternPivot) {
      this.handLanternPivot.rotation.x = isMoving
        ? -0.22 + Math.sin(this.clockTime * 11) * 0.14
        : Math.sin(this.clockTime * 2.4) * 0.06;
      this.handLanternPivot.rotation.z = Math.cos(this.clockTime * 3.1) * (isMoving ? 0.1 : 0.04);
    }

    if (invulnTimer > 0) {
      this.playerBodyGroup.visible = Math.floor(this.clockTime * 16) % 2 === 0;
    } else {
      this.playerBodyGroup.visible = true;
    }

    if (this.hatLanternLight) {
      this.hatLanternLight.intensity = 2.6 + snapshot.player.carried * 0.2;
    }

    // Orbiting carried motes
    const carried = snapshot.player.carried;
    this.carriedOrbsGroup.rotation.y = this.clockTime * 1.9;
    for (let i = 0; i < this.carriedOrbs.length; i++) {
      const orb = this.carriedOrbs[i];
      if (i < carried) {
        orb.visible = true;
        const a = (i / Math.max(1, carried)) * Math.PI * 2;
        orb.position.set(
          Math.cos(a) * 0.85,
          Math.sin(this.clockTime * 3.5 + i) * 0.18,
          Math.sin(a) * 0.85,
        );
      } else {
        orb.visible = false;
      }
    }

    // Preview ghost orbit on Lobby Menu
    if (this.previewGhostGroup && this.previewGhostGroup.visible) {
      const a = this.clockTime * 0.7;
      this.previewGhostGroup.position.set(
        px + Math.cos(a) * 3.4,
        py + 1.0 + Math.sin(this.clockTime * 3.2) * 0.22,
        pz + Math.sin(a) * 3.4,
      );
      this.previewGhostGroup.rotation.y = Math.atan2(
        px - this.previewGhostGroup.position.x,
        pz - this.previewGhostGroup.position.z,
      );
    }

    // 2. Sync Lanterns (Fuel Bars, 20% Unlit Squash + Tears, 1Hz Low-Fuel Blink, Progressive Ambient)
    let litCount = 0;
    let nearestTarget: { id: string; pos: Vec3 } | null = null;
    let nearestTargetDist = Infinity;
    const blink1Hz = Math.sin(this.clockTime * Math.PI * 2) >= 0;

    for (const l of snapshot.lanterns) {
      let vis = this.lanternVisuals.get(l.id);
      if (!vis) vis = this.createLanternVisual(l.id, l.pos);
      vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);

      if (l.lit) {
        litCount++;
        const lowFuel = l.fuel < this.tuning.low_fuel_threshold;
        vis.paperMesh.scale.set(1, 1, 1);
        vis.tearGroup.visible = false;

        vis.paperMat.color.setHex(this.mapCfg.lanternCoreColor);
        vis.paperMat.emissive.setHex(this.mapCfg.lanternLitColor);
        vis.paperMat.emissiveIntensity = lowFuel
          ? blink1Hz
            ? 2.0
            : 0.35
          : 1.9 + Math.sin(this.clockTime * 3 + l.pos[0]) * 0.16;
        vis.pointLight.intensity = lowFuel ? (blink1Hz ? 13 : 3) : 16;

        // Safe zone ring ONLY visible when fuel >= 30
        vis.safeRing.visible = !lowFuel;
        vis.progressRing.visible = l.fuel < this.tuning.fuel_max;

        // Floating 3D fuel bar
        vis.fuelBarGroup.visible = !lowFuel || blink1Hz;
        vis.fuelBarGroup.lookAt(this.camera.position);
        const ratio = Math.max(0.01, Math.min(1, l.fuel / this.tuning.fuel_max));
        vis.fuelFillMesh.scale.x = ratio;
        vis.fuelFillMesh.position.x = -(1 - ratio) * 0.8;
        vis.fuelFillMat.color.setHex(
          lowFuel ? (this.colorblindMode ? 0xffffff : 0xff5a5f) : 0xf2c14e,
        );

        // If low fuel, also prioritize pointing compass toward weak lantern if closer
        if (lowFuel) {
          const d = Math.hypot(l.pos[0] - px, l.pos[2] - pz);
          if (d < nearestTargetDist) {
            nearestTargetDist = d;
            nearestTarget = { id: `${l.id}!`, pos: l.pos };
          }
        }
      } else {
        // Non-color distinction: 20% squashed paper + visible tears
        vis.paperMesh.scale.set(1, 0.8, 1);
        vis.tearGroup.visible = true;
        vis.fuelBarGroup.visible = false;

        const reqCost = l.ever_lit ? this.tuning.relight_cost : this.tuning.lantern_cost;
        const charge = l.deposited / Math.max(1, reqCost);
        vis.paperMat.color.setHex(charge > 0 ? 0xa3937d : this.mapCfg.lanternUnlitColor);
        vis.paperMat.emissive.setHex(charge > 0 ? 0x8c5618 : 0x1a1e30);
        vis.paperMat.emissiveIntensity = 0.3 + charge * 0.9;
        vis.pointLight.intensity = charge * 4;
        vis.safeRing.visible = false;
        vis.progressRing.visible = true;

        const d = Math.hypot(l.pos[0] - px, l.pos[2] - pz);
        if (d < nearestTargetDist) {
          nearestTargetDist = d;
          nearestTarget = { id: l.id, pos: l.pos };
        }
      }
    }

    const nearestUnlit = nearestTarget;
    const nearestUnlitDist = nearestTargetDist;

    if (nearestUnlit && nearestUnlitDist > this.tuning.interact_radius) {
      this.compassGroup.visible = true;
      this.compassGroup.position.set(px, py + 0.06, pz);
      this.compassGroup.rotation.y = Math.atan2(nearestUnlit.pos[0] - px, nearestUnlit.pos[2] - pz);
    } else {
      this.compassGroup.visible = false;
    }

    const targetLitRatio = litCount / Math.max(1, snapshot.lanterns.length);
    this.currentLitRatio += (targetLitRatio - this.currentLitRatio) * Math.min(1, frameDt * 2.2);
    // Exact Phase 2 formula: 0.15 + 0.55 * (lit / total)
    this.ambientLight.intensity = 0.15 + 0.55 * this.currentLitRatio;

    const skyColor = new THREE.Color(this.mapCfg.skyDark).lerp(
      new THREE.Color(this.mapCfg.skyLit),
      this.currentLitRatio,
    );
    this.scene.background = skyColor;
    this.fog.color.setHex(this.mapCfg.fogColor).lerp(skyColor, this.currentLitRatio * 0.5);
    this.fog.density =
      this.mapCfg.fogDarkDensity +
      (this.mapCfg.fogLitDensity - this.mapCfg.fogDarkDensity) * this.currentLitRatio;
    this.hemiLight.intensity = 0.45 + this.currentLitRatio * 0.65;
    this.hemiLight.color
      .setHex(this.mapCfg.hemiDarkColor)
      .lerp(new THREE.Color(this.mapCfg.hemiLitColor), this.currentLitRatio);
    this.dirLight.intensity = 0.55 + this.currentLitRatio * 0.7;
    this.dirLight.color
      .setHex(this.mapCfg.dirDarkColor)
      .lerp(new THREE.Color(this.mapCfg.dirLitColor), this.currentLitRatio);

    // 3. Sync Motes
    const activeMoteIds = new Set<string>();
    for (const m of snapshot.motes) {
      activeMoteIds.add(m.id);
      let mesh = this.moteMeshes.get(m.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.moteGeo,
          m.kind === 'dropped' ? this.droppedMoteMat : this.moteMat,
        );
        this.scene.add(mesh);
        this.moteMeshes.set(m.id, mesh);
      }
      const phase = m.pos[0] * 0.7 + m.pos[2] * 0.5;
      mesh.position.set(
        m.pos[0],
        m.pos[1] + 0.72 + Math.sin(this.clockTime * 3.2 + phase) * 0.22,
        m.pos[2],
      );
      mesh.rotation.y = this.clockTime * 1.8 + phase;
    }
    for (const [id, mesh] of this.moteMeshes.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }

    // 4. Sync Shades
    const activeShadeIds = new Set<string>();
    for (const s of snapshot.shades) {
      activeShadeIds.add(s.id);
      let vis = this.shadeVisuals.get(s.id);
      if (!vis) {
        vis = this.buildGhostMesh(this.mapCfg.ghostKind);
        this.scene.add(vis.group);
        this.shadeVisuals.set(s.id, vis);
      }
      const hover = Math.sin(this.clockTime * 4 + s.pos[0]) * 0.16;
      vis.group.position.set(s.pos[0], s.pos[1] + hover, s.pos[2]);
      if (vis.orbitRing) vis.orbitRing.rotation.z = this.clockTime * 3.2;

      if (s.state === 'stunned') {
        // Phase 2/3 standard stunned color: #3A3450
        vis.bodyMat.color.setHex(0x3a3450);
        vis.bodyMat.emissive.setHex(0x6e5f96);
        vis.eyeLeftMat.color.setHex(0xf2c14e);
        vis.eyeRightMat.color.setHex(0xf2c14e);
        vis.stunHalo.visible = true;
        vis.stunHalo.rotation.z = this.clockTime * 5;
        vis.group.rotation.y = this.clockTime * 4;
      } else {
        vis.bodyMat.color.setHex(vis.normalBodyColor);
        // Colorblind mode: Shade rim/emissive & eyes switch from #7A3CFF to #00B3FF
        const activeRim = this.colorblindMode ? 0x00b3ff : vis.normalBodyEmissive;
        const activeEye = this.colorblindMode ? 0x00b3ff : vis.normalEyeColor;
        vis.bodyMat.emissive.setHex(activeRim);
        vis.bodyMat.emissiveIntensity =
          s.state === 'drain' ? 1.25 + Math.sin(this.clockTime * 10) * 0.45 : 0.65;
        vis.eyeLeftMat.color.setHex(activeEye);
        vis.eyeRightMat.color.setHex(activeEye);
        vis.stunHalo.visible = false;
        vis.group.rotation.y = Math.atan2(px - s.pos[0], pz - s.pos[2]);
      }
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // 5. Sync Drifters (Gió Lạc)
    const activeDrifterIds = new Set<string>();
    for (const d of snapshot.drifters) {
      activeDrifterIds.add(d.id);
      let vis = this.drifterVisuals.get(d.id);
      if (!vis) vis = this.createDrifterVisual(d.id);
      vis.group.position.set(
        d.pos[0],
        d.pos[1] + Math.sin(this.clockTime * 6 + d.pos[0]) * 0.25,
        d.pos[2],
      );
      vis.group.rotation.y = Math.atan2(px - d.pos[0], pz - d.pos[2]) + (d.state === 'flee' ? Math.PI : 0);
      vis.stolenOrb.visible = d.stolen > 0;
    }
    for (const [id, vis] of this.drifterVisuals.entries()) {
      if (!activeDrifterIds.has(id)) {
        this.scene.remove(vis.group);
        this.drifterVisuals.delete(id);
      }
    }

    // 6. Sync Charms (Bùa Gió)
    const activeCharmIds = new Set<string>();
    for (const c of charmInfos) {
      activeCharmIds.add(c.id);
      let vis = this.charmVisuals.get(c.id);
      if (!vis) vis = this.createCharmVisual(c.id, c.pos);
      vis.group.visible = c.available;
      if (c.available) {
        vis.group.position.set(c.pos[0], c.pos[1] + 1.15 + Math.sin(this.clockTime * 3) * 0.2, c.pos[2]);
        vis.group.rotation.y = this.clockTime * 2.1;
      }
    }
    for (const [id, vis] of this.charmVisuals.entries()) {
      if (!activeCharmIds.has(id)) {
        this.scene.remove(vis.group);
        this.charmVisuals.delete(id);
      }
    }

    // 7. Wind leaves visual (Night 3)
    const showLeaves = snapshot.wind.active || windWarning;
    this.windLeavesGroup.visible = showLeaves;
    if (showLeaves) {
      this.windLeavesGroup.position.set(px, py, pz);
      const rad = (windDirDeg * Math.PI) / 180;
      const spd = snapshot.wind.active ? 14 : 6;
      const dx = Math.cos(rad) * spd * frameDt;
      const dz = Math.sin(rad) * spd * frameDt;
      for (const leaf of this.windLeaves) {
        leaf.position.x += dx;
        leaf.position.z += dz;
        leaf.rotation.x += frameDt * 5;
        leaf.rotation.z += frameDt * 4;
        if (Math.abs(leaf.position.x) > 18) leaf.position.x = -Math.sign(leaf.position.x) * 18;
        if (Math.abs(leaf.position.z) > 18) leaf.position.z = -Math.sign(leaf.position.z) * 18;
      }
    }

    if (this.cloudGroup) {
      this.cloudGroup.rotation.y += frameDt * 0.012;
    }

    // 8. Transient particles & pulse rings
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += frameDt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      } else {
        p.vel.y -= 9.5 * frameDt;
        p.mesh.position.addScaledVector(p.vel, frameDt);
        const t = 1 - p.life / p.maxLife;
        p.mesh.scale.setScalar(t);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      }
    }

    for (let i = this.pulseRings.length - 1; i >= 0; i--) {
      const r = this.pulseRings[i];
      r.age += frameDt;
      if (r.age >= r.duration) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.pulseRings.splice(i, 1);
      } else {
        const progress = r.age / r.duration;
        const scale = 0.5 + progress * r.maxRadius;
        r.mesh.scale.set(scale, scale, scale);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.85;
      }
    }

    // 9. Third-person camera matching Test Contract cam_yaw_deg with smooth Zoom In / Zoom Out
    this.currentZoom += (this.targetZoom - this.currentZoom) * Math.min(1, frameDt * 12);
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 11.8 * this.currentZoom;
    const camHeight = 1.35 + 5.65 * this.currentZoom;
    const lookYOffset = 1.15 + 0.25 * Math.min(1, this.currentZoom);
    let shakeX = 0;
    let shakeY = 0;
    if (this.hitShakeTimer > 0 && !this.reduceMotion) {
      this.hitShakeTimer = Math.max(0, this.hitShakeTimer - frameDt);
      const amp = this.hitShakeTimer * 1.2;
      shakeX = Math.sin(this.clockTime * 55) * amp;
      shakeY = Math.cos(this.clockTime * 48) * amp;
    }
    const desiredCamPos = new THREE.Vector3(
      px - Math.sin(theta) * camDist + shakeX,
      Math.max(-3, py) + camHeight + shakeY,
      pz - Math.cos(theta) * camDist,
    );
    const desiredLook = new THREE.Vector3(px, Math.max(-4, py) + lookYOffset, pz);

    const smooth = 1 - Math.exp(-frameDt * 10);
    this.camCurrentPos.lerp(desiredCamPos, smooth);
    this.camLookTarget.lerp(desiredLook, smooth);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camLookTarget);

    this.renderer.render(this.scene, this.camera);

    // 10. Compute off-screen edge arrow for nearest unlit lantern
    const arrowState: OffscreenArrowState = {
      visible: false,
      x: 0,
      y: 0,
      angleDeg: 0,
      lanternId: '',
    };
    if (nearestUnlit) {
      const worldPos = new THREE.Vector3(
        nearestUnlit.pos[0],
        nearestUnlit.pos[1] + 3.0,
        nearestUnlit.pos[2],
      );
      const ndc = worldPos.clone().project(this.camera);
      const isBehind = ndc.z > 1;
      const onScreen = !isBehind && Math.abs(ndc.x) <= 0.94 && Math.abs(ndc.y) <= 0.9;
      if (!onScreen) {
        let sx = isBehind ? -ndc.x : ndc.x;
        let sy = isBehind ? -ndc.y : ndc.y;
        const len = Math.hypot(sx, sy) || 1;
        sx /= len;
        sy /= len;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        const pad = 48;
        const pxScreen = Math.max(pad, Math.min(w - pad, (sx * 0.45 + 0.5) * w));
        const pyScreen = Math.max(pad + 40, Math.min(h - pad - 40, (-sy * 0.45 + 0.5) * h));
        const angleRad = Math.atan2(sx, sy);
        arrowState.visible = true;
        arrowState.x = pxScreen;
        arrowState.y = pyScreen;
        arrowState.angleDeg = (angleRad * 180) / Math.PI;
        arrowState.lanternId = nearestUnlit.id;
      }
    }
    return arrowState;
  }
}
