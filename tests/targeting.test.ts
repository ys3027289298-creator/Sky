import { describe, it, expect } from 'vitest';
import { TargetingSystem, type LockTarget } from '../src/core/targeting';
import { v } from '../src/core/math';
import type { Obstacle } from '../src/core/types';

const t1 = (over: Partial<LockTarget> = {}): LockTarget => ({ id: 't1', pos: v(0, 0, -50), radius: 3, alive: true, ...over });
const obs = (z = -25, r = 6): Obstacle => ({ id: 'o', pos: v(0, 0, z), radius: r, kind: 'asteroid', alive: true });

describe('导弹锁定', () => {
  it('锁定进度在对准目标后累积到完成', () => {
    const sys = new TargetingSystem(0);
    sys.setCandidates([t1()]);
    for (let i = 0; i < 40; i++) sys.update(0.05, v(0, 0, 0), v(0, 0, -1), [], true);
    expect(sys.locked).toBe(true);
  });

  it('目标过远时脱锁', () => {
    const sys = new TargetingSystem(0);
    sys.current = t1({ pos: v(0, 0, -500) });
    sys.progress = 1;
    sys.update(0.1, v(0, 0, 0), v(0, 0, -1), [], true);
    expect(sys.current).toBeNull();
    expect(sys.lostReason).toContain('距离');
  });

  it('障碍物遮挡视线导致脱锁', () => {
    const sys = new TargetingSystem(0);
    sys.current = t1();
    sys.progress = 1;
    sys.update(0.1, v(0, 0, 0), v(0, 0, -1), [obs()], true);
    expect(sys.current).toBeNull();
    expect(sys.lostReason).toContain('障碍物');
  });

  it('目标偏离锁定锥会脱锁', () => {
    const sys = new TargetingSystem(0);
    sys.current = t1();
    sys.progress = 1;
    sys.update(0.1, v(0, 0, 0), v(1, 0, 0), [], true);
    expect(sys.current).toBeNull();
  });

  it('可在多个目标之间切换', () => {
    const sys = new TargetingSystem(0);
    const a = t1({ id: 'a', pos: v(1, 0, -50) });
    const b = t1({ id: 'b', pos: v(-1, 0, -50) });
    sys.setCandidates([a, b]);
    const first = sys.acquire(v(0, 0, 0), v(0.02, 0, -1), []);
    const second = sys.acquire(v(0, 0, 0), v(0.02, 0, -1), [], true);
    expect(first?.id).not.toBe(second?.id);
  });

  it('干扰装置拖慢锁定速度', () => {
    const sys = new TargetingSystem(0);
    sys.setCandidates([t1({ jamming: 1 })]);
    for (let i = 0; i < 10; i++) sys.update(0.05, v(0, 0, 0), v(0, 0, -1), [], true);
    expect(sys.progress).toBeLessThan(0.6);
  });
});
