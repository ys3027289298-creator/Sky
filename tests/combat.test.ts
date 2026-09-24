import { describe, expect, it } from 'vitest';
import { CombatSession, PendingShot, ShotContext } from '../src/core/combat';
import { Enemy, ENEMY_CONFIG } from '../src/core/enemies';
import { v } from '../src/core/types';
import { TargetingSystem, WEAPONS } from '../src/core/weapons';

const makeEnemy = (id: string, pos = v(0, 0, -100)) => new Enemy(id, 'scout', pos, v(0, 0, 0));

const ctxWith = (enemies: Enemy[], isVisible: () => boolean = () => true): ShotContext => ({
  enemies,
  shipPos: v(0, 0, 0),
  isVisible,
});

const missileShot = (session: CombatSession, target: Enemy | null, targetId: string | null): PendingShot => ({
  token: session.token,
  weapon: 'missile',
  targetId,
  targetRef: target,
});

describe('锁定候选选择：visible 与 inRange 必须同时满足', () => {
  it('遮挡但在锁定距离内的敌人不会被初选为目标', () => {
    const t = new TargetingSystem();
    const lock = t.update([{ id: 'hidden', visible: false, inRange: true }], 0.5);
    expect(lock.targetId).toBeNull();
    expect(lock.progress).toBe(0);
  });

  it('可见但超出锁定距离的敌人不会被初选为目标', () => {
    const t = new TargetingSystem();
    const lock = t.update([{ id: 'far', visible: true, inRange: false }], 0.5);
    expect(lock.targetId).toBeNull();
  });

  it('当前目标被遮挡后只降进度，超过 1.4 秒才清除锁定', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }], 2);
    const halfway = t.update([{ id: 'a', visible: false, inRange: true }], 1.0);
    expect(halfway.targetId).toBe('a');
    expect(halfway.progress).toBeLessThan(100);
    const cleared = t.update([{ id: 'a', visible: false, inRange: true }], 0.5);
    expect(cleared.targetId).toBeNull();
  });

  it('丢锁后不会自动切到仍在距离内但被遮挡的候选', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }], 2);
    t.update([{ id: 'a', visible: false, inRange: true }, { id: 'b', visible: false, inRange: true }], 1.5);
    const lock = t.update([{ id: 'a', visible: false, inRange: true }, { id: 'b', visible: false, inRange: true }], 0.1);
    expect(lock.targetId).toBeNull();
  });

  it('用户请求切换时切到另一个可见且在范围内的目标', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }, { id: 'b', visible: true, inRange: true }], 0.1);
    const lock = t.update([{ id: 'a', visible: true, inRange: true }, { id: 'b', visible: true, inRange: true }], 0.1, true);
    expect(lock.targetId).toBe('b');
  });

  it('切换请求只允许可见目标：其余候选被遮挡时保持当前锁定', () => {
    const t = new TargetingSystem();
    t.update([{ id: 'a', visible: true, inRange: true }, { id: 'b', visible: false, inRange: true }], 0.1);
    const lock = t.update([{ id: 'a', visible: true, inRange: true }, { id: 'b', visible: false, inRange: true }], 0.1, true);
    expect(lock.targetId).toBe('a');
  });

  it('锁定进度：获得时 20，可见时按 42/s 累积到 100，遮挡时按 35/s 衰减', () => {
    const t = new TargetingSystem();
    let lock = t.update([{ id: 'a', visible: true, inRange: true }], 0.01);
    expect(lock.progress).toBeGreaterThan(20);
    for (let i = 0; i < 40; i++) lock = t.update([{ id: 'a', visible: true, inRange: true }], 0.1);
    expect(lock.progress).toBe(100);
    lock = t.update([{ id: 'a', visible: false, inRange: true }], 0.5);
    expect(lock.progress).toBeCloseTo(100 - 35 * 0.5, 5);
  });
});

describe('导弹发射门槛与命中复核', () => {
  it('锁定进度未满或没有 targetId 时不允许发射导弹', () => {
    const session = new CombatSession();
    expect(session.canLaunchMissile({ targetId: 'a', progress: 99, lostTimer: 0 })).toBe(false);
    expect(session.canLaunchMissile({ targetId: null, progress: 100, lostTimer: 0 })).toBe(false);
    expect(session.canLaunchMissile({ targetId: 'a', progress: 100, lostTimer: 0 })).toBe(true);
  });

  it('无锁定的导弹不追踪也不造成伤害', () => {
    const session = new CombatSession();
    session.beginMission();
    const enemy = makeEnemy('a');
    const outcome = session.resolveShot(missileShot(session, null, null), ctxWith([enemy]));
    expect(outcome.hit).toBe(false);
    expect(outcome.reason).toBe('no-lock');
    expect(enemy.hp).toBe(ENEMY_CONFIG.scout.hp);
  });

  it('满锁导弹在目标可见且在射程内时正常命中', () => {
    const session = new CombatSession();
    session.beginMission();
    const enemy = makeEnemy('a');
    const outcome = session.resolveShot(missileShot(session, enemy, 'a'), ctxWith([enemy]));
    expect(outcome.hit).toBe(true);
    expect(outcome.target).toBe(enemy);
  });

  it('发射后目标被障碍物遮挡时导弹丢失（命中时复核视线）', () => {
    const session = new CombatSession();
    session.beginMission();
    const enemy = makeEnemy('a');
    const outcome = session.resolveShot(missileShot(session, enemy, 'a'), ctxWith([enemy], () => false));
    expect(outcome.hit).toBe(false);
    expect(outcome.reason).toBe('occluded');
    expect(enemy.hp).toBe(ENEMY_CONFIG.scout.hp);
  });

  it('命中时目标已超出导弹射程则不造成伤害', () => {
    const session = new CombatSession();
    session.beginMission();
    const enemy = makeEnemy('a', v(0, 0, -WEAPONS.missile.range - 1));
    const outcome = session.resolveShot(missileShot(session, enemy, 'a'), ctxWith([enemy]));
    expect(outcome.hit).toBe(false);
    expect(outcome.reason).toBe('out-of-range');
  });

  it('命中时目标已死亡则不造成伤害', () => {
    const session = new CombatSession();
    session.beginMission();
    const enemy = makeEnemy('a');
    enemy.damage(1000);
    const outcome = session.resolveShot(missileShot(session, enemy, 'a'), ctxWith([enemy]));
    expect(outcome.hit).toBe(false);
    expect(outcome.reason).toBe('not-alive');
  });

  it('目标 ID 被新敌人复用时，旧导弹不会命中新目标', () => {
    const session = new CombatSession();
    session.beginMission();
    const oldTarget = makeEnemy('scout-0');
    oldTarget.damage(1000);
    const reused = makeEnemy('scout-0');
    const outcome = session.resolveShot(missileShot(session, oldTarget, 'scout-0'), ctxWith([reused]));
    expect(outcome.hit).toBe(false);
    expect(outcome.reason).toBe('invalid-target');
    expect(reused.hp).toBe(ENEMY_CONFIG.scout.hp);
    expect(reused.alive).toBe(true);
  });
});

