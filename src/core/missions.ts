import { Vec3, dist } from './math';
import type { MissionId } from './types';

export type ObjectiveState = 'pending' | 'active' | 'done' | 'failed';

export interface Objective {
  id: string;
  text: string;
  state: ObjectiveState;
  progress?: number;
  target?: number;
}

export interface MissionDef {
  id: MissionId;
  name: string;
  brief: string;
  region: 'mining' | 'station' | 'fleet';
  timeLimitSec: number;
}

export const MISSION_DEFS: MissionDef[] = [
  { id: 'recon', name: '任务一 · 废弃矿区侦察', brief: '潜入废弃采矿区，扫描 3 个信标并躲避侦察无人机，随后返回集结点。', region: 'mining', timeLimitSec: 360 },
  { id: 'escort', name: '任务二 · 运输船护航', brief: '护送运输船穿越陨石带，击退所有追击敌机，运输船存活至终点。', region: 'mining', timeLimitSec: 360 },
  { id: 'station', name: '任务三 · 失控空间站', brief: '突入失控空间站，摧毁 3 个防御节点，夺取能源核心，并在爆炸倒计时结束前撤离。', region: 'station', timeLimitSec: 420 },
  { id: 'final', name: '任务四 · 舰队决战', brief: '关闭两座干扰塔，击破敌方指挥舰，在舰队反击前撤离。', region: 'fleet', timeLimitSec: 480 }
];

export interface MissionContext {
  playerPos: Vec3;
  hullAlive: boolean;
  timeLeft: number;
  fuel: number;
  scans: number;
  scansRequired: number;
  escortHp: number;
  escortReachedEnd: boolean;
  nodesDestroyed: number;
  nodesRequired: number;
  coreTaken: boolean;
  towersDisabled: number;
  towersRequired: number;
  commandDead: boolean;
  evacuatePos: Vec3 | null;
  stationDetonated: boolean;
}

export class Mission {
  def: MissionDef;
  objectives: Objective[] = [];
  state: 'briefing' | 'running' | 'success' | 'failed' = 'briefing';
  failReason: string | null = null;
  elapsed = 0;
  timeLeft: number;
  evacuateOpened = false;

  constructor(def: MissionDef) {
    this.def = def;
    this.timeLeft = def.timeLimitSec;
    this.objectives = this.buildObjectives(def.id);
  }

  private buildObjectives(id: MissionId): Objective[] {
    switch (id) {
      case 'recon':
        return [
          { id: 'enter', text: '抵达废弃采矿区', state: 'active' },
          { id: 'scan', text: '扫描侦察信标', state: 'pending', progress: 0, target: 3 },
          { id: 'return', text: '返回集结点撤离', state: 'pending' }
        ];
      case 'escort':
        return [
          { id: 'rendezvous', text: '与运输船会合', state: 'active' },
          { id: 'protect', text: '掩护运输船穿越陨石带', state: 'pending' },
          { id: 'finish', text: '运输船抵达安全区', state: 'pending' }
        ];
      case 'station':
        return [
          { id: 'enter', text: '进入失控空间站', state: 'active' },
          { id: 'nodes', text: '摧毁防御节点', state: 'pending', progress: 0, target: 3 },
          { id: 'core', text: '夺取能源核心', state: 'pending' },
          { id: 'evac', text: '爆炸前撤离空间站', state: 'pending' }
        ];
      case 'final':
        return [
          { id: 'enter', text: '突入敌方舰队外围', state: 'active' },
          { id: 'towers', text: '关闭干扰塔', state: 'pending', progress: 0, target: 2 },
          { id: 'command', text: '击破敌方指挥舰', state: 'pending' },
          { id: 'evac', text: '舰队反击前撤离', state: 'pending' }
        ];
    }
  }

  start() {
    if (this.state === 'briefing') this.state = 'running';
  }

  setObjective(id: string, patch: Partial<Objective>) {
    const o = this.objectives.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  }

