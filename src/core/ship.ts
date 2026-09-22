import { Vec3, add, clamp, len, norm, scale, sub, dist, PartKind } from './types';
import { SaveData } from './storage';

export class Ship {
  pos: Vec3 = { x: 0, y: 0, z: 80 };
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0; pitch = 0; roll = 0;
  hp = 100; maxHp = 100; shield = 80; maxShield = 80; armor = 80; maxArmor = 80; energy = 100; maxEnergy = 100; fuel = 100;
  parts: Record<PartKind, number> = { hull: 100, engine: 100, weapon: 100, radar: 100 };
  shieldDelay = 0;
  repairMaterials = 2;
  constructor(public upgrades: SaveData['upgrades']) {
    this.maxShield = 80 + upgrades.shield * 25;
    this.maxArmor = 80 + upgrades.armor * 20;
    this.shield = this.maxShield; this.armor = this.maxArmor;
  }
  get speedMultiplier() { return 0.55 + 0.45 * (this.parts.engine / 100) + this.upgrades.engine * 0.12; }
  get fireMultiplier() { return 0.55 + 0.45 * (this.parts.weapon / 100) + this.upgrades.weapon * 0.10; }
  get lockRange() { return 260 + this.upgrades.radar * 80 + this.parts.radar * 1.6; }
  update(input: { thrust: number; strafe: number; boost: boolean; dodge?: Vec3 }, dt: number, obstacles: { pos: Vec3; radius: number }[] = []) {
    const burningFuel = input.thrust > 0 || input.boost;
    this.fuel = clamp(this.fuel - (input.boost ? 3.2 : input.thrust > 0 ? 1.1 : 0.25) * dt, 0, 100);
    if (this.fuel <= 0) input.thrust = 0;
    const forward = this.forward();
    const right = { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
    const power = (24 + this.upgrades.engine * 4) * this.speedMultiplier;
    if (this.energy >= (input.boost ? 18 * dt : 0)) {
      this.vel = add(this.vel, scale(forward, input.thrust * power * dt));
      this.vel = add(this.vel, scale(right, input.strafe * power * 0.65 * dt));
      if (input.boost) { this.vel = add(this.vel, scale(forward, 42 * dt)); this.energy -= 18 * dt; }
    }
    if (input.dodge && this.energy >= 18) { this.vel = add(this.vel, scale(norm(input.dodge), 48)); this.energy -= 18; }
    const drag = Math.pow(0.986, dt * 60);
    this.vel = scale(this.vel, drag);
    const maxSpeed = (48 + this.upgrades.engine * 7) * this.speedMultiplier * (input.boost ? 1.55 : 1);
    if (len(this.vel) > maxSpeed) this.vel = scale(norm(this.vel), maxSpeed);
    this.pos = add(this.pos, scale(this.vel, dt));
    this.energy = clamp(this.energy + (burningFuel ? 4 : 9) * dt, 0, this.maxEnergy);
    this.shieldDelay = Math.max(0, this.shieldDelay - dt);
    if (this.shieldDelay <= 0) this.shield = clamp(this.shield + (3 + this.upgrades.shield) * dt, 0, this.maxShield);
    for (const o of obstacles) this.resolveCollision(o.pos, o.radius + 4);
  }
  rotate(dx: number, dy: number, rollInput: number, dt: number) {
    this.yaw -= dx * 0.0022; this.pitch = clamp(this.pitch - dy * 0.002, -1.1, 1.1);
    this.roll = clamp(this.roll + rollInput * dt * 2.4, -1.25, 1.25);
  }
  forward(): Vec3 { return norm({ x: -Math.sin(this.yaw) * Math.cos(this.pitch), y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * Math.cos(this.pitch) }); }
  resolveCollision(pos: Vec3, radius: number): number {
    const d = sub(this.pos, pos); const distance = len(d);
    if (distance < radius && distance > 0) {
      const push = radius - distance;
      this.pos = add(this.pos, scale(norm(d), push));
      this.vel = scale(this.vel, 0.45);
      const damage = push * 3 + len(this.vel) * 0.12;
      this.takeDamage(damage, 'hull');
      return damage;
    }
    return 0;
  }
  takeDamage(amount: number, part: PartKind = 'hull') {
    let remaining = amount;
    if (this.shield > 0) { const absorbed = Math.min(this.shield, remaining); this.shield -= absorbed; remaining -= absorbed; this.shieldDelay = 4; }
    if (remaining > 0) {
      const armorBlock = 0.35 + this.upgrades.armor * 0.04;
      const armorLoss = Math.min(this.armor, remaining * armorBlock);
      this.armor -= armorLoss; remaining -= armorLoss;
      this.hp = clamp(this.hp - remaining, 0, this.maxHp);
      this.parts[part] = clamp(this.parts[part] - remaining * 0.45, 0, 100);
    }
  }
  repair(): boolean {
    if (this.repairMaterials <= 0 || (this.hp >= this.maxHp && this.armor >= this.maxArmor && Object.values(this.parts).every(x => x >= 100))) return false;
    this.repairMaterials--; this.hp = clamp(this.hp + 35, 0, this.maxHp); this.armor = clamp(this.armor + 25, 0, this.maxArmor);
    (Object.keys(this.parts) as PartKind[]).forEach(p => this.parts[p] = clamp(this.parts[p] + 28, 0, 100));
    return true;
  }
  pickup(kind: 'fuel' | 'ammo' | 'repair' | 'module'): number {
    if (kind === 'fuel') this.fuel = clamp(this.fuel + 30, 0, 100);
    if (kind === 'repair') this.repairMaterials += 1;
    if (kind === 'module') return 1;
    return 0;
  }
  near(a: Vec3, range: number) { return dist(this.pos, a) <= range; }
}
