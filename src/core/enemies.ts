import { Vec3, add, clamp, dist, len, norm, scale, sub, v } from './math';
import type { AIState, EnemyKind, PartKind } from './types';

export interface EnemySpec {
  kind: EnemyKind;
  name: string;
  maxHull: number;
  maxShield: number;
  speed: number;
  radius: number;
  detectRange: number;
  attackRange: number;
  damage: number;
  fireRate: number; // 次/秒
  preferred: 'melee' | 'ranged' | 'missile';
  score: number;
  resourceDrop: number;
  color: number;
}

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  scout: {
    kind: 'scout',
    name: '侦察无人机',
    maxHull: 24,
    maxShield: 0,
    speed: 42,
    radius: 2.4,
    detectRange: 120,
    attackRange: 70,
    damage: 4,
    fireRate: 1.2,
    preferred: 'ranged',
    score: 50,
    resourceDrop: 6,
    color: 0x66ddff
  },
  interceptor: {
    kind: 'interceptor',
    name: '高速截击机',
    maxHull: 40,
    maxShield: 20,
    speed: 68,
    radius: 2.8,
    detectRange: 150,
    attackRange: 60,
    damage: 7,
    fireRate: 2.4,
    preferred: 'melee',
    score: 90,
    resourceDrop: 10,
    color: 0xffaa33
  },
  gunship: {
    kind: 'gunship',
    name: '重型炮艇',
    maxHull: 120,
    maxShield: 60,
    speed: 26,
    radius: 5.2,
    detectRange: 170,
    attackRange: 130,
    damage: 12,
    fireRate: 0.9,
    preferred: 'ranged',
    score: 200,
    resourceDrop: 22,
    color: 0xff5544
  },
  defense: {
    kind: 'defense',
    name: '防御无人机',
    maxHull: 55,
    maxShield: 70,
    speed: 34,
    radius: 3.0,
    detectRange: 110,
    attackRange: 80,
    damage: 6,
    fireRate: 1.8,
    preferred: 'ranged',
    score: 120,
    resourceDrop: 14,
    color: 0xaa66ff
  },
  command: {
    kind: 'command',
    name: '敌方指挥舰',
    maxHull: 520,
    maxShield: 300,
    speed: 14,
    radius: 14,
    detectRange: 260,
    attackRange: 200,
    damage: 16,
    fireRate: 0.7,
    preferred: 'missile',
    score: 1000,
    resourceDrop: 120,
    color: 0xff3355
  }
};

export interface EnemyFireEvent {
  origin: Vec3;
  dir: Vec3;
  damage: number;
  missile: boolean;
}

let eseq = 1;

export class Enemy {
  id: string;
  spec: EnemySpec;
  pos: Vec3;
  vel: Vec3 = v();
  forward: Vec3 = v(0, 0, 1);
  hull: number;
  shield: number;
  state: AIState = 'patrol';
  patrolAnchor: Vec3;
  patrolPhase = Math.random() * Math.PI * 2;
  searchTimer = 0;
  fireTimer = 0;
  alive = true;
  /** 指挥舰可破坏部件：炮塔/引擎/护盾节点 */
  parts?: Record<'turret' | 'engine' | 'shieldNode', number>;
  specialCooldown = 8;
  jamming = 0;
  sawPlayerThisFrame = false;

  constructor(kind: EnemyKind, pos: Vec3) {
    this.id = `enemy-${eseq++}`;
    this.spec = ENEMY_SPECS[kind];
    this.pos = { ...pos };
    this.patrolAnchor = { ...pos };
    this.hull = this.spec.maxHull;
    this.shield = this.spec.maxShield;
    if (kind === 'command') {
      this.parts = { turret: 1, engine: 1, shieldNode: 1 };
    }
  }

  /** 对敌人造成伤害，支持弱点部件；返回实际伤害 */
  damage(amount: number, part?: 'turret' | 'engine' | 'shieldNode' | 'hull'): number {
    if (!this.alive) return 0;
    let dmg = amount;
    if (part && part !== 'hull' && this.parts) {
      // 弱点伤害加成
      const weakBonus = part === 'shieldNode' ? 2.2 : part === 'engine' ? 1.6 : 1.3;
      dmg *= weakBonus;
      this.parts[part] = clamp(this.parts[part] - amount / 200, 0, 1);
      if (part === 'shieldNode') this.shield = Math.max(0, this.shield - amount);
      if (part === 'engine') this.spec = { ...this.spec, speed: ENEMY_SPECS.command.speed * (0.4 + 0.6 * this.parts.engine) };
    }
    if (this.shield > 0 && !(part === 'shieldNode')) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.hull -= dmg;
    if (this.hull <= 0) {
      this.alive = false;
      this.state = 'dead';
    }
    return amount;
  }

