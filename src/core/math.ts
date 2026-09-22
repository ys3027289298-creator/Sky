// 轻量三维向量，避免核心逻辑依赖 Three.js，方便单元测试
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const cloneV = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, m: number): Vec3 => ({ x: a.x * m, y: a.y * m, z: a.z * m });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
export const len = (a: Vec3): number => Math.sqrt(dot(a, a));
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const dist2 = (a: Vec3, b: Vec3): number => {
  const d = sub(a, b);
  return dot(d, d);
};
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v(0, 0, 1);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** 简单可复现随机数 */
export class Rng {
  private state: number;
  constructor(seed = 1234567) {
    this.state = seed >>> 0 || 1;
  }
  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** 线段 (p0->p1) 与球体(球心 c, 半径 r) 的最近距离平方 */
export function segmentSphereDist2(p0: Vec3, p1: Vec3, c: Vec3): number {
  const ab = sub(p1, p0);
  const abLen2 = dot(ab, ab);
  let t = abLen2 > 1e-9 ? dot(sub(c, p0), ab) / abLen2 : 0;
  t = clamp(t, 0, 1);
  const closest = add(p0, scale(ab, t));
  return dist2(closest, c);
}

/** 射线/线段是否被球体阻挡（用于锁定视线判定） */
export function blockedBySphere(p0: Vec3, p1: Vec3, c: Vec3, r: number): boolean {
  return segmentSphereDist2(p0, p1, c) < r * r;
}
