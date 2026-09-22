import type { ShipInput } from '../core/ship';

export class InputManager {
  keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  firingPrimary = false;
  firingSecondary = false;
  lockHeld = false;
  cycleRequested = false;
  pointerLocked = false;
  sensitivity = 1;
  invertY = false;
  // 单次按下事件队列
  private pressed = new Set<string>();

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this.firingPrimary = true;
      if (e.button === 2) {
        this.firingSecondary = true;
        this.lockHeld = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firingPrimary = false;
      if (e.button === 2) this.firingSecondary = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === el;
      if (!this.pointerLocked) {
        this.firingPrimary = false;
        this.firingSecondary = false;
      }
    });
  }

  requestLock() {
    try {
      const p = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // 某些浏览器环境（如无头 E2E）不允许指针锁，忽略即可
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumePressed(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** 组装一帧飞船输入，返回后清空鼠标增量 */
  sampleShipInput(dt: number): ShipInput {
    const k = this.keys;
    const yaw = Math.max(-1, Math.min(1, this.mouseDX / 9)) * this.sensitivity;
    let pitch = Math.max(-1, Math.min(1, this.mouseDY / 9)) * this.sensitivity;
    if (this.invertY) pitch = -pitch;
    const input: ShipInput = {
      throttle: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      strafe: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      pitch,
      yaw,
      roll: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0),
      boost: k.has('ShiftLeft') || k.has('ShiftRight'),
      evade: this.consumePressed('Space')
    };
    this.mouseDX = 0;
    this.mouseDY = 0;
    void dt;
    return input;
  }
}
