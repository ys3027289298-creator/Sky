import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/game/world', () => ({
  toThree: (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x, v.y, v.z),
  GameWorld: class {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    obstacles: { id: string; pos: { x: number; y: number; z: number }; radius: number }[] = [];
    enemyMeshes = new Map();
    constructor(public container: HTMLElement) {}
    makePlayerShip() { return new THREE.Group(); }
    addEnemyMesh() {}
    spawnProjectile() { return new THREE.Mesh(); }
    explosion() {}
    update() {}
  }
}));

import { GameApp } from '../src/game/GameApp';
import { v } from '../src/core/types';

const HUD_HTML = `
  <div id="app"></div>
  <div id="hud" class="hidden">
    <div id="missionPanel"><b>任务</b><span id="missionTitle"></span><span id="missionObjective"></span><span id="missionTimer"></span></div>
    <div id="eventBanner" class="hidden"></div>
    <div id="navCard" class="hidden"><b id="navName"></b><span id="navKind"></span><span id="navDist"></span><span id="navDir"></span><span id="navStatus"></span></div>
    <canvas id="navPanel" width="260" height="260" class="hidden"></canvas>
    <div id="crosshair"><div id="lockBox"><span id="lockText"></span></div></div>
    <div id="targetInfo"></div>
    <canvas id="radar" width="190" height="190"></canvas>
    <div id="statusPanel">
      <label>生命 <i id="hpText"></i><progress id="hpBar" max="100"></progress></label>
      <label>护盾 <i id="shieldText"></i><progress id="shieldBar" max="100"></progress></label>
      <label>装甲 <i id="armorText"></i><progress id="armorBar" max="100"></progress></label>
      <label>能量 <i id="energyText"></i><progress id="energyBar" max="100"></progress></label>
      <label>燃料 <i id="fuelText"></i><progress id="fuelBar" max="100"></progress></label>
      <div id="weaponInfo"></div><div id="partStatus"></div>
    </div>
    <div id="controlsHint"></div>
  </div>
  <div id="menu" class="screen"></div>
  <div id="overlay" class="screen hidden"></div>`;

const press = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code }));

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

describe('页面级导航 HUD', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = HUD_HTML; });

  it('开始任务后 HUD 出现正确航点，推进步骤后文本和距离同步更新', () => {
    const app = new GameApp();
    app.start(0);
    app.updateHud();
    const navName = document.querySelector('#navName')!, navDist = document.querySelector('#navDist')!, navStatus = document.querySelector('#navStatus')!;
    expect(document.querySelector('#navCard')!.classList.contains('hidden')).toBe(false);
    expect(navName.textContent).toContain('采矿区信标');
    expect(navStatus.textContent).toBe('前往中');
    app.missions.state.objectiveStep = 1;
    app.ship.pos = v(-200, 0, -100);
    app.updateHud();
    expect(navName.textContent).toContain('扫描区');
    expect(navDist.textContent).toContain('60');
    app.ship.pos = v(-200, 0, -130);
    app.updateHud();
    expect(navDist.textContent).toContain('30');
  });

  it('按 N 展开和收起战术导航面板', () => {
    const app = new GameApp();
    app.start(0);
    const panel = document.querySelector('#navPanel')!;
    expect(panel.classList.contains('hidden')).toBe(true);
    press('KeyN');
    expect(app.nav.open).toBe(true);
    expect(panel.classList.contains('hidden')).toBe(false);
    press('KeyN');
    expect(app.nav.open).toBe(false);
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('暂停时距离显示冻结不再更新', () => {
    const app = new GameApp();
    app.start(0);
    app.updateHud();
    const navDist = document.querySelector('#navDist')!;
    const before = navDist.textContent;
    app.show('pause');
    app.ship.pos = v(-230, 0, -170);
    app.loop(app.last + 16);
    expect(navDist.textContent).toBe(before);
  });

  it('重新开始任务时清理上一局导航状态', () => {
    const app = new GameApp();
    app.start(0);
    press('KeyN');
    app.missions.state.objectiveStep = 2; app.missions.state.evacuation = true;
    app.updateHud();
    expect(document.querySelector('#navName')!.textContent).toContain('撤离点');
    app.start(0);
    expect(app.nav.open).toBe(false);
    expect(document.querySelector('#navPanel')!.classList.contains('hidden')).toBe(true);
    app.updateHud();
    expect(document.querySelector('#navName')!.textContent).toContain('采矿区信标');
  });

  it('任务成功后导航卡片隐藏', () => {
    const app = new GameApp();
    app.start(0);
    app.missions.state.status = 'success';
    app.updateHud();
    expect(document.querySelector('#navCard')!.classList.contains('hidden')).toBe(true);
  });
});
