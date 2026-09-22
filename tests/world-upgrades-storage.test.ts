import { describe, it, expect } from 'vitest';
import { World } from '../src/core/world';
import { v, Rng } from '../src/core/math';
import { UpgradeManager, UPGRADE_DEFS, upgradeCost } from '../src/core/upgrades';
import {
  MemoryStorage,
  loadSave,
  persistSave,
  defaultSave,
  applyMissionResult,
  migrate,
  SAVE_KEY
} from '../src/core/storage';

describe('资源拾取', () => {
  it('靠近物资可拾取，离开则不能', () => {
    const w = new World(new Rng(1));
    w.addPickup({ id: 'p1', pos: v(5, 0, 0), kind: 'fuel', amount: 20, taken: false });
    expect(w.collectPickups(v(0, 0, 0), 4).length).toBe(1);
    w.addPickup({ id: 'p2', pos: v(100, 0, 0), kind: 'ammo', amount: 10, taken: false });
    expect(w.collectPickups(v(0, 0, 0), 4).length).toBe(0);
  });

  it('视线被陨石阻挡', () => {
    const w = new World(new Rng(1));
    w.addObstacle({ id: 'r', pos: v(0, 0, -20), radius: 8, kind: 'asteroid', alive: true });
    expect(w.lineBlocked(v(0, 0, 0), v(0, 0, -40))).toBe(true);
    expect(w.lineBlocked(v(0, 0, 0), v(30, 0, -40))).toBe(false);
  });

  it('陨石带偏移整体移动陨石位置', () => {
    const w = new World(new Rng(3));
    w.buildAsteroidBelt(v(0, 0, 0), 20, 80);
    const z0 = w.obstacles[0].pos.z;
    w.shiftAsteroids(v(0, 0, 30));
    expect(w.obstacles[0].pos.z - z0).toBeCloseTo(30);
  });
});

describe('飞船改装', () => {
  it('资源足够才能升级，每类最多三级且真实扣费', () => {
    const um = new UpgradeManager(undefined, 100);
    const cost = upgradeCost(UPGRADE_DEFS[0], 0);
    expect(um.canUpgrade('engine')).toBe(true);
    expect(um.upgrade('engine')).toBe(true);
    expect(um.state.engine).toBe(1);
    expect(um.resources).toBe(100 - cost);
    um.resources = 0;
    expect(um.canUpgrade('engine')).toBe(false);
  });

  it('六个改装槽均为三级', () => {
    expect(UPGRADE_DEFS.length).toBe(6);
    UPGRADE_DEFS.forEach((d) => expect(d.maxLevel).toBe(3));
  });

  it('满级后不能继续升级', () => {
    const um = new UpgradeManager(undefined, 9999);
    for (let i = 0; i < 3; i++) um.upgrade('weapon');
    expect(um.upgrade('weapon')).toBe(false);
  });
});

describe('localStorage 存档', () => {
  it('默认存档、写入、读取一致', () => {
    const kv = new MemoryStorage();
    const data = defaultSave();
    data.resources = 77;
    persistSave(kv, data);
    const loaded = loadSave(kv);
    expect(loaded.resources).toBe(77);
  });

  it('损坏的存档回退到默认值', () => {
    const kv = new MemoryStorage();
    kv.setItem(SAVE_KEY, '{not-json');
    expect(loadSave(kv).version).toBe(defaultSave().version);
  });

  it('迁移补齐旧版本缺失字段', () => {
    const m = migrate({ resources: 10 } as any);
    expect(m.upgrades.engine).toBe(0);
    expect(m.settings.masterVolume).toBeGreaterThan(0);
  });

  it('任务成功解锁下一关并累计资源与击杀', () => {
    const data = defaultSave();
    const next = applyMissionResult(data, 0, { success: true, kills: 5, resources: 50 });
    expect(next.unlockedMission).toBe(1);
    expect(next.resources).toBe(50);
    expect(next.totalKills).toBe(5);
    const fail = applyMissionResult(data, 0, { success: false, kills: 2, resources: 50 });
    expect(fail.unlockedMission).toBe(0);
    expect(fail.resources).toBe(0);
  });
});
