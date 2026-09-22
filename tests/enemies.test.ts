import { describe, it, expect } from 'vitest';
import { Enemy, ENEMY_SPECS } from '../src/core/enemies';
import { v, dist } from '../src/core/math';

describe('敌人 AI 状态机', () => {
  it('巡逻时未发现玩家保持 patrol', () => {
    const e = new Enemy('scout', v(0, 0, -30));
    e.update(0.1, v(200, 0, 0), false, []);
    expect(e.state).toBe('patrol');
  });

  it('发现玩家后追击，进入射程后攻击并开火', () => {
    const e = new Enemy('interceptor', v(0, 0, -30));
    e.update(0.1, v(0, 0, 0), true, []);
    expect(['chase', 'attack']).toContain(e.state);
    let fired = false;
    for (let i = 0; i < 60; i++) {
      const ev = e.update(0.2, v(0, 0, 0), true, []);
      if (ev) fired = true;
    }
    expect(e.state).toBe('attack');
    expect(fired).toBe(true);
  });

  it('失去玩家目标后进入搜索，超时回到巡逻', () => {
    const e = new Enemy('scout', v(0, 0, -20));
    e.state = 'attack';
    e.update(0.1, v(0, 0, 0), false, []);
    expect(e.state).toBe('search');
    for (let i = 0; i < 100; i++) e.update(0.1, v(0, 0, 0), false, []);
    expect(e.state).toBe('patrol');
  });

  it('低血量时撤退', () => {
    const e = new Enemy('gunship', v(0, 0, -30));
    e.state = 'attack';
    e.hull = 5;
    e.update(0.1, v(0, 0, 0), true, []);
    expect(e.state).toBe('retreat');
  });

  it('敌人不会穿过障碍物', () => {
    const e = new Enemy('interceptor', v(0, 0, 0));
    const rock = { pos: v(0, 0, -40), radius: 12 };
    for (let i = 0; i < 100; i++) {
      e.state = 'chase';
      e.update(0.1, v(0, 0, -200), true, [rock]);
      expect(dist(e.pos, rock.pos)).toBeGreaterThanOrEqual(rock.radius + e.spec.radius - 0.01);
    }
  });

  it('玩家不在视野时敌人无法开火', () => {
    const e = new Enemy('gunship', v(0, 0, -20));
    e.state = 'attack';
    let fired = false;
    for (let i = 0; i < 30; i++) {
      if (e.update(0.2, v(0, 0, 0), false, [])) fired = true;
    }
    expect(fired).toBe(false);
  });
});

describe('五种敌人差异', () => {
  it('每种敌人速度/攻击偏好不同', () => {
    const kinds = Object.keys(ENEMY_SPECS) as (keyof typeof ENEMY_SPECS)[];
    expect(kinds.length).toBe(5);
    expect(ENEMY_SPECS.scout.speed).toBeLessThan(ENEMY_SPECS.interceptor.speed);
    expect(ENEMY_SPECS.command.maxHull).toBeGreaterThan(ENEMY_SPECS.gunship.maxHull);
  });

  it('指挥舰拥有护盾与可破坏弱点部件', () => {
    const e = new Enemy('command', v(0, 0, -100));
    expect(e.shield).toBeGreaterThan(0);
    expect(e.parts).toBeDefined();
    const before = e.hull;
    e.damage(50, 'shieldNode');
    expect(e.parts!.shieldNode).toBeLessThan(1);
    expect(before - e.hull).toBeGreaterThan(50); // 弱点加成
  });
});
