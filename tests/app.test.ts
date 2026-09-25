import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../src/game/world', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/game/world')>();
  class GameWorldStub {
    scene = { add() {}, remove() {} };
    camera = { position: { lerp() {} }, lookAt() {} };
    obstacles: { id: string; pos: { x: number; y: number; z: number }; radius: number }[] = [];
    enemyMeshes = new Map();
    constructor(_container?: HTMLElement) {}
    makePlayerShip() { return { position: { copy() {} }, rotation: { set() {} } }; }
    addEnemyMesh() {}
    spawnProjectile() { return { lookAt() {} }; }
    explosion() {}
    update() {}
  }
  return { ...actual, GameWorld: GameWorldStub };
});
vi.mock('../src/game/audio', () => ({ SoundFX: class { constructor(_v?: number) {} shoot() {} missile() {} hit() {} alarm() {} } }));

import { GameApp } from '../src/game/GameApp';

const hudHtml = `
  <div id="app"></div>
  <div id="hud" class="hidden">
    <div id="missionPanel"><b>任务</b><span id="missionTitle"></span><span id="missionObjective"></span><span id="missionTimer"></span></div>
    <div id="eventBanner" class="hidden"></div>
    <div id="navCard" class="hidden"><b id="navName"></b><span id="navKind"></span><span id="navDist"></span><span id="navDir"></span><span id="navState"></span></div>
    <canvas id="navPanel" width="220" height="220" class="hidden"></canvas>
    <div id="crosshair"><div id="lockBox"><span id="lockText"></span></div></div>
    <div id="targetInfo"></div>
    <canvas id="radar" width="190" height="190"></canvas>
    <div id="statusPanel">
      <label>生命 <i id="hpText"></i><progress id="hpBar" max="100"></progress></label>
      <label>护盾 <i id="shieldText"></i><progress id="shieldBar" max="100"></progress></label>
      <label>装甲 <i id="armorText"></i><progress id="armorBar" max="100"></progress></label>
      <label>能量 <i id="energyText"></i><progress id="energyBar" max="100"></progress></label>
      <label>燃料 <i id="fuelText"></i><progress id="fuelBar" max="100"></progress></label>
      <div id="weaponInfo"></div>
      <div id="partStatus"></div>
    </div>
    <div id="controlsHint"></div>
  </div>
  <div id="menu" class="screen"></div>
  <div id="overlay" class="screen hidden"></div>`;

beforeAll(() => {
  (globalThis as Record<string, unknown>).requestAnimationFrame = () => 0;
  HTMLCanvasElement.prototype.getContext = (() =>
    new Proxy({}, { get: () => () => {}, set: () => true })) as never;
});

const newApp = () => {
  document.body.innerHTML = hudHtml;
  localStorage.clear();
  return new GameApp();
};
const navText = (id: string) => document.querySelector(id)!.textContent;

describe('页面级：HUD 导航卡与战术面板', () => {
  let app: GameApp;
  beforeEach(() => { app = newApp(); });

  it('开始任务后 HUD 出现当前航点，进入下一步后文本和距离同步更新', () => {
    app.start(0);
    app.updateHud();
    expect(document.querySelector('#navCard')!.classList.contains('hidden')).toBe(false);
    expect(navText('#navName')).toBe('采矿区信标');
    expect(navText('#navKind')).toContain('信标');
    expect(navText('#navState')).toBe('前往中');
    const firstDist = navText('#navDist');
    expect(firstDist).toBe(`距离 ${Math.hypot(170, 240).toFixed(0)}m`);
    app.missions.state.objectiveStep = 1;
    app.updateHud();
    expect(navText('#navName')).toBe('目标扫描区');
    expect(navText('#navDist')).not.toBe(firstDist);
    expect(navText('#navDist')).toBe(`距离 ${Math.hypot(185, 5, 255).toFixed(0)}m`);
  });

  it('N 键展开和收起战术导航面板', () => {
    app.start(0);
    app.updateHud();
    expect(app.nav.open).toBe(false);
    app.key(new KeyboardEvent('keydown', { code: 'KeyN' }), true);
    expect(app.nav.open).toBe(true);
    expect(document.querySelector('#navPanel')!.classList.contains('hidden')).toBe(false);
    app.key(new KeyboardEvent('keydown', { code: 'KeyN' }), true);
    expect(app.nav.open).toBe(false);
    app.updateHud();
    expect(document.querySelector('#navPanel')!.classList.contains('hidden')).toBe(true);
  });

  it('暂停时距离不再更新', () => {
    app.start(0);
    app.updateHud();
    const before = navText('#navDist');
    app.show('pause');
    app.ship.pos.x += 50;
    app.loop(16);
    expect(navText('#navDist')).toBe(before);
    app.show('game');
    app.updateHud();
    expect(navText('#navDist')).not.toBe(before);
  });

  it('重新开始任务时收起面板并重建航点', () => {
    app.start(0);
    app.key(new KeyboardEvent('keydown', { code: 'KeyN' }), true);
    app.missions.state.objectiveStep = 2;
    app.start(0);
    app.updateHud();
    expect(app.nav.open).toBe(false);
    expect(app.missions.state.objectiveStep).toBe(0);
    expect(navText('#navName')).toBe('采矿区信标');
  });

  it('任务成功或失败后隐藏导航', () => {
    app.start(0);
    app.updateHud();
    app.finish(true, '任务完成');
    expect(document.querySelector('#navCard')!.classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#navPanel')!.classList.contains('hidden')).toBe(true);
    app.start(1);
    app.finish(false, '运输船生命值降为零，护航失败');
    expect(document.querySelector('#navCard')!.classList.contains('hidden')).toBe(true);
  });

  it('方向文本根据 yaw 正确显示前后左右', () => {
    app.start(0);
    const base = Math.atan2(170, 240);
    app.ship.yaw = base;
    app.updateHud();
    expect(navText('#navDir')).toBe('方向 前方');
    app.ship.yaw = base + Math.PI;
    app.updateHud();
    expect(navText('#navDir')).toBe('方向 后方');
    app.ship.yaw = base - Math.PI / 2;
    app.updateHud();
    expect(navText('#navDir')).toBe('方向 左侧');
    app.ship.yaw = base + Math.PI / 2;
    app.updateHud();
    expect(navText('#navDir')).toBe('方向 右侧');
  });
});
