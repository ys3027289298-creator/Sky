import { describe, it, expect } from 'vitest';
import { EventDirector, baseEffects, applyChoice, EVENT_TEMPLATES } from '../src/core/events';
import { Rng } from '../src/core/math';
import { Enemy } from '../src/core/enemies';
import { v } from '../src/core/math';

describe('动态事件', () => {
  it('至少六种事件，均带来真实数值效果', () => {
    expect(EVENT_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(baseEffects('spaceStorm').visibilityMul).toBeLessThan(1);
    expect(baseEffects('reinforcement').spawnReinforcements).toBeGreaterThan(0);
    expect(baseEffects('shieldFault').shieldDrainPerSec).toBeGreaterThan(0);
    expect(baseEffects('stationExplosion').shake).toBeGreaterThan(0);
    expect(baseEffects('convoyReroute').routeLonger).toBe(true);
    expect(baseEffects('asteroidShift').shake).toBeGreaterThan(0);
  });

  it('事件经历预警倒计时再激活再结束', () => {
    const dir = new EventDirector(new Rng(5));
    (dir as any).nextEventAt = 0;
    const warned = dir.update(1, 'recon');
    expect(warned?.phase).toBe('warning');
    for (let i = 0; i < 20; i++) dir.update(1, 'recon');
    const cur = dir.events[dir.events.length - 1];
    expect(['active', 'done']).toContain(cur.phase);
  });

  it('玩家不同应对方式产生不同结果', () => {
    const evade = applyChoice(baseEffects('spaceStorm'), 'spaceStorm', 'evade');
    const engage = applyChoice(baseEffects('reinforcement'), 'reinforcement', 'engage');
    const fortify = applyChoice(baseEffects('stationExplosion'), 'stationExplosion', 'fortify');
    expect(evade.shieldDrainPerSec).toBeLessThan(baseEffects('spaceStorm').shieldDrainPerSec);
    expect(engage.spawnReinforcements).toBeGreaterThan(baseEffects('reinforcement').spawnReinforcements);
    expect(fortify.enemyDamageMul).toBeLessThan(1);
  });
});

describe('最终指挥舰战斗', () => {
  it('指挥舰需要持续输出才能摧毁，不是一次点击', () => {
    const e = new Enemy('command', v(0, 0, -80));
    e.damage(100, 'hull');
    expect(e.alive).toBe(true);
    let shots = 0;
    while (e.alive && shots < 100) {
      e.damage(60, shots % 3 === 0 ? 'shieldNode' : shots % 3 === 1 ? 'turret' : 'engine');
      shots++;
    }
    expect(e.alive).toBe(false);
    expect(shots).toBeGreaterThan(3);
  });

  it('摧毁护盾节点后再打船体效率更高', () => {
    const direct = new Enemy('command', v(0, 0, -80));
    direct.damage(200, 'hull');
    const weak = new Enemy('command', v(0, 0, -80));
    weak.damage(200, 'shieldNode');
    expect(weak.hull).toBeLessThan(direct.hull);
  });

  it('指挥舰引擎被打坏后速度下降', () => {
    const e = new Enemy('command', v(0, 0, -80));
    const speed0 = e.spec.speed;
    e.damage(180, 'engine');
    expect(e.spec.speed).toBeLessThan(speed0);
  });
});
