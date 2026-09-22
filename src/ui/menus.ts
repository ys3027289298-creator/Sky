import { UPGRADE_DEFS, upgradeCost } from '../core/upgrades';
import { MISSION_DEFS } from '../core/missions';
import type { SaveData, GameSettings, MissionId, MissionResult } from '../core/types';
import { audio } from '../game/audio';

type CB = {
  startMission: (index: number) => void;
  continueGame: () => void;
  save: () => void;
};

export class MenuSystem {
  root: HTMLElement;
  constructor(private save: SaveData, private cb: CB) {
    this.root = document.createElement('div');
    this.root.id = 'menu-root';
    document.body.appendChild(this.root);
    this.main();
  }

  private clear() {
    this.root.innerHTML = '';
  }

  private btn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'menu-btn ' + cls;
    b.onclick = () => {
      audio.ensure();
      audio.uiClick();
      fn();
    };
    return b;
  }

  main() {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel';
    wrap.innerHTML = `
      <h1 class="title">星陨防线</h1>
      <div class="subtitle">STARFALL DEFENSE · 3D 太空射击</div>
      <div class="menu-buttons"></div>
      <div class="save-info"></div>
    `;
    const btns = wrap.querySelector('.menu-buttons')!;
    const canContinue = this.save.unlockedMission > 0;
    btns.appendChild(this.btn('▶ 开始任务（练习：任务一）', () => this.missionSelect(false)));
    btns.appendChild(
      this.btn(
        canContinue ? `↩ 继续游戏（任务 ${this.save.unlockedMission + 1}）` : '↩ 继续游戏（暂无进度）',
        () => canContinue && this.cb.continueGame(),
        canContinue ? '' : 'disabled-btn'
      )
    );
    btns.appendChild(this.btn('🛠 飞船改装', () => this.hangar()));
    btns.appendChild(this.btn('📖 操作说明', () => this.instructions()));
    btns.appendChild(this.btn('⚙ 设置', () => this.settings()));
    wrap.querySelector('.save-info')!.textContent =
      `改装资源：${this.save.resources} · 累计击毁：${this.save.totalKills} · 已解锁任务 ${this.save.unlockedMission + 1}/4`;
    this.root.appendChild(wrap);
  }

  missionSelect(playAll: boolean) {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel wide';
    wrap.innerHTML = `<h2>选择任务</h2><p class="hint">推荐 10–15 分钟连续完成四个任务；也可直接进入单关练习。</p><div class="mission-list"></div>`;
    const list = wrap.querySelector('.mission-list')!;
    MISSION_DEFS.forEach((m, i) => {
      const locked = i > this.save.unlockedMission;
      const card = document.createElement('div');
      card.className = 'mission-card' + (locked ? ' locked' : '');
      const best = this.save.bestResults[m.id];
      card.innerHTML = `
        <h3>${m.name}</h3>
        <p>${m.brief}</p>
        <div class="meta">${locked ? '🔒 完成上一关解锁' : best ? `最佳：${best.success ? '成功' : '未完成'} · 击毁 ${best.kills}` : '尚未挑战'}</div>
      `;
      if (!locked) card.onclick = () => this.cb.startMission(i);
      list.appendChild(card);
    });
    wrap.appendChild(this.btn('返回', () => this.main()));
    this.root.appendChild(wrap);
  }

  hangar() {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel wide';
    wrap.innerHTML = `<h2>飞船改装</h2><div class="resources">改装资源：<b id="res-num">${this.save.resources}</b></div><div class="upgrade-grid"></div>`;
    const grid = wrap.querySelector('.upgrade-grid')!;

    const render = () => {
      grid.innerHTML = '';
      wrap.querySelector('#res-num')!.textContent = String(this.save.resources);
      for (const def of UPGRADE_DEFS) {
        const lvl = this.save.upgrades[def.key];
        const cost = upgradeCost(def, lvl);
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        const pips = Array.from({ length: 3 }, (_, i) => `<span class="pip ${i < lvl ? 'on' : ''}"></span>`).join('');
        card.innerHTML = `
          <h3>${def.name}</h3>
          <div class="pips">${pips}</div>
          <p>${def.desc}</p>
          <div class="up-cost">${lvl >= 3 ? '已满级' : `消耗 ${cost} 资源`}</div>
        `;
        if (lvl < 3) {
          const b = this.btn(lvl >= 3 ? '满级' : '升级', () => {
            if (this.save.resources >= cost) {
              this.save.resources -= cost;
              this.save.upgrades[def.key] = lvl + 1;
              this.cb.save();
              render();
            }
          });
          if (this.save.resources < cost) b.classList.add('disabled-btn');
          card.appendChild(b);
        }
        grid.appendChild(card);
      }
    };
    render();
    wrap.appendChild(this.btn('返回', () => this.main()));
    this.root.appendChild(wrap);
  }

  instructions() {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel wide text-panel';
    wrap.innerHTML = `
      <h2>操作说明</h2>
      <div class="keys">
        <div><b>W / S</b> 加速 / 减速</div>
        <div><b>A / D</b> 横向平移</div>
        <div><b>鼠标</b> 控制朝向</div>
        <div><b>Q / E</b> 侧向翻滚</div>
        <div><b>鼠标左键</b> 主武器射击（持续射击会过热）</div>
        <div><b>鼠标右键</b> 按住锁定目标 / 点击发射副武器</div>
        <div><b>T</b> 切换锁定目标　<b>1 / 2</b> 导弹 / 爆破弹</div>
        <div><b>Shift</b> 加力冲刺（耗能量与燃料）</div>
        <div><b>空格</b> 紧急闪避</div>
        <div><b>R</b> 换弹 / 武器冷却</div>
        <div><b>C</b> 追尾 / 驾驶舱视角</div>
        <div><b>Y / X / V</b> 动态事件应对：规避 / 迎战 / 加固</div>
        <div><b>Tab</b> 任务与装备信息　<b>P / Esc</b> 暂停</div>
      </div>
      <h3>推荐演示路线（约 10–15 分钟）</h3>
      <p>任务一侦察 3 信标 → 任务二护航（注意运输船血量）→ 任务三摧毁 3 节点、夺核心、35 秒内撤离 → 任务四关闭 2 干扰塔、攻击指挥舰护盾节点/引擎/炮塔弱点后撤离。沿途拾取燃料/弹药/维修，绿色光环为维修点。</p>
    `;
    wrap.appendChild(this.btn('返回', () => this.main()));
    this.root.appendChild(wrap);
  }

  settings() {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel wide';
    wrap.innerHTML = `<h2>设置</h2><div class="settings"></div>`;
    const box = wrap.querySelector('.settings')!;
    const s: GameSettings = this.save.settings;

    const slider = (label: string, value: number, min: number, max: number, step: number, fn: (x: number) => void) => {
      const row = document.createElement('div');
      row.className = 'setting-row';
      row.innerHTML = `<label>${label}</label>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.oninput = () => fn(Number(input.value));
      row.appendChild(input);
      return row;
    };
    box.appendChild(slider('主音量', s.masterVolume, 0, 1, 0.05, (x) => {
      s.masterVolume = x;
      audio.volume = x;
      this.cb.save();
    }));
    box.appendChild(slider('鼠标灵敏度', s.mouseSensitivity, 0.4, 2, 0.1, (x) => {
      s.mouseSensitivity = x;
      this.cb.save();
    }));
    const inv = document.createElement('div');
    inv.className = 'setting-row';
    inv.innerHTML = `<label>反转鼠标 Y</label>`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = s.invertY;
    cb.onchange = () => {
      s.invertY = cb.checked;
      this.cb.save();
    };
    inv.appendChild(cb);
    box.appendChild(inv);

    wrap.appendChild(this.btn('返回', () => this.main()));
    this.root.appendChild(wrap);
  }

  briefing(index: number, onStart: () => void) {
    this.clear();
    const def = MISSION_DEFS[index];
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel';
    wrap.innerHTML = `
      <h2>${def.name}</h2>
      <p class="brief">${def.brief}</p>
      <p class="hint">时间限制 ${Math.floor(def.timeLimitSec / 60)} 分钟 · 点击开始后锁定鼠标</p>
    `;
    wrap.appendChild(this.btn('开始任务', onStart, 'primary'));
    wrap.appendChild(this.btn('返回主菜单', () => this.main()));
    this.root.appendChild(wrap);
  }

  pause(onResume: () => void, onRestart: () => void, onMenu: () => void) {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel';
    wrap.innerHTML = `<h2>已暂停</h2>`;
    wrap.appendChild(this.btn('继续', onResume, 'primary'));
    wrap.appendChild(this.btn('重新开始任务', onRestart));
    wrap.appendChild(this.btn('返回主菜单', onMenu));
    this.root.appendChild(wrap);
  }

  result(r: MissionResult, index: number, next: () => void, retry: () => void, menu: () => void) {
    this.clear();
    const wrap = document.createElement('div');
    wrap.className = 'menu-panel ' + (r.success ? 'result-success' : 'result-fail');
    const acc = r.shots > 0 ? Math.round((r.hits / r.shots) * 100) : 0;
    wrap.innerHTML = `
      <h2>${r.success ? '✅ 任务完成' : '❌ 任务失败'}</h2>
      ${r.failReason ? `<div class="fail-reason">失败原因：${r.failReason}</div>` : ''}
      <div class="result-grid">
        <div><span>击毁敌机</span><b>${r.kills}</b></div>
        <div><span>命中率</span><b>${acc}%</b></div>
        <div><span>剩余护盾</span><b>${r.shieldLeft}</b></div>
        <div><span>剩余结构</span><b>${r.hullLeft}</b></div>
        <div><span>用时</span><b>${Math.floor(r.timeSec / 60)}:${Math.floor(r.timeSec % 60).toString().padStart(2, '0')}</b></div>
        <div><span>获得资源</span><b class="res">+${r.resources}</b></div>
      </div>
    `;
    if (r.success && index < 3) {
      wrap.appendChild(this.btn('▶ 进入下一任务', next, 'primary'));
    } else if (r.success) {
      wrap.innerHTML += `<p class="campaign-done">🎉 你已完成《星陨防线》全部战役，星域恢复安宁！</p>`;
    }
    wrap.appendChild(this.btn('重新开始任务', retry));
    wrap.appendChild(this.btn('返回主菜单', menu));
    this.root.appendChild(wrap);
  }

  hide() {
    this.root.style.display = 'none';
  }
  show() {
    this.root.style.display = '';
  }
  destroy() {
    this.root.remove();
  }
}
