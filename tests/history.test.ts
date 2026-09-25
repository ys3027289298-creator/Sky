import { describe, expect, it, beforeEach } from 'vitest';
import { appendRunRecord, filterRunRecords, normalizeHistory, normalizeRunRecord, HISTORY_LIMIT, RunRecord } from '../src/core/history';
import { DEFAULT_SAVE, SaveStore } from '../src/core/storage';
import { MissionManager } from '../src/core/missions';
import { Ship } from '../src/core/ship';
import { WeaponSystem } from '../src/core/weapons';
import { GameApp } from '../src/game/GameApp';

const KEY = 'starfall-defense-save';
const upgrades = () => ({ engine: 1, shield: 0, armor: 0, weapon: 2, radar: 0, missile: 0 });
const makeRecord = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  id: 'run-1', missionIndex: 0, missionName: '废弃采矿区侦察', success: true, reason: '任务完成',
  startedAt: 1000, finishedAt: 2000, duration: 1, kills: 3, shots: 10, hits: 5, accuracy: 0.5,
  reward: 140, upgrades: upgrades(), ...overrides
});

beforeEach(() => localStorage.clear());

describe('存档兼容与历史规范化', () => {
  it('旧版存档没有 history 时按空历史读取，其余字段保留', () => {
    localStorage.setItem(KEY, JSON.stringify({ unlockedMission: 2, resources: 500, points: 3, upgrades: { engine: 2 }, settings: { mouseSensitivity: 1.5, volume: 0.3, practice: true } }));
    const data = new SaveStore().load();
    expect(data.history).toEqual([]);
    expect(data.unlockedMission).toBe(2);
    expect(data.resources).toBe(500);
    expect(data.upgrades.engine).toBe(2);
    expect(data.settings.volume).toBe(0.3);
  });
  it('坏 JSON 返回默认存档且不覆盖原存储内容', () => {
    localStorage.setItem(KEY, '{oops');
    const data = new SaveStore().load();
    expect(data).toEqual(DEFAULT_SAVE);
    expect(localStorage.getItem(KEY)).toBe('{oops');
  });
  it('history 不是数组时降级为空历史，其他字段不受影响', () => {
    for (const bad of ['bad', 42, null, {}, undefined]) {
      localStorage.setItem(KEY, JSON.stringify({ unlockedMission: 1, resources: 7, history: bad }));
      const data = new SaveStore().load();
      expect(data.history).toEqual([]);
      expect(data.unlockedMission).toBe(1);
      expect(data.resources).toBe(7);
    }
  });
  it('记录字段缺失时填充安全默认值', () => {
    const rec = normalizeRunRecord({});
    expect(rec.success).toBe(false);
    expect(rec.reason).toBe('');
    expect(rec.kills).toBe(0);
    expect(rec.id).not.toBe('');
    expect(rec.upgrades).toEqual({ engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 });
  });
  it('非法数字和未知状态降级为安全默认值', () => {
    const rec = normalizeRunRecord({ kills: NaN, shots: Infinity, finishedAt: 'x', success: 'yes', reward: -5 });
    expect(rec.kills).toBe(0);
    expect(rec.shots).toBe(0);
    expect(rec.finishedAt).toBe(0);
    expect(rec.success).toBe(false);
    expect(rec.reward).toBe(-5);
  });
  it('准确率边界：零射击为 0，命中超过射击钳制到 1，非法值按命中/射击重算', () => {
    expect(normalizeRunRecord({ shots: 0, hits: 0, accuracy: NaN }).accuracy).toBe(0);
    expect(normalizeRunRecord({ shots: 2, hits: 5 }).accuracy).toBe(1);
    expect(normalizeRunRecord({ shots: 4, hits: 1, accuracy: 'high' }).accuracy).toBe(0.25);
    expect(normalizeRunRecord({ shots: 4, hits: 1, accuracy: 0.5 }).accuracy).toBe(0.5);
    expect(normalizeRunRecord({ shots: 4, hits: 1, accuracy: 9 }).accuracy).toBe(1);
  });
});

