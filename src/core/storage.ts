import type { SaveData, GameSettings } from './types';
import { defaultUpgrades } from './upgrades';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'starfall-defense-save-v1';

export function defaultSettings(): GameSettings {
  return { masterVolume: 0.7, mouseSensitivity: 1, invertY: false, showTutorial: true };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlockedMission: 0,
    upgrades: defaultUpgrades(),
    resources: 0,
    totalKills: 0,
    settings: defaultSettings(),
    bestResults: {}
  };
}

/** 存档读写抽象层，浏览器用 localStorage；测试可注入 memoryStorage */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KVStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

export function loadSave(kv: KVStorage): SaveData {
  const raw = kv.getItem(SAVE_KEY);
  if (!raw) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate(parsed);
  } catch {
    return defaultSave();
  }
}

export function persistSave(kv: KVStorage, data: SaveData): void {
  kv.setItem(SAVE_KEY, JSON.stringify(data));
}

export function clearSave(kv: KVStorage): void {
  kv.removeItem(SAVE_KEY);
}

/** 版本迁移：补齐缺失字段，兼容旧存档 */
export function migrate(raw: Partial<SaveData>): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: SAVE_VERSION,
    unlockedMission: Number.isFinite(raw.unlockedMission) ? raw.unlockedMission! : 0,
    upgrades: { ...base.upgrades, ...(raw.upgrades ?? {}) },
    resources: typeof raw.resources === 'number' ? raw.resources : 0,
    totalKills: typeof raw.totalKills === 'number' ? raw.totalKills : 0,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    bestResults: raw.bestResults ?? {}
  };
}

/** 结算后更新进度：解锁下一关、累计资源/击杀、保存最佳战绩 */
export function applyMissionResult(data: SaveData, missionIndex: number, result: {
  success: boolean;
  kills: number;
  resources: number;
}): SaveData {
  const next: SaveData = {
    ...data,
    upgrades: { ...data.upgrades },
    settings: { ...data.settings },
    bestResults: { ...data.bestResults }
  };
  next.totalKills += result.kills;
  if (result.success) {
    next.resources += result.resources;
    next.unlockedMission = Math.max(next.unlockedMission, Math.min(3, missionIndex + 1));
  }
  return next;
}
