import { Ship } from './ship';
import { SaveData } from './storage';
import { Vec3, clamp, dist } from './types';

export const PICKUP_KINDS = ['fuel', 'ammo', 'repair', 'module'] as const;
export type PickupKind = (typeof PICKUP_KINDS)[number];

export const PICKUP_RADIUS = 8;
export const FUEL_PICKUP_AMOUNT = 30;
export const AMMO_PICKUP_MISSILES = 2;
export const AMMO_PICKUP_BLASTS = 1;

export interface PickupChanges {
  fuel: number;
  missile: number;
  blast: number;
  repairMaterials: number;
  repairUsed: boolean;
  points: number;
}

export interface PickupResult {
  kind: PickupKind | null;
  applied: boolean;
  changes: PickupChanges;
}

const NO_CHANGES: PickupChanges = { fuel: 0, missile: 0, blast: 0, repairMaterials: 0, repairUsed: false, points: 0 };

export function isPickupKind(kind: unknown): kind is PickupKind {
  return typeof kind === 'string' && (PICKUP_KINDS as readonly string[]).includes(kind);
}

export function applyPickup(kind: unknown, ship: Ship, ammo: Record<string, number>, save: SaveData): PickupResult {
  if (!isPickupKind(kind)) return { kind: null, applied: false, changes: { ...NO_CHANGES } };
  const changes: PickupChanges = { ...NO_CHANGES };
  if (kind === 'fuel') {
    const before = ship.fuel;
    ship.fuel = clamp(ship.fuel + FUEL_PICKUP_AMOUNT, 0, 100);
    changes.fuel = ship.fuel - before;
  }
  if (kind === 'ammo') {
    ammo.missile += AMMO_PICKUP_MISSILES;
    ammo.blast += AMMO_PICKUP_BLASTS;
    changes.missile = AMMO_PICKUP_MISSILES;
    changes.blast = AMMO_PICKUP_BLASTS;
  }
  if (kind === 'repair') {
    ship.repairMaterials += 1;
    changes.repairMaterials = 1;
    changes.repairUsed = ship.repair();
  }
  if (kind === 'module') {
    save.points += 1;
    changes.points = 1;
  }
  return { kind, applied: true, changes };
}

export interface PickupEntity {
  kind: unknown;
  pos: Vec3;
}

export class PickupPool<T extends PickupEntity> {
  private active = new Set<T>();

  add(item: T): T {
    this.active.add(item);
    return item;
  }

  has(item: T): boolean {
    return this.active.has(item);
  }

  clear(): void {
    this.active.clear();
  }

  get size(): number {
    return this.active.size;
  }

  values(): T[] {
    return [...this.active];
  }

  collect(item: T, shipPos: Vec3, radius: number, apply: (kind: PickupKind) => PickupResult): PickupResult | null {
    if (!this.active.has(item)) return null;
    if (dist(shipPos, item.pos) > radius) return null;
    this.active.delete(item);
    if (!isPickupKind(item.kind)) return { kind: null, applied: false, changes: { ...NO_CHANGES } };
    return apply(item.kind);
  }
}
