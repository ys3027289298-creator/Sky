import { Vec3, add, dist, scale, sub, v } from './math';
import type { WeaponId } from './types';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  damage: number;
  fireRate: number; // 发/秒
  range: number;
  heatPerShot: number;
  overheatAt: number;
  coolRate: number;
  ammoPerShot: number;
  maxAmmo: number; // Infinity 表示不耗弹
  reloadTime: number;
  projectileSpeed: number;
  splashRadius: number;
  homing: boolean;
  slot: 'primary' | 'secondary';
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  dual: {
    id: 'dual',
    name: '双联能量炮',
    damage: 7,
    fireRate: 7,
    range: 150,
    heatPerShot: 7,
    overheatAt: 100,
    coolRate: 26,
    ammoPerShot: 0,
    maxAmmo: Infinity,
    reloadTime: 1.1,
    projectileSpeed: 220,
    splashRadius: 0,
    homing: false,
    slot: 'primary'
  },
  pulse: {
    id: 'pulse',
    name: '高速脉冲炮',
    damage: 11,
    fireRate: 4.2,
    range: 230,
    heatPerShot: 12,
    overheatAt: 100,
    coolRate: 30,
    ammoPerShot: 0,
    maxAmmo: Infinity,
    reloadTime: 0.9,
    projectileSpeed: 340,
    splashRadius: 0,
    homing: false,
    slot: 'primary'
  },
  missile: {
    id: 'missile',
    name: '追踪导弹',
    damage: 42,
    fireRate: 1.1,
    range: 320,
    heatPerShot: 0,
    overheatAt: 100,
    coolRate: 20,
    ammoPerShot: 1,
    maxAmmo: 14,
    reloadTime: 1.6,
    projectileSpeed: 130,
    splashRadius: 7,
    homing: true,
    slot: 'secondary'
  },
  blast: {
    id: 'blast',
    name: '范围爆破弹',
    damage: 30,
    fireRate: 0.8,
    range: 200,
    heatPerShot: 0,
    overheatAt: 100,
    coolRate: 20,
    ammoPerShot: 1,
    maxAmmo: 10,
    reloadTime: 2.0,
    projectileSpeed: 110,
    splashRadius: 22,
    homing: false,
    slot: 'secondary'
  }
};

export interface Projectile {
  id: number;
  weapon: WeaponId;
  pos: Vec3;
  vel: Vec3;
  damage: number;
  splashRadius: number;
  homing: boolean;
  targetId: string | null;
  life: number;
  fromPlayer: boolean;
  dead: boolean;
}

let pid = 1;

export class WeaponSystem {
  spec: WeaponSpec;
  heat = 0;
  overheated = false;
  ammo: number;
  cooldownTimer = 0; // 发射间隔
  reloadTimer = 0; // 手动冷却/换弹
  reloading = false;
  damageMul: number;
  fireRateMul: number;

  constructor(spec: WeaponSpec, upgrades: { weapon: number; missile: number }) {
    this.spec = spec;
    this.ammo = spec.maxAmmo;
    if (spec.slot === 'secondary') {
      if (spec.id === 'missile') this.ammo = spec.maxAmmo + upgrades.missile * 3;
    }
    this.damageMul = 1 + 0.1 * upgrades.weapon;
    this.fireRateMul = 1 + 0.07 * upgrades.weapon;
  }

  get ammoMax() {
    return this.spec.maxAmmo === Infinity ? Infinity : this.spec.maxAmmo;
  }

  /** 尝试开火，返回 true 表示成功 */
  tryFire(partHealth: number): boolean {
    if (this.overheated || this.reloading) return false;
    if (this.cooldownTimer > 0) return false;
    if (this.ammo < this.spec.ammoPerShot) return false;
    if (this.heat + this.spec.heatPerShot > this.spec.overheatAt) {
      this.overheated = true;
      return false;
    }
    this.ammo -= this.spec.ammoPerShot;
    this.heat = Math.min(this.spec.overheatAt, this.heat + this.spec.heatPerShot);
    // 武器受损 -> 射速下降（间隔变长）
    const healthFactor = 0.55 + 0.45 * partHealth;
    this.cooldownTimer = 1 / (this.spec.fireRate * this.fireRateMul * healthFactor);
    return true;
  }

  /** R 键手动换弹/冷却 */
  startReload() {
    if (this.reloading) return;
    this.reloading = true;
    this.reloadTimer = this.spec.reloadTime;
  }

  update(dt: number) {
    if (this.cooldownTimer > 0) this.cooldownTimer -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      this.heat = Math.max(0, this.heat - this.spec.coolRate * 1.6 * dt);
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.overheated = false;
        if (this.spec.maxAmmo !== Infinity) this.ammo = this.spec.maxAmmo;
      }
      return;
    }
    this.heat = Math.max(0, this.heat - this.spec.coolRate * dt);
    if (this.overheated && this.heat <= 0) this.overheated = false;
  }

  addAmmo(n: number) {
    if (this.spec.maxAmmo === Infinity) return;
    this.ammo = Math.min(this.spec.maxAmmo, n >= 999 ? this.spec.maxAmmo : this.ammo + n);
  }

  makeProjectile(origin: Vec3, dir: Vec3, targetId: string | null): Projectile {
    return {
      id: pid++,
      weapon: this.spec.id,
      pos: { ...origin },
      vel: scale(dir, this.spec.projectileSpeed),
      damage: this.spec.damage * this.damageMul,
      splashRadius: this.spec.splashRadius,
      homing: this.spec.homing,
      targetId,
      life: this.spec.range / this.spec.projectileSpeed + 0.5,
      fromPlayer: true,
      dead: false
    };
  }
}

/** 推进弹丸；homing 弹追踪目标位置 */
export function updateProjectile(
  p: Projectile,
  dt: number,
  targetPos: Vec3 | null
): void {
  if (p.dead) return;
  if (p.homing && targetPos) {
    const desired = scale(sub(targetPos, p.pos), 1 / Math.max(0.001, dt));
    const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    const nd = (() => {
      const d = sub(targetPos, p.pos);
      const l = Math.hypot(d.x, d.y, d.z) || 1;
      return scale(d, 1 / l);
    })();
    const steer = Math.min(1, 1.8 * dt);
    const cur = (() => {
      const l = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
      return scale(p.vel, 1 / l);
    })();
    const blended = (() => {
      const b = add(scale(cur, 1 - steer), scale(nd, steer));
      const l = Math.hypot(b.x, b.y, b.z) || 1;
      return scale(b, 1 / l);
    })();
    p.vel = scale(blended, speed);
    void desired;
  }
  p.pos = add(p.pos, scale(p.vel, dt));
  p.life -= dt;
  if (p.life <= 0) p.dead = true;
}

export function projectileHits(p: Projectile, center: Vec3, radius: number): boolean {
  return dist(p.pos, center) <= radius + 0.8;
}

export { v };
