import { appendRunRecord, normalizeHistory, RunRecord, SAVE_SCHEMA_VERSION } from './history';

export interface UpgradeLevels { engine: number; shield: number; armor: number; weapon: number; radar: number; missile: number; }
export interface SaveData { unlockedMission: number; resources: number; points: number; upgrades: UpgradeLevels; settings: { mouseSensitivity: number; volume: number; practice: boolean }; history?: RunRecord[]; schemaVersion?: number; }

export const DEFAULT_SAVE: SaveData = {
  unlockedMission: 0,
  resources: 0,
  points: 0,
  upgrades: { engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 },
  settings: { mouseSensitivity: 1, volume: 0.6, practice: false },
  history: [],
  schemaVersion: SAVE_SCHEMA_VERSION
};

export class SaveStore {
  constructor(private key = 'starfall-defense-save', private memory: Record<string, string> = {}) {}
  load(): SaveData {
    try {
      const raw = globalThis.localStorage?.getItem(this.key) ?? this.memory[this.key];
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw);
      const data: SaveData = {
        ...structuredClone(DEFAULT_SAVE),
        ...parsed,
        upgrades: { ...DEFAULT_SAVE.upgrades, ...parsed?.upgrades },
        settings: { ...DEFAULT_SAVE.settings, ...parsed?.settings }
      };
      data.history = normalizeHistory(parsed?.history);
      data.schemaVersion = SAVE_SCHEMA_VERSION;
      return data;
    } catch { return structuredClone(DEFAULT_SAVE); }
  }
  save(data: SaveData): void {
    const normalized: SaveData = { ...data, schemaVersion: SAVE_SCHEMA_VERSION, history: normalizeHistory(data.history) };
    const raw = JSON.stringify(normalized);
    this.memory[this.key] = raw;
    globalThis.localStorage?.setItem(this.key, raw);
  }
  appendRun(record: RunRecord): SaveData {
    const data = this.load();
    data.history = appendRunRecord(data.history, record);
    this.save(data);
    return data;
  }
  clearHistory(): SaveData {
    const data = this.load();
    data.history = [];
    this.save(data);
    return data;
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
