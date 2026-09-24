import { describe, expect, it } from 'vitest';
import { CombatSession, canTrackMissile, resolveShotTarget, ShotTarget } from '../src/core/combat';
import { TargetingSystem } from '../src/core/weapons';
import { v } from '../src/core/types';

const enemy = (id: string, pos = v(0, 0, -100), alive = true): ShotTarget => ({ id, alive, pos });
const allVisible = () => true;
const ctx = (enemies: ShotTarget[], visible: (p: { x: number; y: number; z: number }) => boolean = allVisible) =>
  ({ enemies, shipPos: v(0, 0, 0), visible });

describe('锁定初选：候选必须同时 visible 且 inRange', () => {
  it('隐藏但在范围内的候选不会被初选为目标', () => {
    const t = new TargetingSystem();
    const lock = t.update([{ id: 'a', visible: false, inRange: true }], 0.1);
    expect(lock.targetId).toBeNull();
  });
  it('可见但超出范围的候选不会被初选为目标', () => {
    const t = new TargetingSystem();
    const lock = t.update([{ id: 'a', visible: true, inRange: false }], 0.1);
    expect(lock.targetId).toBeNull();
  });
  it('同时可见且在范围内的候选会被锁定，初始进度 20', () => {
    const t = new TargetingSystem();
    const lock = t.update([{ id: 'a', visible: true, inRange: true }], 0);
    expect(lock.targetId).toBe('a');
    expect(lock.progress).toBe(20);
  });
});

describe('遮挡丢锁：只按 lostTimer 衰减，不自动切换', () => {
  it('遮挡后 lostTimer 累积、进度下降，1.4 秒内保持目标', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }], 1);
    const lock = t.update([{ id: 'a', visible: false, inRange: true }], 1);
    expect(lock.targetId).toBe('a');
    expect(lock.lostTimer).toBeCloseTo(1);
    expect(lock.progress).toBeLessThan(62);
  });
  it('遮挡超过 1.4 秒后清除锁定', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }], 1);
    const lock = t.update([{ id: 'a', visible: false, inRange: true }], 1.5);
    expect(lock.targetId).toBeNull();
    expect(lock.progress).toBe(0);
  });
  it('当前目标被遮挡时不会自动切到隐藏候选', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }, { id: 'b', visible: false, inRange: true }], 1);
    const during = t.update([{ id: 'a', visible: false, inRange: true }, { id: 'b', visible: false, inRange: true }], 1);
    expect(during.targetId).toBe('a');
    const after = t.update([{ id: 'a', visible: false, inRange: true }, { id: 'b', visible: false, inRange: true }], 1);
    expect(after.targetId).toBeNull();
  });
});

describe('目标切换：只允许切到另一个可见且在范围内的目标', () => {
  it('可切换到另一个可见目标', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }], 0.1);
    const lock = t.update([{ id: 'a', visible: true, inRange: true }, { id: 'b', visible: true, inRange: true }], 0.1, true);
    expect(lock.targetId).toBe('b');
  });
  it('隐藏候选不能成为切换目标', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }], 0.1);
    const lock = t.update([{ id: 'a', visible: true, inRange: true }, { id: 'b', visible: false, inRange: true }], 0.1, true);
    expect(lock.targetId).toBe('a');
  });
  it('没有其他可见目标时切换请求保持原目标', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }], 0.1);
    const lock = t.update([{ id: 'a', visible: true, inRange: true }], 0.1, true);
    expect(lock.targetId).toBe('a');
  });
});

describe('锁定进度与导弹发射门槛', () => {
  it('锁定进度从 20 起按 42/s 累积并封顶 100', () => {
    const t = new TargetingSystem();
    let lock = t.update([{ id: 'a', visible: true, inRange: true }], 0.5);
    expect(lock.progress).toBeCloseTo(41);
    lock = t.update([{ id: 'a', visible: true, inRange: true }], 10);
    expect(lock.progress).toBe(100);
  });
  it('导弹只有满锁且持有 targetId 时才允许追踪', () => {
    expect(canTrackMissile({ targetId: 'a', progress: 100, lostTimer: 0 })).toBe(true);
    expect(canTrackMissile({ targetId: 'a', progress: 99, lostTimer: 0 })).toBe(false);
    expect(canTrackMissile({ targetId: null, progress: 100, lostTimer: 0 })).toBe(false);
  });
});

