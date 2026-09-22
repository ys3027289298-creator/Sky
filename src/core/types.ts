import type { Vec3 } from './math';

export type WeaponId = 'dual' | 'pulse' | 'missile' | 'blast';
export type EnemyKind = 'scout' | 'interceptor' | 'gunship' | 'defense' | 'command';
export type AIState = 'patrol' | 'search' | 'chase' | 'attack' | 'retreat' | 'dead';
export type PartKind = 'engine' | 'weapon' | 'radar' | 'hull';
export type MissionId = 'recon' | 'escort' | 'station' | 'final';

export interface Obstacle {
  id: string;
  pos: Vec3;
  radius: number;
  kind: 'asteroid' | 'station' | 'wreck' | 'tower' | 'node' | 'energy';
  hp?: number;
  alive: boolean;
}

export interface Pickup {
  id: string;
  pos: Vec3;
  kind: 'fuel' | 'ammo' | 'repair' | 'module';
  amount: number;
  taken: boolean;
}

export interface DamageInfo {
  amount: number;
  part: PartKind;
  source?: string;
}

export interface MissionResult {
  missionId: MissionId;
  success: boolean;
  failReason?: string;
  kills: number;
  shots: number;
  hits: number;
  timeSec: number;
  shieldLeft: number;
  hullLeft: number;
  resources: number;
}

export interface UpgradeState {
  engine: number;
  shield: number;
  armor: number;
  weapon: number;
  radar: number;
  missile: number;
}

export interface SaveData {
  version: number;
  unlockedMission: number; // 已解锁到第几关 (0..3)
  upgrades: UpgradeState;
  resources: number;
  totalKills: number;
  settings: GameSettings;
  bestResults: Partial<Record<MissionId, MissionResult>>;
}

export interface GameSettings {
  masterVolume: number;
  mouseSensitivity: number;
  invertY: boolean;
  showTutorial: boolean;
}
