import { clamp } from './math';
import type { PartKind } from './types';

export interface DefenseConfig {
  maxHull: number;
  maxShield: number;
  maxArmor: number;
  shieldRegenDelay: number;
  shieldRegenRate: number;
}

export const BASE_DEFENSE: DefenseConfig = {
  maxHull: 100,
  maxShield: 80,
  maxArmor: 60,
  shieldRegenDelay: 4,
  shieldRegenRate: 9
};

export class DefenseSystem {
  hull: number;
  shield: number;
  armor: number;
  parts: Record<PartKind, number>;
  cfg: DefenseConfig;
  shieldDelayTimer = 0;
  shieldOffline = false;
  offlineRemaining = 0;
  lastHitPart: PartKind | null = null;

  constructor(upgrades: { shield: number; armor: number }, cfg?: DefenseConfig) {
    this.cfg =
      cfg ??
      ({
        ...BASE_DEFENSE,
        maxShield: BASE_DEFENSE.maxShield * (1 + 0.12 * upgrades.shield),
        shieldRegenRate: BASE_DEFENSE.shieldRegenRate * (1 + 0.1 * upgrades.shield),
        maxArmor: BASE_DEFENSE.maxArmor * (1 + 0.12 * upgrades.armor),
        maxHull: BASE_DEFENSE.maxHull * (1 + 0.05 * upgrades.armor)
      } as DefenseConfig);
    this.parts = { engine: 1, weapon: 1, radar: 1, hull: 1 };
    this.hull = this.cfg.maxHull;
    this.shield = this.cfg.maxShield;
    this.armor = this.cfg.maxArmor;
  }

  get alive() {
    return this.hull > 0;
  }

  partHealth(p: PartKind): number {
    return this.parts[p];
  }

  update(dt: number) {
    this.tickOffline(dt);
    if (this.shieldDelayTimer > 0) this.shieldDelayTimer -= dt;
    if (this.shieldDelayTimer <= 0 && !this.shieldOffline && this.shield < this.cfg.maxShield) {
      this.shield = clamp(this.shield + this.cfg.shieldRegenRate * dt, 0, this.cfg.maxShield);
    }
  }

  /** 承受伤害：护盾优先吸收，其次装甲减伤，最后结构生命与对应部件 */
  takeDamage(amount: number, part: PartKind = 'hull'): number {
    this.lastHitPart = part;
    this.shieldDelayTimer = this.cfg.shieldRegenDelay;
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining <= 0) return amount;
    if (this.armor > 0) {
      const armorSoak = Math.min(this.armor, remaining * 0.6);
      this.armor -= armorSoak;
      remaining -= armorSoak * 0.35 / 0.6;
    }
    this.hull = clamp(this.hull - remaining, 0, this.cfg.maxHull);
    this.parts[part] = clamp(this.parts[part] - remaining / this.cfg.maxHull, 0, 1);
    if (part !== 'hull') {
      this.parts.hull = clamp(this.parts.hull - remaining / this.cfg.maxHull / 2, 0, 1);
    }
    return amount;
  }

  repair(amount: number): number {
    const before = this.hull + this.armor;
    this.armor = clamp(this.armor + amount, 0, this.cfg.maxArmor);
    this.hull = clamp(this.hull + amount * 0.8, 0, this.cfg.maxHull);
    (Object.keys(this.parts) as PartKind[]).forEach((p) => {
      this.parts[p] = clamp(this.parts[p] + amount / 200, 0, 1);
    });
    return this.hull + this.armor - before;
  }

  fullRepair() {
    this.hull = this.cfg.maxHull;
    this.armor = this.cfg.maxArmor;
    (Object.keys(this.parts) as PartKind[]).forEach((p) => (this.parts[p] = 1));
  }

  setShieldOffline(seconds: number) {
    this.shieldOffline = true;
    this.offlineRemaining = seconds;
    this.shield = 0;
  }

  private tickOffline(dt: number) {
    if (this.offlineRemaining > 0) {
      this.offlineRemaining -= dt;
      if (this.offlineRemaining <= 0) this.shieldOffline = false;
    }
  }
}
