import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Ship } from '../src/core/ship';
import { WeaponSystem } from '../src/core/weapons';
import { DEFAULT_SAVE, SaveData, SaveStore } from '../src/core/storage';
import { applyPickup, isPickupKind, PICKUP_RADIUS, PickupPool } from '../src/core/pickups';
import { v } from '../src/core/types';

const upgrades = { engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 };
const makeShip = () => new Ship({ ...upgrades });
const makeSave = (): SaveData => structuredClone(DEFAULT_SAVE);
const makeAmmo = () => ({ missile: 10, blast: 8 });

describe('资源结算映射：四类拾取效果', () => {
  it('fuel 拾取只增加 30 点燃料，不触碰其他资源', () => {
    const s = makeShip(); s.fuel = 40; const ammo = makeAmmo(); const save = makeSave(); const mats = s.repairMaterials;
    const r = applyPickup('fuel', s, ammo, save);
    expect(r.applied).toBe(true); expect(r.kind).toBe('fuel'); expect(r.changes.fuel).toBe(30);
    expect(s.fuel).toBe(70);
    expect(ammo).toEqual({ missile: 10, blast: 8 });
    expect(s.repairMaterials).toBe(mats); expect(save.points).toBe(0);
    expect(r.changes.missile).toBe(0); expect(r.changes.blast).toBe(0); expect(r.changes.points).toBe(0);
  });
  it('fuel 在 0 到 100 之间截断，90 时只补 10 点', () => {
    const s = makeShip(); s.fuel = 90;
    const r = applyPickup('fuel', s, makeAmmo(), makeSave());
    expect(s.fuel).toBe(100); expect(r.changes.fuel).toBe(10);
  });
  it('fuel 已满时不溢出也不把奖励转成别的资源', () => {
    const s = makeShip(); s.fuel = 100; const ammo = makeAmmo(); const save = makeSave();
    const r = applyPickup('fuel', s, ammo, save);
    expect(r.applied).toBe(true); expect(r.changes.fuel).toBe(0);
    expect(s.fuel).toBe(100); expect(ammo).toEqual({ missile: 10, blast: 8 }); expect(save.points).toBe(0);
  });
  it('ammo 拾取只增加导弹 2 发和爆破弹 1 发，不再误加燃料', () => {
    const s = makeShip(); s.fuel = 50; const ammo = makeAmmo(); const save = makeSave();
    const r = applyPickup('ammo', s, ammo, save);
    expect(r.applied).toBe(true); expect(r.changes.missile).toBe(2); expect(r.changes.blast).toBe(1);
    expect(ammo.missile).toBe(12); expect(ammo.blast).toBe(9);
    expect(s.fuel).toBe(50); expect(r.changes.fuel).toBe(0); expect(save.points).toBe(0);
  });
  it('ammo 多次拾取稳定累加', () => {
    const s = makeShip(); const ammo = makeAmmo(); const save = makeSave();
    applyPickup('ammo', s, ammo, save); applyPickup('ammo', s, ammo, save); applyPickup('ammo', s, ammo, save);
    expect(ammo.missile).toBe(16); expect(ammo.blast).toBe(11); expect(s.fuel).toBe(100);
  });
  it('repair 拾取增加一个维修材料并执行一次维修', () => {
    const s = makeShip(); s.takeDamage(200, 'hull'); const hp = s.hp; const mats = s.repairMaterials;
    const r = applyPickup('repair', s, makeAmmo(), makeSave());
    expect(r.applied).toBe(true); expect(r.changes.repairMaterials).toBe(1); expect(r.changes.repairUsed).toBe(true);
    expect(s.repairMaterials).toBe(mats); expect(s.hp).toBeGreaterThan(hp);
  });
  it('repair 拾取在状态已满时保留材料且不串改其他资源', () => {
    const s = makeShip(); const ammo = makeAmmo(); const save = makeSave(); const mats = s.repairMaterials;
    const r = applyPickup('repair', s, ammo, save);
    expect(r.changes.repairUsed).toBe(false);
    expect(s.repairMaterials).toBe(mats + 1); expect(s.hp).toBe(s.maxHp);
    expect(s.fuel).toBe(100); expect(ammo).toEqual({ missile: 10, blast: 8 }); expect(save.points).toBe(0);
  });
  it('module 拾取只增加一个改装点，不串改燃料弹药和材料', () => {
    const s = makeShip(); s.fuel = 55; const ammo = makeAmmo(); const save = makeSave(); save.points = 2; const mats = s.repairMaterials;
    const r = applyPickup('module', s, ammo, save);
    expect(r.applied).toBe(true); expect(r.changes.points).toBe(1); expect(save.points).toBe(3);
    expect(s.fuel).toBe(55); expect(ammo).toEqual({ missile: 10, blast: 8 }); expect(s.repairMaterials).toBe(mats);
    expect(r.changes.fuel).toBe(0); expect(r.changes.missile).toBe(0); expect(r.changes.repairMaterials).toBe(0);
  });
  it('非法拾取类型被保护，任何资源都不变', () => {
    const s = makeShip(); s.fuel = 60; const ammo = makeAmmo(); const save = makeSave();
    expect(isPickupKind('grenade')).toBe(false); expect(isPickupKind('ammo')).toBe(true);
    const r = applyPickup('grenade', s, ammo, save);
    expect(r.applied).toBe(false); expect(r.kind).toBeNull();
    expect(s.fuel).toBe(60); expect(ammo).toEqual({ missile: 10, blast: 8 }); expect(save.points).toBe(0);
    expect(r.changes).toEqual({ fuel: 0, missile: 0, blast: 0, repairMaterials: 0, repairUsed: false, points: 0 });
  });
});

