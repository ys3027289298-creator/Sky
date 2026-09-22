import { describe, it, expect } from 'vitest';
import { WeaponSystem, WEAPONS, updateProjectile, projectileHits } from '../src/core/weapons';
import { v } from '../src/core/math';

const noUp = { weapon: 0, missile: 0 };

describe('武器射击与过热', () => {
  it('双联能量炮受射速间隔限制', () => {
    const w = new WeaponSystem(WEAPONS.dual, noUp);
    expect(w.tryFire(1)).toBe(true);
    expect(w.tryFire(1)).toBe(false);
    w.update(1 / WEAPONS.dual.fireRate + 0.01);
    expect(w.tryFire(1)).toBe(true);
  });

  it('持续射击累积热量，过热后无法继续射击', () => {
    const w = new WeaponSystem(WEAPONS.dual, noUp);
    let fired = 0;
    for (let i = 0; i < 100; i++) {
      if (w.tryFire(1)) fired++;
      w.update(1 / WEAPONS.dual.fireRate);
    }
    expect(w.overheated).toBe(true);
    expect(w.tryFire(1)).toBe(false);
  });

  it('R 手动冷却/换弹后清除过热并补满副武器弹药', () => {
    const w = new WeaponSystem(WEAPONS.missile, noUp);
    w.ammo = 3;
    w.startReload();
    expect(w.tryFire(1)).toBe(false);
    w.update(WEAPONS.missile.reloadTime + 0.01);
    expect(w.reloading).toBe(false);
    expect(w.ammo).toBe(WEAPONS.missile.maxAmmo);
  });

  it('副武器弹药有限，打空后不能射击', () => {
    const w = new WeaponSystem(WEAPONS.blast, noUp);
    let shots = 0;
    for (let i = 0; i < 100; i++) {
      if (w.tryFire(1)) shots++;
      w.update(1 / WEAPONS.blast.fireRate + 0.01);
    }
    expect(shots).toBe(WEAPONS.blast.maxAmmo);
    expect(w.ammo).toBe(0);
  });

  it('武器部件受损降低射速', () => {
    const healthy = new WeaponSystem(WEAPONS.dual, noUp);
    healthy.tryFire(1);
    healthy.update(0.2);
    expect(healthy.tryFire(1)).toBe(true);
    const broken = new WeaponSystem(WEAPONS.dual, noUp);
    broken.tryFire(0);
    broken.update(0.2);
    expect(broken.tryFire(0)).toBe(false);
  });

  it('四种武器参数各不相同', () => {
    const ids = Object.keys(WEAPONS);
    expect(ids.length).toBe(4);
    expect(new Set(ids.map((k) => WEAPONS[k as keyof typeof WEAPONS].damage)).size).toBeGreaterThan(1);
  });
});

describe('弹丸飞行', () => {
  it('直射弹丸沿速度方向飞行并在寿命结束后消亡', () => {
    const w = new WeaponSystem(WEAPONS.pulse, noUp);
    const p = w.makeProjectile(v(0, 0, 0), v(0, 0, -1), null);
    updateProjectile(p, 0.1, null);
    expect(p.pos.z).toBeLessThan(0);
    p.life = 0;
    updateProjectile(p, 0.1, null);
    expect(p.dead).toBe(true);
  });

  it('追踪导弹会朝目标转向', () => {
    const w = new WeaponSystem(WEAPONS.missile, noUp);
    const p = w.makeProjectile(v(0, 0, 0), v(0, 0, -1), 't1');
    for (let i = 0; i < 8; i++) updateProjectile(p, 0.05, v(60, 0, -60));
    expect(p.vel.x).toBeGreaterThan(0);
  });

  it('命中判定使用目标球半径', () => {
    const p = { pos: v(0, 0, -10), dead: false } as any;
    expect(projectileHits(p, v(0, 0, -12), 3)).toBe(true);
    expect(projectileHits(p, v(50, 50, 50), 3)).toBe(false);
  });
});
