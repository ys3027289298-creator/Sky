import { clamp } from './types';
import { Waypoint, WaypointFlags, resolveWaypoints } from './waypoints';

export type MissionStatus = 'briefing' | 'active' | 'success' | 'failed';
export interface MissionState { index: number; name: string; status: MissionStatus; time: number; objectiveStep: number; progress: number; evacuation: boolean; failReason: string; }

export const MISSIONS = [
  { name: '废弃采矿区侦察', brief: '扫描 3 个目标并返航，避开侦察无人机。', steps: ['前往采矿区信标', '扫描目标', '返回撤离点'], checks: 3 },
  { name: '陨石带护航', brief: '护送运输船穿越陨石带，击毁截击机。', steps: ['与运输船会合', '清除追击者', '护送运输船撤离'], checks: 5 },
  { name: '失控空间站突袭', brief: '摧毁三座防御节点，取得核心后倒计时撤离。', steps: ['突入空间站', '摧毁防御节点', '夺取能源核心', '爆炸前撤离'], checks: 3 },
  { name: '舰队外围终战', brief: '关闭两座干扰塔并击破指挥舰，随后撤离。', steps: ['关闭干扰塔', '摧毁指挥舰', '舰队反击前撤离'], checks: 2 }
];

export class MissionManager {
  state: MissionState;
  constructor(index = 0) { const m = MISSIONS[index]; this.state = { index, name: m.name, status: 'briefing', time: 0, objectiveStep: 0, progress: 0, evacuation: false, failReason: '' }; }
  start() { if (this.state.status === 'briefing') this.state.status = 'active'; }
  update(dt: number) { if (this.state.status === 'active') this.state.time += dt; }
  addProgress(amount = 1) { if (this.state.status === 'active') { this.state.progress = clamp(this.state.progress + amount, 0, MISSIONS[this.state.index].checks); if (this.state.progress >= MISSIONS[this.state.index].checks) this.state.evacuation = true; } }
  advanceAtEvac(evacuated: boolean, protectHp = 100) {
    if (this.state.status !== 'active') return;
    if (protectHp <= 0) return this.fail('护航运输船被摧毁');
    if (this.state.evacuation && evacuated) this.state.status = 'success';
  }
  stationCoreTaken(coreTaken: boolean, evacuated: boolean, timeLeft: number) {
    if (this.state.index !== 2 || this.state.status !== 'active') return;
    if (coreTaken && timeLeft <= 0) return this.fail('空间站爆炸，未能及时撤离');
    if (coreTaken && evacuated && timeLeft > 0) this.state.status = 'success';
  }
  finalBattle(towersDown: boolean, commandDead: boolean, evacuated: boolean, timeLeft: number) {
    if (this.state.index !== 3 || this.state.status !== 'active') return;
    if (timeLeft <= 0) return this.fail('敌方舰队完成反击合围');
    if (towersDown && commandDead && evacuated) this.state.status = 'success';
  }
  fail(reason: string) { this.state.status = 'failed'; this.state.failReason = reason; }
  waypoints(flags: WaypointFlags): Waypoint[] { return resolveWaypoints(this.state, flags); }
  currentWaypoint(flags: WaypointFlags): Waypoint | null { return this.waypoints(flags).find(w => w.active) ?? null; }
  nextWaypoints(flags: WaypointFlags): Waypoint[] {
    const all = this.waypoints(flags);
    const current = all.findIndex(w => w.active);
    return current < 0 ? [] : all.slice(current + 1).filter(w => !w.completed);
  }
}