describe('拾取池幂等结算', () => {
  const setup = () => {
    const ship = makeShip(); ship.pos = v(0, 0, 0); ship.fuel = 50;
    const ammo = makeAmmo(); const save = makeSave();
    const pool = new PickupPool<{ kind: string; pos: { x: number; y: number; z: number } }>();
    const apply = (kind: any) => applyPickup(kind, ship, ammo, save);
    return { ship, ammo, save, pool, apply };
  };
  it('距离检测失败时不结算且对象保留在活动集合', () => {
    const { ship, pool, apply } = setup();
    const p = pool.add({ kind: 'fuel', pos: v(0, 0, -50) });
    expect(pool.collect(p, ship.pos, PICKUP_RADIUS, apply)).toBeNull();
    expect(ship.fuel).toBe(50); expect(pool.has(p)).toBe(true); expect(pool.size).toBe(1);
  });
  it('同一对象重复结算只发放一次奖励', () => {
    const { ship, pool, apply } = setup();
    const p = pool.add({ kind: 'fuel', pos: v(1, 0, 0) });
    const first = pool.collect(p, ship.pos, PICKUP_RADIUS, apply);
    const second = pool.collect(p, ship.pos, PICKUP_RADIUS, apply);
    expect(first?.applied).toBe(true); expect(second).toBeNull();
    expect(ship.fuel).toBe(80); expect(pool.size).toBe(0);
  });
  it('跨帧重复 update 后弹药只增加一次', () => {
    const { ship, ammo, pool, apply } = setup();
    pool.add({ kind: 'ammo', pos: v(0, 0, -2) });
    for (let frame = 0; frame < 5; frame++) {
      for (const p of pool.values()) pool.collect(p, ship.pos, PICKUP_RADIUS, apply);
    }
    expect(ammo.missile).toBe(12); expect(ammo.blast).toBe(9); expect(ship.fuel).toBe(50);
  });
  it('重复引用同一对象不会重复进入活动集合', () => {
    const { ship, pool, apply } = setup();
    const p = { kind: 'module', pos: v(0, 0, 0) };
    pool.add(p); pool.add(p);
    expect(pool.size).toBe(1);
  });
  it('结算先从集合移除，销毁表现对象失败也不会双倍奖励', () => {
    const { ship, save, pool, apply } = setup();
    const p = pool.add({ kind: 'module', pos: v(0, 0, 0) });
    const r = pool.collect(p, ship.pos, PICKUP_RADIUS, apply);
    expect(r?.applied).toBe(true); expect(save.points).toBe(1);
    expect(pool.has(p)).toBe(false);
    expect(pool.collect(p, ship.pos, PICKUP_RADIUS, apply)).toBeNull();
    expect(save.points).toBe(1);
  });
  it('非法类型对象被清理但不发放任何资源', () => {
    const { ship, ammo, save, pool, apply } = setup();
    const p = pool.add({ kind: 'grenade', pos: v(0, 0, 0) });
    const r = pool.collect(p, ship.pos, PICKUP_RADIUS, apply);
    expect(r?.applied).toBe(false); expect(pool.size).toBe(0);
    expect(ship.fuel).toBe(50); expect(ammo.missile).toBe(10); expect(save.points).toBe(0);
  });
});

