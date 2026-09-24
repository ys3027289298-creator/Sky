import { Vec3, WeaponId, dist } from './types';
import { LockState, WEAPONS } from './weapons';

export interface ShotTarget { id: string; alive: boolean; pos: Vec3; }
export interface ShotContext<T extends ShotTarget = ShotTarget> {
  enemies: T[];
  shipPos: Vec3;
  visible: (pos: Vec3) => boolean;
}

// 发射时校验：导弹只有在满锁且持有有效 targetId 时才允许追踪。
export function canTrackMissile(lock: LockState): boolean {
  return lock.progress >= 100 && lock.targetId !== null;
}

// 命中时校验：再次验证目标身份、存活、射程和当前视线。
// 导弹绝不回退到最近敌人；主炮和爆破弹保留自由瞄准规则。
export function resolveShotTarget<T extends ShotTarget>(id: WeaponId, targetId: string | null | undefined, ctx: ShotContext<T>): T | null {
  const spec = WEAPONS[id];
  if (id === 'missile') {
    if (!targetId) return null;
    const target = ctx.enemies.find(e => e.id === targetId && e.alive);
    if (!target) return null;
    if (dist(target.pos, ctx.shipPos) > spec.range) return null;
    if (!ctx.visible(target.pos)) return null;
    return target;
  }
  const target = ctx.enemies.find(e => e.id === targetId && e.alive)
    ?? ctx.enemies.filter(e => e.alive).sort((a, b) => dist(a.pos, ctx.shipPos) - dist(b.pos, ctx.shipPos))[0];
  if (!target) return null;
  if (dist(target.pos, ctx.shipPos) > spec.range) return null;
  if (!ctx.visible(target.pos)) return null;
  return target;
}

// 每次任务开始生成新的 combat token，延迟投射物回调必须携带 token；
// 旧任务的回调在命中结算时只能被丢弃。
export class CombatSession {
  token = 0;
  begin() { this.token += 1; return this.token; }
  isCurrent(token: number) { return token !== 0 && token === this.token; }
}
