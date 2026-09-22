import { Rng } from './math';

export type EventKind =
  | 'asteroidShift'
  | 'reinforcement'
  | 'shieldFault'
  | 'stationExplosion'
  | 'convoyReroute'
  | 'spaceStorm';

export interface EventEffects {
  visibilityMul: number;
  shieldDrainPerSec: number;
  enemySpeedMul: number;
  enemyDamageMul: number;
  spawnReinforcements: number;
  routeLonger: boolean;
  shake: number;
}

const neutral = (): EventEffects => ({
  visibilityMul: 1,
  shieldDrainPerSec: 0,
  enemySpeedMul: 1,
  enemyDamageMul: 1,
  spawnReinforcements: 0,
  routeLonger: false,
  shake: 0
});

export interface DynamicEvent {
  kind: EventKind;
  title: string;
  description: string;
  durationSec: number;
  countdownSec: number;
  phase: 'warning' | 'active' | 'done';
  effects: EventEffects;
  playerChoice?: 'evade' | 'engage' | 'fortify';
  activated?: boolean;
}

interface Template {
  kind: EventKind;
  title: string;
  description: string;
  warnSec: number;
  durationSec: number;
}

export const EVENT_TEMPLATES: Template[] = [
  { kind: 'asteroidShift', title: '陨石带偏移', description: '引力扰动使陨石带整体漂移，飞行路线收窄。', warnSec: 6, durationSec: 30 },
  { kind: 'reinforcement', title: '敌方增援跃迁', description: '侦测到敌方增援信号，截击机正在跃入战场。', warnSec: 5, durationSec: 25 },
  { kind: 'shieldFault', title: '护盾谐波故障', description: '辐射脉冲导致护盾持续流失。', warnSec: 4, durationSec: 12 },
  { kind: 'stationExplosion', title: '能源站爆炸', description: '失控能源站即将殉爆，冲击波损伤护盾并阻挡视线。', warnSec: 7, durationSec: 10 },
  { kind: 'convoyReroute', title: '运输船改变航线', description: '运输船绕行高密度陨石区，航程增加、敌机增多。', warnSec: 5, durationSec: 30 },
  { kind: 'spaceStorm', title: '临时空间风暴', description: '空间风暴席卷战区，能见度下降、护盾持续损耗。', warnSec: 6, durationSec: 28 }
];

export function baseEffects(kind: EventKind): EventEffects {
  const e = neutral();
  switch (kind) {
    case 'asteroidShift':
      e.routeLonger = true;
      e.shake = 0.25;
      break;
    case 'reinforcement':
      e.spawnReinforcements = 3;
      e.enemySpeedMul = 1.1;
      break;
    case 'shieldFault':
      e.shieldDrainPerSec = 7;
      break;
    case 'stationExplosion':
      e.shieldDrainPerSec = 12;
      e.visibilityMul = 0.45;
      e.shake = 0.9;
      break;
    case 'convoyReroute':
      e.routeLonger = true;
      e.spawnReinforcements = 2;
      break;
    case 'spaceStorm':
      e.visibilityMul = 0.35;
      e.shieldDrainPerSec = 5;
      e.enemyDamageMul = 1.15;
      e.shake = 0.4;
      break;
  }
  return e;
}

/** 玩家应对策略修正：规避（少受护盾损耗但路线更长）、迎战（刷敌人）、加固（减伤但耗能） */
export function applyChoice(e: EventEffects, kind: EventKind, choice: 'evade' | 'engage' | 'fortify'): EventEffects {
  const out = { ...e };
  if (choice === 'evade') {
    out.shieldDrainPerSec *= 0.3;
    out.visibilityMul = Math.min(1, out.visibilityMul + 0.25);
    out.routeLonger = true;
  } else if (choice === 'engage') {
    out.spawnReinforcements += kind === 'reinforcement' ? 2 : 1;
    out.enemyDamageMul *= 0.9;
  } else if (choice === 'fortify') {
    out.shieldDrainPerSec *= 0.5;
    out.enemyDamageMul *= 0.8;
    out.shake *= 0.5;
  }
  return out;
}

export class EventDirector {
  events: DynamicEvent[] = [];
  rng: Rng;
  elapsed = 0;
  private nextEventAt: number;
  private missionGateOk = true;

  constructor(rng = new Rng(), completedMissions: string[] = []) {
    this.rng = rng;
    this.nextEventAt = this.rng.range(18, 28);
    void completedMissions;
  }

  /** 某些事件根据之前任务完成情况更易触发 */
  setMissionGate(completed: string[]) {
    this.missionGateOk = completed.length > 0;
  }

  update(dt: number, missionId: string): DynamicEvent | null {
    this.elapsed += dt;
    const current = this.events.find((e) => e.phase !== 'done');
    if (current) {
      if (current.phase === 'warning') {
        current.countdownSec -= dt;
        if (current.countdownSec <= 0) current.phase = 'active';
      } else {
        current.durationSec -= dt;
        if (current.durationSec <= 0) current.phase = 'done';
      }
      return null;
    }
    if (this.elapsed >= this.nextEventAt) {
      let pool = EVENT_TEMPLATES.slice();
      if (!this.missionGateOk) pool = pool.filter((t) => t.kind !== 'stationExplosion' && t.kind !== 'convoyReroute');
      if (missionId === 'escort') pool = EVENT_TEMPLATES.filter((t) => t.kind !== 'stationExplosion');
      const tpl = this.rng.pick(pool);
      const ev: DynamicEvent = {
        kind: tpl.kind,
        title: tpl.title,
        description: tpl.description,
        durationSec: tpl.durationSec,
        countdownSec: tpl.warnSec,
        phase: 'warning',
        effects: baseEffects(tpl.kind)
      };
      this.events.push(ev);
      this.nextEventAt = this.elapsed + this.rng.range(30, 45);
      return ev;
    }
    return null;
  }

  choose(choice: 'evade' | 'engage' | 'fortify') {
    const cur = this.events.find((e) => e.phase === 'warning');
    if (cur) {
      cur.playerChoice = choice;
      cur.effects = applyChoice(cur.effects, cur.kind, choice);
    }
  }

  get activeEffects(): EventEffects {
    const active = this.events.find((e) => e.phase === 'active');
    return active ? active.effects : neutral();
  }

  get current(): DynamicEvent | undefined {
    return this.events.find((e) => e.phase !== 'done');
  }
}