describe('存档兼容、练习模式与场景清理', () => {
  beforeEach(() => localStorage.clear());
  it('旧存档缺字段时读取补默认值，module 拾取正常计数', () => {
    localStorage.setItem('starfall-defense-save', JSON.stringify({ unlockedMission: 2, resources: 100 }));
    const save = new SaveStore().load();
    expect(save.points).toBe(0); expect(save.upgrades.engine).toBe(0); expect(save.settings.practice).toBe(false);
    const r = applyPickup('module', makeShip(), makeAmmo(), save);
    expect(r.applied).toBe(true); expect(save.points).toBe(1);
  });
  it('旧存档 settings 缺字段时合并默认设置', () => {
    localStorage.setItem('starfall-defense-save', JSON.stringify({ points: 3, settings: { practice: true } }));
    const save = new SaveStore().load();
    expect(save.settings.practice).toBe(true);
    expect(save.settings.mouseSensitivity).toBe(1); expect(save.settings.volume).toBe(0.6);
    expect(save.points).toBe(3);
  });
  it('练习模式高维修材料下 repair 拾取仍然只走统一结算', () => {
    const s = makeShip(); s.repairMaterials = 8; const ammo = makeAmmo(); const save = makeSave();
    const r = applyPickup('repair', s, ammo, save);
    expect(r.changes.repairUsed).toBe(false); expect(s.repairMaterials).toBe(9);
    expect(s.fuel).toBe(100); expect(ammo).toEqual({ missile: 10, blast: 8 }); expect(save.points).toBe(0);
  });
  it('结算后表现对象从场景和集合中原子清理', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(2), new THREE.MeshBasicMaterial());
    mesh.position.set(0, 0, 0); scene.add(mesh);
    const ship = makeShip(); ship.pos = v(0, 0, 0); ship.fuel = 50;
    const pool = new PickupPool<{ kind: string; pos: THREE.Vector3; mesh: THREE.Object3D }>();
    const p = pool.add({ kind: 'fuel', pos: mesh.position, mesh });
    const r = pool.collect(p, ship.pos, PICKUP_RADIUS, kind => applyPickup(kind, ship, makeAmmo(), makeSave()));
    expect(r?.applied).toBe(true);
    if (r) scene.remove(p.mesh);
    expect(scene.children.length).toBe(0); expect(pool.size).toBe(0);
    expect(ship.fuel).toBe(80);
  });
  it('完整回归：四类拾取依次结算后状态精确匹配', () => {
    const ship = makeShip(); ship.pos = v(0, 0, 0); ship.fuel = 40;
    ship.takeDamage(200, 'hull');
    const weapons = new WeaponSystem(); const save = makeSave();
    const hpBefore = ship.hp; const matsBefore = ship.repairMaterials;
    const pool = new PickupPool<{ kind: string; pos: { x: number; y: number; z: number } }>();
    pool.add({ kind: 'fuel', pos: v(1, 0, 0) });
    pool.add({ kind: 'ammo', pos: v(0, 1, 0) });
    pool.add({ kind: 'repair', pos: v(0, 0, 1) });
    pool.add({ kind: 'module', pos: v(-1, 0, 0) });
    const results = pool.values().map(p => pool.collect(p, ship.pos, PICKUP_RADIUS, kind => applyPickup(kind, ship, weapons.ammo, save)));
    expect(results.every(r => r?.applied)).toBe(true); expect(pool.size).toBe(0);
    expect(ship.fuel).toBe(70);
    expect(weapons.ammo.missile).toBe(12); expect(weapons.ammo.blast).toBe(9);
    expect(ship.repairMaterials).toBe(matsBefore); expect(ship.hp).toBeGreaterThan(hpBefore);
    expect(save.points).toBe(1); expect(save.resources).toBe(0);
  });
});
