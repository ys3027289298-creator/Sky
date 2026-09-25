import type { UpgradeLevels } from './storage';

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

export const HISTORY_LIMIT = 20;
export const SAVE_SCHEMA_VERSION = 2;

const UPGRADE_KEYS = ['engine', 'shield', 'armor', 'weapon', 'radar', 'missile'] as const;

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const int = (value: unknown, fallback = 0): number => Math.trunc(num(value, fallback));
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function normalizeUpgrades(raw: unknown): UpgradeLevels {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of UPGRADE_KEYS) out[key] = Math.min(3, Math.max(0, int(src[key], 0)));
  return out as unknown as UpgradeLevels;
}

export function normalizeRecord(raw: unknown): RunRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const finishedAt = Math.max(0, num(r.finishedAt, 0));
  const shots = Math.max(0, int(r.shots, 0));
  const hits = Math.max(0, int(r.hits, 0));
  const success = r.success === true;
  const storedAccuracy = num(r.accuracy, NaN);
  const accuracy = shots > 0 ? clamp01(hits / shots) : Number.isFinite(storedAccuracy) ? clamp01(storedAccuracy) : 0;
  const id = str(r.id) || `legacy-${finishedAt}-${int(r.missionIndex, 0)}`;
  return {
    id,
    missionIndex: Math.max(0, int(r.missionIndex, 0)),
    missionName: str(r.missionName) || '未知任务',
    success,
    reason: str(r.reason) || (success ? '任务完成' : '任务失败'),
    startedAt: Math.max(0, num(r.startedAt, finishedAt)),
    finishedAt,
    duration: Math.max(0, num(r.duration, 0)),
    kills: Math.max(0, int(r.kills, 0)),
    shots,
    hits,
    accuracy,
    reward: Math.max(0, int(r.reward, 0)),
    upgrades: normalizeUpgrades(r.upgrades)
  };
}

export function normalizeHistory(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RunRecord[] = [];
  raw.forEach(item => {
    const record = normalizeRecord(item);
    if (!record || seen.has(record.id)) return;
    seen.add(record.id);
    out.push(record);
  });
  out.sort((a, b) => b.finishedAt - a.finishedAt);
  return out.slice(0, HISTORY_LIMIT);
}

export function appendRunRecord(history: unknown, record: unknown): RunRecord[] {
  const list = normalizeHistory(history);
  const next = normalizeRecord(record);
  if (!next || list.some(r => r.id === next.id)) return list;
  return normalizeHistory([next, ...list]);
}
