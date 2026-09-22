import type { UpgradeState } from './types';

export interface UpgradeDef {
  key: keyof UpgradeState;
  name: string;
  desc: string;
  maxLevel: number;
  costBase: number;
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  { key: 'engine', name: '引擎', desc: '每级 +10% 极速、+8% 加速，冲刺耗能 -8%', maxLevel: 3, costBase: 40 },
  { key: 'shield', name: '护盾', desc: '每级 +12% 护盾容量、+10% 回盾速度', maxLevel: 3, costBase: 40 },
  { key: 'armor', name: '装甲', desc: '每级 +12% 装甲、+5% 结构值', maxLevel: 3, costBase: 35 },
  { key: 'weapon', name: '武器', desc: '每级 +10% 伤害、+7% 射速', maxLevel: 3, costBase: 45 },
  { key: 'radar', name: '雷达', desc: '每级 +22 锁定距离、更快锁定', maxLevel: 3, costBase: 30 },
  { key: 'missile', name: '导弹舱', desc: '每级 +3 枚导弹载弹', maxLevel: 3, costBase: 35 }
];

export function defaultUpgrades(): UpgradeState {
  return { engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 };
}

export function upgradeCost(def: UpgradeDef, currentLevel: number): number {
  return Math.round(def.costBase * (1 + currentLevel * 0.6));
}

export class UpgradeManager {
  state: UpgradeState;
  resources: number;

  constructor(state: UpgradeState = defaultUpgrades(), resources = 0) {
    this.state = { ...state };
    this.resources = resources;
  }

  canUpgrade(key: keyof UpgradeState): boolean {
    const def = UPGRADE_DEFS.find((d) => d.key === key)!;
    const lvl = this.state[key];
    return lvl < def.maxLevel && this.resources >= upgradeCost(def, lvl);
  }

  upgrade(key: keyof UpgradeState): boolean {
    const def = UPGRADE_DEFS.find((d) => d.key === key)!;
    const lvl = this.state[key];
    if (lvl >= def.maxLevel) return false;
    const cost = upgradeCost(def, lvl);
    if (this.resources < cost) return false;
    this.resources -= cost;
    this.state[key] = lvl + 1;
    return true;
  }

  addResources(n: number) {
    this.resources += n;
  }
}
