import { clamp } from './types';

export type PickupKind = 'fuel' | 'ammo' | 'repair' | 'module';

export interface ResourceState {
  fuel: number;
  missile: number;
  blast: number;
  repairMaterials: number;
  points: number;
}

export interface PickupChanges {
  fuel?: number;
  missile?: number;
  blast?: number;
  repairMaterials?: number;
  points?: number;
  repaired?: boolean;
}

export interface PickupResult {
  kind: string;
  applied: boolean;
  changes: PickupChanges;
}

export const PICKUP_EFFECTS = {
  fuel: { fuel: 30 },
  ammo: { missile: 2, blast: 1 },
  repair: { repairMaterials: 1, repair: true },
  module: { points: 1 }
} as const;

export const FUEL_MIN = 0;
export const FUEL_MAX = 100;

export function isPickupKind(kind: unknown): kind is PickupKind {
  return kind === 'fuel' || kind === 'ammo' || kind === 'repair' || kind === 'module';
}

export function applyPickup(state: ResourceState, kind: PickupKind, repair?: () => boolean): PickupResult {
  if (!isPickupKind(kind)) return { kind: String(kind), applied: false, changes: {} };
  if (kind === 'fuel') {
    const before = state.fuel;
    state.fuel = clamp(state.fuel + PICKUP_EFFECTS.fuel.fuel, FUEL_MIN, FUEL_MAX);
    return { kind, applied: true, changes: { fuel: state.fuel - before } };
  }
  if (kind === 'ammo') {
    state.missile += PICKUP_EFFECTS.ammo.missile;
    state.blast += PICKUP_EFFECTS.ammo.blast;
    return { kind, applied: true, changes: { missile: PICKUP_EFFECTS.ammo.missile, blast: PICKUP_EFFECTS.ammo.blast } };
  }
  if (kind === 'repair') {
    const before = state.repairMaterials;
    state.repairMaterials += PICKUP_EFFECTS.repair.repairMaterials;
    const repaired = repair ? repair() : false;
    return { kind, applied: true, changes: { repairMaterials: state.repairMaterials - before, repaired } };
  }
  state.points += PICKUP_EFFECTS.module.points;
  return { kind, applied: true, changes: { points: PICKUP_EFFECTS.module.points } };
}

export class PickupLedger {
  private active = new Set<string>();
  register(id: string): void { this.active.add(id); }
  unregister(id: string): boolean { return this.active.delete(id); }
  isActive(id: string): boolean { return this.active.has(id); }
  get size(): number { return this.active.size; }
  clear(): void { this.active.clear(); }
  settle(id: string, kind: PickupKind, state: ResourceState, repair?: () => boolean): PickupResult | null {
    if (!this.active.delete(id)) return null;
    return applyPickup(state, kind, repair);
  }
}
