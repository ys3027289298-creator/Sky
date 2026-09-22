import type { HudState } from '../game/engine';

export function createHud(): { root: HTMLElement; update: (s: HudState) => void } {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div id="mission-panel">
      <div id="mission-name"></div>
      <div id="mission-objective"></div>
      <div id="mission-timer"></div>
      <div id="escort-bar" class="hidden"><span>运输船</span><div class="bar"><div id="escort-fill"></div></div></div>
      <div id="station-cd" class="hidden"></div>
    </div>
    <div id="radar">
      <div class="radar-sweep"></div>
      <canvas id="radar-canvas" width="180" height="180"></canvas>
      <div id="enemies-left"></div>
    </div>
    <div id="crosshair">
      <div class="ch"></div>
      <div id="lock-box" class="hidden">
        <div id="lock-progress"><div id="lock-progress-fill"></div></div>
        <div id="lock-name"></div>
        <div id="lock-bars">
          <div class="lb"><span>盾</span><div class="bar"><div id="lock-shield"></div></div></div>
          <div class="lb"><span>体</span><div class="bar"><div id="lock-hull"></div></div></div>
        </div>
        <div id="lock-dist"></div>
      </div>
      <div id="lost-lock" class="hidden"></div>
    </div>
    <div id="status-panel">
      <div class="stat"><span class="label">结构</span><div class="bar big"><div id="hull-fill" class="fill hull"></div></div><span id="hull-text"></span></div>
      <div class="stat"><span class="label">护盾</span><div class="bar big"><div id="shield-fill" class="fill shield"></div></div><span id="shield-text"></span></div>
      <div class="stat"><span class="label">装甲</span><div class="bar big"><div id="armor-fill" class="fill armor"></div></div><span id="armor-text"></span></div>
      <div class="stat"><span class="label">能量</span><div class="bar big"><div id="energy-fill" class="fill energy"></div></div></div>
      <div class="stat"><span class="label">燃料</span><div class="bar big"><div id="fuel-fill" class="fill fuel"></div></div></div>
      <div id="parts-status">
        <span id="part-engine">引擎</span>
        <span id="part-weapon">武器</span>
        <span id="part-radar">雷达</span>
      </div>
    </div>
    <div id="weapon-panel">
      <div id="primary-weapon">
        <div class="wname"></div>
        <div class="heat-bar"><div id="heat-fill"></div></div>
        <div id="heat-state"></div>
      </div>
      <div id="secondary-weapon">
        <div class="wname"></div>
        <div id="sec-ammo"></div>
      </div>
      <div id="speedo"></div>
    </div>
    <div id="event-banner" class="hidden">
      <div id="event-title"></div>
      <div id="event-phase"></div>
      <div id="event-hint">Y 规避 · X 迎战 · V 加固</div>
    </div>
    <div id="toast" class="hidden"></div>
    <div id="hit-damage"></div>
  `;
  document.body.appendChild(root);

  const $ = (id: string) => root.querySelector('#' + id) as HTMLElement;
  const radarCtx = ($('radar-canvas') as HTMLCanvasElement).getContext('2d')!;

  function update(s: HudState) {
    $('mission-name').textContent = s.missionName;
    $('mission-objective').textContent = '▶ ' + s.objective;
    const m = Math.floor(s.timeLeft / 60);
    const sec = Math.floor(s.timeLeft % 60).toString().padStart(2, '0');
    $('mission-timer').textContent = `剩余时间 ${m}:${sec}`;
    $('mission-timer').className = s.timeLeft < 30 ? 'urgent' : '';

    const setBar = (id: string, val: number, max: number) => {
      $(id).style.width = `${Math.max(0, (val / max) * 100)}%`;
    };
    setBar('hull-fill', s.hull, s.hullMax);
    setBar('shield-fill', s.shield, s.shieldMax);
    setBar('armor-fill', s.armor, s.armorMax);
    setBar('energy-fill', s.energy, 100);
    setBar('fuel-fill', s.fuel, 100);
    $('hull-text').textContent = `${Math.round(s.hull)}`;
    $('shield-text').textContent = `${Math.round(s.shield)}`;
    $('armor-text').textContent = `${Math.round(s.armor)}`;

    $('part-engine').className = s.parts.engine < 0.5 ? 'damaged' : s.parts.engine < 0.85 ? 'warn' : '';
    $('part-weapon').className = s.parts.weapon < 0.5 ? 'damaged' : s.parts.weapon < 0.85 ? 'warn' : '';
    $('part-radar').className = s.parts.radar < 0.5 ? 'damaged' : s.parts.radar < 0.85 ? 'warn' : '';

    const pw = $('primary-weapon');
    pw.querySelector('.wname')!.textContent = `主武器：${s.primaryName}`;
    setBar('heat-fill', s.weaponHeat, 100);
    $('heat-fill').className = s.overheated ? 'overheat' : '';
    $('heat-state').textContent = s.overheated ? '过热！按 R 冷却' : s.reloading ? '冷却/换弹中…' : '';
    const sw = $('secondary-weapon');
    sw.querySelector('.wname')!.textContent = `副武器：${s.secondaryName}（右键发射）`;
    $('sec-ammo').textContent = s.secondaryAmmo === null ? '能量供弹 ∞' : `弹药 ${s.secondaryAmmo}`;
    $('speedo').textContent = `${Math.round(s.speed * 3.6)} km/h${s.boost ? ' 🔥加力' : ''}${s.evadeReady ? '' : ' · 闪避充能中'}`;

    // 锁定框
    const lockBox = $('lock-box');
    if (s.lockTargetName && (s.lockProgress > 0.05 || s.locked)) {
      lockBox.classList.remove('hidden');
      setBar('lock-progress-fill', s.lockProgress * 100, 100);
      $('lock-progress-fill').className = s.locked ? 'locked' : '';
      $('lock-name').textContent = (s.locked ? '🔒 ' : '锁定中 ') + s.lockTargetName;
      setBar('lock-shield', s.lockShield, s.lockShieldMax || 1);
      setBar('lock-hull', s.lockHull, s.lockHullMax || 1);
      $('lock-dist').textContent = `距离 ${Math.round(s.lockDist)} m`;
    } else {
      lockBox.classList.add('hidden');
    }
    const lost = $('lost-lock');
    if (s.lostLock) {
      lost.classList.remove('hidden');
      lost.textContent = '⚠ ' + s.lostLock;
    } else lost.classList.add('hidden');
    root.querySelector('#crosshair .ch')!.className = s.crosshairHit ? 'ch hit' : 'ch';

    // 护航
    const escortBar = $('escort-bar');
    if (s.escortHp !== null) {
      escortBar.classList.remove('hidden');
      setBar('escort-fill', s.escortHp * 100, 100);
      $('escort-fill').className = s.escortHp < 0.3 ? 'urgent-fill' : '';
    } else escortBar.classList.add('hidden');
    const stCd = $('station-cd');
    if (s.stationCountdown !== null) {
      stCd.classList.remove('hidden');
      stCd.textContent = `空间站爆炸倒计时 ${Math.ceil(s.stationCountdown)} s`;
      stCd.className = s.stationCountdown < 10 ? 'urgent' : '';
    } else stCd.classList.add('hidden');

    // 雷达
    $('enemies-left').textContent = `敌机 ${s.enemiesLeft}`;
    radarCtx.clearRect(0, 0, 180, 180);
    radarCtx.strokeStyle = 'rgba(80,220,160,0.25)';
    for (const r of [30, 60, 88]) {
      radarCtx.beginPath();
      radarCtx.arc(90, 90, r, 0, Math.PI * 2);
      radarCtx.stroke();
    }
    radarCtx.fillStyle = '#55ffaa';
    radarCtx.beginPath();
    radarCtx.arc(90, 90, 3, 0, Math.PI * 2);
    radarCtx.fill();
    for (const b of s.radarBlips) {
      radarCtx.fillStyle = b.hostile ? '#ff4455' : '#66ffaa';
      radarCtx.fillRect(90 + b.x * 80 - 2, 90 + b.y * 80 - 2, 4, 4);
    }

    // 事件
    const banner = $('event-banner');
    if (s.eventTitle) {
      banner.classList.remove('hidden');
      $('event-title').textContent = '⚠ ' + s.eventTitle;
      $('event-phase').textContent =
        s.eventPhase === 'warning' ? `将在 ${Math.ceil(s.eventCountdown)} 秒后发生` : `事件进行中 ${Math.ceil(s.eventCountdown)} s`;
    } else banner.classList.add('hidden');

    const toast = $('toast');
    if (s.message) {
      toast.classList.remove('hidden');
      toast.textContent = s.message;
    } else toast.classList.add('hidden');
  }

  return { root, update };
}
