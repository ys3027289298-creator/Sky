import { describe, expect, it } from 'vitest';
import { MissionManager } from '../src/core/missions';
import {
  NavPanelState, WaypointFlags, distanceTo, projectToPanel, relativeDirection, resolveWaypoints, waypointStatus
} from '../src/core/waypoints';
import { v } from '../src/core/types';

const flags = (over: Partial<WaypointFlags> = {}): WaypointFlags => ({ scanned: 0, nodes: 0, towers: 0, core: false, commandDead: false, ...over });
const activeMission = (index: number) => { const m = new MissionManager(index); m.start(); return m; };

describe('四个任务的航点阶段切换', () => {
  it('任务一：信标 → 扫描区 → 撤离点', () => {
    const m = activeMission(0);
    expect(m.currentWaypoint(flags())?.id).toBe('m0-beacon');
    m.state.objectiveStep = 1;
    expect(m.currentWaypoint(flags())?.id).toBe('m0-scan');
    m.state.objectiveStep = 2; m.state.evacuation = true;
    const evac = m.currentWaypoint(flags());
    expect(evac?.id).toBe('m0-evac');
    expect(evac?.kind).toBe('evac');
  });
  it('任务二：运输船会合点 → 护航撤离点', () => {
    const m = activeMission(1);
    expect(m.currentWaypoint(flags())?.id).toBe('m1-rendezvous');
    m.addProgress(5);
    expect(m.state.evacuation).toBe(true);
    expect(m.currentWaypoint(flags())?.id).toBe('m1-evac');
  });
  it('任务三：防御节点 → 能源核心 → 倒计时撤离点', () => {
    const m = activeMission(2);
    expect(m.currentWaypoint(flags({ nodes: 0 }))?.id).toBe('m2-node');
    expect(m.currentWaypoint(flags({ nodes: 3 }))?.id).toBe('m2-core');
    expect(m.currentWaypoint(flags({ nodes: 3, core: true }))?.id).toBe('m2-evac');
  });
  it('任务四：两座干扰塔 → 指挥舰 → 终局撤离点', () => {
    const m = activeMission(3);
    expect(m.currentWaypoint(flags({ towers: 0 }))?.id).toBe('m3-tower-a');
    expect(m.currentWaypoint(flags({ towers: 1 }))?.id).toBe('m3-tower-a');
    expect(m.currentWaypoint(flags({ towers: 2 }))?.id).toBe('m3-command');
    expect(m.currentWaypoint(flags({ towers: 2, commandDead: true }))?.id).toBe('m3-evac');
  });
  it('后续航点队列随进度推进且不含已完成项', () => {
    const m = activeMission(0);
    expect(m.nextWaypoints(flags()).map(w => w.id)).toEqual(['m0-scan', 'm0-evac']);
    m.state.objectiveStep = 2; m.state.evacuation = true;
    expect(m.nextWaypoints(flags())).toEqual([]);
  });
});

describe('等待条件、完成与空状态', () => {
  it('未满足条件的航点处于等待状态并说明条件', () => {
    const m = activeMission(0);
    const evac = m.waypoints(flags()).find(w => w.id === 'm0-evac')!;
    expect(evac.active).toBe(false);
    expect(evac.completed).toBe(false);
    expect(waypointStatus(evac)).toBe('等待条件');
    expect(evac.condition).toContain('扫描');
  });
  it('已完成的航点标记为已到达', () => {
    const m = activeMission(2);
    const node = m.waypoints(flags({ nodes: 3 })).find(w => w.id === 'm2-node')!;
    expect(node.completed).toBe(true);
    expect(waypointStatus(node)).toBe('已到达');
  });
  it('任务成功后航点为空状态', () => {
    const m = activeMission(0); m.addProgress(3); m.advanceAtEvac(true);
    expect(m.state.status).toBe('success');
    expect(m.currentWaypoint(flags())).toBeNull();
    expect(m.waypoints(flags())).toEqual([]);
  });
  it('任务失败后航点为空状态', () => {
    const m = activeMission(1); m.fail('护航运输船被摧毁');
    expect(m.currentWaypoint(flags())).toBeNull();
    expect(m.nextWaypoints(flags())).toEqual([]);
  });
  it('同一航点 id 在多次解析和进度变化中保持稳定', () => {
    const m = activeMission(3);
    const first = m.waypoints(flags()).map(w => w.id);
    const second = m.waypoints(flags({ towers: 2 })).map(w => w.id);
    expect(first).toEqual(second);
    expect(m.waypoints(flags()).map(w => w.id)).toEqual(first);
  });
});

