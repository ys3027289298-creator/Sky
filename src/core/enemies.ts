import { EnemyKind, EnemyState, Vec3, dist, sub, norm, scale, add, clamp } from './types';

export interface EnemyConfig { hp: number; shield: number; speed: number; range: number; damage: number; score: number; }
export const ENEMY_CONFIG: Record<EnemyKind, EnemyConfig> = {
  scout: { hp: 28, shield: 10, speed: 24, range: 90, damage: 5, score: 40 },
  interceptor: { hp: 42, shield: 25, speed: 38, range: 110, damage: 8, score: 70 },
  gunship: { hp: 95, shield: 45, speed: 16, range: 150, damage: 16, score: 130 },
  drone: { hp: 55, shield: 35, speed: 20, range: 70, damage: 10, score: 85 },
  command: { hp: 420, shield: 220, speed: 9, range: 210, damage: 24, score: 600 }
};

export class Enemy {
  hp; shield; state: EnemyState = 'patrol'; awareTimer = 0; fireTimer = Math.random() * 2; alive = true;
  weakpoints = { turret: 100, engine: 100, node: 100 };
  constructor(public id: string, public kind: EnemyKind, public pos: Vec3, public patrol: Vec3) {
    this.hp = ENEMY_CONFIG[kind].hp; this.shield = ENEMY_CONFIG[kind].shield;
  }
  get cfg() { return ENEMY_CONFIG[this.kind]; }
  update(playerPos: Vec3, dt: number, obstacles: { pos: Vec3; radius: number }[], jamming = false) {
    if (!this.alive) return;
    const distance = dist(this.pos, playerPos);
    const sees = distance < this.cfg.range * 1.25 && !jamming;
    if (sees) this.state = distance < this.cfg.range * 0.65 ? 'attack' : 'pursue';
    else if (this.state !== 'patrol') { this.awareTimer += dt; this.state = this.awareTimer > 5 ? 'retreat' : 'aware'; }
    if (this.state === 'retreat' && distance > this.cfg.range * 1.8) { this.state = 'patrol'; this.awareTimer = 0; }
    let goal = this.patrol;
    if (this.state === 'pursue' || this.state === 'attack') goal = playerPos;
    if (this.state === 'retreat') goal = this.patrol;
    const direction = norm(sub(goal, this.pos));
    const desired = this.state === 'attack' && distance > 35 ? scale(direction, this.cfg.speed) : this.state === 'pursue' ? scale(direction, this.cfg.speed) : scale(direction, this.cfg.speed * 0.22);
    this.pos = add(this.pos, scale(desired, dt));
    for (const o of obstacles) {
      const away = sub(this.pos, o.pos); const d = Math.hypot(away.x, away.y, away.z);
      const min = o.radius + (this.kind === 'command' ? 24 : 8);
      if (d < min && d > 0) this.pos = add(this.pos, scale(norm(away), min - d));
    }
    this.shield = Math.min(this.cfg.shield, this.shield + dt * (this.kind === 'command' ? 5 : 1.2));
    this.fireTimer -= dt;
  }
  canShoot(playerPos: Vec3, jamming = false) {
    const inRange = dist(this.pos, playerPos) <= this.cfg.range;
    return this.alive && (this.state === 'attack' || this.state === 'pursue') && inRange && !jamming && this.fireTimer <= 0;
  }
  fired() { this.fireTimer = this.kind === 'interceptor' ? 0.55 : this.kind === 'command' ? 1.1 : 1.4; }
  damage(amount: number, part?: keyof Enemy['weakpoints']): boolean {
    let remaining = amount;
    if (this.shield > 0) { const absorbed = Math.min(this.shield, remaining); this.shield -= absorbed; remaining -= absorbed; }
    if (part && part in this.weakpoints) { remaining *= 1.75; this.weakpoints[part] = clamp(this.weakpoints[part] - amount, 0, 100); }
    this.hp -= remaining;
    if (this.hp <= 0) { this.alive = false; this.state = 'dead'; return true; }
    return false;
  }
}