  update(dt: number, ctx: MissionContext) {
    if (this.state !== 'running') return;
    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    if (!ctx.hullAlive) return this.fail('飞船结构值归零，飞船解体');
    if (this.timeLeft <= 0) {
      if (this.def.id === 'station' && ctx.stationDetonated)
        return this.fail('未能在空间站爆炸前撤离');
      return this.fail('任务超时，作战窗口关闭');
    }

    switch (this.def.id) {
      case 'recon': this.tickRecon(ctx); break;
      case 'escort': this.tickEscort(ctx); break;
      case 'station': this.tickStation(ctx); break;
      case 'final': this.tickFinal(ctx); break;
    }
  }

  private nearEvac(ctx: MissionContext): boolean {
    return ctx.evacuatePos !== null && dist(ctx.playerPos, ctx.evacuatePos) < 22;
  }

  private tickRecon(ctx: MissionContext) {
    this.setObjective('enter', { state: 'done' });
    const scan = this.objectives.find((o) => o.id === 'scan')!;
    scan.state = 'active';
    scan.progress = ctx.scans;
    const ret = this.objectives.find((o) => o.id === 'return')!;
    if (ctx.scans >= ctx.scansRequired) {
      scan.state = 'done';
      ret.state = 'active';
      this.evacuateOpened = true;
      if (this.nearEvac(ctx)) {
        ret.state = 'done';
        this.succeed();
      }
    }
  }

  private tickEscort(ctx: MissionContext) {
    if (ctx.escortHp <= 0) return this.fail('运输船被击毁，护航任务失败');
    this.setObjective('rendezvous', { state: 'done' });
    const protect = this.objectives.find((o) => o.id === 'protect')!;
    protect.state = 'active';
    const finish = this.objectives.find((o) => o.id === 'finish')!;
    if (ctx.escortReachedEnd) {
      protect.state = 'done';
      finish.state = 'done';
      this.succeed();
    }
  }

  private tickStation(ctx: MissionContext) {
    this.setObjective('enter', { state: 'done' });
    const nodes = this.objectives.find((o) => o.id === 'nodes')!;
    nodes.state = 'active';
    nodes.progress = ctx.nodesDestroyed;
    const core = this.objectives.find((o) => o.id === 'core')!;
    const evac = this.objectives.find((o) => o.id === 'evac')!;
    if (ctx.nodesDestroyed >= ctx.nodesRequired) nodes.state = 'done';
    if (ctx.coreTaken) core.state = 'done';
    if (ctx.coreTaken) {
      evac.state = 'active';
      this.evacuateOpened = true;
      if (this.nearEvac(ctx)) {
        evac.state = 'done';
        this.succeed();
      }
    }
    if (ctx.stationDetonated) this.fail('空间站爆炸，未能及时撤离');
  }

  private tickFinal(ctx: MissionContext) {
    this.setObjective('enter', { state: 'done' });
    const towers = this.objectives.find((o) => o.id === 'towers')!;
    towers.state = 'active';
    towers.progress = ctx.towersDisabled;
    const command = this.objectives.find((o) => o.id === 'command')!;
    const evac = this.objectives.find((o) => o.id === 'evac')!;
    if (ctx.towersDisabled >= ctx.towersRequired) towers.state = 'done';
    if (ctx.commandDead) command.state = 'done';
    if (ctx.commandDead) {
      evac.state = 'active';
      this.evacuateOpened = true;
      if (this.nearEvac(ctx)) {
        evac.state = 'done';
        this.succeed();
      }
    }
  }

  private succeed() {
    if (this.state === 'running') this.state = 'success';
  }

  fail(reason: string) {
    if (this.state === 'running') {
      this.state = 'failed';
      this.failReason = reason;
    }
  }

  get activeObjectiveText(): string {
    const o = this.objectives.find((x) => x.state === 'active');
    if (!o) return '';
    if (typeof o.progress === 'number' && o.target) return `${o.text} ${o.progress}/${o.target}`;
    return o.text;
  }
}
