import { describe, it, expect } from 'vitest';
import { Mission, MISSION_DEFS } from '../src/core/missions';
import { v } from '../src/core/math';
import type { MissionContext } from '../src/core/missions';

const baseCtx = (over: Partial<MissionContext> = {}): MissionContext => ({
  playerPos: v(0, 0, 0),
  hullAlive: true,
  timeLeft: 300,
  fuel: 50,
  scans: 0,
  scansRequired: 3,
  escortHp: 1,
  escortReachedEnd: false,
  nodesDestroyed: 0,
  nodesRequired: 3,
  coreTaken: false,
  towersDisabled: 0,
  towersRequired: 2,
  commandDead: false,
  evacuatePos: v(0, 0, 20),
  stationDetonated: false,
  ...over
});

const run = (m: Mission, ctx: MissionContext, frames = 3) => {
  m.start();
  for (let i = 0; i < frames; i++) m.update(0.1, ctx);
};

describe('任务流程', () => {
  it('侦察任务：扫描 3 个目标后到集结点即成功', () => {
    const m = new Mission(MISSION_DEFS[0]);
    run(m, baseCtx({ scans: 3 }));
    expect(m.state).toBe('success');
  });

  it('侦察任务未扫满时不会成功', () => {
    const m = new Mission(MISSION_DEFS[0]);
    run(m, baseCtx({ scans: 2 }));
    expect(m.state).toBe('running');
  });

  it('护航任务：运输船被毁则失败并给出原因', () => {
    const m = new Mission(MISSION_DEFS[1]);
    run(m, baseCtx({ escortHp: 0 }));
    expect(m.state).toBe('failed');
    expect(m.failReason).toContain('运输船');
  });

  it('护航任务：运输船抵达终点成功', () => {
    const m = new Mission(MISSION_DEFS[1]);
    run(m, baseCtx({ escortReachedEnd: true }));
    expect(m.state).toBe('success');
  });

  it('空间站任务：取核心后需撤离；爆炸则失败', () => {
    const m = new Mission(MISSION_DEFS[2]);
    run(m, baseCtx({ nodesDestroyed: 3, coreTaken: true }));
    expect(m.state).toBe('success');
    const m2 = new Mission(MISSION_DEFS[2]);
    run(m2, baseCtx({ stationDetonated: true }));
    expect(m2.state).toBe('failed');
  });

  it('最终任务：关塔 + 击毁指挥舰 + 撤离', () => {
    const m = new Mission(MISSION_DEFS[3]);
    run(m, baseCtx({ towersDisabled: 2, commandDead: true }));
    expect(m.state).toBe('success');
    const m2 = new Mission(MISSION_DEFS[3]);
    run(m2, baseCtx({ towersDisabled: 2 }));
    expect(m2.state).toBe('running');
  });

  it('玩家死亡与超时导致失败', () => {
    const m = new Mission(MISSION_DEFS[0]);
    run(m, baseCtx({ hullAlive: false }));
    expect(m.state).toBe('failed');
    const m2 = new Mission(MISSION_DEFS[0]);
    m2.start();
    m2.timeLeft = 0.1;
    m2.update(0.2, baseCtx());
    expect(m2.state).toBe('failed');
  });

  it('共四个连续任务', () => {
    expect(MISSION_DEFS.map((d) => d.id)).toEqual(['recon', 'escort', 'station', 'final']);
  });
});
