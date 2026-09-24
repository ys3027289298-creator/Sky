import { Enemy } from './enemies';
import { Vec3, WeaponId, dist } from './types';
import { LockState, WEAPONS } from './weapons';

export interface PendingShot {
  token: number;
  weapon: WeaponId;
  targetId?: string | null;
  targetRef?: Enemy | null;
}

export interface ShotContext {
  enemies: Enemy[];
  shipPos: Vec3;
  isVisible: (pos: Vec3) => boolean;
}

export type MissReason = 'stale-token' | 'no-lock' | 'invalid-target' | 'not-alive' | 'out-of-range' | 'occluded' | 'no-target';

export interface ShotOutcome {
  hit: boolean;
  target?: Enemy;
  reason?: MissReason;
}

export class CombatSession {
  token = 0;

  beginMission(): number {
    this.token += 1;
    return this.token;
  }

  canLaunchMissile(lock: LockState): boolean {
    return lock.progress >= 100 && lock.targetId !== null;
  }

  resolveShot(shot: PendingShot, ctx: ShotContext): ShotOutcome {
    if (shot.token !== this.token) return { hit: false, reason: 'stale-token' };
    const spec = WEAPONS[shot.weapon];
    if (shot.weapon === 'missile') {
      const target = shot.targetRef ?? null;
      if (!shot.targetId || !target) return { hit: false, reason: 'no-lock' };
      if (target.id !== shot.targetId || !ctx.enemies.includes(target)) return { hit: false, reason: 'invalid-target' };
      if (!target.alive) return { hit: false, reason: 'not-alive' };
      if (dist(target.pos, ctx.shipPos) > spec.range) return { hit: false, reason: 'out-of-range' };
      if (!ctx.isVisible(target.pos)) return { hit: false, reason: 'occluded' };
      return { hit: true, target };
    }
    const target = ctx.enemies.find(e => e.id === shot.targetId && e.alive)
      ?? ctx.enemies.filter(e => e.alive).sort((a, b) => dist(a.pos, ctx.shipPos) - dist(b.pos, ctx.shipPos))[0];
    if (!target) return { hit: false, reason: 'no-target' };
    if (dist(target.pos, ctx.shipPos) > spec.range) return { hit: false, reason: 'out-of-range' };
    if (!ctx.isVisible(target.pos)) return { hit: false, reason: 'occluded' };
    return { hit: true, target };
  }
}
