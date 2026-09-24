import { describe, expect, it, beforeEach } from 'vitest';
import { applyPickup, isPickupKind, PickupKind, PickupLedger, PICKUP_EFFECTS, ResourceState } from '../src/core/pickups';
import { Ship } from '../src/core/ship';
import { SaveStore } from '../src/core/storage';

const noUpgrades = { engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 };
const makeState = (over: Partial<ResourceState> = {}): ResourceState => ({ fuel: 50, missile: 10, blast: 8, repairMaterials: 2, points: 0, ...over });
const snapshot = (s: ResourceState) => ({ ...s });

describe('资源结算映射：四类拾取的精确效果', () => {
  it('fuel 拾取只增加 30 点燃料', () => {
    const s = makeState({ fuel: 40 });
    const r = applyPickup(s, 'fuel');
    expect(r.applied).toBe(true); expect(r.changes.fuel).toBe(30); expect(s.fuel).toBe(70);
    expect(s.missile).toBe(10); expect(s.blast).toBe(8); expect(s.repairMaterials).toBe(2); expect(s.points).toBe(0);
  });
  it('fuel 在 0 到 100 之间截断，90 时只补到 100', () => {
    const s = makeState({ fuel: 90 });
    const r = applyPickup(s, 'fuel');
    expect(s.fuel).toBe(100); expect(r.changes.fuel).toBe(10);
  });
  it('fuel 已满时不转化为其他资源', () => {
    const s = makeState({ fuel: 100 });
    const r = applyPickup(s, 'fuel');
    expect(s.fuel).toBe(100); expect(r.changes.fuel).toBe(0);
    expect(s.missile).toBe(10); expect(s.repairMaterials).toBe(2); expect(s.points).toBe(0);
  });
  it('ammo 拾取只增加导弹 2 发和爆破弹 1 发，不影响 fuel', () => {
    const s = makeState({ fuel: 33 });
    const r = applyPickup(s, 'ammo');
    expect(r.changes).toEqual({ missile: 2, blast: 1 });
    expect(s.missile).toBe(12); expect(s.blast).toBe(9); expect(s.fuel).toBe(33); expect(s.points).toBe(0);
  });
  it('ammo 多次拾取可累积', () => {
    const s = makeState();
    const ledger = new PickupLedger();
    ledger.register('a'); ledger.register('b'); ledger.register('c');
    for (const id of ['a', 'b', 'c']) expect(ledger.settle(id, 'ammo', s)?.applied).toBe(true);
    expect(s.missile).toBe(16); expect(s.blast).toBe(11); expect(s.fuel).toBe(50);
  });
  it('repair 增加一个维修材料并对受损飞船执行一次维修', () => {
    const ship = new Ship(noUpgrades); ship.takeDamage(180, 'weapon');
    const s = makeState({ repairMaterials: ship.repairMaterials });
    const hp = ship.hp;
    const r = applyPickup(s, 'repair', () => { ship.repairMaterials = s.repairMaterials; const done = ship.repair(); s.repairMaterials = ship.repairMaterials; return done; });
    expect(r.changes.repaired).toBe(true); expect(r.changes.repairMaterials).toBe(0);
    expect(ship.hp).toBeGreaterThan(hp); expect(ship.repairMaterials).toBe(2);
  });
  it('repair 在生命装甲部位全满时保留材料且不改其他资源', () => {
    const ship = new Ship(noUpgrades);
    const s = makeState({ repairMaterials: ship.repairMaterials });
    const r = applyPickup(s, 'repair', () => { ship.repairMaterials = s.repairMaterials; const done = ship.repair(); s.repairMaterials = ship.repairMaterials; return done; });
    expect(r.changes.repaired).toBe(false); expect(r.changes.repairMaterials).toBe(1);
    expect(ship.repairMaterials).toBe(3); expect(ship.hp).toBe(ship.maxHp); expect(s.fuel).toBe(50); expect(s.missile).toBe(10);
  });
  it('module 只增加一个改装点，不串改其他资源', () => {
    const s = makeState({ points: 2, fuel: 17 });
    const before = snapshot(s);
    const r = applyPickup(s, 'module');
    expect(r.changes).toEqual({ points: 1 }); expect(s.points).toBe(3);
    expect(s.fuel).toBe(before.fuel); expect(s.missile).toBe(before.missile); expect(s.blast).toBe(before.blast); expect(s.repairMaterials).toBe(before.repairMaterials);
  });
});

