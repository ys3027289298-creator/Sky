import * as THREE from 'three';
import { PlayerShip } from '../core/ship';
import { DefenseSystem } from '../core/defense';
import { WeaponSystem, WEAPONS, updateProjectile, type Projectile, projectileHits } from '../core/weapons';
import { TargetingSystem } from '../core/targeting';
import { World, REGIONS } from '../core/world';
import { Mission, MISSION_DEFS, type MissionContext } from '../core/missions';
import { EventDirector } from '../core/events';
import { Enemy } from '../core/enemies';
import { Rng, v, dist, type Vec3 } from '../core/math';
import type { MissionId, WeaponId, SaveData, Pickup, Obstacle, EnemyKind, MissionResult } from '../core/types';
import { LEVELS, type LevelDef } from './levels';
import { buildPlayerShip, buildEnemy, buildAsteroid, buildStation, buildExplosion } from './factory';
import { InputManager } from './input';
import { audio } from './audio';

interface EnemyView {
  core: Enemy;
  mesh: THREE.Group;
}
interface ProjView {
  core: Projectile;
  mesh: THREE.Object3D;
}
interface Particle {
  points: THREE.Points;
  life: number;
  maxLife: number;
  vel: Float32Array;
}

export interface HudState {
  hull: number; hullMax: number;
  shield: number; shieldMax: number;
  armor: number; armorMax: number;
  energy: number; fuel: number;
  speed: number;
  weaponHeat: number; overheated: boolean; reloading: boolean;
  secondaryAmmo: number | null; secondaryName: string;
  primaryName: string;
  parts: { engine: number; weapon: number; radar: number };
  missionName: string; objective: string;
  timeLeft: number;
  lockProgress: number; locked: boolean; lockTargetName: string | null;
  lockDist: number; lockHull: number; lockShield: number; lockHullMax: number; lockShieldMax: number;
  lostLock: string | null;
  radarBlips: { x: number; y: number; hostile: boolean }[];
  eventTitle: string | null; eventPhase: string | null; eventCountdown: number;
  enemiesLeft: number;
  message: string | null;
  escortHp: number | null;
  stationCountdown: number | null;
  boost: boolean; evadeReady: boolean;
  crosshairHit: boolean;
}

const toV3 = (a: [number, number, number]): Vec3 => v(a[0], a[1], a[2]);

