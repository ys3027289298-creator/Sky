import { describe, expect, it } from 'vitest';
import { MissionManager } from '../src/core/missions';
import {
  ARRIVE_RADIUS, NavPanelState, WAYPOINTS, buildPanelModel, currentWaypoint, missionWaypoints,
  navCardModel, projectToPanel, relativeDirection, upcomingWaypoints, waypointDistance
} from '../src/core/waypoints';
import { v } from '../src/core/types';

describe('四个任务的航点阶段切换', () => {
  it('任务0：信标 → 扫描区 → 撤离点', () => {
    const m = new MissionManager(0); m.start();
    expect(m.currentWaypoint()?.id).toBe('m0-beacon');
    m.state.objectiveStep = 1;
    expect(m.currentWaypoint()?.id).toBe('m0-scan');
    m.state.objectiveStep = 2; m.state.evacuation = true;
    expect(m.currentWaypoint()?.id).toBe('m0-evac');
  });
  it('任务1：会合点在撤离开启后切换为护航撤离点', () => {
    const m = new MissionManager(1); m.start();
    expect(m.currentWaypoint()?.id).toBe('m1-rendezvous');
    m.addProgress(5);
    expect(m.state.evacuation).toBe(true);
    expect(m.currentWaypoint()?.id).toBe('m1-evac');
  });
  it('任务2：节点 → 核心 → 倒计时撤离', () => {
    const m = new MissionManager(2); m.start();
    expect(m.currentWaypoint()?.id).toBe('m2-station');
    m.addProgress(3);
    expect(m.currentWaypoint()?.id).toBe('m2-core');
    expect(m.currentWaypoint({ coreTaken: true })?.id).toBe('m2-evac');
  });
  it('任务3：两座干扰塔 → 指挥舰 → 终局撤离', () => {
    const m = new MissionManager(3); m.start();
    expect(m.currentWaypoint()?.id).toBe('m3-tower-a');
    expect(m.currentWaypoint({ towersDown: 1 })?.id).toBe('m3-tower-b');
    expect(m.currentWaypoint({ towersDown: 2, commandAlive: true })?.id).toBe('m3-command');
    expect(m.currentWaypoint({ towersDown: 2, commandAlive: false })?.id).toBe('m3-evac');
  });
  it('指挥舰航点跟随 GameApp 提供的动态位置', () => {
    const wp = currentWaypoint(3, { towersDown: 2, commandAlive: true, commandPos: v(300, 0, -100) });
    expect(wp?.pos).toEqual({ x: 300, y: 0, z: -100 });
  });
});

describe('航点状态、空状态和稳定性', () => {
  it('简报阶段条件未满足时当前航点为等待状态', () => {
    const m = new MissionManager(0);
    const wp = m.currentWaypoint();
    expect(wp?.id).toBe('m0-beacon');
    expect(wp?.active).toBe(false);
    const card = navCardModel(0, m.navContext(), v(0, 0, 80), 0);
    expect(card.status).toBe('waiting');
  });
  it('任务成功后当前航点为空', () => {
    const m = new MissionManager(0); m.start(); m.addProgress(3); m.advanceAtEvac(true);
    expect(m.state.status).toBe('success');
    expect(m.currentWaypoint()).toBeNull();
    expect(navCardModel(0, m.navContext(), v(0, 0, 0), 0).visible).toBe(false);
  });
  it('任务失败后当前航点为空', () => {
    const m = new MissionManager(2); m.start(); m.stationCoreTaken(true, false, 0);
    expect(m.state.status).toBe('failed');
    expect(m.currentWaypoint()).toBeNull();
  });
  it('倒计时耗尽导致失败时撤离航点立即消失', () => {
    const m = new MissionManager(3); m.start();
    expect(m.currentWaypoint({ towersDown: 2, commandAlive: false })?.id).toBe('m3-evac');
    m.finalBattle(true, true, false, 0);
    expect(m.currentWaypoint({ towersDown: 2, commandAlive: false })).toBeNull();
  });
  it('同一航点 id 在进度变化中保持稳定', () => {
    const ids1 = missionWaypoints(0, { objectiveStep: 0 }).map(w => w.id);
    const ids2 = missionWaypoints(0, { objectiveStep: 2, evacuation: true }).map(w => w.id);
    expect(ids1).toEqual(ids2);
    expect(new Set(ids1).size).toBe(ids1.length);
    expect(WAYPOINTS.filter(w => w.missionIndex === 3).map(w => w.id)).toContain('m3-tower-a');
  });
  it('后续航点列表排除当前航点且保持顺序', () => {
    const ups = upcomingWaypoints(0, { objectiveStep: 0 });
    expect(ups.map(w => w.id)).toEqual(['m0-scan', 'm0-evac']);
  });
});

