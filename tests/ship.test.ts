import { describe, it, expect } from 'vitest';
import { PlayerShip, BASE_SHIP_CONFIG } from '../src/core/ship';
import { v, len, dist } from '../src/core/math';
import { defaultUpgrades } from '../src/core/upgrades';

const fullHealth = () => 1;

describe('飞船移动与惯性', () => {
  it('W 键加速产生前向速度且有上限', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    for (let i = 0; i < 200; i++) {
      s.update(0.05, { throttle: 1, strafe: 0, pitch: 0, yaw: 0, roll: 0, boost: false, evade: false }, fullHealth);
    }
    expect(s.speed).toBeGreaterThan(40);
    expect(s.speed).toBeLessThanOrEqual(BASE_SHIP_CONFIG.maxSpeed + 0.01);
  });

  it('松开油门后因惯性继续滑行而非立刻停止', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    for (let i = 0; i < 60; i++)
      s.update(0.05, { throttle: 1, strafe: 0, pitch: 0, yaw: 0, roll: 0, boost: false, evade: false }, fullHealth);
    const moving = s.speed;
    for (let i = 0; i < 10; i++)
      s.update(0.05, { throttle: 0, strafe: 0, pitch: 0, yaw: 0, roll: 0, boost: false, evade: false }, fullHealth);
    expect(s.speed).toBeGreaterThan(moving * 0.5);
    expect(s.speed).toBeLessThan(moving);
  });

  it('A/D 产生横向移动', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    for (let i = 0; i < 30; i++)
      s.update(0.05, { throttle: 0, strafe: 1, pitch: 0, yaw: 0, roll: 0, boost: false, evade: false }, fullHealth);
    expect(s.pos.x).toBeGreaterThan(5);
  });

  it('转向速度受限，单帧不会瞬转', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    const f0 = { ...s.forward };
    s.update(0.016, { throttle: 0, strafe: 0, pitch: 1, yaw: 1, roll: 0, boost: false, evade: false }, fullHealth);
    const dot = f0.x * s.forward.x + f0.y * s.forward.y + f0.z * s.forward.z;
    expect(dot).toBeLessThan(1);
    expect(dot).toBeGreaterThan(0.95);
  });

  it('冲刺消耗能量与燃料并提升极速', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    for (let i = 0; i < 100; i++)
      s.update(0.05, { throttle: 1, strafe: 0, pitch: 0, yaw: 0, roll: 0, boost: true, evade: false }, fullHealth);
    expect(s.energy).toBeLessThan(s.maxEnergy);
    expect(s.fuel).toBeLessThan(s.maxFuel);
    expect(s.speed).toBeGreaterThan(BASE_SHIP_CONFIG.maxSpeed);
  });

  it('闪避有冷却且消耗能量', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    const e0 = s.energy;
    s.update(0.05, { throttle: 1, strafe: 0, pitch: 0, yaw: 0, roll: 0, boost: false, evade: true }, fullHealth);
    expect(s.evadeTimer).toBeGreaterThan(0);
    expect(s.energy).toBeLessThan(e0);
    const e1 = s.energy;
    s.update(0.05, { throttle: 0, strafe: 0, pitch: 0, yaw: 0, roll: 0, boost: false, evade: true }, fullHealth);
    expect(s.evadeCooldownTimer).toBeGreaterThan(0);
    expect(s.energy).toBeGreaterThanOrEqual(e1 - 1);
  });
});

describe('飞船碰撞', () => {
  it('不能穿过大型球体障碍物，被推开并反弹', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    s.vel = v(0, 0, -40);
    const impact = s.resolveSphereCollision(v(0, 0, -10), 12);
    expect(dist(s.pos, v(0, 0, -10))).toBeCloseTo(12 + s.radius, 5);
    expect(impact).toBeGreaterThan(0);
    expect(s.vel.z).toBeGreaterThan(0);
  });

  it('引擎受损降低最高速度', () => {
    const s = new PlayerShip(v(0, 0, 0), defaultUpgrades());
    const damaged = () => 0;
    for (let i = 0; i < 200; i++)
      s.update(0.05, { throttle: 1, strafe: 0, pitch: 0, yaw: 0, roll: 0, boost: false, evade: false }, damaged);
    expect(s.speed).toBeLessThan(BASE_SHIP_CONFIG.maxSpeed * 0.6);
  });
});