export class GameEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  input: InputManager;
  save: SaveData;

  private ship!: PlayerShip;
  private shipMesh!: THREE.Group;
  private defense!: DefenseSystem;
  private primary!: WeaponSystem;
  private secondary!: WeaponSystem;
  private secondaryChoice: WeaponId = 'missile';
  private targeting!: TargetingSystem;
  private world!: World;
  private mission!: Mission;
  private events!: EventDirector;
  private level!: LevelDef;

  private enemies: EnemyView[] = [];
  private projs: ProjView[] = [];
  private enemyProjs: ProjView[] = [];
  private particles: Particle[] = [];
  private obstacleMeshes = new Map<string, THREE.Object3D>();
  private pickupMeshes = new Map<string, THREE.Object3D>();

  private raf = 0;
  private lastT = 0;
  paused = false;
  cockpitView = false;
  showBrief = true;
  private finished = false;

  private stats = { kills: 0, shots: 0, hits: 0 };
  private scans = 0;
  private scanPoints: { pos: Vec3; scanned: boolean; mesh: THREE.Object3D }[] = [];
  private escort: { mesh: THREE.Object3D; hp: number; t: number; reached: boolean } | null = null;
  private nodes: { obs: Obstacle; mesh: THREE.Object3D }[] = [];
  private corePickup: Pickup | null = null;
  private coreMesh: THREE.Object3D | null = null;
  private towers: { obs: Obstacle; mesh: THREE.Object3D; disabled: boolean }[] = [];
  private commandView: EnemyView | null = null;
  private stationExploded = false;
  private stationCountdown: number | null = null;
  private messageTimer = 0;
  private crosshairHitTimer = 0;
  private reinforcementsQueued: { kind: EnemyKind; delay: number }[] = [];
  private repairDrones: { pos: Vec3; mesh: THREE.Object3D; cooldown: number }[] = [];
  private starField!: THREE.Points;
  private cameraRoll = 0;
  private globalTime = 0;
  private shakeAmt = 0;

  onHud: (s: HudState) => void = () => {};
  onResult: (r: MissionResult) => void = () => {};

  constructor(private container: HTMLElement, save: SaveData) {
    this.save = save;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x05060d);
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x14122a, 0.0015);
    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.1, 4000);
    this.input = new InputManager(container);
    this.input.sensitivity = save.settings.mouseSensitivity;
    this.input.invertY = save.settings.invertY;
    audio.volume = save.settings.masterVolume;
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  get missionId(): MissionId {
    return this.level.id;
  }
  get missionName(): string {
    return this.mission.def.name;
  }

  loadMission(index: number) {
    this.disposeDynamic();
    this.level = LEVELS[index];
    this.mission = new Mission(MISSION_DEFS[index]);
    this.events = new EventDirector(new Rng(2000 + index * 77));
    this.world = new World(new Rng(500 + index * 31));
    this.ship = new PlayerShip(toV3(this.level.playerStart), this.save.upgrades);
    this.defense = new DefenseSystem(this.save.upgrades);
    this.primary = new WeaponSystem(WEAPONS.dual, this.save.upgrades);
    this.secondary = new WeaponSystem(WEAPONS[this.secondaryChoice], this.save.upgrades);
    this.targeting = new TargetingSystem(this.save.upgrades.radar);
    this.stats = { kills: 0, shots: 0, hits: 0 };
    this.scans = 0;
    this.finished = false;
    this.paused = false;
    this.showBrief = true;
    this.stationExploded = false;
    this.stationCountdown = null;
    this.reinforcementsQueued = [];
    this.globalTime = 0;

    this.buildEnvironment();
    this.buildShipMesh();
    this.buildLevelObjects();

    cancelAnimationFrame(this.raf);
    this.lastT = performance.now();
    this.loop();
  }

  startMission() {
    this.showBrief = false;
    this.mission.start();
    this.input.requestLock();
    audio.ensure();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.input.exitLock();
    else this.input.requestLock();
  }

  selectSecondary(id: WeaponId) {
    if (id === this.secondaryChoice) return;
    this.secondaryChoice = id;
    this.secondary = new WeaponSystem(WEAPONS[id], this.save.upgrades);
  }

  toggleCamera() {
    this.cockpitView = !this.cockpitView;
  }

  private buildEnvironment() {
    const starCount = 2400;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 1500 + Math.random() * 1200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions.set(
        [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)],
        i * 3
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starField = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xaabbff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.9 })
    );
    this.scene.add(this.starField);

    const nebMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1a1030) },
        bottomColor: { value: new THREE.Color(0x05060d) }
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 topColor; uniform vec3 bottomColor;
        void main(){ float h = normalize(vP).y*0.5+0.5; vec3 c = mix(bottomColor, topColor, h);
        float n = sin(vP.x*0.01)*cos(vP.z*0.013)+sin(vP.y*0.02); c += vec3(0.06,0.03,0.10)*n;
        gl_FragColor = vec4(c,1.0); }`
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 16), nebMat));

    this.scene.add(new THREE.AmbientLight(0x405070, 1.2));
    const key = new THREE.DirectionalLight(0xbcd0ff, 1.5);
    key.position.set(60, 80, 40);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x5533aa, 2.2, 1000);
    rim.position.set(0, 0, -300);
    this.scene.add(rim);

    this.world.buildAsteroidBelt(toV3(this.level.asteroidsCenter), this.level.asteroids, this.level.asteroidsSpread);
    for (const o of this.world.obstacles) {
      const mesh = buildAsteroid(o.radius);
      mesh.position.set(o.pos.x, o.pos.y, o.pos.z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.userData.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.2);
      this.scene.add(mesh);
      this.obstacleMeshes.set(o.id, mesh);
    }

    if (this.level.hasStation && this.level.stationPos) {
      const station = buildStation();
      station.position.set(...this.level.stationPos);
      this.scene.add(station);
      this.obstacleMeshes.set('station', station);
      this.world.addObstacle({ id: 'station', pos: toV3(this.level.stationPos), radius: 30, kind: 'station', alive: true });
    }
  }

  private buildShipMesh() {
    this.shipMesh = buildPlayerShip();
    this.scene.add(this.shipMesh);
  }

  private spawnEnemy(kind: EnemyKind, pos: Vec3): EnemyView {
    const core = new Enemy(kind, pos);
    const mesh = buildEnemy(kind);
    mesh.position.set(pos.x, pos.y, pos.z);
    this.scene.add(mesh);
    const view = { core, mesh };
    this.enemies.push(view);
    if (kind === 'command') this.commandView = view;
    return view;
  }

  private addPickupMesh(p: Pickup) {
    const colors: Record<Pickup['kind'], number> = { fuel: 0x66ccff, ammo: 0xffcc44, repair: 0x44ff88, module: 0xff66ff };
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(p.kind === 'module' ? 1.8 : 1.3),
      new THREE.MeshBasicMaterial({ color: colors[p.kind] })
    );
    mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    const light = new THREE.PointLight(colors[p.kind], 0.8, 30);
    light.position.copy(mesh.position);
    this.scene.add(mesh);
    this.scene.add(light);
    this.pickupMeshes.set(p.id, mesh);
  }

  private buildLevelObjects() {
    const region = REGIONS[this.level.regionIndex];
    (this.scene.fog as THREE.FogExp2).color.setHex(region.fogColor);
    (this.scene.fog as THREE.FogExp2).density = region.fogDensity;

    for (const se of this.level.enemies) this.spawnEnemy(se.kind, toV3(se.pos));

    const dropKinds: Pickup['kind'][] = ['fuel', 'ammo', 'repair', 'module'];
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = 60 + Math.random() * 150;
      const pos = v(
        this.level.asteroidsCenter[0] + Math.cos(ang) * rr,
        (Math.random() - 0.5) * 80,
        this.level.asteroidsCenter[2] + Math.sin(ang) * rr
      );
      const kind = dropKinds[i % 4];
      const p: Pickup = { id: `pick-${i}`, pos, kind, amount: kind === 'module' ? 1 : 25, taken: false };
      this.addPickupMesh(p);
      this.world.addPickup(p);
    }

    for (let i = 0; i < 2; i++) {
      const pos = v(this.level.asteroidsCenter[0] + (i === 0 ? -100 : 100), 20, this.level.asteroidsCenter[2] + 50);
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(3, 0.8, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0x33ff88 })
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      const light = new THREE.PointLight(0x33ff88, 1.6, 70);
      light.position.copy(mesh.position);
      this.scene.add(mesh);
      this.scene.add(light);
      this.repairDrones.push({ pos, mesh, cooldown: 0 });
    }

    if (this.level.id === 'recon') this.buildRecon();
    if (this.level.id === 'escort') this.buildEscort();
    if (this.level.id === 'station') this.buildStationMission();
    if (this.level.id === 'final') this.buildFinal();
  }

  private makeMarker(color: number, pos: Vec3): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.8, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    m.position.set(pos.x, pos.y, pos.z);
    this.scene.add(m);
    return m;
  }

  private buildRecon() {
    const pts: Vec3[] = [v(30, 0, -300), v(-70, 20, -380), v(90, -20, -460)];
    for (const p of pts) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.4),
        new THREE.MeshBasicMaterial({ color: 0x33ddff })
      );
      mesh.position.set(p.x, p.y, p.z);
      this.scene.add(mesh);
      const light = new THREE.PointLight(0x33ddff, 1.2, 40);
      light.position.copy(mesh.position);
      this.scene.add(light);
      this.scanPoints.push({ pos: p, scanned: false, mesh });
    }
  }

  private buildEscort() {
    const mesh = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x88bb66, metalness: 0.6, roughness: 0.4, emissive: 0x113311 })
    );
    mesh.add(hull);
    for (const sx of [-1, 1]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 2.4, 8), new THREE.MeshBasicMaterial({ color: 0x66ffaa }));
      eng.rotation.x = Math.PI / 2;
      eng.position.set(sx * 2, 0, 6.5);
      mesh.add(eng);
    }
    const start = toV3(this.level.playerStart);
    mesh.position.set(start.x, 0, start.z - 30);
    this.scene.add(mesh);
    this.escort = { mesh, hp: 1, t: 0, reached: false };
  }

  private buildStationMission() {
    // 三个防御节点（可摧毁障碍）
    const c = toV3(this.level.stationPos!);
    const offsets: Vec3[] = [v(36, 12, 0), v(-30, -14, 18), v(6, 24, -28)];
    for (let i = 0; i < offsets.length; i++) {
      const pos = v(c.x + offsets[i].x, c.y + offsets[i].y, c.z + offsets[i].z);
      const obs: Obstacle = { id: `node-${i}`, pos, radius: 6, kind: 'node', hp: 60, alive: true };
      this.world.addObstacle(obs);
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(6),
        new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xaa1100, emissiveIntensity: 0.7, metalness: 0.5 })
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      this.scene.add(mesh);
      this.nodes.push({ obs, mesh });
    }
    // 能源核心
    const corePos = v(c.x, c.y + 6, c.z);
    const p: Pickup = { id: 'energy-core', pos: corePos, kind: 'module', amount: 1, taken: false };
    this.corePickup = p;
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(4),
      new THREE.MeshBasicMaterial({ color: 0x66ffff, transparent: true, opacity: 0.85 })
    );
    mesh.position.set(corePos.x, corePos.y, corePos.z);
    this.scene.add(mesh);
    const cl = new THREE.PointLight(0x66ffff, 2, 80);
    cl.position.copy(mesh.position);
    this.scene.add(cl);
    this.coreMesh = mesh;
  }

  private buildFinal() {
    const c = v(this.level.asteroidsCenter[0], this.level.asteroidsCenter[1], this.level.asteroidsCenter[2] - 60);
    for (let i = 0; i < 2; i++) {
      const pos = v(c.x + (i === 0 ? -70 : 70), c.y, c.z + 40);
      const obs: Obstacle = { id: `tower-${i}`, pos, radius: 8, kind: 'tower', hp: 120, alive: true };
      this.world.addObstacle(obs);
      const mesh = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 5, 26, 8),
        new THREE.MeshStandardMaterial({ color: 0x9944ff, emissive: 0x4400aa, emissiveIntensity: 0.6, metalness: 0.6 })
      );
      mesh.add(pole);
      const dish = new THREE.Mesh(new THREE.TorusGeometry(7, 0.8, 8, 24), new THREE.MeshBasicMaterial({ color: 0xcc66ff }));
      dish.rotation.x = Math.PI / 2;
      dish.position.y = 12;
      dish.name = 'dish';
      mesh.add(dish);
      mesh.position.set(pos.x, pos.y, pos.z);
      this.scene.add(mesh);
      this.towers.push({ obs, mesh, disabled: false });
    }
  }

  // ---------------- 主循环 ----------------
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.paused && !this.showBrief && !this.finished) {
      this.update(dt);
    } else {
      // 菜单/暂停时仍做轻微的环境动画
      this.animateEnvironment(dt);
    }
    this.syncCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.emitHud();
  };

  private animateEnvironment(dt: number) {
    this.globalTime += dt;
    for (const [, mesh] of this.obstacleMeshes) {
      const spin = mesh.userData.spin as THREE.Vector3 | undefined;
      if (spin) mesh.rotation.x += spin.x * dt, mesh.rotation.y += spin.y * dt;
    }
    if (this.starField) this.starField.rotation.y += dt * 0.004;
    for (const p of this.scanPoints) p.mesh.rotation.y += dt * 1.5;
    for (const r of this.repairDrones) r.mesh.rotation.z += dt * 1.2;
  }

  private update(dt: number) {
    this.globalTime += dt;

    // E2E 调试钩子（仅当 localStorage 标记启用），用于无头浏览器确定性验证结算流程
    if (typeof localStorage !== 'undefined' && localStorage.getItem('__e2e_success__')) {
      this.e2eSuccessTick();
    }
    if (typeof localStorage !== 'undefined' && localStorage.getItem('__e2e_fail__')) {
      this.defense.hull = 0;
    }

    // 全局按键
    if (this.input.consumePressed('KeyC')) this.toggleCamera();
    if (this.input.consumePressed('KeyR')) {
      this.primary.startReload();
      this.secondary.startReload();
    }
    if (this.input.consumePressed('Digit1')) this.selectSecondary('missile');
    if (this.input.consumePressed('Digit2')) this.selectSecondary('blast');
    if (this.input.consumePressed('KeyP') || this.input.consumePressed('Escape')) {
      this.setPaused(true);
    }

    // 飞船
    const shipInput = this.input.sampleShipInput(dt);
    if (shipInput.evade) audio.evade();
    this.ship.update(dt, shipInput, (p) => this.defense.partHealth(p));
    this.defense.update(dt);
    this.primary.update(dt);
    this.secondary.update(dt);

    // 碰撞：障碍物
    for (const o of this.world.obstacles) {
      if (!o.alive) continue;
      const impact = this.ship.resolveSphereCollision(o.pos, o.radius);
      if (impact > 4) {
        const dmg = impact * 0.9;
        this.defense.takeDamage(dmg, 'engine');
        this.shakeAmt = Math.min(1, this.shakeAmt + dmg / 60);
        audio.damage();
      }
    }

    this.handleFiring();
    this.updateLock(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickupsAndRepairs();
    this.updateMissionSpecific(dt);
    this.updateEvents(dt);
    this.updateParticles(dt);
    this.animateEnvironment(dt);
    this.syncMeshes();

    // 失败：生命归零
    if (!this.defense.alive && !this.finished) {
      this.complete(false, '飞船结构值归零，飞船解体');
    }

    // 任务逻辑
    const ctx = this.buildMissionContext();
    this.mission.update(dt, ctx);
    if (this.mission.state === 'success' && !this.finished) this.complete(true);
    if (this.mission.state === 'failed' && !this.finished) this.complete(false, this.mission.failReason ?? '任务失败');

    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (this.crosshairHitTimer > 0) this.crosshairHitTimer -= dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
  }

  private message(text: string, sec = 3) {
    this.messageTimer = sec;
    this._message = text;
  }
  private _message: string | null = null;

  private e2eSuccessTick() {
    // 直接把当前任务推到完成条件并把玩家放到撤离点
    const evac = toV3(this.level.evac);
    this.ship.pos = { ...evac };
    if (this.level.id === 'recon') this.scans = 3;
    if (this.level.id === 'escort' && this.escort) this.escort.reached = true;
    if (this.level.id === 'station') {
      for (const n of this.nodes) n.obs.alive = false;
      if (this.corePickup) {
        this.corePickup.taken = true;
        this.stationCountdown = null;
      }
    }
    if (this.level.id === 'final') {
      for (const t of this.towers) t.disabled = true;
      if (this.commandView) {
        this.commandView.core.hull = 0;
        this.commandView.core.alive = false;
      }
    }
  }

  private handleFiring() {
    // 主武器
    if (this.input.firingPrimary && this.primary.tryFire(this.defense.partHealth('weapon'))) {
      this.fireWeapon(this.primary, false);
    }
    // 副武器：右键（导弹需要锁定也可盲射）
    if (this.input.firingSecondary && this.secondary.tryFire(this.defense.partHealth('weapon'))) {
      this.fireWeapon(this.secondary, true);
      this.input.firingSecondary = false;
    }
  }

  private fireWeapon(ws: WeaponSystem, secondary: boolean) {
    const spec = ws.spec;
    const origin = v(
      this.ship.pos.x + this.ship.right.x * 0.9,
      this.ship.pos.y - 0.3,
      this.ship.pos.z
    );
    // 双联：两发轻微散布
    const shots = spec.id === 'dual' ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const spread = spec.id === 'dual' ? (i === 0 ? -0.012 : 0.012) : (Math.random() - 0.5) * 0.01;
      const dir = {
        x: this.ship.forward.x + this.ship.right.x * spread,
        y: this.ship.forward.y + this.ship.right.y * spread,
        z: this.ship.forward.z + this.ship.right.z * spread
      };
      const len0 = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const nd = v(dir.x / len0, dir.y / len0, dir.z / len0);
      let targetId: string | null = null;
      if (spec.homing) {
        targetId = this.targeting.locked ? this.targeting.current!.id : null;
        if (spec.id === 'missile' && !targetId) {
          // 未锁定也可发射，但无追踪
        }
      }
      const core = ws.makeProjectile(origin, nd, targetId);
      const geo =
        spec.id === 'blast'
          ? new THREE.SphereGeometry(1.1, 8, 8)
          : new THREE.CapsuleGeometry(0.22, spec.homing ? 1.4 : 0.9, 4, 6);
      const color = spec.id === 'dual' ? 0x88ddff : spec.id === 'pulse' ? 0xffee66 : spec.id === 'missile' ? 0xff9944 : 0xff5522;
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(core.pos.x, core.pos.y, core.pos.z);
      this.scene.add(mesh);
      const light = new THREE.PointLight(color, 1.2, 24);
      mesh.add(light);
      this.projs.push({ core, mesh });
      this.stats.shots++;
    }
    if (spec.id === 'dual') audio.shootPrimary();
    else if (spec.id === 'pulse') audio.shootPulse();
    else if (spec.id === 'missile') audio.shootMissile();
    else audio.shootBlast();
  }

  private updateLock(dt: number) {
    const cycle = this.input.consumePressed('KeyT') || false;
    const candidates: import('../core/targeting').LockTarget[] = this.enemies
      .filter((e) => e.core.alive)
      .map((e) => ({
        id: e.core.id,
        pos: e.core.pos,
        radius: e.core.spec.radius,
        alive: e.core.alive,
        jamming: this.towersActive() ? 0.8 : e.core.jamming
      }));
    this.targeting.setCandidates(candidates);
    let cycleTarget: import('../core/targeting').LockTarget | null = null;
    if (cycle) cycleTarget = this.targeting.acquire(this.ship.pos, this.ship.forward, this.world.obstacles, true);
    // 右键按住保持锁定
    const wantLock = this.input.lockHeld;
    this.targeting.update(dt, this.ship.pos, this.ship.forward, this.world.obstacles, wantLock || this.targeting.locked, cycleTarget);
    if (this.targeting.locked && this._wasNotLocked) audio.lock();
    this._wasNotLocked = !this.targeting.locked;
  }
  private _wasNotLocked = true;

  private towersActive(): boolean {
    return this.towers.some((t) => !t.disabled);
  }

  private updateEnemies(dt: number) {
    const fx = this.events.activeEffects;
    const obs = this.world.obstacles.map((o) => ({ pos: o.pos, radius: o.radius }));
    for (const ev of this.enemies) {
      const e = ev.core;
      if (!e.alive) continue;
      e.spec = { ...e.spec, speed: e.spec.speed }; // 保持当前（引擎受损）速度
      const canSee = !this.world.lineBlocked(e.pos, this.ship.pos);
      const fire = e.update(dt, this.ship.pos, canSee, obs);
      if (fire) {
        this.spawnEnemyShot(fire.origin, fire.dir, fire.damage * fx.enemyDamageMul, fire.missile);
      }
    }

    // 事件增援
    for (const r of this.reinforcementsQueued) {
      r.delay -= dt;
      if (r.delay <= 0) {
        const ang = Math.random() * Math.PI * 2;
        const pos = v(this.ship.pos.x + Math.cos(ang) * 90, this.ship.pos.y + (Math.random() - 0.5) * 40, this.ship.pos.z + Math.sin(ang) * 90);
        this.spawnEnemy(r.kind, pos);
        this.message('敌方增援已跃入战区！', 2.5);
      }
    }
    this.reinforcementsQueued = this.reinforcementsQueued.filter((r) => r.delay > 0);
  }

  private spawnEnemyShot(origin: Vec3, dir: Vec3, damage: number, missile: boolean) {
    const speed = missile ? 90 : 180;
    const core: Projectile = {
      id: Math.floor(Math.random() * 1e9),
      weapon: missile ? 'missile' : 'pulse',
      pos: { ...origin },
      vel: v(dir.x * speed, dir.y * speed, dir.z * speed),
      damage,
      splashRadius: missile ? 8 : 0,
      homing: missile,
      targetId: null,
      life: 3.2,
      fromPlayer: false,
      dead: false
    };
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(missile ? 0.9 : 0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: missile ? 0xff4488 : 0xff6644 })
    );
    mesh.position.set(origin.x, origin.y, origin.z);
    this.scene.add(mesh);
    this.enemyProjs.push({ core, mesh });
  }

  private updateProjectiles(dt: number) {
    // 玩家弹丸
    for (const pv of this.projs) {
      const p = pv.core;
      let targetPos: Vec3 | null = null;
      if (p.homing && p.targetId) {
        const t = this.enemies.find((e) => e.core.id === p.targetId && e.core.alive);
        if (t) targetPos = t.core.pos;
        else p.targetId = null;
      }
      updateProjectile(p, dt, targetPos);

      // 撞障碍物
      for (const o of this.world.obstacles) {
        if (!o.alive) continue;
        if (projectileHits(p, o.pos, o.radius)) {
          p.dead = true;
          if (o.hp !== undefined) this.damageObstacle(o, p.damage, pv.mesh);
          else this.spawnExplosion(p.pos, p.splashRadius > 0 ? 1.2 : 0.5);
          break;
        }
      }
      // 撞敌人
      if (!p.dead) {
        for (const ev of this.enemies) {
          const e = ev.core;
          if (!e.alive) continue;
          if (projectileHits(p, e.pos, e.spec.radius)) {
            p.dead = true;
            this.stats.hits++;
            this.crosshairHitTimer = 0.12;
            // 部位判定（相对命中高度）
            let part: 'turret' | 'engine' | 'shieldNode' | 'hull' = 'hull';
            if (e.spec.kind === 'command') {
              const localY = (p.pos.y - e.pos.y) / e.spec.radius;
              part = localY > 0.35 ? 'turret' : localY < -0.35 ? 'engine' : 'shieldNode';
            }
            e.damage(p.damage, part);
            audio.hit();
            if (p.splashRadius > 0) {
              this.spawnExplosion(p.pos, 2);
              // 范围伤害
              for (const other of this.enemies) {
                if (other.core.alive && other.core.id !== e.id && dist(other.core.pos, p.pos) < p.splashRadius) {
                  other.core.damage(p.damage * 0.5);
                }
              }
            } else {
              this.spawnExplosion(p.pos, 0.4);
            }
            if (!e.alive) this.killEnemy(ev);
            break;
          }
        }
      }
    }

    // 敌方弹丸
    for (const pv of this.enemyProjs) {
      const p = pv.core;
      if (p.homing) updateProjectile(p, dt, this.ship.pos);
      else updateProjectile(p, dt, null);
      let blocked = false;
      for (const o of this.world.obstacles) {
        if (o.alive && projectileHits(p, o.pos, o.radius)) {
          blocked = true;
          break;
        }
      }
      if (!blocked && projectileHits(p, this.ship.pos, this.ship.radius)) {
        p.dead = true;
        this.defense.takeDamage(p.damage, Math.random() < 0.3 ? 'engine' : 'hull');
        audio.damage();
        this.shakeAmt = Math.min(1, this.shakeAmt + 0.25);
      }
      if (blocked) {
        p.dead = true;
        this.spawnExplosion(p.pos, 0.4);
      }
    }

    // 清理
    this.projs = this.projs.filter((pv) => {
      if (pv.core.dead) {
        this.scene.remove(pv.mesh);
        (pv.mesh as THREE.Mesh).geometry?.dispose();
        return false;
      }
      return true;
    });
    this.enemyProjs = this.enemyProjs.filter((pv) => {
      if (pv.core.dead) {
        this.scene.remove(pv.mesh);
        (pv.mesh as THREE.Mesh).geometry?.dispose();
        return false;
      }
      return true;
    });
  }

  private damageObstacle(o: Obstacle, dmg: number, fromMesh: THREE.Object3D) {
    if (o.hp === undefined) return;
    o.hp -= dmg;
    this.spawnExplosion(fromMesh.position, 0.6);
    if (o.kind === 'node') {
      const rec = this.nodes.find((n) => n.obs.id === o.id);
      if (rec) (rec.mesh as THREE.Mesh).scale.setScalar(1 + 0.05 * Math.sin(this.globalTime * 20));
    }
    if (o.hp <= 0) {
      o.alive = false;
      const mesh = this.obstacleMeshes.get(o.id);
      const pos = mesh ? mesh.position : new THREE.Vector3(o.pos.x, o.pos.y, o.pos.z);
      this.spawnExplosion(v(pos.x, pos.y, pos.z), 1.8);
      audio.explosion();
      if (o.kind === 'node') {
        const rec = this.nodes.find((n) => n.obs.id === o.id);
        if (rec) this.scene.remove(rec.mesh);
      }
      if (o.kind === 'tower') {
        const rec = this.towers.find((t) => t.obs.id === o.id);
        if (rec) {
          rec.disabled = true;
          rec.mesh.visible = false;
          this.message('干扰塔已关闭！锁定恢复正常。', 2.5);
        }
      }
    }
  }

  private killEnemy(ev: EnemyView) {
    this.stats.kills++;
    this.spawnExplosion(ev.core.pos, ev.core.spec.kind === 'command' ? 5 : 1.2);
    audio.explosion();
    this.shakeAmt = Math.min(1, this.shakeAmt + (ev.core.spec.kind === 'command' ? 0.9 : 0.2));
    ev.mesh.visible = false;
    // 掉落
    const drop = ev.core.spec.resourceDrop;
    const kinds: Pickup['kind'][] = ['ammo', 'fuel', 'repair'];
    const kind = kinds[Math.floor(Math.random() * 3)];
    const p: Pickup = {
      id: `drop-${Math.random().toString(36).slice(2, 7)}`,
      pos: { ...ev.core.pos },
      kind,
      amount: Math.round(drop / 2) + 10,
      taken: false
    };
    this.world.addPickup(p);
    this.addPickupMesh(p);
    if (ev.core.spec.kind === 'command') {
      this.message('指挥舰已击毁！立即撤离！', 4);
    }
  }

  private spawnExplosion(pos: Vec3, scale: number) {
    const { points, life } = buildExplosion(scale);
    points.position.set(pos.x, pos.y, pos.z);
    this.scene.add(points);
    const vel = points.geometry.getAttribute('velocity') as THREE.BufferAttribute;
    this.particles.push({ points, life, maxLife: life, vel: vel.array as Float32Array });
  }

  private updatePickupsAndRepairs() {
    const got = this.world.collectPickups(this.ship.pos, this.ship.radius);
    for (const p of got) {
      let text = '';
      switch (p.kind) {
        case 'fuel':
          this.ship.fuel = Math.min(this.ship.maxFuel, this.ship.fuel + p.amount);
          text = `+${p.amount} 燃料`;
          break;
        case 'ammo':
          this.secondary.addAmmo(p.amount);
          text = `+${p.amount} 副武器弹药`;
          break;
        case 'repair':
          this.defense.repair(p.amount);
          text = `维修 +${p.amount}`;
          break;
        case 'module':
          if (p.id === 'energy-core') {
            text = '取得能源核心！立即撤离！';
          } else {
            this.save.resources += 5;
            text = '获得升级模块（+5 改装资源）';
          }
          break;
      }
      this.message(text, 2.5);
      audio.pickup();
      const mesh = this.pickupMeshes.get(p.id);
      if (mesh) {
        this.scene.remove(mesh);
        this.pickupMeshes.delete(p.id);
      }
      if (p.id === 'energy-core') {
        // 取得核心 -> 开始爆炸倒计时
        this.stationCountdown = 35;
        if (this.coreMesh) this.coreMesh.visible = false;
      }
    }

    // 维修点
    for (const r of this.repairDrones) {
      r.cooldown = Math.max(0, r.cooldown - 0.016);
      if (dist(this.ship.pos, r.pos) < 12) {
        // 消耗能量换完整维修（每 4 秒一次）
        if (r.cooldown <= 0 && this.ship.energy > 30 && (this.defense.hull < this.defense.cfg.maxHull - 5 || this.defense.armor < this.defense.cfg.maxArmor - 5)) {
          this.ship.energy -= 30;
          this.defense.fullRepair();
          this.ship.fuel = Math.min(this.ship.maxFuel, this.ship.fuel + 25);
          r.cooldown = 4;
          this.message('维修点：装甲与部件已修复，燃料补给 +25', 3);
          audio.pickup();
        }
      }
    }
  }

  private updateMissionSpecific(dt: number) {
    // 扫描点
    for (const sp of this.scanPoints) {
      sp.mesh.rotation.y += dt * 1.5;
      if (!sp.scanned && dist(this.ship.pos, sp.pos) < 16) {
        sp.scanned = true;
        this.scans++;
        (sp.mesh as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x33ff88 });
        this.message(`信标扫描完成 ${this.scans}/3`, 2.5);
        audio.lock();
      }
    }

    // 护航
    if (this.escort) {
      const e = this.escort;
      const start = toV3(this.level.playerStart);
      const end = toV3(this.level.evac);
      const routeLen = dist(start, end);
      const speed = this.events.activeEffects.routeLonger ? 26 : 34;
      e.t += (speed * dt) / routeLen;
      if (e.t >= 1) {
        e.t = 1;
        e.reached = true;
      }
      const pos = v(
        start.x + (end.x - start.x) * e.t,
        Math.sin(this.globalTime * 0.8) * 4,
        start.z + (end.z - start.z) * e.t
      );
      e.mesh.position.set(pos.x, pos.y, pos.z);
      // 敌人靠近运输船 -> 掉血
      for (const ev of this.enemies) {
        if (ev.core.alive && dist(ev.core.pos, pos) < 30) {
          e.hp -= dt * 0.03;
        }
      }
      if (e.hp <= 0) {
        e.hp = 0;
        this.spawnExplosion(pos, 3);
      }
    }

    // 空间站爆炸倒计时
    if (this.stationCountdown !== null) {
      this.stationCountdown -= dt;
      if (this.stationCountdown <= 0) {
        // 玩家若仍在空间站附近 -> 爆炸失败
        const c = toV3(this.level.stationPos!);
        if (dist(this.ship.pos, c) < 90) {
          this.stationExploded = true;
        }
        this.stationCountdown = null;
      }
    }
  }

  private updateEvents(dt: number) {
    const warned = this.events.update(dt, this.level.id);
    if (warned) {
      this.message(`⚠ ${warned.title}：${warned.description}（按 1 规避 / 2 迎战 / 3 加固）`, warned.countdownSec + 0.5);
      audio.alarm();
    }
    // 玩家应对
    if (this.input.consumePressed('Numpad1') || this.input.consumePressed('BracketLeft')) this.events.choose('evade');
    // 简化：用 Y 规避、X 迎战、V 加固，避免与武器键冲突
    if (this.input.consumePressed('KeyY')) this.events.choose('evade');
    if (this.input.consumePressed('KeyX')) this.events.choose('engage');
    if (this.input.consumePressed('KeyV')) this.events.choose('fortify');

    const cur = this.events.current;
    if (cur) {
      if (cur.phase === 'warning') {
        // 倒计时提示
      } else {
        const fx = cur.effects;
        // 生效：护盾流失、雾效、震屏
        if (fx.shieldDrainPerSec > 0) {
          this.defense.shield = Math.max(0, this.defense.shield - fx.shieldDrainPerSec * dt);
        }
        this.shakeAmt = Math.min(1, this.shakeAmt + fx.shake * dt);
        const fog = this.scene.fog as THREE.FogExp2;
        fog.density = REGIONS[this.level.regionIndex].fogDensity / fx.visibilityMul;
      }
      // 激活瞬间刷增援
      if (cur.phase === 'active' && !cur.activated) {
        cur.activated = true;
        const count = cur.effects.spawnReinforcements;
        for (let i = 0; i < count; i++) {
          const kind = this.level.reinforcementKinds[i % this.level.reinforcementKinds.length];
          this.reinforcementsQueued.push({ kind, delay: 1 + i * 1.2 });
        }
        // 陨石带偏移
        if (cur.kind === 'asteroidShift') {
          this.world.shiftAsteroids(v(18, 6, 0));
          for (const o of this.world.obstacles) {
            const m = this.obstacleMeshes.get(o.id);
            if (m && o.kind === 'asteroid') m.position.set(o.pos.x, o.pos.y, o.pos.z);
          }
        }
      }
    } else {
      const fog = this.scene.fog as THREE.FogExp2;
      fog.density += (REGIONS[this.level.regionIndex].fogDensity - fog.density) * dt;
    }
  }

  private updateParticles(dt: number) {
    for (const pt of this.particles) {
      pt.life -= dt;
      const attr = pt.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        attr.setXYZ(
          i,
          attr.getX(i) + pt.vel[i * 3] * dt,
          attr.getY(i) + pt.vel[i * 3 + 1] * dt,
          attr.getZ(i) + pt.vel[i * 3 + 2] * dt
        );
      }
      attr.needsUpdate = true;
      (pt.points.material as THREE.PointsMaterial).opacity = Math.max(0, pt.life / pt.maxLife);
    }
    this.particles = this.particles.filter((pt) => {
      if (pt.life <= 0) {
        this.scene.remove(pt.points);
        pt.points.geometry.dispose();
        (pt.points.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }

  private syncMeshes() {
    // 飞船
    this.shipMesh.position.set(this.ship.pos.x, this.ship.pos.y, this.ship.pos.z);
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(this.ship.right.x, this.ship.right.y, this.ship.right.z),
      new THREE.Vector3(this.ship.up.x, this.ship.up.y, this.ship.up.z),
      new THREE.Vector3(-this.ship.forward.x, -this.ship.forward.y, -this.ship.forward.z)
    );
    this.shipMesh.quaternion.setFromRotationMatrix(m);
    this.shipMesh.rotateZ(this.ship.rollVisual);
    // 引擎尾焰随冲刺变化
    const flameScale = this.ship.boostActive ? 2.2 : 1;
    this.shipMesh.traverse((o) => {
      if (o.name === 'flame') o.scale.z = flameScale * (0.8 + Math.random() * 0.4);
    });

    // 敌人
    for (const ev of this.enemies) {
      if (!ev.core.alive) continue;
      ev.mesh.position.set(ev.core.pos.x, ev.core.pos.y, ev.core.pos.z);
      const f = ev.core.forward;
      ev.mesh.lookAt(ev.mesh.position.x + f.x, ev.mesh.position.y + f.y, ev.mesh.position.z + f.z);
      // 指挥舰部件损毁视觉
      if (ev.core.parts) {
        ev.mesh.traverse((o) => {
          if (o.name === 'turret' && ev.core.parts!.turret <= 0) (o as THREE.Mesh).visible = false;
          if (o.name === 'engine' && ev.core.parts!.engine <= 0) (o as THREE.Mesh).visible = false;
          if (o.name === 'shieldNode' && ev.core.parts!.shieldNode <= 0) (o as THREE.Mesh).visible = false;
        });
      }
    }

    // 弹丸朝向
    for (const pv of [...this.projs, ...this.enemyProjs]) {
      pv.mesh.position.set(pv.core.pos.x, pv.core.pos.y, pv.core.pos.z);
      const vv = pv.core.vel;
      pv.mesh.lookAt(pv.mesh.position.x + vv.x, pv.mesh.position.y + vv.y, pv.mesh.position.z + vv.z);
    }

    // 核心悬浮
    if (this.coreMesh && this.coreMesh.visible) {
      this.coreMesh.rotation.y += 0.02;
      this.coreMesh.position.y += Math.sin(this.globalTime * 2) * 0.02;
    }
    // 节点脉冲
    for (const n of this.nodes) {
      if (n.obs.alive) n.mesh.scale.setScalar(1 + Math.sin(this.globalTime * 6) * 0.06);
    }
  }

  private syncCamera(dt: number) {
    const t = this.ship.pos;
    if (this.cockpitView) {
      // 驾驶舱视角
      const eye = v(t.x + this.ship.forward.x * 1.2, t.y + this.ship.forward.y * 1.2 + 0.6, t.z + this.ship.forward.z * 1.2);
      this.camera.position.set(eye.x, eye.y, eye.z);
      const look = v(t.x + this.ship.forward.x * 100, t.y + this.ship.forward.y * 100, t.z + this.ship.forward.z * 100);
      this.camera.up.set(this.ship.up.x, this.ship.up.y, this.ship.up.z);
      this.camera.lookAt(look.x, look.y, look.z);
      this.shipMesh.visible = false;
    } else {
      // 追尾视角
      this.shipMesh.visible = true;
      const back = 13;
      const height = 4.2;
      const desired = v(
        t.x - this.ship.forward.x * back + this.ship.up.x * height,
        t.y - this.ship.forward.y * back + this.ship.up.y * height,
        t.z - this.ship.forward.z * back + this.ship.up.z * height
      );
      this.camera.position.lerp(new THREE.Vector3(desired.x, desired.y, desired.z), 1 - Math.exp(-8 * dt));
      const look = v(t.x + this.ship.forward.x * 60, t.y + this.ship.forward.y * 60, t.z + this.ship.forward.z * 60);
      this.camera.up.set(this.ship.up.x, this.ship.up.y, this.ship.up.z);
      this.camera.lookAt(look.x, look.y, look.z);
    }
    // 震屏
    if (this.shakeAmt > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt * 1.2;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt * 1.2;
    }
    void this.cameraRoll;
  }

  private buildMissionContext(): MissionContext {
    const evacPos = this.mission.evacuateOpened ? toV3(this.level.evac) : null;
    return {
      playerPos: this.ship.pos,
      hullAlive: this.defense.alive,
      timeLeft: this.mission.timeLeft,
      fuel: this.ship.fuel,
      scans: this.scans,
      scansRequired: 3,
      escortHp: this.escort ? this.escort.hp : 1,
      escortReachedEnd: this.escort ? this.escort.reached : false,
      nodesDestroyed: this.nodes.filter((n) => !n.obs.alive).length,
      nodesRequired: 3,
      coreTaken: this.corePickup ? this.corePickup.taken : false,
      towersDisabled: this.towers.filter((t) => t.disabled).length,
      towersRequired: 2,
      commandDead: this.commandView ? !this.commandView.core.alive : false,
      evacuatePos: evacPos,
      stationDetonated: this.stationExploded
    };
  }

  private complete(success: boolean, failReason?: string) {
    this.finished = true;
    this.input.exitLock();
    const resources = success
      ? 80 + this.stats.kills * 6 + this.level.id.length * 10
      : Math.round(this.stats.kills * 3);
    const result: MissionResult = {
      missionId: this.level.id,
      success,
      failReason,
      kills: this.stats.kills,
      shots: this.stats.shots,
      hits: this.stats.hits,
      timeSec: this.mission.elapsed,
      shieldLeft: Math.round(this.defense.shield),
      hullLeft: Math.round(this.defense.hull),
      resources
    };
    audio.uiClick();
    this.onResult(result);
  }

  private emitHud() {
    const lockT = this.targeting.current;
    let lockName: string | null = null;
    let lockHull = 0, lockShield = 0, lockHullMax = 0, lockShieldMax = 0, lockDist = 0;
    if (lockT) {
      const ev = this.enemies.find((e) => e.core.id === lockT.id);
      if (ev) {
        lockName = ev.core.spec.name;
        lockHull = ev.core.hull;
        lockShield = ev.core.shield;
        lockHullMax = ev.core.spec.maxHull;
        lockShieldMax = ev.core.spec.maxShield;
        lockDist = dist(this.ship.pos, lockT.pos);
      }
    }
    // 雷达（以玩家为中心，前向上方）
    const blips: HudState['radarBlips'] = [];
    for (const ev of this.enemies) {
      if (!ev.core.alive) continue;
      const d = sub2(ev.core.pos, this.ship.pos);
      const forward = this.ship.forward;
      const right = this.ship.right;
      const fx = d.x * right.x + d.y * right.y + d.z * right.z;
      const fz = d.x * forward.x + d.y * forward.y + d.z * forward.z;
      const range = 220;
      if (Math.abs(fx) < range && Math.abs(fz) < range) {
        blips.push({ x: fx / range, y: -fz / range, hostile: true });
      }
    }
    if (this.escort) {
      const d = sub2(this.escort.mesh.position as unknown as Vec3, this.ship.pos);
      const fx = d.x * this.ship.right.x + d.z * this.ship.right.z;
      const fz = d.x * this.ship.forward.x + d.z * this.ship.forward.z;
      blips.push({ x: fx / 220, y: -fz / 220, hostile: false });
    }

    const cur = this.events.current;
    this.onHud({
      hull: this.defense.hull,
      hullMax: this.defense.cfg.maxHull,
      shield: this.defense.shield,
      shieldMax: this.defense.cfg.maxShield,
      armor: this.defense.armor,
      armorMax: this.defense.cfg.maxArmor,
      energy: this.ship.energy,
      fuel: this.ship.fuel,
      speed: this.ship.speed,
      weaponHeat: this.primary.heat,
      overheated: this.primary.overheated,
      reloading: this.primary.reloading || this.secondary.reloading,
      secondaryAmmo: this.secondary.spec.maxAmmo === Infinity ? null : this.secondary.ammo,
      secondaryName: this.secondary.spec.name,
      primaryName: this.primary.spec.name,
      parts: {
        engine: this.defense.parts.engine,
        weapon: this.defense.parts.weapon,
        radar: this.defense.parts.radar
      },
      missionName: this.mission.def.name,
      objective: this.mission.activeObjectiveText,
      timeLeft: this.mission.timeLeft,
      lockProgress: this.targeting.progress,
      locked: this.targeting.locked,
      lockTargetName: lockName,
      lockDist,
      lockHull,
      lockShield,
      lockHullMax,
      lockShieldMax,
      lostLock: this.targeting.lostFlash > 0 ? this.targeting.lostReason : null,
      radarBlips: blips,
      eventTitle: cur ? cur.title : null,
      eventPhase: cur ? cur.phase : null,
      eventCountdown: cur ? (cur.phase === 'warning' ? cur.countdownSec : cur.durationSec) : 0,
      enemiesLeft: this.enemies.filter((e) => e.core.alive).length,
      message: this.messageTimer > 0 ? this._message : null,
      escortHp: this.escort ? this.escort.hp : null,
      stationCountdown: this.stationCountdown,
      boost: this.ship.boostActive,
      evadeReady: this.ship.evadeCooldownTimer <= 0,
      crosshairHit: this.crosshairHitTimer > 0
    });
  }

  private disposeDynamic() {
    for (const child of [...this.scene.children]) {
      this.scene.remove(child);
      const anyChild = child as any;
      if (anyChild.geometry) anyChild.geometry.dispose?.();
      if (anyChild.material) {
        if (Array.isArray(anyChild.material)) anyChild.material.forEach((mm: any) => mm.dispose?.());
        else anyChild.material.dispose?.();
      }
    }
    this.enemies = [];
    this.projs = [];
    this.enemyProjs = [];
    this.particles = [];
    this.obstacleMeshes.clear();
    this.pickupMeshes.clear();
    this.scanPoints = [];
    this.escort = null;
    this.nodes = [];
    this.towers = [];
    this.commandView = null;
    this.corePickup = null;
    this.coreMesh = null;
    this.repairDrones = [];
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.input.exitLock();
    window.removeEventListener('resize', this.onResize);
    this.disposeDynamic();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function sub2(a: Vec3, b: Vec3): Vec3 {
  return v(a.x - b.x, a.y - b.y, a.z - b.z);
}
