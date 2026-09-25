import { Vec3, dist } from './types';
import type { MissionStatus } from './missions';

export type WaypointKind = 'beacon' | 'scan' | 'evac' | 'rendezvous' | 'escort' | 'station' | 'core' | 'tower' | 'command';
export type NavStatus = 'heading' | 'arrived' | 'waiting';
export type RelativeDirection = 'front' | 'back' | 'left' | 'right';

export interface NavContext {
  status?: MissionStatus;
  objectiveStep?: number;
  progress?: number;
  evacuation?: boolean;
  timeLeft?: number;
  nodesDown?: number;
  coreTaken?: boolean;
  towersDown?: number;
  commandAlive?: boolean;
  commandPos?: Vec3;
  enemiesAlive?: number;
}

export interface FullNavContext {
  status: MissionStatus; objectiveStep: number; progress: number; evacuation: boolean; timeLeft: number;
  nodesDown: number; coreTaken: boolean; towersDown: number; commandAlive: boolean; commandPos?: Vec3; enemiesAlive: number;
}

export const DEFAULT_NAV_CONTEXT: FullNavContext = {
  status: 'active', objectiveStep: 0, progress: 0, evacuation: false, timeLeft: Infinity,
  nodesDown: 0, coreTaken: false, towersDown: 0, commandAlive: true, enemiesAlive: 0
};

export interface Waypoint {
  id: string;
  label: string;
  kind: WaypointKind;
  pos: Vec3;
  missionIndex: number;
  objectiveStep: number;
  activeWhen: (ctx: FullNavContext) => boolean;
  completeWhen: (ctx: FullNavContext) => boolean;
}

export interface ResolvedWaypoint extends Waypoint { active: boolean; completed: boolean; }

export const WAYPOINT_KIND_LABEL: Record<WaypointKind, string> = {
  beacon: '信标', scan: '扫描区', evac: '撤离点', rendezvous: '会合点', escort: '护航点',
  station: '空间站', core: '能源核心', tower: '干扰塔', command: '指挥舰'
};
export const DIRECTION_LABEL: Record<RelativeDirection, string> = { front: '前方', back: '后方', left: '左侧', right: '右侧' };
export const NAV_STATUS_LABEL: Record<NavStatus, string> = { heading: '前往中', arrived: '已到达', waiting: '等待条件' };

const active = (ctx: FullNavContext) => ctx.status === 'active';

export const WAYPOINTS: Waypoint[] = [
  { id: 'm0-beacon', label: '采矿区信标', kind: 'beacon', pos: { x: -230, y: 0, z: -170 }, missionIndex: 0, objectiveStep: 0,
    activeWhen: c => active(c) && c.objectiveStep === 0, completeWhen: c => c.objectiveStep >= 1 },
  { id: 'm0-scan', label: '扫描区', kind: 'scan', pos: { x: -200, y: 0, z: -160 }, missionIndex: 0, objectiveStep: 1,
    activeWhen: c => active(c) && c.objectiveStep === 1 && !c.evacuation, completeWhen: c => c.evacuation },
  { id: 'm0-evac', label: '撤离点', kind: 'evac', pos: { x: 0, y: 0, z: 80 }, missionIndex: 0, objectiveStep: 2,
    activeWhen: c => active(c) && c.evacuation, completeWhen: c => c.status === 'success' },
  { id: 'm1-rendezvous', label: '运输船会合点', kind: 'rendezvous', pos: { x: -90, y: 0, z: -220 }, missionIndex: 1, objectiveStep: 0,
    activeWhen: c => active(c) && !c.evacuation, completeWhen: c => c.evacuation },
  { id: 'm1-evac', label: '护航撤离点', kind: 'escort', pos: { x: -60, y: 0, z: -200 }, missionIndex: 1, objectiveStep: 2,
    activeWhen: c => active(c) && c.evacuation, completeWhen: c => c.status === 'success' },
  { id: 'm2-station', label: '空间站防御节点', kind: 'station', pos: { x: 0, y: 25, z: -270 }, missionIndex: 2, objectiveStep: 1,
    activeWhen: c => active(c) && c.progress < 3, completeWhen: c => c.progress >= 3 },
  { id: 'm2-core', label: '能源核心', kind: 'core', pos: { x: 0, y: 25, z: -252 }, missionIndex: 2, objectiveStep: 2,
    activeWhen: c => active(c) && c.progress >= 3 && !c.coreTaken, completeWhen: c => c.coreTaken },
  { id: 'm2-evac', label: '撤离点', kind: 'evac', pos: { x: 0, y: 10, z: -40 }, missionIndex: 2, objectiveStep: 3,
    activeWhen: c => active(c) && c.coreTaken, completeWhen: c => c.status === 'success' },
  { id: 'm3-tower-a', label: '干扰塔 α', kind: 'tower', pos: { x: 180, y: 20, z: -190 }, missionIndex: 3, objectiveStep: 0,
    activeWhen: c => active(c) && c.towersDown < 1, completeWhen: c => c.towersDown >= 1 },
  { id: 'm3-tower-b', label: '干扰塔 β', kind: 'tower', pos: { x: 310, y: -35, z: -230 }, missionIndex: 3, objectiveStep: 0,
    activeWhen: c => active(c) && c.towersDown === 1, completeWhen: c => c.towersDown >= 2 },
  { id: 'm3-command', label: '指挥舰', kind: 'command', pos: { x: 250, y: -20, z: -210 }, missionIndex: 3, objectiveStep: 1,
    activeWhen: c => active(c) && c.towersDown >= 2 && c.commandAlive, completeWhen: c => !c.commandAlive },
  { id: 'm3-evac', label: '终局撤离点', kind: 'evac', pos: { x: 0, y: 0, z: 80 }, missionIndex: 3, objectiveStep: 2,
    activeWhen: c => active(c) && !c.commandAlive, completeWhen: c => c.status === 'success' }
];

