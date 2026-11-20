import * as THREE from 'three';
import { ISLAND_RADIUS } from '../sim/engine.ts';
import type { GameTuning, SnapshotRecord } from '../sim/types.ts';

interface LanternVisual {
  group: THREE.Group;
  paperMesh: THREE.Mesh;
  paperMat: THREE.MeshStandardMaterial;
  pointLight: THREE.PointLight;
  safeRing: THREE.Mesh;
  progressRing: THREE.Mesh;
  lit: boolean;
  deposited: number;
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  eyeLeftMat: THREE.MeshBasicMaterial;
  eyeRightMat: THREE.MeshBasicMaterial;
  stunHalo: THREE.Mesh;
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

export class GameRenderer {
  private readonly container: HTMLElement;
  private readonly tuning: GameTuning;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly fog: THREE.FogExp2;

  private readonly hemiLight: THREE.HemisphereLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly cloudGroup: THREE.Group;

  // Player (Mây)
  private readonly playerGroup: THREE.Group;
  private readonly playerBodyGroup: THREE.Group;
  private readonly hatLanternLight: THREE.PointLight;
  private readonly carriedOrbsGroup: THREE.Group;
  private readonly carriedOrbs: THREE.Mesh[] = [];

  // Diegetic compass pointing to nearest unlit lantern (Creativity feature)
  private readonly compassGroup: THREE.Group;

  // Dynamic entities
  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteMeshes = new Map<string, THREE.Mesh>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();

  // Transient VFX (strictly visual)
  private readonly particles: BurstParticle[] = [];
  private readonly pulseRings: PulseRingEffect[] = [];

  private readonly moteGeo = new THREE.OctahedronGeometry(0.32, 1);
  private readonly moteMat = new THREE.MeshStandardMaterial({
    color: 0xffd26a,
    emissive: 0xff9b26,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  private readonly particleGeo = new THREE.SphereGeometry(0.11, 6, 6);

  private clockTime = 0;
  private currentLitRatio = 0;
  private camCurrentPos = new THREE.Vector3(0, 7.5, -11);
  private camLookTarget = new THREE.Vector3(0, 1.4, 0);

  constructor(container: HTMLElement, tuning: GameTuning) {
    this.container = container;
    this.tuning = tuning;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1024);
    this.fog = new THREE.FogExp2(0x10132a, 0.0155);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      260,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // Base Lighting (progressively warms as lanterns light up)
    this.hemiLight = new THREE.HemisphereLight(0x5264a8, 0x1a1e33, 0.65);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0x9ab4ff, 0.55);
    this.dirLight.position.set(22, 42, -18);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 120;
    const d = 52;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    // Build static island, starfield & sea of clouds
    this.buildIsland();
    this.buildStars();
    this.cloudGroup = this.buildCloudSea();
    this.scene.add(this.cloudGroup);

    // Build Mây (player)
    const builtPlayer = this.buildPlayer();
    this.playerGroup = builtPlayer.root;
    this.playerBodyGroup = builtPlayer.body;
    this.hatLanternLight = builtPlayer.hatLight;
    this.carriedOrbsGroup = builtPlayer.carriedGroup;
    this.scene.add(this.playerGroup);

    // Diegetic Lantern Compass
    this.compassGroup = this.buildCompass();
    this.scene.add(this.compassGroup);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private buildIsland(): void {
    // Top walkable meadow surface at Y = 0
    const topGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.94, 3.2, 48);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x202b3d,
      roughness: 0.9,
      metalness: 0.05,
    });
    const islandTop = new THREE.Mesh(topGeo, topMat);
    islandTop.position.y = -1.6;
    islandTop.receiveShadow = true;
    this.scene.add(islandTop);

    // Tapered floating rock underside
    const underGeo = new THREE.ConeGeometry(ISLAND_RADIUS * 0.92, 16, 20);
    const underMat = new THREE.MeshStandardMaterial({
      color: 0x161a2b,
      roughness: 0.95,
    });
    const underside = new THREE.Mesh(underGeo, underMat);
    underside.rotation.x = Math.PI;
    underside.position.y = -11.2;
    this.scene.add(underside);

