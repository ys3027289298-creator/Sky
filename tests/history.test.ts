import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendRunRecord, HISTORY_LIMIT, normalizeHistory, normalizeRecord, RunRecord, SAVE_SCHEMA_VERSION } from '../src/core/history';
import { DEFAULT_SAVE, SaveStore } from '../src/core/storage';
import { MissionManager } from '../src/core/missions';
import { WeaponSystem } from '../src/core/weapons';
import { GameApp } from '../src/game/GameApp';

const KEY = 'starfall-defense-save';
const baseUpgrades = { engine: 1, shield: 2, armor: 0, weapon: 3, radar: 1, missile: 0 };
const makeRecord = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: `run-${Math.random().toString(36).slice(2)}`,
  missionIndex: 0, missionName: '废弃采矿区侦察', success: true, reason: '任务完成',
  startedAt: 1000, finishedAt: 2000, duration: 12.5, kills: 3, shots: 10, hits: 5,
  accuracy: 0.5, reward: 140, upgrades: { ...baseUpgrades }, ...over
});

beforeEach(() => localStorage.clear());

describe('存档兼容与 history 归一化', () => {
  it('旧版存档没有 history/schemaVersion 时按空历史读取且保留原字段', () => {
    localStorage.setItem(KEY, JSON.stringify({ unlockedMission: 2, resources: 300, points: 4, upgrades: baseUpgrades, settings: { mouseSensitivity: 1.5, volume: 0.3, practice: true } }));
    const data = new SaveStore().load();
    expect(data.history).toEqual([]);
    expect(data.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(data.unlockedMission).toBe(2);
    expect(data.resources).toBe(300);
    expect(data.settings.mouseSensitivity).toBe(1.5);
    expect(data.upgrades.weapon).toBe(3);
  });
  it('坏 JSON 降级为默认存档且历史为空', () => {
    localStorage.setItem(KEY, '{not-json');
    const data = new SaveStore().load();
    expect(data).toEqual(structuredClone(DEFAULT_SAVE));
    expect(data.history ?? []).toEqual([]);
  });
  it('history 不是数组时降级为空历史', () => {
    localStorage.setItem(KEY, JSON.stringify({ unlockedMission: 1, history: { foo: 1 } }));
    const data = new SaveStore().load();
    expect(data.history).toEqual([]);
    expect(data.unlockedMission).toBe(1);
  });
  it('字段缺失和非法数字降级为安全默认值', () => {
    const rec = normalizeRecord({ id: 'a', shots: 'x', hits: NaN, finishedAt: -5, kills: 2.9, reward: -3 })!;
    expect(rec.shots).toBe(0);
    expect(rec.hits).toBe(0);
    expect(rec.accuracy).toBe(0);
    expect(rec.finishedAt).toBe(0);
    expect(rec.kills).toBe(2);
    expect(rec.reward).toBe(0);
    expect(rec.missionName).toBe('未知任务');
    expect(rec.upgrades).toEqual({ engine: 0, shield: 0, armor: 0, weapon: 0, radar: 0, missile: 0 });
  });
  it('未知成功状态（非布尔）按失败处理并保留原因', () => {
    const rec = normalizeRecord({ id: 'b', success: 'yes', reason: '被击坠' })!;
    expect(rec.success).toBe(false);
    expect(rec.reason).toBe('被击坠');
  });
  it('非对象记录被丢弃，缺失 id 的记录获得稳定 id 并去重', () => {
    const list = normalizeHistory([null, 42, 'x', { finishedAt: 10, missionIndex: 1 }, { finishedAt: 10, missionIndex: 1 }]);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('legacy-10-1');
  });
  it('归一化不覆盖已有解锁、资源、改装和设置', () => {
    const store = new SaveStore();
    store.save({ ...structuredClone(DEFAULT_SAVE), unlockedMission: 3, resources: 500, points: 7, upgrades: baseUpgrades, settings: { mouseSensitivity: 2, volume: 0.1, practice: false } });
    store.appendRun(makeRecord());
    const data = store.load();
    expect(data.unlockedMission).toBe(3);
    expect(data.resources).toBe(500);
    expect(data.points).toBe(7);
    expect(data.upgrades).toEqual(baseUpgrades);
    expect(data.settings.volume).toBe(0.1);
    expect(data.history).toHaveLength(1);
  });
});

describe('RunRecord 追加规则', () => {
  it('成功局生成完整记录并追加', () => {
    const store = new SaveStore();
    store.appendRun(makeRecord({ id: 'win-1', success: true }));
    const rec = store.load().history![0];
    expect(rec.success).toBe(true);
    expect(rec).toMatchObject({ id: 'win-1', missionIndex: 0, missionName: '废弃采矿区侦察', kills: 3, shots: 10, hits: 5, accuracy: 0.5, reward: 140 });
    expect(rec.startedAt).toBe(1000);
    expect(rec.finishedAt).toBe(2000);
  });
  it('失败局也必须保留', () => {
    const store = new SaveStore();
    store.appendRun(makeRecord({ id: 'lose-1', success: false, reason: '飞船生命值降为零，在敌火中解体', reward: 25 }));
    const rec = store.load().history![0];
    expect(rec.success).toBe(false);
    expect(rec.reason).toContain('解体');
  });
  it('准确率边界：零射击为 0，非法 accuracy 由命中重算并夹取', () => {
    expect(normalizeRecord({ id: 'z', shots: 0, hits: 0 })!.accuracy).toBe(0);
    expect(normalizeRecord({ id: 'y', shots: 4, hits: 3 })!.accuracy).toBe(0.75);
    expect(normalizeRecord({ id: 'w', shots: 2, hits: 9 })!.accuracy).toBe(1);
    expect(normalizeRecord({ id: 'v', shots: 0, accuracy: 7 })!.accuracy).toBe(1);
  });
  it('记录按 finishedAt 倒序排列', () => {
    const store = new SaveStore();
    store.appendRun(makeRecord({ id: 'a', finishedAt: 100 }));
    store.appendRun(makeRecord({ id: 'b', finishedAt: 300 }));
    store.appendRun(makeRecord({ id: 'c', finishedAt: 200 }));
    expect(store.load().history!.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('最多保留最近 20 条', () => {
    let history: RunRecord[] = [];
    for (let i = 0; i < 25; i++) history = appendRunRecord(history, makeRecord({ id: `r${i}`, finishedAt: i }));
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].id).toBe('r24');
    expect(history[history.length - 1].id).toBe('r5');
  });
  it('同一 run id 重复写入幂等', () => {
    const store = new SaveStore();
    const rec = makeRecord({ id: 'dup' });
    store.appendRun(rec);
    store.appendRun({ ...rec, kills: 99 });
    const history = store.load().history!;
    expect(history).toHaveLength(1);
    expect(history[0].kills).toBe(3);
  });
  it('清空操作只清 history，不影响其他存档字段', () => {
    const store = new SaveStore();
    store.save({ ...structuredClone(DEFAULT_SAVE), unlockedMission: 2, resources: 120, points: 3, upgrades: baseUpgrades });
    store.appendRun(makeRecord());
    const data = store.clearHistory();
    expect(data.history).toEqual([]);
    expect(data.unlockedMission).toBe(2);
    expect(data.resources).toBe(120);
    expect(data.upgrades).toEqual(baseUpgrades);
    expect(store.load().history).toEqual([]);
  });
  it('改装快照是深拷贝，与存档互不影响', () => {
    const store = new SaveStore();
    const rec = makeRecord();
    store.appendRun(rec);
    rec.upgrades.weapon = 0;
    const loaded = store.load().history![0];
    expect(loaded.upgrades.weapon).toBe(3);
    loaded.upgrades.weapon = 1;
    expect(store.load().history![0].upgrades.weapon).toBe(3);
  });
  it('刷新后（新 SaveStore 实例）仍能读取历史', () => {
    new SaveStore().appendRun(makeRecord({ id: 'persist' }));
    expect(new SaveStore().load().history![0].id).toBe('persist');
  });
});

function makeApp() {
  document.body.innerHTML = '<div id="app"></div><div id="hud" class="hidden"></div><div id="menu" class="screen"></div><div id="overlay" class="screen hidden"></div>';
  const app = Object.create(GameApp.prototype) as GameApp;
  app.store = new SaveStore();
  app.save = app.store.load();
  app.el = {
    menu: document.querySelector('#menu'), overlay: document.querySelector('#overlay'),
    hud: document.querySelector('#hud'), app: document.querySelector('#app')
  } as never;
  app.screen = 'game'; app.paused = false; app.missionIndex = 0;
  app.enemies = [{ alive: false }, { alive: false }, { alive: true }] as never;
  app.weapons = new WeaponSystem(); app.weapons.shots = 10; app.weapons.hits = 4;
  app.missions = new MissionManager(0); app.missions.start(); app.missions.state.time = 42;
  app.ship = { shield: 55 } as never;
  app.runId = 'run-page-1'; app.runStartedAt = 5000; app.runRecorded = false;
  app.recordFilter = { mission: 'all', status: 'all' };
  return app;
}

describe('页面级：finish 到任务战绩', () => {
  it('finish 成功落地一条记录，重复调用不产生重复条目', () => {
    const app = makeApp();
    app.finish(true, '任务完成');
    app.finish(true, '任务完成');
    const history = app.store.load().history!;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: 'run-page-1', success: true, reason: '任务完成', kills: 2, shots: 10, hits: 4, accuracy: 0.4, duration: 42 });
    expect(history[0].reward).toBe(80 + 2 * 20);
  });
  it('失败 finish 也会记录且保留原因', () => {
    const app = makeApp();
    app.finish(false, '飞船生命值降为零，在敌火中解体');
    const history = app.store.load().history!;
    expect(history).toHaveLength(1);
    expect(history[0].success).toBe(false);
    expect(history[0].reason).toContain('解体');
    expect(history[0].reward).toBe(25 + 2 * 10);
  });
  it('finish 后返回主菜单可从“任务战绩”入口查看列表和详情', () => {
    const app = makeApp();
    app.finish(true, '任务完成');
    app.el.overlay.querySelector<HTMLElement>('[data-a=menu]')!.click();
    expect(app.screen).toBe('menu');
    app.el.menu.querySelector<HTMLElement>('button[data-a=records]')!.click();
    expect(app.screen).toBe('records');
    const rows = app.el.overlay.querySelectorAll('#recordList .record-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('废弃采矿区侦察');
    expect(rows[0].textContent).toContain('命中率 40%');
    (rows[0] as HTMLElement).click();
    expect(app.el.overlay.textContent).toContain('任务完成');
    expect(app.el.overlay.textContent).toContain('射击 10 发｜命中 4 发');
    expect(app.el.overlay.textContent).toContain('武器 0/3');
  });
  it('reason 按文本渲染，不会被当作 HTML 注入', () => {
    const app = makeApp();
    app.finish(false, '<img src=x onerror=alert(1)>');
    app.show('records');
    (app.el.overlay.querySelector('#recordList .record-row') as HTMLElement).click();
    expect(app.el.overlay.querySelector('img')).toBeNull();
    expect(app.el.overlay.querySelector('.record-reason')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });
  it('任务筛选和状态筛选只影响列表显示', () => {
    const app = makeApp();
    app.save.history = [
      makeRecord({ id: 'a', missionIndex: 0, success: true, finishedAt: 300 }),
      makeRecord({ id: 'b', missionIndex: 1, missionName: '陨石带护航', success: false, finishedAt: 200 }),
      makeRecord({ id: 'c', missionIndex: 1, missionName: '陨石带护航', success: true, finishedAt: 100 })
    ];
    app.show('records');
    expect(app.el.overlay.querySelectorAll('.record-row')).toHaveLength(3);
    const missionSel = app.el.overlay.querySelector<HTMLSelectElement>('#recordMissionFilter')!;
    missionSel.value = '1'; missionSel.dispatchEvent(new Event('change'));
    expect(app.el.overlay.querySelectorAll('.record-row')).toHaveLength(2);
    const statusSel = app.el.overlay.querySelector<HTMLSelectElement>('#recordStatusFilter')!;
    statusSel.value = 'failed'; statusSel.dispatchEvent(new Event('change'));
    const rows = app.el.overlay.querySelectorAll('.record-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('失败');
    expect(app.save.history).toHaveLength(3);
  });
  it('详情关闭后回到列表仍保留筛选条件', () => {
    const app = makeApp();
    app.save.history = [makeRecord({ id: 'a', missionIndex: 0, finishedAt: 200 }), makeRecord({ id: 'b', missionIndex: 1, missionName: '陨石带护航', finishedAt: 100 })];
    app.recordFilter = { mission: '1', status: 'all' };
    app.show('records');
    expect(app.el.overlay.querySelectorAll('.record-row')).toHaveLength(1);
    (app.el.overlay.querySelector('.record-row') as HTMLElement).click();
    const back = [...app.el.overlay.querySelectorAll('button')].find(b => b.textContent === '返回列表')!;
    back.click();
    expect(app.el.overlay.querySelector<HTMLSelectElement>('#recordMissionFilter')!.value).toBe('1');
    expect(app.el.overlay.querySelectorAll('.record-row')).toHaveLength(1);
  });
  it('没有记录时显示明确空状态', () => {
    const app = makeApp();
    app.show('records');
    expect(app.el.overlay.querySelector('.record-empty')!.textContent).toContain('暂无任务战绩');
    expect(app.el.overlay.querySelectorAll('.record-row')).toHaveLength(0);
  });
  it('筛选无结果时显示空状态且不修改存档', () => {
    const app = makeApp();
    app.save.history = [makeRecord({ id: 'a', success: true })];
    app.recordFilter = { mission: 'all', status: 'failed' };
    app.show('records');
    expect(app.el.overlay.querySelector('.record-empty')!.textContent).toContain('没有符合当前筛选条件');
    expect(app.store.load().history ?? []).toEqual([]);
  });
  it('清空战绩需要二次确认且只删除历史', () => {
    const app = makeApp();
    app.save.resources = 90;
    app.store.save(app.save);
    app.store.appendRun(makeRecord({ id: 'a' }));
    app.save = app.store.load();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    app.show('records');
    app.el.overlay.querySelector<HTMLElement>('#clearRecords')!.click();
    expect(app.store.load().history).toHaveLength(1);
    confirmSpy.mockReturnValue(true);
    app.el.overlay.querySelector<HTMLElement>('#clearRecords')!.click();
    expect(app.store.load().history).toEqual([]);
    expect(app.store.load().resources).toBe(90);
    expect(app.el.overlay.querySelector('.record-empty')).not.toBeNull();
    confirmSpy.mockRestore();
  });
});