describe('追加、排序、上限与幂等', () => {
  it('成功记录追加后包含全部字段', () => {
    const history = appendRunRecord([], makeRecord());
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: 'run-1', missionName: '废弃采矿区侦察', success: true, kills: 3, shots: 10, hits: 5, reward: 140 });
  });
  it('失败记录同样被保留', () => {
    const history = appendRunRecord([], makeRecord({ id: 'f1', success: false, reason: '飞船生命值降为零，在敌火中解体', reward: 25 }));
    expect(history[0].success).toBe(false);
    expect(history[0].reason).toContain('解体');
  });
  it('记录按 finishedAt 倒序排列', () => {
    let history: RunRecord[] = [];
    history = appendRunRecord(history, makeRecord({ id: 'a', finishedAt: 100 }));
    history = appendRunRecord(history, makeRecord({ id: 'b', finishedAt: 300 }));
    history = appendRunRecord(history, makeRecord({ id: 'c', finishedAt: 200 }));
    expect(history.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });
  it(`最多保留最近 ${HISTORY_LIMIT} 条`, () => {
    let history: RunRecord[] = [];
    for (let i = 0; i < 25; i++) history = appendRunRecord(history, makeRecord({ id: `r${i}`, finishedAt: i }));
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].id).toBe('r24');
    expect(history[history.length - 1].id).toBe('r5');
  });
  it('同一 run id 重复写入幂等，只保留一条', () => {
    let history = appendRunRecord([], makeRecord({ id: 'dup', kills: 1 }));
    history = appendRunRecord(history, makeRecord({ id: 'dup', kills: 9 }));
    expect(history).toHaveLength(1);
    expect(history[0].kills).toBe(9);
  });
  it('normalizeHistory 对已有重复 id 去重', () => {
    const history = normalizeHistory([makeRecord({ id: 'x' }), makeRecord({ id: 'x' }), makeRecord({ id: 'y', finishedAt: 1 })]);
    expect(history.map(r => r.id)).toEqual(['x', 'y']);
  });
  it('追加时深拷贝改装快照，后续修改互不影响', () => {
    const rec = makeRecord();
    const history = appendRunRecord([], rec);
    rec.upgrades.engine = 3;
    expect(history[0].upgrades.engine).toBe(1);
    history[0].upgrades.weapon = 0;
    expect(rec.upgrades.weapon).toBe(2);
  });
});

describe('SaveStore 持久化与清空隔离', () => {
  it('保存后重新读取（模拟刷新）历史一致', () => {
    const store = new SaveStore();
    const data = store.load();
    data.history = appendRunRecord(data.history, makeRecord());
    store.save(data);
    const reloaded = new SaveStore().load();
    expect(reloaded.history).toHaveLength(1);
    expect(reloaded.history![0].id).toBe('run-1');
    expect(reloaded.schemaVersion).toBe(2);
  });
  it('clearHistory 只清空 history，保留解锁、资源、改装和设置', () => {
    const store = new SaveStore();
    const data = store.load();
    data.unlockedMission = 3; data.resources = 999; data.points = 5; data.upgrades.engine = 3; data.settings.volume = 0.1;
    data.history = appendRunRecord([], makeRecord());
    store.save(data);
    const cleared = store.clearHistory();
    expect(cleared.history).toEqual([]);
    expect(cleared.unlockedMission).toBe(3);
    expect(cleared.resources).toBe(999);
    expect(cleared.upgrades.engine).toBe(3);
    expect(cleared.settings.volume).toBe(0.1);
    expect(new SaveStore().load().history).toEqual([]);
  });
});

describe('筛选逻辑', () => {
  const records = [
    makeRecord({ id: 'a', missionIndex: 0, success: true, finishedAt: 3 }),
    makeRecord({ id: 'b', missionIndex: 1, success: false, finishedAt: 2 }),
    makeRecord({ id: 'c', missionIndex: 0, success: false, finishedAt: 1 })
  ];
  it('按任务筛选', () => {
    expect(filterRunRecords(records, { mission: 0, status: 'all' }).map(r => r.id)).toEqual(['a', 'c']);
    expect(filterRunRecords(records, { mission: 'all', status: 'all' })).toHaveLength(3);
  });
  it('按成功状态筛选', () => {
    expect(filterRunRecords(records, { mission: 'all', status: 'success' }).map(r => r.id)).toEqual(['a']);
    expect(filterRunRecords(records, { mission: 'all', status: 'failed' }).map(r => r.id)).toEqual(['b', 'c']);
  });
});

