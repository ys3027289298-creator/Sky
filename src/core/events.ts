export type EventKind = 'asteroidShift' | 'reinforcement' | 'shieldFault' | 'stationBoom' | 'convoyReroute' | 'storm';
export interface GameEvent { kind: EventKind; name: string; countdown: number; active: boolean; resolved: boolean; }

export const EVENT_INFO: Record<EventKind, string> = {
  asteroidShift: '陨石带偏移：新碎片封锁原航线', reinforcement: '敌人增援：高速截击机进入战场',
  shieldFault: '护盾故障：回充暂时中断', stationBoom: '能源站爆炸：强光和碎片扩散',
  convoyReroute: '运输船改线：护航路线变长', storm: '临时空间风暴：能见度下降、能量流失'
};

export class EventManager {
  events: GameEvent[] = [];
  trigger(kind: EventKind, countdown = 8) { if (!this.events.some(e => e.kind === kind && !e.resolved)) this.events.push({ kind, name: EVENT_INFO[kind], countdown, active: false, resolved: false }); }
  update(dt: number) {
    for (const e of this.events) if (!e.resolved) { e.countdown -= dt; if (e.countdown <= 0) e.active = true; }
  }
  resolve(kind: EventKind) { const e = this.events.find(x => x.kind === kind && !x.resolved); if (e) e.resolved = true; }
  active(kind: EventKind) { return this.events.some(e => e.kind === kind && e.active && !e.resolved); }
  visibility() { return this.active('storm') || this.active('stationBoom') ? 0.32 : 1; }
  shieldRechargeScale() { return this.active('shieldFault') ? 0 : 1; }
}
