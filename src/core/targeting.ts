import { Vec3, dist, norm, sub, scale, blockedBySphere, dot } from './math';
import type { Obstacle } from './types';

export interface LockTarget {
  id: string;
  pos: Vec3;
  radius: number;
  alive: boolean;
  /** 干扰等级 0..1，越高越难锁定 */
  jamming?: number;
}

export class TargetingSystem {
  range: number;
  lockTime: number;
  current: LockTarget | null = null;
  progress = 0; // 0..1
  lostReason: string | null = null;
  lostFlash = 0;
  /** 潜在目标（雷达锥内） */
  candidates: LockTarget[] = [];
  private lastAcquireId: string | null = null;

  constructor(radarUpgrade: number) {
    this.range = 140 + radarUpgrade * 22;
    this.lockTime = 1.1 - radarUpgrade * 0.1;
  }

  setCandidates(c: LockTarget[]) {
    this.candidates = c;
  }

  /** 选择准星方向上最近的目标；再次调用可切换到下一个目标 */
  acquire(viewPos: Vec3, aimDir: Vec3, obstacles: Obstacle[], cycle = false): LockTarget | null {
    const scored = this.candidates
      .filter((t) => t.alive)
      .map((t) => {
        const to = sub(t.pos, viewPos);
        const d = Math.hypot(to.x, to.y, to.z);
        const nd = norm(to);
        const alignment = dot(nd, aimDir); // 1 表示在准星正中
        return { t, d, alignment };
      })
      .filter((s) => s.d <= this.range && s.alignment > 0.86)
      .filter((s) => !this.isBlocked(viewPos, s.t.pos, obstacles))
      .sort((a, b) => b.alignment - a.alignment || a.d - b.d);

    if (scored.length === 0) return null;
    if (cycle) {
      const refId = this.current?.id ?? this.lastAcquireId;
      const idx = scored.findIndex((s) => s.t.id === refId);
      if (scored.length > 1) {
        const pickIdx = idx >= 0 ? (idx + 1) % scored.length : 1 % scored.length;
        this.lastAcquireId = scored[pickIdx].t.id;
        return scored[pickIdx].t;
      }
    }
    this.lastAcquireId = scored[0].t.id;
    return scored[0].t;
  }

  isBlocked(from: Vec3, to: Vec3, obstacles: Obstacle[]): boolean {
    return obstacles.some(
      (o) => o.alive && blockedBySphere(from, to, o.pos, o.radius * 0.95)
    );
  }

  /** 每帧更新锁定进度/脱锁 */
  update(
    dt: number,
    viewPos: Vec3,
    aimDir: Vec3,
    obstacles: Obstacle[],
    requested: boolean,
    cycleTarget?: LockTarget | null
  ) {
    this.lostFlash = Math.max(0, this.lostFlash - dt);
    if (cycleTarget && (!this.current || cycleTarget.id !== this.current.id)) {
      this.current = cycleTarget;
      this.progress = 0;
      this.lostReason = null;
    }
    if (requested && (!this.current || !this.current.alive)) {
      // 自动捕获准星方向上的最近目标
      const auto = this.acquire(viewPos, aimDir, obstacles, false);
      if (auto) {
        this.current = auto;
        this.progress = 0;
        this.lostReason = null;
      }
    }
    if (!requested || !this.current || !this.current.alive) {
      if (this.current && (!this.current.alive)) this.flagLost('目标已摧毁');
      else if (!requested && this.current) this.flagLost('取消锁定');
      this.current = requested ? this.current : null;
      if (!requested) this.progress = 0;
      return;
    }
    const t = this.current;
    const d = dist(viewPos, t.pos);
    const to = norm(sub(t.pos, viewPos));
    const inCone = dot(to, aimDir) > 0.7;
    if (d > this.range * 1.25) {
      this.flagLost('距离过远，信号丢失');
      return;
    }
    if (this.isBlocked(viewPos, t.pos, obstacles)) {
      this.flagLost('目标进入障碍物后方，脱锁');
      return;
    }
    if (!inCone) {
      this.flagLost('目标偏离锁定锥，脱锁');
      return;
    }
    this.lostReason = null;
    const jam = t.jamming ?? 0;
    this.progress = Math.min(1, this.progress + (dt / this.lockTime) * (1 - jam * 0.6));
  }

  private flagLost(reason: string) {
    this.lostReason = reason;
    this.lostFlash = 1.6;
    this.current = null;
    this.progress = 0;
  }

  get locked(): boolean {
    return this.current !== null && this.progress >= 1;
  }
}

export function aimDirFrom(p: Vec3, forward: Vec3): Vec3 {
  return norm(scale(forward, 1));
}
