import { describe, expect, it, beforeEach } from 'vitest';
import { Ship } from '../src/core/ship';
import { TargetingSystem, WeaponSystem } from '../src/core/weapons';
import { Enemy } from '../src/core/enemies';
import { MissionManager } from '../src/core/missions';
import { EventManager } from '../src/core/events';
import { purchaseUpgrade, SaveStore } from '../src/core/storage';
import { v } from '../src/core/types';

describe('飞船移动、惯性、转向和碰撞', () => {
  it('推进产生速度且松手后保留惯性', () => { const s=new Ship({engine:0,shield:0,armor:0,weapon:0,radar:0,missile:0}); const before=s.vel.z; s.update({thrust:1,strafe:0,boost:false},.1); expect(s.vel.z).not.toBe(before); const moving=s.vel.z; s.update({thrust:0,strafe:0,boost:false},.1); expect(Math.abs(s.vel.z)).toBeGreaterThan(0); expect(Math.abs(s.vel.z)).toBeLessThan(Math.abs(moving)); });
  it('碰撞大型障碍物不能穿过并受伤', () => { const s=new Ship({engine:0,shield:0,armor:0,weapon:0,radar:0,missile:0}); s.pos=v(0,0,0); s.vel={x:10,y:0,z:0}; const shield=s.shield; s.resolveCollision(v(5,0,0),10); expect(s.pos.x).toBeLessThanOrEqual(-1); expect(s.shield).toBeLessThan(shield); });
});

describe('武器、弹药、过热和冷却', () => {
  it('主炮可过热，R 类冷却后恢复', () => { const w=new WeaponSystem(); for(let i=0;i<12;i++)w.fire('twin'); expect(w.overheated).toBe(true); expect(w.fire('twin')).toBe(false); w.cool(); expect(w.fire('twin')).toBe(true); });
  it('副武器消耗有限弹药', () => { const w=new WeaponSystem(); w.ammo.missile=1; expect(w.fire('missile')).toBe(true); expect(w.ammo.missile).toBe(0); expect(w.fire('missile')).toBe(false); });
});

describe('导弹锁定、脱锁和切换', () => {
  it('可见目标可锁定，遮挡后脱锁', () => { const t=new TargetingSystem(); let l=t.update([{id:'a',visible:true,inRange:true}],2.5); expect(l.targetId).toBe('a'); l=t.update([{id:'a',visible:false,inRange:true}],1.5); expect(l.targetId).toBeNull(); });
  it('可切换到另一个目标', () => { const t=new TargetingSystem(); t.update([{id:'a',visible:true,inRange:true}],.1); const l=t.update([{id:'a',visible:true,inRange:true},{id:'b',visible:true,inRange:true}],.1,true); expect(l.targetId).toBe('b'); });
});

describe('护盾、装甲、部位损伤和维修', () => {
  it('伤害先扣护盾，破盾后损伤部位', () => { const s=new Ship({engine:0,shield:0,armor:0,weapon:0,radar:0,missile:0}); s.takeDamage(200,'engine'); expect(s.shield).toBe(0); expect(s.parts.engine).toBeLessThan(100); expect(s.speedMultiplier).toBeLessThan(1); });
  it('维修包恢复生命装甲和部位', () => { const s=new Ship({engine:0,shield:0,armor:0,weapon:0,radar:0,missile:0}); s.takeDamage(180,'weapon'); const hp=s.hp; expect(s.repair()).toBe(true); expect(s.hp).toBeGreaterThan(hp); expect(s.parts.weapon).toBeGreaterThan(60); });
});

describe('敌人状态机', () => {
  it('近距离追击攻击，失去目标后撤退巡逻', () => { const e=new Enemy('e','interceptor',v(0,0,0),v(100,0,0)); e.update(v(20,0,0),.1,[]); expect(['pursue','attack']).toContain(e.state); for(let i=0;i<8;i++)e.update(v(500,0,0),1,[]); expect(e.state).toBe('patrol'); expect(e.canShoot(v(500,0,0))).toBe(false); });
});

describe('任务流程、资源改装和存档', () => {
  beforeEach(()=>localStorage.clear());
  it('任务开始、成功、失败和撤离条件有效', () => { const m=new MissionManager(0); m.start(); m.addProgress(3); m.advanceAtEvac(true); expect(m.state.status).toBe('success'); const f=new MissionManager(1); f.start(); f.advanceAtEvac(true,0); expect(f.state.status).toBe('failed'); expect(f.state.failReason).toContain('运输船'); });
  it('拾取资源与三级改装真实消耗点数并存档', () => { const store=new SaveStore(); let data=store.load(); data.points=6; for(let i=0;i<3;i++)data=purchaseUpgrade(data,'engine'); expect(data.upgrades.engine).toBe(3); expect(data.points).toBe(0); store.save(data); expect(store.load().upgrades.engine).toBe(3); });
});

describe('动态事件与指挥舰', () => {
  it('六类事件倒计时后改变战斗参数', () => { const e=new EventManager(); e.trigger('storm',0.01); e.update(.02); expect(e.visibility()).toBeLessThan(1); e.trigger('shieldFault',0.01); e.update(.02); expect(e.shieldRechargeScale()).toBe(0); });
  it('指挥舰护盾、弱点和终战条件有效', () => { const c=new Enemy('boss','command',v(0,0,0),v(0,0,0)); const killed=c.damage(1000,'turret'); expect(c.weakpoints.turret).toBeLessThan(100); expect(killed).toBe(true); const m=new MissionManager(3);m.start();m.addProgress(2);m.finalBattle(true,true,true,10);expect(m.state.status).toBe('success'); });
});