describe('幂等结算：重复、跨帧与非法输入', () => {
  it('同一对象重复结算只发放一次', () => {
    const s = makeState(); const ledger = new PickupLedger(); ledger.register('p1');
    expect(ledger.settle('p1', 'fuel', s)?.applied).toBe(true);
    expect(ledger.settle('p1', 'fuel', s)).toBeNull();
    expect(s.fuel).toBe(80);
  });
  it('数组中重复引用同一对象不会双倍奖励', () => {
    const s = makeState(); const ledger = new PickupLedger(); ledger.register('dup');
    const results = [ledger.settle('dup', 'ammo', s), ledger.settle('dup', 'ammo', s)];
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(s.missile).toBe(12); expect(s.blast).toBe(9);
  });
  it('跨帧重复 update 不会重复结算', () => {
    const s = makeState(); const ledger = new PickupLedger(); ledger.register('frame');
    const frames = [ledger.settle('frame', 'module', s), ledger.settle('frame', 'module', s), ledger.settle('frame', 'module', s)];
    expect(frames[0]?.changes.points).toBe(1); expect(frames[1]).toBeNull(); expect(frames[2]).toBeNull();
    expect(s.points).toBe(1);
  });
  it('非法类型被保护，不改变任何资源', () => {
    const s = makeState(); const before = snapshot(s);
    const r = applyPickup(s, 'gold' as PickupKind);
    expect(r.applied).toBe(false); expect(r.changes).toEqual({}); expect(s).toEqual(before);
    expect(isPickupKind('gold')).toBe(false); expect(isPickupKind('fuel')).toBe(true);
  });
  it('未注册的 id 不能结算', () => {
    const s = makeState(); const ledger = new PickupLedger();
    expect(ledger.settle('ghost', 'fuel', s)).toBeNull(); expect(s.fuel).toBe(50);
  });
});

describe('拾取链路集成：距离门控、场景清理与练习模式', () => {
  const makeHarness = () => {
    const ledger = new PickupLedger();
    const scene = new Set<string>();
    const state = makeState();
    let seq = 0;
    const pickups: { id: string; kind: PickupKind; dist: number }[] = [];
    const add = (kind: PickupKind, dist: number) => { const id = `pickup-${seq++}`; ledger.register(id); scene.add(id); pickups.push({ id, kind, dist }); return id; };
    const update = () => {
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        if (p.dist > 8) continue;
        const r = ledger.settle(p.id, p.kind, state);
        scene.delete(p.id);
        pickups.splice(i, 1);
        if (!r) continue;
      }
    };
    return { ledger, scene, state, pickups, add, update };
  };
  it('距离检测失败时不结算、不移除', () => {
    const h = makeHarness(); h.add('fuel', 20);
    h.update();
    expect(h.state.fuel).toBe(50); expect(h.pickups).toHaveLength(1); expect(h.ledger.size).toBe(1);
  });
  it('结算成功后从活动集合和场景原子移除', () => {
    const h = makeHarness(); const id = h.add('ammo', 3);
    h.update();
    expect(h.state.missile).toBe(12); expect(h.ledger.isActive(id)).toBe(false);
    expect(h.scene.has(id)).toBe(false); expect(h.pickups).toHaveLength(0);
  });
  it('场景移除后重复 update 不造成双倍奖励', () => {
    const h = makeHarness(); h.add('fuel', 3);
    h.update(); h.update(); h.update();
    expect(h.state.fuel).toBe(80);
  });
  it('练习模式高维修材料下 repair 拾取仍只发一份材料并维修一次', () => {
    const ship = new Ship(noUpgrades); ship.repairMaterials = 8; ship.takeDamage(180, 'hull');
    const s = makeState({ repairMaterials: ship.repairMaterials });
    const ledger = new PickupLedger(); ledger.register('prac');
    const r = ledger.settle('prac', 'repair', s, () => { ship.repairMaterials = s.repairMaterials; const done = ship.repair(); s.repairMaterials = ship.repairMaterials; return done; });
    expect(r?.changes.repaired).toBe(true); expect(ship.repairMaterials).toBe(8);
    expect(ledger.settle('prac', 'repair', s)).toBeNull(); expect(ship.repairMaterials).toBe(8);
  });
  it('旧存档缺字段时按默认值补全，不影响资源结算', () => {
    localStorage.clear();
    localStorage.setItem('starfall-defense-save', JSON.stringify({ resources: 5, upgrades: { engine: 2 }, settings: { practice: true } }));
    const data = new SaveStore().load();
    expect(data.resources).toBe(5); expect(data.upgrades.engine).toBe(2); expect(data.upgrades.missile).toBe(0);
    expect(data.settings.practice).toBe(true); expect(data.settings.volume).toBe(0.6); expect(data.points).toBe(0);
    const s = makeState({ points: data.points });
    applyPickup(s, 'module');
    expect(s.points).toBe(1);
  });
  it('完整回归：四类拾取各结算一次后状态等于各自效果之和', () => {
    const ship = new Ship(noUpgrades); ship.takeDamage(100, 'engine');
    const s = makeState({ fuel: 10, missile: 4, blast: 3, repairMaterials: ship.repairMaterials, points: 1 });
    const ledger = new PickupLedger();
    (['fuel', 'ammo', 'repair', 'module'] as const).forEach((k, i) => ledger.register(`r${i}`));
    ledger.settle('r0', 'fuel', s);
    ledger.settle('r1', 'ammo', s);
    ledger.settle('r2', 'repair', s, () => { ship.repairMaterials = s.repairMaterials; const done = ship.repair(); s.repairMaterials = ship.repairMaterials; return done; });
    ledger.settle('r3', 'module', s);
    expect(s.fuel).toBe(40); expect(s.missile).toBe(4 + PICKUP_EFFECTS.ammo.missile); expect(s.blast).toBe(3 + PICKUP_EFFECTS.ammo.blast);
    expect(s.repairMaterials).toBe(2); expect(s.points).toBe(2); expect(ledger.size).toBe(0);
  });
});
