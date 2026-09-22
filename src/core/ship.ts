import { Vec3, add, clamp, len, norm, scale, sub, v } from './math';
import type { UpgradeState } from './types';

export interface ShipInput {
  throttle: number; // W/S -1..1
  strafe: number; // A/D -1..1
  pitch: number; // 鼠标 Y -1..1
  yaw: number; // 鼠标 X -1..1
  roll: number; // Q/E -1..1
  boost: boolean;
  evade: boolean;
}

export interface ShipConfig {
  maxSpeed: number;
  accel: number;
  turnRate: number;
  rollRate: number;
  boostMul: number;
  boostDrain: number;
  evadeCost: number;
  evadeSpeed: number;
  evadeDuration: number;
  evadeCooldown: number;
  drag: number;
}

export const BASE_SHIP_CONFIG: ShipConfig = {
  maxSpeed: 60,
  accel: 34,
  turnRate: 1.7,
  rollRate: 2.4,
  boostMul: 1.9,
  boostDrain: 28,
  evadeCost: 18,
  evadeSpeed: 150,
  evadeDuration: 0.28,
  evadeCooldown: 2.2,
  drag: 0.55
};

export function configFromUpgrades(u: UpgradeState): ShipConfig {
  const c: ShipConfig = { ...BASE_SHIP_CONFIG };
  c.maxSpeed *= 1 + 0.1 * u.engine;
  c.accel *= 1 + 0.08 * u.engine;
  c.turnRate *= 1 + 0.04 * u.engine;
  c.boostDrain *= 1 - 0.08 * u.engine;
  c.evadeCooldown *= 1 - 0.06 * u.engine;
  return c;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

let shipSeq = 0;

export class PlayerShip {
  id = `ship-${shipSeq++}`;
  pos: Vec3;
  vel: Vec3 = v();
  forward: Vec3 = v(0, 0, -1);
  right: Vec3 = v(1, 0, 0);
  up: Vec3 = v(0, 1, 0);
  rollVisual = 0;

  fuel = 100;
  maxFuel = 100;
  energy = 100;
  maxEnergy = 100;
  boostActive = false;
  evadeTimer = 0;
  evadeCooldownTimer = 0;
  alive = true;
  radius = 2.2;
  config: ShipConfig;
  upgrades: UpgradeState;

  constructor(pos: Vec3, upgrades: UpgradeState, config?: ShipConfig) {
    this.pos = { ...pos };
    this.upgrades = upgrades;
    this.config = config ?? configFromUpgrades(upgrades);
  }

  get speed() {
    return len(this.vel);
  }

  update(
    dt: number,
    input: ShipInput,
    partHealth: (p: 'engine' | 'weapon' | 'radar') => number
  ): void {
    if (!this.alive) return;
    const c = this.config;

    this.energy = clamp(this.energy + 14 * dt, 0, this.maxEnergy);

    if (this.evadeCooldownTimer > 0) this.evadeCooldownTimer -= dt;
    if (this.evadeTimer > 0) this.evadeTimer -= dt;
    if (input.evade && this.evadeCooldownTimer <= 0 && this.energy >= c.evadeCost) {
      this.energy -= c.evadeCost;
      this.evadeTimer = c.evadeDuration;
      this.evadeCooldownTimer = c.evadeCooldown;
    }

    this.boostActive = input.boost && this.energy > 0 && this.fuel > 0 && this.evadeTimer <= 0;
    if (this.boostActive) {
      this.energy = clamp(this.energy - c.boostDrain * dt, 0, this.maxEnergy);
      this.fuel = clamp(this.fuel - 2.2 * dt, 0, this.maxFuel);
    }

    const yawAngle = -input.yaw * c.turnRate * dt;
    const pitchAngle = -input.pitch * c.turnRate * dt;
    this.rotateAxis(this.up, yawAngle);
    this.rotateAxis(this.right, pitchAngle);
    const rollAngle = -input.roll * c.rollRate * dt;
    this.rotateAxis(this.forward, rollAngle);
    this.rollVisual = clamp(this.rollVisual + rollAngle * 0.4 - this.rollVisual * dt * 4, -0.8, 0.8);

    const eng = 0.5 + 0.5 * partHealth('engine');
    const speedCap = c.maxSpeed * eng * (this.boostActive ? c.boostMul : 1);
    const accelNow = c.accel * eng * (this.boostActive ? c.boostMul : 1);

    const moveInput =
      Math.abs(input.throttle) + Math.abs(input.strafe) > 0
        ? norm(add(scale(this.forward, Math.max(0, input.throttle)), scale(this.right, input.strafe)))
        : v();
    const reverse = input.throttle < 0 ? scale(this.forward, input.throttle * accelNow * 0.5) : v();
    const accelV = add(scale(moveInput, accelNow), reverse);
    this.vel = add(this.vel, scale(accelV, dt));

    if (this.evadeTimer > 0) {
      const dir = len(this.vel) > 1 ? norm(this.vel) : this.forward;
      this.vel = add(this.vel, scale(dir, c.evadeSpeed * dt * 3));
    }

    this.vel = scale(this.vel, Math.exp(-c.drag * dt));

    const sp = len(this.vel);
    if (this.evadeTimer <= 0 && sp > speedCap) {
      this.vel = scale(this.vel, speedCap / sp);
    }

    this.pos = add(this.pos, scale(this.vel, dt));
  }

  private rotateAxis(axis: Vec3, angle: number) {
    if (Math.abs(angle) < 1e-8) return;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rot = (vec: Vec3): Vec3 =>
      add(
        add(scale(vec, cos), scale(cross3(axis, vec), sin)),
        scale(axis, dot3(axis, vec) * (1 - cos))
      );
    this.forward = norm(rot(this.forward));
    this.right = norm(rot(this.right));
    this.up = norm(rot(this.up));
  }

  /** 与球形障碍物碰撞解算，返回法向撞击速度（用于碰撞伤害） */
  resolveSphereCollision(center: Vec3, radius: number): number {
    const diff = sub(this.pos, center);
    const d = len(diff);
    const minDist = radius + this.radius;
    if (d >= minDist) return 0;
    const n = d > 1e-6 ? scale(diff, 1 / d) : v(1, 0, 0);
    this.pos = add(center, scale(n, minDist));
    const into = -dot3(this.vel, n);
    if (into > 0) {
      this.vel = add(this.vel, scale(n, into * 1.35));
      this.vel = scale(this.vel, 0.72);
    }
    return Math.abs(into);
  }
}
