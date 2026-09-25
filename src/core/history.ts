import type { UpgradeLevels } from './storage';

export const SAVE_SCHEMA_VERSION = 2;
export const HISTORY_LIMIT = 20;

export interface RunRecord {
  id: string;
  missionIndex: number;
  missionName: string;
  success: boolean;
  reason: string;
  startedAt: number;
  finishedAt: number;
  duration: number;
  kills: number;
  shots: number;
  hits: number;
  accuracy: number;
  reward: number;
  upgrades: UpgradeLevels;
}

export interface HistoryFilter { mission: number | 'all'; status: 'all' | 'success' | 'failed'; }

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const nonNeg = (value: unknown, fallback = 0): number => Math.max(0, num(value, fallback));
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const UPGRADE_KEYS: (keyof UpgradeLevels)[] = ['engine', 'shield', 'armor', 'weapon', 'radar', 'missile'];

export function normalizeUpgrades(input: unknown): UpgradeLevels {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = {} as UpgradeLevels;
  for (const key of UPGRADE_KEYS) out[key] = Math.min(3, Math.max(0, Math.round(num(src[key], 0))));
  return out;
}

export function normalizeRunRecord(input: unknown, index = 0): RunRecord {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const shots = nonNeg(src.shots);
  const hits = nonNeg(src.hits);
  const finishedAt = nonNeg(src.finishedAt);
  const startedAtRaw = nonNeg(src.startedAt);
  const missionIndex = Math.max(0, Math.round(num(src.missionIndex, 0)));
  const rawAccuracy = src.accuracy;
  const accuracy = typeof rawAccuracy === 'number' && Number.isFinite(rawAccuracy)
    ? Math.min(1, Math.max(0, rawAccuracy))
    : shots > 0 ? Math.min(1, hits / shots) : 0;
  return {
    id: str(src.id) || `run-legacy-${finishedAt}-${missionIndex}-${index}`,
    missionIndex,
    missionName: str(src.missionName) || `任务 ${missionIndex + 1}`,
    success: src.success === true,
    reason: str(src.reason),
    startedAt: startedAtRaw > 0 ? startedAtRaw : finishedAt,
    finishedAt,
    duration: nonNeg(src.duration),
    kills: nonNeg(src.kills),
    shots,
    hits,
    accuracy,
    reward: num(src.reward, 0),
    upgrades: normalizeUpgrades(src.upgrades)
  };
}

export function sortHistory(records: RunRecord[]): RunRecord[] {
  return [...records].sort((a, b) => b.finishedAt - a.finishedAt);
}

export function normalizeHistory(input: unknown): RunRecord[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: RunRecord[] = [];
  input.forEach((entry, index) => {
    const record = normalizeRunRecord(entry, index);
    if (seen.has(record.id)) return;
    seen.add(record.id);
    out.push(record);
  });
  return sortHistory(out).slice(0, HISTORY_LIMIT);
}

export function appendRunRecord(history: unknown, record: unknown, limit = HISTORY_LIMIT): RunRecord[] {
  const existing = normalizeHistory(history);
  const next = normalizeRunRecord(record, existing.length);
  return sortHistory([next, ...existing.filter(r => r.id !== next.id)]).slice(0, limit);
}

export function filterRunRecords(records: RunRecord[], filter: HistoryFilter): RunRecord[] {
  return records.filter(r =>
    (filter.mission === 'all' || r.missionIndex === filter.mission) &&
    (filter.status === 'all' || (filter.status === 'success') === r.success));
}
