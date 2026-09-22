import * as THREE from 'three';
import { Enemy } from '../core/enemies';
import { Obstacle, Vec3 } from '../core/types';

export function toThree(v: Vec3) { return new THREE.Vector3(v.x, v.y, v.z); }

export class GameWorld {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1400);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  obstacles: (Obstacle & { mesh: THREE.Object3D })[] = [];
  enemyMeshes = new Map<string, THREE.Group>();
  projectiles: { mesh: THREE.Object3D; born: number; life: number; target?: string; blast?: boolean }[] = [];
  effects: { mesh: THREE.Object3D; born: number; life: number }[] = [];
  zones: THREE.Mesh[] = [];
  storm?: THREE.Points;
  constructor(container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x02030a);
    container.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x050713, 0.004);
    this.scene.add(new THREE.AmbientLight(0x6688ff, 0.55));
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.2); sun.position.set(-80, 80, 40); this.scene.add(sun);
    this.makeStars();
    this.makeRegions();
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); });
  }
  makeStars() {
    const count = 2200, pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 450 + Math.random() * 700, a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
      pos.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.cos(a)], i * 3);
      const c = new THREE.Color().setHSL(0.58 + Math.random() * 0.18, 0.55, 0.65 + Math.random() * 0.35);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.2, vertexColors: true })));
    const stormPos = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) stormPos.set([(Math.random() - .5) * 500, (Math.random() - .5) * 220, (Math.random() - .5) * 500], i * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(stormPos, 3));
    this.storm = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x56e8ff, size: 2.2, transparent: true, opacity: 0 }));
    this.scene.add(this.storm);
  }
  makeRegions() {
    const centers: [number, number, number, number][] = [[-230, 0, -170, 0x7a5632], [0, 25, -270, 0x496b8f], [250, -20, -210, 0x82354f]];
    for (const [x, y, z, color] of centers) {
      const zone = new THREE.Mesh(new THREE.RingGeometry(42, 44, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
      zone.position.set(x, y, z); zone.rotation.x = Math.PI / 2; this.scene.add(zone); this.zones.push(zone);
    }
    for (let i = 0; i < 42; i++) this.addAsteroid([-230, 0, -170], i < 12);
    for (let i = 0; i < 28; i++) this.addAsteroid([250, -20, -210], i < 8);
    this.addStation(); this.addWreck(-120, -30, -260); this.addRift(90, 45, -330);
  }
  addAsteroid(center: number[], moving = false) {
    const radius = 5 + Math.random() * 16;
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), new THREE.MeshStandardMaterial({ color: 0x756b62, roughness: .92, metalness: .08 }));
    mesh.position.set(center[0] + (Math.random() - .5) * 210, center[1] + (Math.random() - .5) * 110, center[2] + (Math.random() - .5) * 180);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(mesh);
    this.obstacles.push({ id: `asteroid-${this.obstacles.length}`, pos: mesh.position, radius, blocksLine: true, mesh });
  }
  addStation() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fa3b5, metalness: .65, roughness: .35, emissive: 0x12243a });
    g.add(new THREE.Mesh(new THREE.TorusGeometry(48, 6, 12, 64), mat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(70, 12, 14), mat));
    g.children.forEach(c => { c.rotation.set(Math.random(), Math.random(), Math.random()); });
    g.position.set(0, 25, -270); this.scene.add(g);
    this.obstacles.push({ id: 'station', pos: g.position, radius: 55, blocksLine: true, mesh: g });
  }
  addWreck(x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(8, 18, 90, 7), new THREE.MeshStandardMaterial({ color: 0x5b5148, roughness: .8 }));
    mesh.position.set(x, y, z); mesh.rotation.z = 1.1; this.scene.add(mesh);
    this.obstacles.push({ id: 'wreck', pos: mesh.position, radius: 28, blocksLine: true, mesh });
  }
  addRift(x: number, y: number, z: number) {
    const rift = new THREE.Mesh(new THREE.CircleGeometry(34, 48), new THREE.MeshBasicMaterial({ color: 0x8b4dff, transparent: true, opacity: .32, side: THREE.DoubleSide }));
    rift.position.set(x, y, z); this.scene.add(rift);
  }
  makePlayerShip() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5.5, 4), new THREE.MeshStandardMaterial({ color: 0x61d7ff, metalness: .55, roughness: .25, emissive: 0x062235 }));
    hull.rotation.x = Math.PI / 2; g.add(hull);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.4, .18, 1.5), new THREE.MeshStandardMaterial({ color: 0x305e9c })); wing.position.z = .8; g.add(wing);
    const engine = new THREE.Mesh(new THREE.SphereGeometry(.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff8a32 })); engine.position.z = 2.9; g.add(engine);
    this.scene.add(g); return g;
  }
  addEnemyMesh(enemy: Enemy) {
    const g = new THREE.Group();
    const colors = { scout: 0x6cff8a, interceptor: 0xff5c5c, gunship: 0xffb14a, drone: 0x8e75ff, command: 0xff3f9e };
    const size = enemy.kind === 'command' ? 16 : enemy.kind === 'gunship' ? 6 : 3;
    g.add(new THREE.Mesh(enemy.kind === 'command' ? new THREE.OctahedronGeometry(size) : new THREE.TetrahedronGeometry(size), new THREE.MeshStandardMaterial({ color: colors[enemy.kind], emissive: 0x180000, roughness: .4, metalness: .5 })));
    g.position.copy(toThree(enemy.pos)); this.scene.add(g); this.enemyMeshes.set(enemy.id, g); return g;
  }
  spawnProjectile(from: Vec3, dir: Vec3, target?: string, blast = false) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(blast ? 1.2 : .45, 10, 8), new THREE.MeshBasicMaterial({ color: blast ? 0xff9b2f : 0x8fffff }));
    mesh.position.copy(toThree(from)); mesh.userData.direction = toThree(dir); this.scene.add(mesh); this.projectiles.push({ mesh, born: performance.now(), life: blast ? 3.4 : 1.6, target, blast });
    return mesh;
  }
  explosion(pos: Vec3, color = 0xff7733, scale = 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(2 * scale, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85 }));
    mesh.position.copy(toThree(pos)); this.scene.add(mesh); this.effects.push({ mesh, born: performance.now(), life: .55 });
  }
  update(dt: number) {
    this.zones.forEach((z, i) => z.rotation.z += dt * (i === 1 ? -.2 : .2));
    this.obstacles.forEach((o, i) => { if (o.id.startsWith('asteroid')) o.mesh.rotation.y += dt * .15 * (i % 3 - 1); });
    if (this.storm) this.storm.rotation.y += dt * .08;
    const now = performance.now();
    for (const p of this.projectiles) { const m = p.mesh as THREE.Mesh; const direction = (m.userData.direction as THREE.Vector3) ?? new THREE.Vector3(0,0,-1); m.position.addScaledVector(direction, (p.blast ? 52 : 92) * dt); const a = 1 - (now - p.born) / (p.life * 1000); if ((m.material as THREE.Material) && 'opacity' in m.material) ((m.material as THREE.MeshBasicMaterial)).opacity = Math.max(0, a); }
    this.projectiles = this.projectiles.filter(p => { if (now - p.born < p.life * 1000) return true; this.scene.remove(p.mesh); return false; });
    for (const e of this.effects) { const age = (now - e.born) / (e.life * 1000); e.mesh.scale.setScalar(1 + age * 7); (e.mesh as THREE.Mesh).material instanceof THREE.Material && (((e.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = .85 * (1 - age)); }
    this.effects = this.effects.filter(e => { if (now - e.born < e.life * 1000) return true; this.scene.remove(e.mesh); return false; });
    this.renderer.render(this.scene, this.camera);
  }
}