describe('主炮与爆破弹保持自由瞄准', () => {
  it('主炮无锁定时命中最近的可见敌人', () => {
    const session = new CombatSession();
    session.beginMission();
    const near = makeEnemy('near', v(0, 0, -60));
    const far = makeEnemy('far', v(0, 0, -120));
    const shot: PendingShot = { token: session.token, weapon: 'twin', targetId: null, targetRef: null };
    const outcome = session.resolveShot(shot, ctxWith([far, near]));
    expect(outcome.hit).toBe(true);
    expect(outcome.target).toBe(near);
  });

  it('主炮自由瞄准仍受遮挡和射程限制', () => {
    const session = new CombatSession();
    session.beginMission();
    const enemy = makeEnemy('a');
    const shot: PendingShot = { token: session.token, weapon: 'twin', targetId: null, targetRef: null };
    expect(session.resolveShot(shot, ctxWith([enemy], () => false)).reason).toBe('occluded');
    const farEnemy = makeEnemy('b', v(0, 0, -WEAPONS.twin.range - 1));
    expect(session.resolveShot(shot, ctxWith([farEnemy])).reason).toBe('out-of-range');
  });

  it('爆破弹无锁定时回退到最近可见敌人，不强制要求锁定', () => {
    const session = new CombatSession();
    session.beginMission();
    const enemy = makeEnemy('a', v(0, 0, -80));
    const shot: PendingShot = { token: session.token, weapon: 'blast', targetId: null, targetRef: null };
    const outcome = session.resolveShot(shot, ctxWith([enemy]));
    expect(outcome.hit).toBe(true);
    expect(outcome.target).toBe(enemy);
  });

  it('爆破弹携带锁定目标时优先攻击该目标', () => {
    const session = new CombatSession();
    session.beginMission();
    const locked = makeEnemy('locked', v(0, 0, -150));
    const nearer = makeEnemy('nearer', v(0, 0, -60));
    const shot: PendingShot = { token: session.token, weapon: 'blast', targetId: 'locked', targetRef: locked };
    const outcome = session.resolveShot(shot, ctxWith([nearer, locked]));
    expect(outcome.hit).toBe(true);
    expect(outcome.target).toBe(locked);
  });
});

describe('战斗会话集成（不启动 WebGL）', () => {
  it('重开任务后旧 token 的延迟回调被丢弃，不伤害新局目标', () => {
    const session = new CombatSession();
    session.beginMission();
    const firstRun = [makeEnemy('scout-0'), makeEnemy('drone-1', v(30, 0, -120))];
    const staleShot = missileShot(session, firstRun[0], 'scout-0');

    session.beginMission();
    const secondRun = [makeEnemy('scout-0'), makeEnemy('drone-1', v(30, 0, -120))];

    const outcome = session.resolveShot(staleShot, ctxWith(secondRun));
    expect(outcome.hit).toBe(false);
    expect(outcome.reason).toBe('stale-token');
    for (const enemy of secondRun) {
      expect(enemy.alive).toBe(true);
      expect(enemy.hp).toBe(ENEMY_CONFIG[enemy.kind].hp);
    }
  });

  it('同一任务内 token 匹配的满锁导弹完整走通锁定-发射-命中链路', () => {
    const session = new CombatSession();
    session.beginMission();
    const targeting = new TargetingSystem();
    const enemy = makeEnemy('a');
    let lock = targeting.lock;
    for (let i = 0; i < 30; i++) lock = targeting.update([{ id: 'a', visible: true, inRange: true }], 0.1);
    expect(session.canLaunchMissile(lock)).toBe(true);
    const shot = missileShot(session, enemy, lock.targetId);
    const outcome = session.resolveShot(shot, ctxWith([enemy]));
    expect(outcome.hit).toBe(true);
    if (outcome.hit && outcome.target) outcome.target.damage(WEAPONS.missile.damage);
    expect(enemy.hp).toBeLessThan(ENEMY_CONFIG.scout.hp);
  });
});