describe('距离与方向计算', () => {
  it('距离按三维空间计算', () => {
    expect(distanceTo(v(0, 0, 0), v(3, 4, 0))).toBe(5);
    expect(distanceTo(v(0, 0, 80), v(-170, 0, -160))).toBeCloseTo(Math.hypot(170, 240));
  });
  it('yaw 为 0 时正确区分前后左右四个方向', () => {
    const pos = v(0, 0, 0);
    expect(relativeDirection(pos, 0, v(0, 0, -50))).toBe('front');
    expect(relativeDirection(pos, 0, v(0, 0, 50))).toBe('back');
    expect(relativeDirection(pos, 0, v(50, 0, 0))).toBe('right');
    expect(relativeDirection(pos, 0, v(-50, 0, 0))).toBe('left');
  });
  it('yaw 旋转 90 度后方向随船体朝向变化', () => {
    const pos = v(0, 0, 0), yaw = Math.PI / 2;
    expect(relativeDirection(pos, yaw, v(-50, 0, 0))).toBe('front');
    expect(relativeDirection(pos, yaw, v(50, 0, 0))).toBe('back');
    expect(relativeDirection(pos, yaw, v(0, 0, 50))).toBe('left');
    expect(relativeDirection(pos, yaw, v(0, 0, -50))).toBe('right');
  });
});

describe('二维投影、边缘夹紧与 NaN 防护', () => {
  it('范围内目标投影到面板对应象限', () => {
    const p = projectToPanel(v(0, 0, 0), 0, v(0, 0, -100), 100, 320);
    expect(p.valid).toBe(true);
    expect(p.clamped).toBe(false);
    expect(p.y).toBeLessThan(0);
    expect(Math.abs(p.x)).toBeLessThan(1);
  });
  it('超出边界的航点稳定夹在边缘并保留方向', () => {
    const p = projectToPanel(v(0, 0, 0), 0, v(30, 0, -5000), 100, 320);
    expect(p.clamped).toBe(true);
    expect(p.y).toBe(-100);
    expect(p.x).toBeLessThan(1);
    expect(p.x).toBeGreaterThan(-1);
    expect(p.x).toBeGreaterThan(0);
    const again = projectToPanel(v(0, 0, 0), 0, v(30, 0, -5000), 100, 320);
    expect(again).toEqual(p);
  });
  it('yaw 旋转后投影同步旋转', () => {
    const p = projectToPanel(v(0, 0, 0), Math.PI / 2, v(-100, 0, 0), 100, 320);
    expect(p.valid).toBe(true);
    expect(p.y).toBeLessThan(0);
  });
  it('NaN 或非法输入不会产生 NaN 输出', () => {
    const p = projectToPanel(v(NaN, 0, 0), 0, v(0, 0, -10), 100, 320);
    expect(p.valid).toBe(false);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(projectToPanel(v(0, 0, 0), 0, v(0, 0, -10), 100, 0).valid).toBe(false);
  });
  it('敌人和补给可投影到面板坐标', () => {
    const enemy = projectToPanel(v(0, 0, 0), 0, v(80, 0, -80), 100, 320);
    const supply = projectToPanel(v(0, 0, 0), 0, v(-40, 0, 60), 100, 320);
    expect(enemy.valid && supply.valid).toBe(true);
    expect(enemy.x).toBeGreaterThan(0);
    expect(supply.x).toBeLessThan(0);
    expect(supply.y).toBeGreaterThan(0);
  });
});

describe('导航面板开关状态', () => {
  it('N 键切换展开与收起', () => {
    const nav = new NavPanelState();
    expect(nav.open).toBe(false);
    expect(nav.toggle()).toBe(true);
    expect(nav.toggle()).toBe(false);
  });
  it('重开任务时重置为收起', () => {
    const nav = new NavPanelState();
    nav.toggle();
    nav.reset();
    expect(nav.open).toBe(false);
  });
});

describe('任务状态改变时航点即时切换', () => {
  it('evacuation 置位后当前航点立即切到撤离点', () => {
    const m = activeMission(1);
    expect(m.currentWaypoint(flags())?.kind).toBe('rendezvous');
    m.addProgress(5);
    expect(m.currentWaypoint(flags())?.kind).toBe('evac');
  });
  it('倒计时任务夺取核心后撤离点激活', () => {
    const m = activeMission(2);
    m.state.objectiveStep = 3;
    const wp = m.currentWaypoint(flags({ nodes: 3, core: true }));
    expect(wp?.id).toBe('m2-evac');
    expect(wp?.active).toBe(true);
  });
  it('非当前任务的航点不会泄漏到其他任务', () => {
    for (let i = 0; i < 4; i++) {
      const m = activeMission(i);
      for (const wp of m.waypoints(flags({ nodes: 3, towers: 2, core: true, commandDead: true }))) {
        expect(wp.missionIndex).toBe(i);
        expect(wp.id.startsWith(`m${i}-`)).toBe(true);
      }
    }
  });
  it('resolveWaypoints 纯函数不修改任务状态', () => {
    const m = activeMission(0);
    const before = { ...m.state };
    resolveWaypoints(m.state, flags());
    expect(m.state).toEqual(before);
  });
});
