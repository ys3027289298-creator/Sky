import * as THREE from 'three';
import { Enemy } from '../core/enemies';
import { EventKind, EventManager } from '../core/events';
import { MISSIONS, MissionManager } from '../core/missions';
import { purchaseUpgrade, SaveStore } from '../core/storage';
import { PickupKind, PickupLedger, ResourceState } from '../core/pickups';
import { Ship } from '../core/ship';
import { dist } from '../core/types';
import { TargetingSystem, WeaponSystem, WEAPONS } from '../core/weapons';
import { SoundFX } from './audio';
import { GameWorld, toThree } from './world';

type Screen = 'menu' | 'hangar' | 'help' | 'settings' | 'game' | 'pause';
type Pickup = { id: string; kind: PickupKind; pos: THREE.Vector3; mesh: THREE.Object3D };

export class GameApp {
  store = new SaveStore(); save = this.store.load();
  world!: GameWorld; ship!: Ship; weapons!: WeaponSystem; targeting = new TargetingSystem(); missions!: MissionManager; events = new EventManager(); sound = new SoundFX(this.save.settings.volume);
  enemies: Enemy[] = []; pickups: Pickup[] = []; playerShip!: THREE.Group; screen: Screen = 'menu'; missionIndex = 0; practice = false; paused = false; cameraMode: 'chase'|'cockpit' = 'chase';
  ledger = new PickupLedger(); pickupSeq = 0;
  keys = new Set<string>(); mouse = { x: 0, y: 0 }; stationTime = 75; finalTime = 130; scanned = 0; nodes = 0; towers = 0; core = false; convoyHp = 100; last = 0; fireCooldown = 0;
  el = {
    menu: document.querySelector<HTMLDivElement>('#menu')!, overlay: document.querySelector<HTMLDivElement>('#overlay')!, hud: document.querySelector<HTMLDivElement>('#hud')!, app: document.querySelector<HTMLDivElement>('#app')!,
    missionTitle: document.querySelector('#missionTitle')!, missionObjective: document.querySelector('#missionObjective')!, missionTimer: document.querySelector('#missionTimer')!, event: document.querySelector('#eventBanner')!,
    hp: document.querySelector<HTMLProgressElement>('#hpBar')!, shield: document.querySelector<HTMLProgressElement>('#shieldBar')!, armor: document.querySelector<HTMLProgressElement>('#armorBar')!, energy: document.querySelector<HTMLProgressElement>('#energyBar')!, fuel: document.querySelector<HTMLProgressElement>('#fuelBar')!,
    hpText: document.querySelector('#hpText')!, shieldText: document.querySelector('#shieldText')!, armorText: document.querySelector('#armorText')!, energyText: document.querySelector('#energyText')!, fuelText: document.querySelector('#fuelText')!, weapon: document.querySelector('#weaponInfo')!, parts: document.querySelector('#partStatus')!, target: document.querySelector('#targetInfo')!, lockText: document.querySelector('#lockText')!, radar: document.querySelector<HTMLCanvasElement>('#radar')!
  };

  constructor() {
    document.addEventListener('keydown', e => this.key(e, true)); document.addEventListener('keyup', e => this.keys.delete(e.code));
    document.addEventListener('mousemove', e => { if (this.screen === 'game' && !this.paused) { this.mouse.x += e.movementX * this.save.settings.mouseSensitivity; this.mouse.y += e.movementY * this.save.settings.mouseSensitivity; }});
    document.addEventListener('mousedown', e => { if (this.screen === 'game') this.keys.add(e.button === 0 ? 'Mouse0' : 'Mouse2'); });
    document.addEventListener('mouseup', e => this.keys.delete(e.button === 0 ? 'Mouse0' : 'Mouse2'));
    document.addEventListener('contextmenu', e => e.preventDefault());
    this.showMenu(); requestAnimationFrame(t => this.loop(t));
  }