function setupDom() {
  document.body.innerHTML = `
    <div id="app"></div>
    <div id="hud" class="hidden">
      <div id="missionPanel"><b>任务</b><span id="missionTitle"></span><span id="missionObjective"></span><span id="missionTimer"></span></div>
      <div id="eventBanner" class="hidden"></div>
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
}

function makeApp(): GameApp {
  setupDom();
  const app = new GameApp();
  app.missionIndex = 0;
  app.missions = new MissionManager(0); app.missions.start();
  app.weapons = new WeaponSystem();
  app.ship = new Ship({ engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 });
  app.enemies = [];
  app.runStartedAt = 1000;
  app.screen = 'game';
  return app;
}

describe('页面级：finish 到战绩界面', () => {
  it('finish 成功落地一条记录，返回主菜单后可从任务战绩查看', () => {
    const app = makeApp();
    app.weapons.shots = 10; app.weapons.hits = 4;
    app.finish(true, '任务完成');
    expect(app.screen).toBe('pause');
    app.el.overlay.querySelector<HTMLElement>('[data-a=menu]')!.click();
    expect(app.screen).toBe('menu');
    app.el.menu.querySelector<HTMLElement>('[data-a=history]')!.click();
    expect(app.el.overlay.textContent).toContain('废弃采矿区侦察');
    expect(app.el.overlay.textContent).toContain('成功');
    const item = app.el.overlay.querySelector<HTMLElement>('.historyItem')!;
    expect(item.textContent).toContain('命中率 40%');
    const saved = new SaveStore().load();
    expect(saved.history).toHaveLength(1);
    expect(saved.history![0].success).toBe(true);
  });
  it('finish 因 screen 守卫只记录一次，重复调用不产生重复条目', () => {
    const app = makeApp();
    app.finish(false, '飞船生命值降为零，在敌火中解体');
    app.finish(false, '飞船生命值降为零，在敌火中解体');
    expect(new SaveStore().load().history).toHaveLength(1);
  });
  it('失败局也保存记录且不发放资源奖励', () => {
    const app = makeApp();
    app.finish(false, '运输船生命值降为零，护航失败');
    const saved = new SaveStore().load();
    expect(saved.history).toHaveLength(1);
    expect(saved.history![0].success).toBe(false);
    expect(saved.history![0].reward).toBe(25);
    expect(saved.resources).toBe(0);
  });
  it('没有记录时显示明确空状态', () => {
    const app = makeApp();
    app.show('history');
    expect(app.el.overlay.querySelector('.historyEmpty')!.textContent).toContain('暂无任务战绩');
  });
  it('详情展示结算文案、命中明细和改装快照，reason 按文本转义', () => {
    const app = makeApp();
    app.weapons.shots = 8; app.weapons.hits = 2;
    app.save.upgrades.weapon = 2;
    app.finish(false, '<img src=x onerror=alert(1)>');
    app.show('history');
    app.el.overlay.querySelector<HTMLElement>('.historyItem')!.click();
    expect(app.el.overlay.querySelector('img')).toBeNull();
    expect(app.el.overlay.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(app.el.overlay.textContent).toContain('射击：8 发｜命中：2 发');
    expect(app.el.overlay.textContent).toContain('武器 2 级');
  });
  it('筛选只影响列表，详情返回后保留筛选条件', () => {
    const app = makeApp();
    app.finish(true, '任务完成');
    app.runStartedAt = 2000; app.missionIndex = 1; app.missions = new MissionManager(1); app.missions.start(); app.screen = 'game';
    app.finish(false, '护航失败');
    app.show('history');
    expect(app.el.overlay.querySelectorAll('.historyItem')).toHaveLength(2);
    const statusSel = app.el.overlay.querySelectorAll('select')[1];
    statusSel.value = 'failed';
    statusSel.dispatchEvent(new Event('change'));
    expect(app.el.overlay.querySelectorAll('.historyItem')).toHaveLength(1);
    expect(app.el.overlay.textContent).toContain('陨石带护航');
    app.el.overlay.querySelector<HTMLElement>('.historyItem')!.click();
    app.el.overlay.querySelector<HTMLElement>('button:last-of-type')!.click();
    expect(app.el.overlay.querySelectorAll('.historyItem')).toHaveLength(1);
    expect((app.el.overlay.querySelectorAll('select')[1] as HTMLSelectElement).value).toBe('failed');
    expect(new SaveStore().load().history).toHaveLength(2);
  });
  it('清空战绩需要二次确认且只清空历史', () => {
    const app = makeApp();
    app.finish(true, '任务完成');
    app.show('history');
    const buttons = [...app.el.overlay.querySelectorAll<HTMLButtonElement>('button')];
    const clearBtn = buttons.find(b => b.textContent === '清空战绩')!;
    clearBtn.click();
    expect(new SaveStore().load().history).toHaveLength(1);
    const armedBtn = [...app.el.overlay.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.includes('确认清空'))!;
    armedBtn.click();
    const saved = new SaveStore().load();
    expect(saved.history).toEqual([]);
    expect(saved.resources).toBe(80);
    expect(app.el.overlay.querySelector('.historyEmpty')).not.toBeNull();
  });
});