describe('导弹命中时再校验', () => {
  it('无 targetId 的导弹不得回退到最近敌人', () => {
    const near = enemy('near', v(0, 0, -30));
    expect(resolveShotTarget('missile', null, ctx([near]))).toBeNull();
    expect(resolveShotTarget('missile', undefined, ctx([near]))).toBeNull();
  });
  it('满锁导弹命中锁定目标本人而不是最近的别人', () => {
    const locked = enemy('locked', v(0, 0, -200));
    const nearer = enemy('nearer', v(0, 0, -30));
    expect(resolveShotTarget('missile', 'locked', ctx([locked, nearer]))?.id).toBe('locked');
  });
  it('发射后目标被遮挡则命中无效', () => {
    const target = enemy('a', v(0, 0, -100));
    expect(resolveShotTarget('missile', 'a', ctx([target], () => false))).toBeNull();
  });
  it('命中时目标超出射程则无效', () => {
    const target = enemy('a', v(0, 0, -400));
    expect(resolveShotTarget('missile', 'a', ctx([target]))).toBeNull();
  });
  it('命中时目标已死亡则无效', () => {
    const target = enemy('a', v(0, 0, -100), false);
    expect(resolveShotTarget('missile', 'a', ctx([target]))).toBeNull();
  });
  it('目标 ID 复用时仍按当前状态校验：复用者被遮挡则不命中', () => {
    const reused = enemy('a', v(0, 0, -100));
    expect(resolveShotTarget('missile', 'a', ctx([reused], () => false))).toBeNull();
    expect(resolveShotTarget('missile', 'a', ctx([reused]))?.id).toBe('a');
  });
});

describe('主炮与爆破弹保留自由瞄准', () => {
  it('主炮无锁定时命中最近的可见敌人', () => {
    const near = enemy('near', v(0, 0, -40));
    const far = enemy('far', v(0, 0, -120));
    expect(resolveShotTarget('twin', null, ctx([far, near]))?.id).toBe('near');
  });
  it('主炮不命中被遮挡或超出射程的目标', () => {
    const hidden = enemy('hidden', v(0, 0, -40));
    expect(resolveShotTarget('twin', null, ctx([hidden], () => false))).toBeNull();
    const outOfRange = enemy('far', v(0, 0, -300));
    expect(resolveShotTarget('twin', null, ctx([outOfRange]))).toBeNull();
  });
  it('爆破弹无锁定时仍可自由瞄准最近可见敌人', () => {
    const near = enemy('near', v(0, 0, -60));
    expect(resolveShotTarget('blast', null, ctx([near]))?.id).toBe('near');
  });
  it('爆破弹保留视线检查，不穿障碍命中', () => {
    const hidden = enemy('hidden', v(0, 0, -60));
    expect(resolveShotTarget('blast', null, ctx([hidden], () => false))).toBeNull();
  });
});

describe('战斗会话 token：重开任务后旧回调只能被丢弃', () => {
  it('token 随任务开始递增，只有当前 token 有效', () => {
    const s = new CombatSession();
    const first = s.begin();
    expect(s.isCurrent(first)).toBe(true);
    const second = s.begin();
    expect(s.isCurrent(first)).toBe(false);
    expect(s.isCurrent(second)).toBe(true);
    expect(s.isCurrent(0)).toBe(false);
  });
  it('集成：旧任务的延迟命中回调不会伤害新局目标', () => {
    const session = new CombatSession();
    const fire = (token: number, targetId: string, enemies: ShotTarget[]) =>
      () => {
        if (!session.isCurrent(token)) return null;
        const hit = resolveShotTarget('missile', targetId, ctx(enemies));
        if (hit) hit.alive = false;
        return hit;
      };
    // 第一局：满锁发射导弹，回调携带 token1
    const token1 = session.begin();
    const oldEnemies = [enemy('scout-0')];
    const staleCallback = fire(token1, 'scout-0', oldEnemies);
    // 玩家在 280ms 回调执行前重开任务：新 token、新敌人列表（ID 恰好复用）
    const token2 = session.begin();
    const newEnemies = [enemy('scout-0')];
    const freshCallback = fire(token2, 'scout-0', newEnemies);
    // 旧回调落地：必须被丢弃，新局目标毫发无损
    expect(staleCallback()).toBeNull();
    expect(newEnemies[0].alive).toBe(true);
    // 新局的回调正常生效
    expect(freshCallback()?.id).toBe('scout-0');
    expect(newEnemies[0].alive).toBe(false);
  });
});