describe('距离与方向计算', () => {
  it('距离按三维空间计算且到达半径内为已到达', () => {
    expect(waypointDistance(v(0, 0, 0), v(3, 4, 0))).toBe(5);
    const card = navCardModel(0, { objectiveStep: 0 }, v(-230, 0, -170 + ARRIVE_RADIUS - 1), 0);
    expect(card.status).toBe('arrived');
  });
  it('目标在飞船正前方', () => {
    expect(relativeDirection(v(0, 0, 0), 0, v(0, 0, -50))).toBe('front');
  });
  it('目标在飞船正后方', () => {
    expect(relativeDirection(v(0, 0, 0), 0, v(0, 0, 50))).toBe('back');
  });
  it('目标在飞船左侧', () => {
    expect(relativeDirection(v(0, 0, 0), 0, v(-50, 0, 0))).toBe('left');
  });
  it('目标在飞船右侧', () => {
    expect(relativeDirection(v(0, 0, 0), 0, v(50, 0, 0))).toBe('right');
  });
  it('yaw 旋转后方向随之变化', () => {
    const target = v(0, 0, -50);
    expect(relativeDirection(v(0, 0, 0), Math.PI / 2, target)).toBe('right');
    expect(relativeDirection(v(0, 0, 0), -Math.PI / 2, target)).toBe('left');
    expect(relativeDirection(v(0, 0, 0), Math.PI, target)).toBe('back');
  });
  it('NaN 输入不会污染方向与距离', () => {
    expect(relativeDirection(v(NaN, 0, 0), NaN, v(0, 0, 0))).toBe('front');
    expect(waypointDistance(v(NaN, 0, 0), v(0, 0, 0))).toBe(0);
    const card = navCardModel(0, { objectiveStep: 0 }, v(NaN, NaN, NaN), NaN);
    expect(Number.isFinite(card.distance)).toBe(true);
  });
});

describe('战术面板投影与开关', () => {
  it('面板上方的点对应飞船前方', () => {
    const p = projectToPanel(v(0, 0, 0), 0, v(0, 0, -40), 118, 4);
    expect(p.y).toBeLessThan(0); expect(Math.abs(p.x)).toBeLessThan(1e-9); expect(p.clamped).toBe(false);
  });
  it('超出边界的航点被稳定夹在边缘并保留方向角', () => {
    const p = projectToPanel(v(0, 0, 0), 0, v(0, 0, -10000), 118, 4);
    expect(p.clamped).toBe(true);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(118, 5);
    expect(p.y).toBeLessThan(0);
    const again = projectToPanel(v(0, 0, 0), 0, v(0, 0, -10000), 118, 4);
    expect(again).toEqual(p);
  });
  it('NaN 坐标投影到中心且不产生 NaN', () => {
    const p = projectToPanel(v(NaN, 0, 0), NaN, v(0, 0, 0), 118, 4);
    expect(p.x).toBe(0); expect(p.y).toBe(0); expect(p.clamped).toBe(false);
  });
  it('面板模型包含航点、敌人和补给三种投影', () => {
    const waypoints = missionWaypoints(0, { objectiveStep: 0 });
    const blips = buildPanelModel(v(0, 0, 80), 0, waypoints,
      [{ id: 'e1', pos: v(10, 0, 40) }], [{ id: 'p1', pos: v(-10, 0, 60) }], 118);
    expect(blips.some(b => b.role === 'waypoint' && b.id === 'm0-beacon')).toBe(true);
    expect(blips.some(b => b.role === 'enemy' && b.id === 'e1')).toBe(true);
    expect(blips.some(b => b.role === 'pickup' && b.id === 'p1')).toBe(true);
    expect(blips.every(b => Number.isFinite(b.point.x) && Number.isFinite(b.point.y))).toBe(true);
  });
  it('N 键开关状态可切换并在重开时重置', () => {
    const nav = new NavPanelState();
    expect(nav.open).toBe(false);
    expect(nav.toggle()).toBe(true);
    expect(nav.toggle()).toBe(false);
    nav.toggle(); nav.reset();
    expect(nav.open).toBe(false);
  });
});