const full = (ctx: NavContext): FullNavContext => ({ ...DEFAULT_NAV_CONTEXT, ...ctx });

export function missionWaypoints(missionIndex: number, ctx: NavContext = {}): ResolvedWaypoint[] {
  const c = full(ctx);
  return WAYPOINTS.filter(w => w.missionIndex === missionIndex).map(w => ({
    ...w,
    pos: w.id === 'm3-command' && ctx.commandPos ? { ...ctx.commandPos } : w.pos,
    active: w.activeWhen(c),
    completed: w.completeWhen(c)
  }));
}

export function currentWaypoint(missionIndex: number, ctx: NavContext = {}): ResolvedWaypoint | null {
  const status = ctx.status ?? DEFAULT_NAV_CONTEXT.status;
  if (status === 'success' || status === 'failed') return null;
  return missionWaypoints(missionIndex, ctx).find(w => !w.completed) ?? null;
}

export function upcomingWaypoints(missionIndex: number, ctx: NavContext = {}): ResolvedWaypoint[] {
  const all = missionWaypoints(missionIndex, ctx).filter(w => !w.completed);
  return all.slice(1);
}

export function waypointDistance(shipPos: Vec3, target: Vec3): number {
  const d = dist(shipPos, target);
  return Number.isFinite(d) ? d : 0;
}

export function relativeDirection(shipPos: Vec3, yaw: number, target: Vec3): RelativeDirection {
  const dx = target.x - shipPos.x, dz = target.z - shipPos.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || !Number.isFinite(yaw)) return 'front';
  const forward = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
  const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
  if (Math.abs(forward) >= Math.abs(right)) return forward >= 0 ? 'front' : 'back';
  return right >= 0 ? 'right' : 'left';
}

export const ARRIVE_RADIUS = 30;

export interface NavCardModel { visible: boolean; waypointId: string; label: string; kind: WaypointKind | ''; distance: number; direction: RelativeDirection; status: NavStatus; }

export function navCardModel(missionIndex: number, ctx: NavContext, shipPos: Vec3, yaw: number): NavCardModel {
  const wp = currentWaypoint(missionIndex, ctx);
  if (!wp) return { visible: false, waypointId: '', label: '', kind: '', distance: 0, direction: 'front', status: 'waiting' };
  const distance = waypointDistance(shipPos, wp.pos);
  const status: NavStatus = !wp.active ? 'waiting' : distance <= ARRIVE_RADIUS ? 'arrived' : 'heading';
  return { visible: true, waypointId: wp.id, label: wp.label, kind: wp.kind, distance, direction: relativeDirection(shipPos, yaw, wp.pos), status };
}

export interface PanelPoint { x: number; y: number; clamped: boolean; angle: number; }

export function projectToPanel(shipPos: Vec3, yaw: number, target: Vec3, radius: number, worldPerPixel = 4): PanelPoint {
  let dx = target.x - shipPos.x, dz = target.z - shipPos.z, heading = yaw;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) { dx = 0; dz = 0; }
  if (!Number.isFinite(heading)) heading = 0;
  const forward = dx * -Math.sin(heading) + dz * -Math.cos(heading);
  const right = dx * Math.cos(heading) + dz * -Math.sin(heading);
  let x = right / worldPerPixel, y = -forward / worldPerPixel;
  const d = Math.hypot(x, y);
  const angle = Math.atan2(y, x);
  if (d > radius && d > 0) { x = x / d * radius; y = y / d * radius; return { x, y, clamped: true, angle }; }
  return { x, y, clamped: false, angle };
}

export interface PanelBlip { id: string; role: 'waypoint' | 'enemy' | 'pickup'; point: PanelPoint; }

export function buildPanelModel(
  shipPos: Vec3, yaw: number,
  waypoints: ResolvedWaypoint[],
  enemies: { id: string; pos: Vec3 }[],
  pickups: { id: string; pos: Vec3 }[],
  radius: number, worldPerPixel = 4
): PanelBlip[] {
  const blips: PanelBlip[] = [];
  for (const w of waypoints.filter(w => !w.completed)) blips.push({ id: w.id, role: 'waypoint', point: projectToPanel(shipPos, yaw, w.pos, radius, worldPerPixel) });
  for (const e of enemies) blips.push({ id: e.id, role: 'enemy', point: projectToPanel(shipPos, yaw, e.pos, radius, worldPerPixel) });
  for (const p of pickups) blips.push({ id: p.id, role: 'pickup', point: projectToPanel(shipPos, yaw, p.pos, radius, worldPerPixel) });
  return blips;
}

export const NAV_TOGGLE_CODE = 'KeyN';

export class NavPanelState {
  open = false;
  toggle(): boolean { this.open = !this.open; return this.open; }
  reset() { this.open = false; }
}
