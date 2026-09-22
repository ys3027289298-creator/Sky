import { Vec3, Rng, dist, dist2, v } from './math';
import type { Obstacle, Pickup } from './types';

export interface RegionDef {
  name: string;
  center: Vec3;
  radius: number;
  fogColor: number;
  fogDensity: number;
  hazard: 'asteroids' | 'station' | 'fleet';
}

export const REGIONS: RegionDef[] = [
  { name: '废弃采矿区', center: v(0, 0, -350), radius: 260, fogColor: 0x2a2138, fogDensity: 0.0016, hazard: 'asteroids' },
  { name: '失控空间站', center: v(420, 20, -900), radius: 240, fogColor: 0x3a2018, fogDensity: 0.002, hazard: 'station' },
  { name: '敌方舰队外围', center: v(-420, -30, -1500), radius: 300, fogColor: 0x141a2e, fogDensity: 0.0014, hazard: 'fleet' }
];

export class World {
  obstacles: Obstacle[] = [];
  pickups: Pickup[] = [];
  rng: Rng;

  constructor(rng = new Rng()) {
    this.rng = rng;
  }

  addObstacle(o: Obstacle) {
    this.obstacles.push(o);
  }

  addPickup(p: Pickup) {
    this.pickups.push(p);
  }

  /** 生成陨石带：沿环形分布，可被“陨石带偏移”事件整体平移 */
  buildAsteroidBelt(center: Vec3, count: number, spread: number, idPrefix = 'ast') {
    for (let i = 0; i < count; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const ringR = this.rng.range(spread * 0.25, spread);
      const pos = v(
        center.x + Math.cos(angle) * ringR,
        center.y + this.rng.range(-60, 60),
        center.z + Math.sin(angle) * ringR
      );
      const big = this.rng.next() < 0.18;
      this.obstacles.push({
        id: `${idPrefix}-${i}`,
        pos,
        radius: big ? this.rng.range(14, 30) : this.rng.range(4, 11),
        kind: 'asteroid',
        alive: true
      });
    }
  }

  shiftAsteroids(delta: Vec3) {
    for (const o of this.obstacles) {
      if (o.kind === 'asteroid') o.pos = { x: o.pos.x + delta.x, y: o.pos.y + delta.y, z: o.pos.z + delta.z };
    }
  }

  /** 玩家拾取检测，返回被拾取的物品 */
  collectPickups(playerPos: Vec3, pickupRadius: number): Pickup[] {
    const got: Pickup[] = [];
    for (const p of this.pickups) {
      if (!p.taken && dist(playerPos, p.pos) <= pickupRadius + 2) {
        p.taken = true;
        got.push(p);
      }
    }
    return got;
  }

  /** 视线是否被障碍物阻挡 */
  lineBlocked(from: Vec3, to: Vec3, extraRadius = 0): boolean {
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      const r = o.radius * 0.9 + extraRadius;
      if (dist2(from, to) < 1) continue;
      if (segmentHit(from, to, o.pos, r)) return true;
    }
    return false;
  }

  /** 对玩家造成碰撞伤害（依据撞击速度），返回伤害值 */
  collisionDamage(impactSpeed: number): number {
    if (impactSpeed < 18) return impactSpeed * 0.25;
    return impactSpeed * 0.9;
  }
}

function segmentHit(p0: Vec3, p1: Vec3, c: Vec3, r: number): boolean {
  const abx = p1.x - p0.x;
  const aby = p1.y - p0.y;
  const abz = p1.z - p0.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-9 ? ((c.x - p0.x) * abx + (c.y - p0.y) * aby + (c.z - p0.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = p0.x + abx * t;
  const cy = p0.y + aby * t;
  const cz = p0.z + abz * t;
  const dx = cx - c.x;
  const dy = cy - c.y;
  const dz = cz - c.z;
  return dx * dx + dy * dy + dz * dz < r * r;
}

export { dist };