    // Warm stone plaza at spawn center (0, 0, 0)
    const plazaGeo = new THREE.CylinderGeometry(4.2, 4.5, 0.14, 24);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0x3b4259,
      roughness: 0.85,
    });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Subtle border rim stones around the island edge
    const postGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.9, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x393c54, roughness: 0.85 });
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(
        Math.cos(a) * (ISLAND_RADIUS - 0.6),
        0.4,
        Math.sin(a) * (ISLAND_RADIUS - 0.6),
      );
      post.castShadow = true;
      this.scene.add(post);
    }

    // 5 subtle stone stepping paths radiating to the 5 lantern positions (radius 25m)
    const stepGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.08, 8);
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x31384e, roughness: 0.9 });
    for (let l = 0; l < this.tuning.lantern_count_night1; l++) {
      const angle = (l * 2 * Math.PI) / this.tuning.lantern_count_night1;
      for (let d = 6; d <= 22; d += 3.2) {
        const stone = new THREE.Mesh(stepGeo, stepMat);
        stone.position.set(Math.sin(angle) * d, 0.02, Math.cos(angle) * d);
        stone.receiveShadow = true;
        this.scene.add(stone);
      }
    }
  }

  private buildStars(): void {
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = ((i * 73.13) % 360) * (Math.PI / 180);
      const phi = Math.acos(0.15 + ((i * 0.6180339) % 0.85));
      const r = 135;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 10;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe8bf,
      size: 0.75,
      transparent: true,
      opacity: 0.85,
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  private buildCloudSea(): THREE.Group {
    const group = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x262d4d,
      emissive: 0x101429,
      roughness: 1.0,
      transparent: true,
      opacity: 0.78,
    });
    const sphereGeo = new THREE.IcosahedronGeometry(1, 1);

    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2;
      const dist = ISLAND_RADIUS + 8 + (i % 4) * 11;
      const puff = new THREE.Mesh(sphereGeo, cloudMat);
      const sx = 8 + (i % 5) * 2.8;
      const sy = 2.6 + (i % 3) * 0.9;
      puff.scale.set(sx, sy, sx * 0.85);
      puff.position.set(
        Math.cos(a) * dist,
        -6.5 - (i % 3) * 1.8,
        Math.sin(a) * dist,
      );
      group.add(puff);
    }
    return group;
  }

  private buildPlayer(): {
    root: THREE.Group;
    body: THREE.Group;
    hatLight: THREE.PointLight;
    carriedGroup: THREE.Group;
  } {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    // Cloak / Tunic (warm indigo-teal coat)
    const cloakGeo = new THREE.ConeGeometry(0.46, 1.1, 10);
    const cloakMat = new THREE.MeshStandardMaterial({ color: 0x395b85, roughness: 0.65 });
    const cloak = new THREE.Mesh(cloakGeo, cloakMat);
    cloak.position.y = 0.62;
    cloak.castShadow = true;
    body.add(cloak);

    // Warm scarf
    const scarfGeo = new THREE.TorusGeometry(0.24, 0.08, 8, 14);
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xd96b38, roughness: 0.6 });
    const scarf = new THREE.Mesh(scarfGeo, scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.1;
    body.add(scarf);

    // Head
    const headGeo = new THREE.SphereGeometry(0.26, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf7dec4, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.32;
    head.castShadow = true;
    body.add(head);

    // Nón lá (Vietnamese conical hat)
    const hatGeo = new THREE.ConeGeometry(0.76, 0.42, 18);
    const hatMat = new THREE.MeshStandardMaterial({
      color: 0xe6c88a,
      roughness: 0.75,
      side: THREE.DoubleSide,
    });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 1.63;
    hat.castShadow = true;
    body.add(hat);

    // Small lantern hanging from front brim of Mây's nón lá
    const cordGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.24, 5);
    const cordMat = new THREE.MeshBasicMaterial({ color: 0x7c5330 });
    const cord = new THREE.Mesh(cordGeo, cordMat);
    cord.position.set(0, 1.34, 0.66);
    body.add(cord);

    const smallLanternGeo = new THREE.OctahedronGeometry(0.14, 1);
    const smallLanternMat = new THREE.MeshStandardMaterial({
      color: 0xffe49c,
      emissive: 0xffa834,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    const smallLantern = new THREE.Mesh(smallLanternGeo, smallLanternMat);
    smallLantern.position.set(0, 1.18, 0.66);
    body.add(smallLantern);

    const hatLight = new THREE.PointLight(0xffb44c, 3.2, 13, 1.6);
    hatLight.position.set(0, 1.3, 0.72);
    body.add(hatLight);

    // Orbiting miniature fireflies indicating carried motes
    const carriedGroup = new THREE.Group();
    carriedGroup.position.y = 1.15;
    root.add(carriedGroup);

    const orbGeo = new THREE.SphereGeometry(0.075, 6, 6);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffd775 });
    for (let i = 0; i < this.tuning.carry_capacity; i++) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.visible = false;
      carriedGroup.add(orb);
      this.carriedOrbs.push(orb);
    }

    return { root, body, hatLight, carriedGroup };
  }

  private buildCompass(): THREE.Group {
    const group = new THREE.Group();
    const arrowGeo = new THREE.ConeGeometry(0.22, 0.55, 4);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffc864,
      transparent: true,
      opacity: 0.72,
    });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0, 0.14, 1.45);
    group.add(arrow);
    return group;
  }

  private createLanternVisual(id: string, pos: [number, number, number]): LanternVisual {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    // Stone pedestal
    const baseGeo = new THREE.CylinderGeometry(0.62, 0.82, 0.45, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x454c66, roughness: 0.85 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.225;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Timber pillar
    const pillarGeo = new THREE.CylinderGeometry(0.22, 0.28, 2.3, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5c3e2b, roughness: 0.8 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 1.5;
    pillar.castShadow = true;
    group.add(pillar);

    // Great Lantern paper body
    const paperGeo = new THREE.CylinderGeometry(0.65, 0.55, 1.15, 8);
    const paperMat = new THREE.MeshStandardMaterial({
      color: 0x5d6785,
      emissive: 0x1a1e30,
      emissiveIntensity: 0.35,
      roughness: 0.45,
    });
    const paperMesh = new THREE.Mesh(paperGeo, paperMat);
    paperMesh.position.y = 3.1;
    paperMesh.castShadow = true;
    group.add(paperMesh);

    // Curved pagoda roof cap
    const roofGeo = new THREE.ConeGeometry(1.05, 0.6, 8);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2f2538, roughness: 0.7 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3.92;
    roof.castShadow = true;
    group.add(roof);

    // Warm PointLight (inactive until lit)
    const pointLight = new THREE.PointLight(0xffa940, 0, 22, 1.5);
    pointLight.position.y = 3.2;
    group.add(pointLight);

    // Safe-zone ground ring (exact tuning.safe_radius)
    const safeGeo = new THREE.RingGeometry(
      Math.max(0.1, this.tuning.safe_radius - 0.14),
      this.tuning.safe_radius,
      48,
    );
    safeGeo.rotateX(-Math.PI / 2);
    const safeMat = new THREE.MeshBasicMaterial({
      color: 0xffc663,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    });
    const safeRing = new THREE.Mesh(safeGeo, safeMat);
    safeRing.position.y = 0.05;
    safeRing.visible = false;
    group.add(safeRing);

    // Subtle ground interact-range ring when unlit
    const progGeo = new THREE.RingGeometry(
      this.tuning.interact_radius - 0.08,
      this.tuning.interact_radius,
      36,
    );
    progGeo.rotateX(-Math.PI / 2);
    const progMat = new THREE.MeshBasicMaterial({
      color: 0x8ea4d2,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    const progressRing = new THREE.Mesh(progGeo, progMat);
    progressRing.position.y = 0.04;
    group.add(progressRing);

    this.scene.add(group);
    const vis: LanternVisual = {
      group,
      paperMesh,
      paperMat,
      pointLight,
      safeRing,
      progressRing,
      lit: false,
      deposited: 0,
    };
    this.lanternVisuals.set(id, vis);
    return vis;
  }

  private createShadeVisual(id: string): ShadeVisual {
    const group = new THREE.Group();

    const bodyGeo = new THREE.ConeGeometry(0.62, 1.85, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a0b26,
      emissive: 0x3b0f5c,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      transparent: true,
      opacity: 0.92,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);

    const eyeGeo = new THREE.SphereGeometry(0.09, 6, 6);
    const eyeLeftMat = new THREE.MeshBasicMaterial({ color: 0xe66bff });
    const eyeRightMat = new THREE.MeshBasicMaterial({ color: 0xe66bff });
    const eyeL = new THREE.Mesh(eyeGeo, eyeLeftMat);
    eyeL.position.set(-0.18, 1.3, 0.36);
    const eyeR = new THREE.Mesh(eyeGeo, eyeRightMat);
    eyeR.position.set(0.18, 1.3, 0.36);
    group.add(eyeL, eyeR);

    // Golden dazed halo when stunned
    const haloGeo = new THREE.TorusGeometry(0.55, 0.055, 6, 18);
    haloGeo.rotateX(Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffe07a });
    const stunHalo = new THREE.Mesh(haloGeo, haloMat);
    stunHalo.position.y = 2.15;
    stunHalo.visible = false;
    group.add(stunHalo);

    this.scene.add(group);
    const vis: ShadeVisual = { group, bodyMat, eyeLeftMat, eyeRightMat, stunHalo };
    this.shadeVisuals.set(id, vis);
    return vis;
  }

  public spawnBurst(pos: [number, number, number], colorHex: number, count = 14): void {
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, mat.clone());
      mesh.position.set(pos[0], pos[1] + 0.9, pos[2]);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 2.0 + Math.random() * 3.5;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * spd, 2.5 + Math.random() * 3.2, Math.sin(a) * spd),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }
  }

  public spawnPulseRing(pos: [number, number, number]): void {
    const geo = new THREE.RingGeometry(0.75, 1.0, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd56e,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], 0.12, pos[2]);
    this.scene.add(mesh);
    this.pulseRings.push({
      mesh,
      age: 0,
      duration: 0.42,
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

    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0;

    for (const r of this.pulseRings) this.scene.remove(r.mesh);
    this.pulseRings.length = 0;
  }

  public render(
    snapshot: SnapshotRecord,
    camYawDeg: number,
    playerHeadingRad: number,
    invulnTimer: number,
    isMoving: boolean,
    frameDt: number,
  ): void {
    this.clockTime += frameDt;

    // 1. Update player (Mây)
    const [px, py, pz] = snapshot.player.pos;
    this.playerGroup.position.set(px, py, pz);
    this.playerBodyGroup.rotation.y = playerHeadingRad;
    this.playerBodyGroup.position.y =
      py <= 0.01 && isMoving ? Math.abs(Math.sin(this.clockTime * 11)) * 0.14 : 0;

    // Invulnerability blink feedback
    if (invulnTimer > 0) {
      this.playerBodyGroup.visible = Math.floor(this.clockTime * 16) % 2 === 0;
    } else {
      this.playerBodyGroup.visible = true;
    }

    // Subtle warm lantern glow strength scales with carried motes
    this.hatLanternLight.intensity = 2.6 + snapshot.player.carried * 0.22;

    // Orbiting carried motes around Mây
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

    // 2. Sync Lanterns & Progressive Atmosphere
    let litCount = 0;
    let nearestUnlit: [number, number, number] | null = null;
    let nearestUnlitDist = Infinity;

    for (const l of snapshot.lanterns) {
      let vis = this.lanternVisuals.get(l.id);
      if (!vis) {
        vis = this.createLanternVisual(l.id, l.pos);
      }
      vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);

      if (l.lit) {
        litCount++;
        vis.paperMat.color.setHex(0xffe19c);
        vis.paperMat.emissive.setHex(0xff9924);
        vis.paperMat.emissiveIntensity = 1.9 + Math.sin(this.clockTime * 3 + l.pos[0]) * 0.18;
        vis.pointLight.intensity = 16;
        vis.safeRing.visible = true;
        vis.progressRing.visible = false;
      } else {
        const charge = l.deposited / Math.max(1, this.tuning.lantern_cost);
        vis.paperMat.color.setHex(charge > 0 ? 0x9b8c78 : 0x5d6785);
        vis.paperMat.emissive.setHex(charge > 0 ? 0x7d4c16 : 0x1a1e30);
        vis.paperMat.emissiveIntensity = 0.35 + charge * 0.9;
        vis.pointLight.intensity = charge * 4;
        vis.safeRing.visible = false;
        vis.progressRing.visible = true;

        const d = Math.hypot(l.pos[0] - px, l.pos[2] - pz);
        if (d < nearestUnlitDist) {
          nearestUnlitDist = d;
          nearestUnlit = l.pos;
        }
      }
      vis.lit = l.lit;
      vis.deposited = l.deposited;
    }

    // Diegetic Compass pointing to nearest unlit lantern
    if (nearestUnlit && nearestUnlitDist > this.tuning.interact_radius) {
      this.compassGroup.visible = true;
      this.compassGroup.position.set(px, 0.04, pz);
      this.compassGroup.rotation.y = Math.atan2(nearestUnlit[0] - px, nearestUnlit[2] - pz);
    } else {
      this.compassGroup.visible = false;
    }

    // Smooth island illumination progression (0 -> 5 lit lanterns)
    const targetLitRatio = litCount / Math.max(1, snapshot.lanterns.length);
    this.currentLitRatio += (targetLitRatio - this.currentLitRatio) * Math.min(1, frameDt * 2.2);
    const skyColor = new THREE.Color(0x0d1024).lerp(new THREE.Color(0x281e3b), this.currentLitRatio);
    this.scene.background = skyColor;
    this.fog.color.copy(skyColor);
    this.fog.density = 0.0155 - this.currentLitRatio * 0.0075;
    this.hemiLight.intensity = 0.65 + this.currentLitRatio * 0.95;
    this.hemiLight.color.setHex(0x5264a8).lerp(new THREE.Color(0xffc985), this.currentLitRatio);
    this.dirLight.intensity = 0.55 + this.currentLitRatio * 0.85;
    this.dirLight.color.setHex(0x9ab4ff).lerp(new THREE.Color(0xffd28e), this.currentLitRatio);

    // 3. Sync Motes
    const activeMoteIds = new Set<string>();
    for (const m of snapshot.motes) {
      activeMoteIds.add(m.id);
      let mesh = this.moteMeshes.get(m.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.moteGeo, this.moteMat);
        this.scene.add(mesh);
        this.moteMeshes.set(m.id, mesh);
      }
      const phase = m.pos[0] * 0.7 + m.pos[2] * 0.5;
      mesh.position.set(m.pos[0], 0.72 + Math.sin(this.clockTime * 3.2 + phase) * 0.22, m.pos[2]);
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
        vis = this.createShadeVisual(s.id);
      }
      const hover = Math.sin(this.clockTime * 4 + s.pos[0]) * 0.18;
      vis.group.position.set(s.pos[0], hover, s.pos[2]);

      if (s.state === 'stunned') {
        vis.bodyMat.color.setHex(0x6b5c8c);
        vis.bodyMat.emissive.setHex(0xaa8b44);
        vis.eyeLeftMat.color.setHex(0xffe07a);
        vis.eyeRightMat.color.setHex(0xffe07a);
        vis.stunHalo.visible = true;
        vis.stunHalo.rotation.z = this.clockTime * 5;
        vis.group.rotation.y = this.clockTime * 4;
      } else {
        vis.bodyMat.color.setHex(0x1a0b26);
        vis.bodyMat.emissive.setHex(0x3b0f5c);
        vis.eyeLeftMat.color.setHex(0xe66bff);
        vis.eyeRightMat.color.setHex(0xe66bff);
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

    // 5. Gentle cloud sea drift
    this.cloudGroup.rotation.y += frameDt * 0.015;

    // 6. Update transient particles & pulse shockwave rings
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

    // 7. Third-person camera matching Test Contract cam_yaw_deg
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.8;
    const desiredCamPos = new THREE.Vector3(
      px - Math.sin(theta) * camDist,
      py + camHeight,
      pz - Math.cos(theta) * camDist,
    );
    const desiredLook = new THREE.Vector3(px, py + 1.4, pz);

    const smooth = 1 - Math.exp(-frameDt * 10);
    this.camCurrentPos.lerp(desiredCamPos, smooth);
    this.camLookTarget.lerp(desiredLook, smooth);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camLookTarget);

    this.renderer.render(this.scene, this.camera);
  }
}