  key(e: KeyboardEvent, down: boolean) {
    if (down && e.code === 'Escape') return this.screen === 'game' ? this.show('pause') : this.screen === 'pause' ? this.show('game') : undefined;
    if (this.screen !== 'game') { if (down) this.keys.add(e.code); return; }
    if (down && e.code === 'KeyC') this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
    if (down && e.code === 'KeyR') this.weapons?.cool();
    if (down && ['Digit1','Digit2','Digit3','Digit4'].includes(e.code)) {
      const ids = ['twin','pulse','missile','blast'] as const;
      const id = ids[Number(e.code.slice(-1))-1];
      if (WEAPONS[id].secondary) this.weapons.secondary = id; else this.weapons.primary = id;
    }
    if (down && e.code === 'Tab') { e.preventDefault(); alert(`${MISSIONS[this.missionIndex].name}\n${MISSIONS[this.missionIndex].brief}\n当前目标：${this.objective()}`); }
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
  }

  show(screen: Screen) {
    this.screen = screen; this.paused = screen === 'pause';
    this.el.hud.classList.toggle('hidden', screen !== 'game'); this.el.menu.classList.toggle('hidden', screen !== 'menu');
    this.el.overlay.classList.toggle('hidden', !['pause','hangar','help','settings'].includes(screen));
    if (screen === 'menu') this.menu(); if (screen === 'hangar') this.hangar(); if (screen === 'help') this.help(); if (screen === 'settings') this.settings(); if (screen === 'pause') this.pauseMenu();
  }
  showMenu() { this.show('menu'); }
  menu() {
    this.el.menu.innerHTML = `<h1>星陨防线</h1><p>侦察、护航、夺核、击破指挥舰。推荐流程 10–15 分钟。</p><button data-a="continue">开始任务 / 继续第 ${this.save.unlockedMission + 1} 关</button><button data-a="new">完整流程</button><button data-a="practice">简单练习</button><button data-a="hangar">飞船改装</button><button data-a="help">操作说明</button><button data-a="settings">设置</button><p>资源 ${this.save.resources}｜改装点 ${this.save.points}｜解锁 ${this.save.unlockedMission + 1}/4</p>`;
    this.el.menu.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => {
      const a = b.dataset.a; if (a === 'continue') this.start(this.save.unlockedMission); if (a === 'new') this.start(0); if (a === 'practice') { this.practice = true; this.start(0); }
      if (a === 'hangar') this.show('hangar'); if (a === 'help') this.show('help'); if (a === 'settings') this.show('settings');
    });
  }
  hangar() {
    const names = { engine:'引擎', shield:'护盾', armor:'装甲', weapon:'武器', radar:'雷达', missile:'导弹舱' };
    this.el.overlay.innerHTML = `<h2>飞船改装</h2><p>改装点：${this.save.points}，升级立即影响实际飞行、防御、火力、雷达与弹药。</p><div class=upgrades>${Object.entries(names).map(([k,n]) => `<div><b>${n}</b><span>${'■'.repeat(this.save.upgrades[k as keyof typeof names])}${'□'.repeat(3-this.save.upgrades[k as keyof typeof names])}</span><button data-u=${k}>升级</button></div>`).join('')}</div><button data-a=menu>返回</button>`;
    this.el.overlay.querySelectorAll<HTMLButtonElement>('[data-u]').forEach(b => b.onclick = () => { this.save = purchaseUpgrade(this.save, b.dataset.u as never); this.store.save(this.save); this.hangar(); });
    this.el.overlay.querySelector<HTMLElement>('[data-a=menu]')!.onclick = () => this.showMenu();
  }
  help() { this.el.overlay.innerHTML = `<h2>操作说明</h2><div class=help><p>W/S 推进与减速，A/D 平移，鼠标转向，Q/E 翻滚。</p><p>左键主炮，右键副武器，Shift 冲刺，空格闪避，R 冷却，Tab 任务，C 切换视角，Esc 暂停。</p><p>绿色信标维修，黄色补给提供燃料/弹药/模块。护盾脱战恢复，装甲和部位损伤需维修。</p><p>Tab 可重新打开任务简报；失败页面会列出具体原因。</p></div><button data-a=menu>返回</button>`; this.el.overlay.querySelector<HTMLElement>('[data-a=menu]')!.onclick = () => this.showMenu(); }
  settings() { this.el.overlay.innerHTML = `<h2>设置</h2><label>鼠标灵敏度 <input id=sens type=range min=.5 max=2 step=.1 value=${this.save.settings.mouseSensitivity}></label><label>音量 <input id=vol type=range min=0 max=1 step=.05 value=${this.save.settings.volume}></label><button id=wipe>清除存档</button><button data-a=menu>返回</button>`; const sens=this.el.overlay.querySelector<HTMLInputElement>('#sens')!,vol=this.el.overlay.querySelector<HTMLInputElement>('#vol')!; sens.oninput=()=>{this.save.settings.mouseSensitivity=+sens.value;this.store.save(this.save)};vol.oninput=()=>{this.save.settings.volume=+vol.value;this.sound.volume=+vol.value;this.store.save(this.save)};this.el.overlay.querySelector<HTMLElement>('#wipe')!.onclick=()=>{this.save=this.store.reset();this.settings()};this.el.overlay.querySelector<HTMLElement>('[data-a=menu]')!.onclick=()=>this.showMenu(); }
  pauseMenu() { this.el.overlay.innerHTML = `<h2>任务暂停</h2><button data-a=resume>继续任务</button><button data-a=restart>重新开始任务</button><button data-a=menu>快速返回主菜单</button>`; this.el.overlay.querySelector<HTMLElement>('[data-a=resume]')!.onclick=()=>this.show('game'); this.el.overlay.querySelector<HTMLElement>('[data-a=restart]')!.onclick=()=>this.start(this.missionIndex); this.el.overlay.querySelector<HTMLElement>('[data-a=menu]')!.onclick=()=>this.showMenu(); }

  start(index: number) {
    this.missionIndex = index; this.save = this.store.load(); this.el.app.innerHTML=''; this.world = new GameWorld(this.el.app);
    this.ship = new Ship(structuredClone(this.save.upgrades)); this.weapons = new WeaponSystem(this.save.upgrades.weapon, this.save.upgrades.missile); this.targeting = new TargetingSystem(); this.missions = new MissionManager(index); this.events = new EventManager();
    if (this.practice) this.ship.repairMaterials = 8;
    this.enemies=[]; this.pickups=[]; this.ledger.clear(); this.scanned=0;this.nodes=0;this.towers=0;this.core=false;this.convoyHp=100;this.stationTime=75;this.finalTime=130;this.playerShip=this.world.makePlayerShip(); this.spawnContent(); this.missions.start(); this.show('game'); this.el.app.querySelector('canvas')?.requestPointerLock?.();
  }
  spawnContent() {
    const sets: Enemy['kind'][][] = [['scout','scout','drone'], ['interceptor','interceptor','gunship','scout'], ['drone','drone','gunship','interceptor'], ['interceptor','gunship','drone','interceptor','command']];
    const centers = [new THREE.Vector3(-230,0,-170), new THREE.Vector3(-90,0,-220), new THREE.Vector3(0,25,-270), new THREE.Vector3(250,-20,-210)];
    sets[this.missionIndex].forEach((kind,i) => { const p = centers[this.missionIndex].clone().add(new THREE.Vector3((i-1)*36, (Math.random()-.5)*42, -i*20)); const e = new Enemy(`${kind}-${i}`, kind, {x:p.x,y:p.y,z:p.z}, {x:p.x+35,y:0,z:p.z-30}); this.enemies.push(e); this.world.addEnemyMesh(e); });
    [['repair',new THREE.Vector3(20,-8,-220)],['fuel',new THREE.Vector3(-170,15,-210)],['ammo',new THREE.Vector3(40,35,-245)],['module',new THREE.Vector3(210,10,-185)]].forEach(([kind,p]) => this.addPickup(kind as Pickup['kind'], p as THREE.Vector3));
  }
  addPickup(kind: PickupKind, pos: THREE.Vector3) { const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(2), new THREE.MeshBasicMaterial({ color: kind==='repair'?0x43ff75:kind==='fuel'?0xffd34a:kind==='ammo'?0x66ccff:0xff70ff })); mesh.position.copy(pos); this.world.scene.add(mesh); const id=`pickup-${this.pickupSeq++}`; this.ledger.register(id); this.pickups.push({id,kind,pos,mesh}); }
  objective() { return MISSIONS[this.missionIndex].steps[Math.min(this.missions.state.objectiveStep, MISSIONS[this.missionIndex].steps.length-1)]; }
  loop(t: number) { const dt=Math.min(.05,(t-(this.last||t))/1000); this.last=t; if(this.screen==='game'&&!this.paused)this.update(dt); if(this.world)this.world.update(dt); requestAnimationFrame(n=>this.loop(n)); }

  update(dt: number) {
    this.missions.update(dt); this.events.update(dt); this.weapons.update(dt); this.fireCooldown -= dt;
    if (this.missions.state.time > 18 && Math.random() < dt * .055) this.randomEvent();
    const thrust=(this.keys.has('KeyW')?1:0)-(this.keys.has('KeyS')?.45:0), strafe=(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0), roll=(this.keys.has('KeyE')?1:0)-(this.keys.has('KeyQ')?1:0);
    this.ship.rotate(this.mouse.x,this.mouse.y,roll,dt); this.mouse.x=this.mouse.y=0;
    this.ship.update({thrust,strafe,boost:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'),dodge:this.keys.has('Space')?this.ship.forward():undefined},dt,this.world.obstacles);
    if (this.events.active('storm')) this.ship.energy=Math.max(0,this.ship.energy-4*dt);
    this.playerShip.position.copy(toThree(this.ship.pos)); this.playerShip.rotation.set(this.ship.pitch,this.ship.yaw,this.ship.roll);
    this.updateEnemies(dt); this.updateWeapons(dt); this.updateMission(dt); this.updatePickups(); this.updateCamera(); this.updateHud();
    if (this.ship.hp<=0) this.finish(false,'飞船生命值降为零，在敌火中解体');
  }

  updateEnemies(dt:number) {
    const jamming=this.missionIndex===3&&this.towers<2;
    for (const enemy of this.enemies) {
      enemy.update(this.ship.pos,dt,this.world.obstacles,jamming);
      const mesh=this.world.enemyMeshes.get(enemy.id); if(mesh){mesh.position.copy(toThree(enemy.pos));mesh.rotation.y+=dt;}
      if (enemy.canShoot(this.ship.pos,jamming)) { enemy.fired(); this.ship.takeDamage(enemy.cfg.damage*(this.practice?.35:1),(['engine','weapon','radar','hull'] as const)[Math.floor(Math.random()*4)]); this.sound.alarm(); }
    }
  }

  visible(pos:{x:number;y:number;z:number}) {
    const from=this.ship.pos;
    for (const o of this.world.obstacles) {
      const ox=o.pos.x-from.x,oy=o.pos.y-from.y,oz=o.pos.z-from.z, dx=pos.x-from.x,dy=pos.y-from.y,dz=pos.z-from.z;
      const l2=dx*dx+dy*dy+dz*dz,t=l2?(ox*dx+oy*dy+oz*dz)/l2:0;
      if (t>0&&t<1 && Math.hypot(ox-dx*t,oy-dy*t,oz-dz*t)<o.radius) return false;
    }
    return true;
  }

  updateWeapons(dt:number) {
    const candidates=this.enemies.filter(e=>e.alive).map(e=>({id:e.id,visible:this.visible(e.pos),inRange:dist(e.pos,this.ship.pos)<=this.ship.lockRange}));
    const lock=this.targeting.update(candidates,dt,false);
    if (this.keys.has('Mouse0')&&this.fireCooldown<=0&&this.weapons.fire(this.weapons.primary,this.ship.fireMultiplier)) {
      const id=this.weapons.primary; this.fireCooldown=1/(WEAPONS[id].rate*this.ship.fireMultiplier); this.fireProjectile(id,lock.targetId);
    }
    if (this.keys.has('Mouse2')&&this.weapons.fire(this.weapons.secondary,this.ship.fireMultiplier)) this.fireProjectile(this.weapons.secondary,lock.progress>=100?lock.targetId:undefined);
  }

  fireProjectile(id:string,targetId?:string|null) {
    const dir=this.ship.forward(), mesh=this.world.spawnProjectile(this.ship.pos,dir,targetId??undefined,id==='blast');
    mesh.lookAt(toThree({x:this.ship.pos.x+dir.x,y:this.ship.pos.y+dir.y,z:this.ship.pos.z+dir.z}));
    id==='missile'?this.sound.missile():this.sound.shoot();
    setTimeout(()=>this.resolveShot(id as never,targetId),id==='missile'?280:70);
  }

  resolveShot(id:'twin'|'pulse'|'missile'|'blast',targetId?:string|null) {
    const spec=WEAPONS[id]; let target=this.enemies.find(e=>e.id===targetId&&e.alive);
    if (!target) target=this.enemies.filter(e=>e.alive).sort((a,b)=>dist(a.pos,this.ship.pos)-dist(b.pos,this.ship.pos))[0];
    if (target&&dist(target.pos,this.ship.pos)<=spec.range&&(id==='missile'||this.visible(target.pos))) {
      const part=target.kind==='command'?(['turret','engine','node'] as const)[Math.floor(Math.random()*3)]:undefined;
      const killed=target.damage(spec.damage*(1+this.save.upgrades.weapon*.08),part);
      this.weapons.registerHit(); this.world.explosion(target.pos,killed?0xff5522:0x99ffff,killed?2:.7); this.sound.hit();
      if (killed) { const mesh=this.world.enemyMeshes.get(target.id); if(mesh)mesh.visible=false; this.addPickup(Math.random()>.5?'ammo':'repair',toThree(target.pos)); }
    }
  }

  randomEvent() {
    const all:EventKind[]=['asteroidShift','reinforcement','shieldFault','stationBoom','convoyReroute','storm'];
    const kind=all[Math.floor(Math.random()*all.length)]; this.events.trigger(kind,4);
    if (kind==='reinforcement') { const e=new Enemy(`reinforced-${Date.now()}`,'interceptor',{x:this.ship.pos.x+70,y:this.ship.pos.y,z:this.ship.pos.z-70},{...this.ship.pos}); this.enemies.push(e); this.world.addEnemyMesh(e); }
    if (kind==='shieldFault') this.ship.shieldDelay=8;
    if (kind==='asteroidShift') this.world.obstacles.filter(o=>o.id.startsWith('asteroid')).slice(0,12).forEach((o,i)=>{o.pos.x+=(i%2?1:-1)*32;o.pos.z+=(i%3-1)*28;});
    if (kind==='stationBoom') { this.ship.takeDamage(12,'hull'); const station=this.world.obstacles.find(o=>o.id==='station'); if(station){station.pos.y+=18;station.radius=62;} }
    if (kind==='convoyReroute') this.convoyHp=Math.max(0,this.convoyHp-4);
  }

  snapshotResources(): ResourceState {
    return { fuel: this.ship.fuel, missile: this.weapons.ammo.missile, blast: this.weapons.ammo.blast, repairMaterials: this.ship.repairMaterials, points: this.save.points };
  }
  applyResources(state: ResourceState) {
    this.ship.fuel = state.fuel; this.weapons.ammo.missile = state.missile; this.weapons.ammo.blast = state.blast; this.ship.repairMaterials = state.repairMaterials; this.save.points = state.points;
  }
  updatePickups() {
    this.pickups=this.pickups.filter(p=>{p.mesh.rotation.y+=.03; if(p.pos.distanceTo(toThree(this.ship.pos))>8)return true;
      const state=this.snapshotResources();
      const result=this.ledger.settle(p.id,p.kind,state,()=>{this.ship.repairMaterials=state.repairMaterials; const repaired=this.ship.repair(); state.repairMaterials=this.ship.repairMaterials; return repaired;});
      if(result)this.applyResources(state);
      this.world.scene.remove(p.mesh); return false;
    });
  }

  updateMission(dt:number) {
    const m=this.missions;
    if(m.state.index===0) {
      if(this.ship.pos.z<-145&&this.ship.pos.x<-140){m.state.objectiveStep=1; if(this.keys.has('KeyF')){this.scanned=3;m.addProgress(3);m.state.evacuation=true;m.state.objectiveStep=2;}}
      if(this.scanned>=3&&this.ship.pos.z>55)m.state.status='success';
    }
    if(m.state.index===1) {
      m.state.objectiveStep=1; this.convoyHp=Math.max(0,this.convoyHp-dt*(this.events.active('reinforcement')?1.2:.35));
      if(this.enemies.filter(e=>e.alive).length<=1){m.addProgress(5);m.advanceAtEvac(this.ship.pos.z<-180&&this.ship.pos.x<-20,this.convoyHp);}
    }
    if(m.state.index===2) {
      if(this.nodes<3&&toThree(this.ship.pos).distanceTo(new THREE.Vector3(0,25,-270))<65&&this.keys.has('KeyF')){this.nodes++;m.addProgress(1);}
      if(this.nodes>=3)m.state.objectiveStep=2;
      if(this.nodes>=3&&!this.core&&toThree(this.ship.pos).distanceTo(new THREE.Vector3(0,25,-270))<40)this.core=true;
      if(this.core){this.stationTime-=dt;m.state.objectiveStep=3;m.stationCoreTaken(true,this.ship.pos.z>-100,this.stationTime);}
    }
    if(m.state.index===3) {
      if(this.towers<2&&this.keys.has('KeyF')&&(toThree(this.ship.pos).distanceTo(new THREE.Vector3(180,20,-190))<28||toThree(this.ship.pos).distanceTo(new THREE.Vector3(310,-35,-230))<28)){this.towers++;m.addProgress(1);}
      const command=this.enemies.find(e=>e.kind==='command');
      if(this.towers>=2)m.state.objectiveStep=1;
      if(command&&!command.alive){m.state.objectiveStep=2;m.addProgress(2);}
      if(!command?.alive){this.finalTime-=dt;m.finalBattle(this.towers>=2,true,this.ship.pos.z>40,this.finalTime);}
    }
    if(this.convoyHp<=0)this.finish(false,'运输船生命值降为零，护航失败');
    if(m.state.status==='success')this.finish(true,'任务完成');
  }

  updateCamera() {
    const forward=toThree(this.ship.forward());
    if(this.cameraMode==='chase')this.world.camera.position.lerp(toThree(this.ship.pos).add(forward.clone().multiplyScalar(-13)).add(new THREE.Vector3(0,4,0)),.12);
    else this.world.camera.position.lerp(toThree(this.ship.pos).add(forward.clone().multiplyScalar(1.2)).add(new THREE.Vector3(0,.8,0)),.25);
    this.world.camera.lookAt(toThree(this.ship.pos).add(forward.multiplyScalar(40)));
  }

  updateHud() {
    const s=this.ship,w=this.weapons,m=this.missions.state,lock=this.targeting.lock;
    this.el.missionTitle.textContent=`${this.missionIndex+1}. ${MISSIONS[this.missionIndex].name}`;
    this.el.missionObjective.textContent=`目标：${this.objective()}｜进度 ${m.progress}/${MISSIONS[this.missionIndex].checks}`;
    this.el.missionTimer.textContent=`倒计时 ${Math.max(0,this.missionIndex===2?this.stationTime:this.missionIndex===3?this.finalTime:600-m.time).toFixed(0)}s｜撤离 ${m.evacuation?'开启':'未开启'}`;
    [this.el.hp,this.el.shield,this.el.armor,this.el.energy,this.el.fuel].forEach((bar,i)=>bar.value=[s.hp,s.shield,s.armor,s.energy,s.fuel][i]);
    this.el.hpText.textContent=`${s.hp.toFixed(0)}`;this.el.shieldText.textContent=`${s.shield.toFixed(0)}`;this.el.armorText.textContent=`${s.armor.toFixed(0)}`;this.el.energyText.textContent=`${s.energy.toFixed(0)}`;this.el.fuelText.textContent=`${s.fuel.toFixed(0)}`;
    this.el.weapon.innerHTML=`主炮(1/2) ${WEAPONS[w.primary].name}｜副武器(3/4) ${WEAPONS[w.secondary].name}<br>过热 ${w.heat.toFixed(0)}% ${w.overheated?'<b>过热冷却</b>':''}｜导弹 ${w.ammo.missile}｜爆破 ${w.ammo.blast}｜维修包 ${s.repairMaterials}`;
    this.el.parts.textContent=`引擎 ${s.parts.engine.toFixed(0)}% 武器 ${s.parts.weapon.toFixed(0)}% 雷达 ${s.parts.radar.toFixed(0)}%`;
    const enemy=this.enemies.find(e=>e.id===lock.targetId&&e.alive);
    this.el.target.textContent=enemy?`锁定 ${enemy.kind}｜距离 ${dist(enemy.pos,s.pos).toFixed(0)}｜生命 ${enemy.hp.toFixed(0)}｜护盾 ${enemy.shield.toFixed(0)}`:(lock.targetId?'目标脱锁：距离过远或被障碍物遮挡':'自由瞄准');
    this.el.lockText.textContent=lock.targetId?(lock.progress>=100?'LOCK':`${lock.progress.toFixed(0)}%`):'';
    const banner=this.events.events.find(e=>!e.resolved&&(!e.active||e.countdown>-2));
    this.el.event.textContent=banner?`${banner.name}｜${banner.active?'事件正在影响战场':`倒计时 ${Math.max(0,banner.countdown).toFixed(1)}s`}`:'';
    this.el.event.classList.toggle('hidden',!banner);
    this.updateRadar();
  }

  updateRadar() {
    const c=this.el.radar.getContext('2d')!; c.clearRect(0,0,190,190); c.fillStyle='rgba(0,18,30,.78)';c.beginPath();c.arc(95,95,88,0,Math.PI*2);c.fill();c.strokeStyle='#5cecff';c.stroke();
    c.fillStyle='#fff';c.beginPath();c.arc(95,95,3,0,Math.PI*2);c.fill();
    for(const e of this.enemies.filter(e=>e.alive)){const dx=e.pos.x-this.ship.pos.x,dz=e.pos.z-this.ship.pos.z,d=Math.hypot(dx,dz),n=Math.min(80,d/4);c.fillStyle=e.kind==='command'?'#ff3c9e':'#ff5555';c.beginPath();c.arc(95+dx/d*n,95+dz/d*n,e.kind==='command'?5:3,0,Math.PI*2);c.fill();}
    for(const p of this.pickups){c.fillStyle='#43ff75';c.fillRect(93+(p.pos.x-this.ship.pos.x)/4,93+(p.pos.z-this.ship.pos.z)/4,4,4);}
  }

  finish(success:boolean,reason:string) {
    if(this.screen!=='game')return;
    const kills=this.enemies.filter(e=>!e.alive).length, reward=success?80+kills*20+this.missionIndex*40:25+kills*10;
    if(success){this.save.resources+=reward;this.save.points+=1+this.missionIndex;this.save.unlockedMission=Math.max(this.save.unlockedMission,Math.min(3,this.missionIndex+1));this.store.save(this.save);}
    this.show('pause');
    this.el.overlay.innerHTML=`<h2 class="${success?'win':'lose'}">${success?'任务成功':'任务失败'}</h2><p>${reason}</p><ul><li>击毁数量：${kills}</li><li>命中率：${(this.weapons.accuracy*100).toFixed(0)}%</li><li>剩余护盾：${this.ship.shield.toFixed(0)}</li><li>用时：${this.missions.state.time.toFixed(1)} 秒</li><li>获得资源：${success?reward:reward}</li></ul><button data-a=restart>重新开始任务</button><button data-a=menu>返回主菜单</button>`;
    this.el.overlay.querySelector<HTMLElement>('[data-a=restart]')!.onclick=()=>this.start(this.missionIndex); this.el.overlay.querySelector<HTMLElement>('[data-a=menu]')!.onclick=()=>this.showMenu();
    document.exitPointerLock?.();
  }
}
