import { describe, it, expect } from 'vitest';
import { DefenseSystem } from '../src/core/defense';

describe('护盾与装甲', () => {
  it('伤害先扣护盾，脱战后缓慢恢复', () => {
    const d = new DefenseSystem({ shield: 0, armor: 0 });
    const s0 = d.shield;
    d.takeDamage(30);
    expect(d.shield).toBeCloseTo(s0 - 30);
    expect(d.hull).toBeCloseTo(d.cfg.maxHull);
    d.update(10);
    expect(d.shield).toBeGreaterThan(s0 - 30);
  });

  it('护盾耗尽后装甲减伤，最后扣结构生命', () => {
    const d = new DefenseSystem({ shield: 0, armor: 0 });
    d.takeDamage(d.cfg.maxShield + 100);
    expect(d.shield).toBe(0);
    expect(d.hull).toBeGreaterThan(0);
    expect(d.hull).toBeLessThan(d.cfg.maxHull);
  });

  it('不同部位受损影响对应系统', () => {
    const d = new DefenseSystem({ shield: 0, armor: 0 });
    d.takeDamage(d.cfg.maxShield + 90, 'engine');
    expect(d.parts.engine).toBeLessThan(1);
    expect(d.parts.engine).toBeLessThan(d.parts.radar);
  });

  it('维修包与完整维修', () => {
    const d = new DefenseSystem({ shield: 0, armor: 0 });
    d.takeDamage(d.cfg.maxShield + 80, 'weapon');
    d.repair(80);
    expect(d.hull).toBeGreaterThan(25);
    d.fullRepair();
    expect(d.hull).toBe(d.cfg.maxHull);
    expect(d.parts.weapon).toBe(1);
  });

  it('生命归零后死亡', () => {
    const d = new DefenseSystem({ shield: 0, armor: 0 });
    d.takeDamage(99999);
    expect(d.alive).toBe(false);
  });

  it('护盾故障结束后恢复回盾', () => {
    const d = new DefenseSystem({ shield: 0, armor: 0 });
    d.setShieldOffline(2);
    expect(d.shieldOffline).toBe(true);
    d.update(3);
    expect(d.shieldOffline).toBe(false);
    d.update(5);
    expect(d.shield).toBeGreaterThan(0);
  });
});
