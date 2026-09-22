import './styles.css';
import { GameEngine, type HudState } from './game/engine';
import { createHud } from './ui/hud';
import { MenuSystem } from './ui/menus';
import { loadSave, persistSave, applyMissionResult } from './core/storage';
import type { MissionResult, MissionId } from './core/types';

const app = document.getElementById('app')!;
const save = loadSave(localStorage);

let engine: GameEngine | null = null;
let hud: ReturnType<typeof createHud> | null = null;
let currentIndex = 0;
let lastResult: MissionResult | null = null;

window.addEventListener('keydown', (e) => {
  if (!engine) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    if (!engine.showBrief) toggleInfoPanel();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!engine.paused && !engine.showBrief && !document.getElementById('info-panel')) openPause();
  }
});

const menu = new MenuSystem(save, {
  startMission: (i) => openBriefing(i),
  continueGame: () => openBriefing(save.unlockedMission),
  save: () => persistSave(localStorage, save)
});

function openBriefing(i: number) {
  currentIndex = i;
  launch(i);
}

function launch(i: number) {
  // 销毁旧引擎/HUD
  if (engine) {
    engine.dispose();
    engine = null;
  }
  if (hud) {
    hud.root.remove();
    hud = null;
  }
  engine = new GameEngine(app, save);
  hud = createHud();
  hud.root.style.display = 'none';
  engine.loadMission(i);
  menu.show();
  menu.briefing(i, () => {
    engine!.startMission();
    hud!.root.style.display = '';
    menu.hide();
  });
  menu.root.style.background = 'radial-gradient(ellipse at center, rgba(30,25,60,0.7), rgba(4,5,10,0.85))';

  engine.onHud = (s: HudState) => {
    hud?.update(s);
    updateHurtOverlay(s);
  };

  engine.onResult = (r: MissionResult) => {
    lastResult = r;
    hud?.root.classList.add('hidden');
    // 写存档
    const next = applyMissionResult(save, i, { success: r.success, kills: r.kills, resources: r.resources });
    Object.assign(save, next);
    if (r.success) {
      save.bestResults[r.missionId as MissionId] = {
        ...save.bestResults[r.missionId as MissionId],
        ...r
      };
    }
    persistSave(localStorage, save);
    setTimeout(() => {
      menu.result(
        r,
        i,
        () => launch(i + 1),
        () => launch(i),
        () => backToMenu()
      );
      menu.show();
    }, 900);
  };

}

function backToMenu() {
  if (engine) {
    engine.dispose();
    engine = null;
  }
  if (hud) {
    hud.root.remove();
    hud = null;
  }
  menu.root.style.background = '';
  menu.main();
  menu.show();
}

function openPause() {
  if (!engine) return;
  engine.setPaused(true);
  menu.pause(
    () => {
      menu.hide();
      engine!.setPaused(false);
    },
    () => launch(currentIndex),
    () => backToMenu()
  );
  menu.show();
}

function toggleInfoPanel() {
  if (!engine || engine.paused) return;
  const existing = document.getElementById('info-panel');
  if (existing) {
    existing.remove();
    engine.setPaused(false);
    engine.input.requestLock();
    return;
  }
  engine.setPaused(true);
  menu.root.style.display = 'none';
  const panel = document.createElement('div');
  panel.id = 'info-panel';
  const up = save.upgrades;
  panel.innerHTML = `
    <div class="ip-box">
      <h2>任务与装备信息</h2>
      <div class="row"><span>当前任务</span><b>${engine.missionName}</b></div>
      <div class="row"><span>主武器</span><b>双联能量炮（过热需冷却）</b></div>
      <div class="row"><span>副武器</span><b>1 追踪导弹 / 2 范围爆破弹（右键发射）</b></div>
      <div class="row"><span>改装等级</span><b>引擎${up.engine} 护盾${up.shield} 装甲${up.armor} 武器${up.weapon} 雷达${up.radar} 导弹舱${up.missile}</b></div>
      <div class="row"><span>操作</span><b>WASD 移动 · 鼠标转向 · Q/E 翻滚 · Shift 冲刺 · 空格闪避 · R 换弹 · C 视角 · T 切目标</b></div>
      <p class="hint" style="margin-top:14px">再次按 Tab 或点击下方按钮继续。</p>
      <button class="menu-btn" style="margin:14px auto 0;display:block;width:50%">继续任务</button>
    </div>
  `;
  panel.querySelector('button')!.onclick = () => {
    panel.remove();
    engine!.setPaused(false);
  };
  document.body.appendChild(panel);
}

function updateHurtOverlay(s: HudState) {
  let el = document.getElementById('hit-damage');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hit-damage';
    document.body.appendChild(el);
  }
  const ratio = s.hull / s.hullMax;
  if (ratio < 0.35) el.classList.add('hurt');
  else el.classList.remove('hurt');
}

// 防止右键菜单在游戏区弹出
document.addEventListener('contextmenu', (e) => e.preventDefault());
