export type Vec3 = { x: number; y: number; z: number };

export type WeaponId = 'twin' | 'pulse' | 'missile' | 'blast';
export type EnemyKind = 'scout' | 'interceptor' | 'gunship' | 'drone' | 'command';
export type EnemyState = 'patrol' | 'aware' | 'pursue' | 'attack' | 'retreat' | 'dead';
export type PartKind = 'engine' | 'weapon' | 'radar' | 'hull';
export type UpgradeKind = 'engine' | 'shield' | 'armor' | 'weapon' | 'radar' | 'missile';

export interface Obstacle { id: string; pos: Vec3; radius: number; blocksLine?: boolean; }
export interface DamageResult { damage: number; killed: boolean; part?: PartKind; }

export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return scale(a, 1 / l); };
export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
