import { WeaponId } from './types';

export interface WeaponSpec { id: WeaponId; name: string; damage: number; rate: number; range: number; ammo: number; cooldown: number; heatPerShot: number; secondary?: boolean; }
export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  twin: { id: 'twin', name: '双联能量炮', damage: 9, rate: 7.5, range: 180, ammo: Infinity, cooldown: 0, heatPerShot: 9 },
  pulse: { id: 'pulse', name: '高速脉冲炮', damage: 7, rate: 11, range: 150, ammo: Infinity, cooldown: 1.25, heatPerShot: 6 },
  missile: { id: 'missile', name: '追踪导弹', damage: 38, rate: 1.15, range: 340, ammo: 10, cooldown: 0.65, heatPerShot: 3, secondary: true },
  blast: { id: 'blast', name: '范围爆破弹', damage: 30, rate: 0.7, range: 230, ammo: 8, cooldown: 1.4, heatPerShot: 10, secondary: true }
};

export class WeaponSystem {
  heat = 0; overheated = false; cooldownLeft = 0;
  ammo = { missile: WEAPONS.missile.ammo, blast: WEAPONS.blast.ammo } as Record<string, number>;
  primary: WeaponId = 'twin'; secondary: WeaponId = 'missile';
  shots = 0; hits = 0;
  constructor(private fireBonus = 0, missileBonus = 0) { this.ammo.missile += missileBonus * 3; this.ammo.blast += missileBonus * 2; }
  update(dt: number) {
    this.heat = Math.max(0, this.heat - (this.overheated ? 18 : 11) * dt);
    if (this.overheated && this.heat <= 25) this.overheated = false;
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
  }
  canFire(id = this.primary): boolean {
    const w = WEAPONS[id];
    if (this.cooldownLeft > 0 || this.overheated) return false;
    if (w.secondary && this.ammo[id] <= 0) return false;
    return true;
  }
  fire(id = this.primary, partMultiplier = 1): boolean {
    if (!this.canFire(id)) return false;
    const w = WEAPONS[id];
    this.cooldownLeft = w.cooldown / Math.max(0.35, partMultiplier + this.fireBonus * 0.08);
    this.heat = Math.min(100, this.heat + w.heatPerShot);
    if (this.heat >= 100) this.overheated = true;
    if (w.secondary) this.ammo[id]--;
    this.shots++;
    return true;
  }
  cool() { this.heat = Math.max(0, this.heat - 38); this.overheated = false; }
  registerHit() { this.hits++; }
  get accuracy() { return this.shots ? this.hits / this.shots : 0; }
}

export interface LockState { targetId: string | null; progress: number; lostTimer: number; }
export class TargetingSystem {
  lock: LockState = { targetId: null, progress: 0, lostTimer: 0 };
  update(candidates: { id: string; visible: boolean; inRange: boolean }[], dt: number, switchTarget = false) {
    if (switchTarget || !this.lock.targetId) {
      const visible = candidates.filter(c => c.visible && c.inRange);
      const next = (switchTarget && this.lock.targetId ? visible.find(c => c.id !== this.lock.targetId) : undefined) ?? visible[0] ?? candidates.find(c => c.inRange);
      if (next?.id !== this.lock.targetId) this.lock = { targetId: next?.id ?? null, progress: next ? 20 : 0, lostTimer: 0 };
    }
    const target = candidates.find(c => c.id === this.lock.targetId);
    if (!target) { this.lock.progress = 0; this.lock.targetId = null; return this.lock; }
    if (target.visible && target.inRange) { this.lock.progress = Math.min(100, this.lock.progress + 42 * dt); this.lock.lostTimer = 0; }
    else { this.lock.lostTimer += dt; this.lock.progress = Math.max(0, this.lock.progress - 35 * dt); if (this.lock.lostTimer > 1.4) this.lock.targetId = null; }
    return this.lock;
  }
}
