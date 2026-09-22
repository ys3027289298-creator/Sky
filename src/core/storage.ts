export interface UpgradeLevels { engine: number; shield: number; armor: number; weapon: number; radar: number; missile: number; }
export interface SaveData { unlockedMission: number; resources: number; points: number; upgrades: UpgradeLevels; settings: { mouseSensitivity: number; volume: number; practice: boolean }; }

export const DEFAULT_SAVE: SaveData = {
  unlockedMission: 0,
  resources: 0,
  points: 0,
  upgrades: { engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 },
  settings: { mouseSensitivity: 1, volume: 0.6, practice: false }
};

export class SaveStore {
  constructor(private key = 'starfall-defense-save', private memory: Record<string, string> = {}) {}
  load(): SaveData {
    try {
      const raw = globalThis.localStorage?.getItem(this.key) ?? this.memory[this.key];
      return raw ? { ...structuredClone(DEFAULT_SAVE), ...JSON.parse(raw), upgrades: { ...DEFAULT_SAVE.upgrades, ...JSON.parse(raw).upgrades } } : structuredClone(DEFAULT_SAVE);
    } catch { return structuredClone(DEFAULT_SAVE); }
  }
  save(data: SaveData): void {
    const raw = JSON.stringify(data);
    this.memory[this.key] = raw;
    globalThis.localStorage?.setItem(this.key, raw);
  }
  reset(): SaveData { const data = structuredClone(DEFAULT_SAVE); this.save(data); return data; }
}

export function purchaseUpgrade(data: SaveData, kind: keyof UpgradeLevels): SaveData {
  const next = structuredClone(data);
  const level = next.upgrades[kind];
  if (level >= 3 || next.points < level + 1) return data;
  next.points -= level + 1;
  next.upgrades[kind] = level + 1;
  return next;
}
