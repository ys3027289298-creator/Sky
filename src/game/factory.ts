import * as THREE from 'three';
import type { EnemyKind } from '../core/types';

/** 玩家轻型战斗飞船：原创几何拼装 */
export function buildPlayerShip(): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.7, roughness: 0.25, emissive: 0x0a2030 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x223044, metalness: 0.8, roughness: 0.4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x55ccff });

  const body = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.2, 8), hullMat);
  body.rotation.x = -Math.PI / 2;
  g.add(body);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 10), new THREE.MeshStandardMaterial({
    color: 0x113355, metalness: 0.3, roughness: 0.1, emissive: 0x1188ff, emissiveIntensity: 0.4
  }));
  cockpit.position.set(0, 0.45, -0.4);
  g.add(cockpit);

  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.5), hullMat);
    wing.position.set(sx * 1.5, -0.1, 0.6);
    wing.rotation.z = sx * -0.12;
    g.add(wing);
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), darkMat);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(sx * 0.7, -0.25, -1.6);
    g.add(gun);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.9, 10), darkMat);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(sx * 0.85, 0, 2);
    g.add(engine);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 8), glowMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(sx * 0.85, 0, 2.9);
    flame.name = 'flame';
    g.add(flame);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

const ENEMY_COLORS: Record<EnemyKind, number> = {
  scout: 0x66ddff,
  interceptor: 0xffaa33,
  gunship: 0xff5544,
  defense: 0xaa66ff,
  command: 0xff3355
};

/** 敌人原创模型 */
export function buildEnemy(kind: EnemyKind): THREE.Group {
  const g = new THREE.Group();
  const color = ENEMY_COLORS[kind];
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35, emissive: color, emissiveIntensity: 0.18 });

  if (kind === 'scout') {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.8), mat);
    g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else if (kind === 'interceptor') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(1, 3.4, 6), mat);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), mat);
      fin.position.set(sx * 1.1, 0, 0.4);
      g.add(fin);
    }
  } else if (kind === 'gunship') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 3.4), mat);
    g.add(body);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x330000, metalness: 0.7 }));
    turret.rotation.x = Math.PI / 2;
    turret.position.set(0, 0, -2);
    turret.name = 'turret';
    g.add(turret);
  } else if (kind === 'defense') {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2), mat);
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.2), new THREE.MeshStandardMaterial({ color: 0xd8b8ff, metalness: 0.5 }));
      const a = (i / 3) * Math.PI * 2;
      plate.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0);
      plate.rotation.z = a;
      g.add(plate);
    }
  } else {
    // 指挥舰：大型舰体 + 可破坏部件标记
    const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 22, 10), mat);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), new THREE.MeshStandardMaterial({ color: 0x551122, metalness: 0.7, roughness: 0.3 }));
    bridge.position.set(0, 3.5, -4);
    g.add(bridge);
    for (const sx of [-1, 1]) {
      const turret = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xaa3300, emissiveIntensity: 0.5 }));
      turret.position.set(sx * 4, 1.5, -7);
      turret.name = 'turret';
      g.add(turret);
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 3, 10), new THREE.MeshBasicMaterial({ color: 0xff6622 }));
      eng.rotation.x = Math.PI / 2;
      eng.position.set(sx * 2.6, 0, 11);
      eng.name = 'engine';
      g.add(eng);
      const node = new THREE.Mesh(new THREE.OctahedronGeometry(1.3), new THREE.MeshBasicMaterial({ color: 0x66ffff }));
      node.position.set(sx * 5.5, 0, 2);
      node.name = 'shieldNode';
      g.add(node);
    }
  }
  return g;
}

export function buildAsteroid(radius: number): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = 0.75 + Math.random() * 0.5;
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * (0.8 + Math.random() * 0.4), pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6b6256, roughness: 0.95, metalness: 0.1, flatShading: true }));
}

export function buildStation(): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a93a6, metalness: 0.85, roughness: 0.35 });
  const core = new THREE.Mesh(new THREE.TorusGeometry(26, 5, 10, 6), metal);
  g.add(core);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 22, 10), metal);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 34), metal);
    arm.rotation.z = (i / 4) * Math.PI / 2;
    g.add(arm);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3322 }));
  lamp.position.set(0, 10, 0);
  g.add(lamp);
  return g;
}

/** 爆炸粒子 */
export function buildExplosion(scale = 1): { points: THREE.Points; life: number } {
  const count = Math.floor(40 * scale);
  const positions = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const sp = (8 + Math.random() * 30) * scale;
    vel.set([dir.x * sp, dir.y * sp, dir.z * sp], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('velocity', new THREE.BufferAttribute(vel, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffaa33, size: 1.4 * scale, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  return { points: new THREE.Points(geo, mat), life: 1.2 };
}
