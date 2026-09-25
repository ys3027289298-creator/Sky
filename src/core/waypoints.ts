import { Vec3, dist } from './types';
import type { MissionState } from './missions';

export type WaypointKind = 'beacon' | 'scan' | 'evac' | 'rendezvous' | 'station' | 'core' | 'tower' | 'capital';

export interface Waypoint {
  id: string;
  label: string;
  kind: WaypointKind;
  position: Vec3;
  missionIndex: number;
  objectiveStep: number;
  active: boolean;
  completed: boolean;
  condition: string;
}

export interface WaypointFlags {
  scanned: number;
  nodes: number;
  towers: number;
  core: boolean;
  commandDead: boolean;
}

export const WAYPOINT_KIND_LABELS: Record<WaypointKind, string> = {
  beacon: '信标', scan: '扫描区', evac: '撤离点', rendezvous: '会合点',
  station: '空间站节点', core: '能源核心', tower: '干扰塔', capital: '指挥舰'
};

interface WaypointDef {
  id: string; label: string; kind: WaypointKind; position: Vec3; objectiveStep: number;
  isActive: (s: MissionState, f: WaypointFlags) => boolean;
  isCompleted: (s: MissionState, f: WaypointFlags) => boolean;
  waiting: string;
}

const defs: WaypointDef[][] = [
  [
    { id: 'm0-beacon', label: '采矿区信标', kind: 'beacon', position: { x: -170, y: 0, z: -160 }, objectiveStep: 0,
      isActive: s => s.objectiveStep === 0, isCompleted: s => s.objectiveStep >= 1, waiting: '等待任务开始' },
    { id: 'm0-scan', label: '目标扫描区', kind: 'scan', position: { x: -185, y: 5, z: -175 }, objectiveStep: 1,
      isActive: s => s.objectiveStep === 1, isCompleted: s => s.objectiveStep >= 2, waiting: '需先抵达采矿区信标' },
    { id: 'm0-evac', label: '侦察撤离点', kind: 'evac', position: { x: 0, y: 0, z: 80 }, objectiveStep: 2,
      isActive: s => s.evacuation, isCompleted: () => false, waiting: '需完成 3 个目标扫描' }
  ],
  [
    { id: 'm1-rendezvous', label: '运输船会合点', kind: 'rendezvous', position: { x: -90, y: 0, z: -220 }, objectiveStep: 0,
      isActive: s => !s.evacuation, isCompleted: s => s.evacuation, waiting: '等待任务开始' },
    { id: 'm1-evac', label: '护航撤离点', kind: 'evac', position: { x: -60, y: 0, z: -200 }, objectiveStep: 2,
      isActive: s => s.evacuation, isCompleted: () => false, waiting: '需先清除追击者' }
  ],
  [
    { id: 'm2-node', label: '空间站防御节点', kind: 'station', position: { x: 0, y: 25, z: -270 }, objectiveStep: 1,
      isActive: (s, f) => f.nodes < 3, isCompleted: (s, f) => f.nodes >= 3, waiting: '等待任务开始' },
    { id: 'm2-core', label: '能源核心', kind: 'core', position: { x: 0, y: 25, z: -270 }, objectiveStep: 2,
      isActive: (s, f) => f.nodes >= 3 && !f.core, isCompleted: (s, f) => f.core, waiting: '需先摧毁三座防御节点' },
    { id: 'm2-evac', label: '爆炸前撤离点', kind: 'evac', position: { x: 0, y: 25, z: -60 }, objectiveStep: 3,
      isActive: (s, f) => f.core, isCompleted: () => false, waiting: '需先夺取能源核心' }
  ],
  [
    { id: 'm3-tower-a', label: '干扰塔 A', kind: 'tower', position: { x: 180, y: 20, z: -190 }, objectiveStep: 0,
      isActive: (s, f) => f.towers < 2 && !f.commandDead, isCompleted: (s, f) => f.towers >= 1, waiting: '等待任务开始' },
    { id: 'm3-tower-b', label: '干扰塔 B', kind: 'tower', position: { x: 310, y: -35, z: -230 }, objectiveStep: 0,
      isActive: (s, f) => f.towers < 2 && !f.commandDead, isCompleted: (s, f) => f.towers >= 2, waiting: '等待任务开始' },
    { id: 'm3-command', label: '指挥舰', kind: 'capital', position: { x: 250, y: -20, z: -210 }, objectiveStep: 1,
      isActive: (s, f) => f.towers >= 2 && !f.commandDead, isCompleted: (s, f) => f.commandDead, waiting: '需先关闭两座干扰塔' },
    { id: 'm3-evac', label: '终局撤离点', kind: 'evac', position: { x: 0, y: 0, z: 80 }, objectiveStep: 2,
      isActive: (s, f) => f.commandDead, isCompleted: () => false, waiting: '需先击破指挥舰' }
  ]
];

export function resolveWaypoints(state: MissionState, flags: WaypointFlags): Waypoint[] {
  if (state.status !== 'active') return [];
  const missionDefs = defs[state.index] ?? [];
  return missionDefs.map(d => {
    const active = d.isActive(state, flags);
    const completed = !active && d.isCompleted(state, flags);
    return {
      id: d.id, label: d.label, kind: d.kind, position: { ...d.position },
      missionIndex: state.index, objectiveStep: d.objectiveStep,
      active, completed,
      condition: active ? '条件已满足，可以前往' : completed ? '目标已完成' : d.waiting
    };
  });
}

export type WaypointStatus = '前往中' | '已到达' | '等待条件';
export function waypointStatus(wp: Waypoint): WaypointStatus {
  return wp.active ? '前往中' : wp.completed ? '已到达' : '等待条件';
}

export type NavDirection = 'front' | 'back' | 'left' | 'right';
export const DIRECTION_LABELS: Record<NavDirection, string> = { front: '前方', back: '后方', left: '左侧', right: '右侧' };

export function distanceTo(pos: Vec3, target: Vec3): number {
  const d = dist(pos, target);
  return Number.isFinite(d) ? d : 0;
}

export function relativeDirection(pos: Vec3, yaw: number, target: Vec3): NavDirection {
  const dx = target.x - pos.x, dz = target.z - pos.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || !Number.isFinite(yaw)) return 'front';
  const forward = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  if (Math.abs(forward) >= Math.abs(right)) return forward >= 0 ? 'front' : 'back';
  return right >= 0 ? 'right' : 'left';
}

export interface PanelPoint { x: number; y: number; clamped: boolean; valid: boolean; }

export function projectToPanel(pos: Vec3, yaw: number, target: Vec3, half: number, range: number): PanelPoint {
  const nums = [pos.x, pos.y, pos.z, target.x, target.y, target.z, yaw, half, range];
  if (!nums.every(Number.isFinite) || half <= 0 || range <= 0) return { x: 0, y: 0, clamped: false, valid: false };
  const dx = target.x - pos.x, dz = target.z - pos.z;
  const forward = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  let nx = right / range, ny = -forward / range;
  const m = Math.max(Math.abs(nx), Math.abs(ny));
  const clamped = m > 1;
  if (clamped) { nx /= m; ny /= m; }
  return { x: nx * half, y: ny * half, clamped, valid: true };
}

export class NavPanelState {
  open = false;
  toggle(): boolean { this.open = !this.open; return this.open; }
  reset() { this.open = false; }
}