  /**
   * 敌人 AI 更新
   * @param canSeePlayer 视线/距离判定结果（由世界层用障碍物计算）
   */
  update(
    dt: number,
    playerPos: Vec3,
    playerVisible: boolean,
    obstacles: { pos: Vec3; radius: number }[]
  ): EnemyFireEvent | null {
    if (!this.alive) return null;
    const s = this.spec;
    const d = dist(this.pos, playerPos);
    this.sawPlayerThisFrame = playerVisible && d < s.detectRange;

    switch (this.state) {
      case 'patrol':
        this.patrolMove(dt, obstacles);
        if (this.sawPlayerThisFrame) this.state = 'chase';
        break;
      case 'chase':
        this.moveToward(playerPos, dt, 1, obstacles);
        if (d < s.attackRange && playerVisible) this.state = 'attack';
        else if (!this.sawPlayerThisFrame) {
          this.state = 'search';
          this.searchTimer = 6;
        }
        break;
      case 'attack':
        this.attackMove(playerPos, d, dt, obstacles);
        if (!playerVisible) {
          this.state = 'search';
          this.searchTimer = 5;
        } else if (this.hull < s.maxHull * 0.18) {
          this.state = 'retreat';
        } else if (d > s.attackRange * 1.25) {
          this.state = 'chase';
        }
        break;
      case 'search':
        this.patrolMove(dt, obstacles, true);
        this.searchTimer -= dt;
        if (this.sawPlayerThisFrame) this.state = 'attack';
        else if (this.searchTimer <= 0) this.state = 'patrol';
        break;
      case 'retreat':
        this.moveAway(playerPos, dt, obstacles);
        if (d > s.detectRange * 1.4) this.state = 'patrol';
        break;
    }

    // 只有在攻击状态且实际看得见玩家时才能开火
    if (this.state === 'attack' && playerVisible) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && d < s.attackRange) {
        this.fireTimer = 1 / s.fireRate;
        const dir = norm(sub(playerPos, this.pos));
        this.forward = dir;
        const useMissile = s.preferred === 'missile' && Math.random() < 0.4;
        return { origin: { ...this.pos }, dir, damage: s.damage, missile: useMissile };
      }
    }

    // 指挥舰特殊攻击：弹幕齐射（护盾节点未全毁时）
    if (this.spec.kind === 'command' && this.state === 'attack') {
      this.specialCooldown -= dt;
      if (this.specialCooldown <= 0) {
        this.specialCooldown = this.parts && this.parts.turret <= 0 ? 20 : 9;
      }
    }
    return null;
  }

  private steerAvoid(obstacles: { pos: Vec3; radius: number }[]): Vec3 {
    let avoid = v();
    for (const o of obstacles) {
      const d = sub(this.pos, o.pos);
      const distV = len(d);
      const safe = o.radius + this.spec.radius + 14;
      if (distV < safe && distV > 1e-4) {
        const strength = (safe - distV) / safe;
        avoid = add(avoid, scale(norm(d), strength * 2.2));
      }
    }
    return avoid;
  }

  private applyMove(dir: Vec3, dt: number, speedMul: number, obstacles: { pos: Vec3; radius: number }[]) {
    const avoid = this.steerAvoid(obstacles);
    const desired = norm(add(dir, avoid));
    const targetVel = scale(desired, this.spec.speed * speedMul);
    // 惯性：速度插值
    const k = 1 - Math.exp(-2.4 * dt);
    this.vel = add(this.vel, scale(sub(targetVel, this.vel), k));
    this.pos = add(this.pos, scale(this.vel, dt));
    if (len(this.vel) > 0.5) this.forward = norm(this.vel);
    // 硬性碰撞兜底
    for (const o of obstacles) {
      const d2 = sub(this.pos, o.pos);
      const dd = len(d2);
      const min = o.radius + this.spec.radius;
      if (dd < min && dd > 1e-4) {
        this.pos = add(o.pos, scale(norm(d2), min));
      }
    }
  }

  private patrolMove(dt: number, obstacles: { pos: Vec3; radius: number }[], searching = false) {
    this.patrolPhase += dt * 0.5;
    const off = v(
      Math.cos(this.patrolPhase) * 26,
      Math.sin(this.patrolPhase * 0.7) * 10,
      Math.sin(this.patrolPhase) * 26
    );
    const target = searching
      ? add(this.patrolAnchor, scale(off, 1.6))
      : add(this.patrolAnchor, off);
    this.applyMove(norm(sub(target, this.pos)), dt, 0.45, obstacles);
  }

  private moveToward(target: Vec3, dt: number, m: number, obstacles: { pos: Vec3; radius: number }[]) {
    this.applyMove(norm(sub(target, this.pos)), dt, m, obstacles);
  }

  private attackMove(
    target: Vec3,
    d: number,
    dt: number,
    obstacles: { pos: Vec3; radius: number }[]
  ) {
    // 远程保持距离，近战逼近
    const ideal =
      this.spec.preferred === 'melee'
        ? this.spec.attackRange * 0.35
        : this.spec.preferred === 'missile'
          ? this.spec.attackRange * 0.75
          : this.spec.attackRange * 0.6;
    const diff = sub(target, this.pos);
    let dir = norm(diff);
    if (d > ideal + 8) dir = norm(diff);
    else if (d < ideal - 8) dir = scale(dir, -1);
    else {
      // 环绕机动
      dir = norm(v(-dir.z, dir.y * 0.4, dir.x));
    }
    this.applyMove(dir, dt, 0.9, obstacles);
  }

  private moveAway(target: Vec3, dt: number, obstacles: { pos: Vec3; radius: number }[]) {
    this.applyMove(norm(sub(this.pos, target)), dt, 1, obstacles);
  }
}

export function enemyPartForHit(kind: EnemyKind, localHitY: number): 'turret' | 'engine' | 'shieldNode' | 'hull' {
  if (kind !== 'command') return 'hull';
  if (localHitY > 0.35) return 'turret';
  if (localHitY < -0.35) return 'engine';
  return 'shieldNode';
}

export type { PartKind };
