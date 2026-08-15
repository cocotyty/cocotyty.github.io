// ============================================================
// main.js - 游戏主循环 / 状态机 / HUD / 渲染
// ============================================================
const VW = 480, VH = 270;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const wrap = document.getElementById('wrap');

// 调试模式 (index.html?debug=1): 1/2/3跳关 G无敌 N传送到Boss前
const DEBUG = /[?&]debug=1/.test(location.search);
// 运行时错误收集 (便于自动化测试)
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));

// 自动驾驶 (调试/展示模式): 真实游戏中不生效
const AUTO = { on: false, t: 0, st: {}, edge: {}, prevNade: false, jumpHold: 0, jumpCd: 0 };
function updateAutopilot(p) {
  AUTO.t++;
  const st = AUTO.st;
  st.left = false; st.right = true; st.up = false; st.down = false;
  st.fire = true; st.jump = false; st.nade = false;
  st.confirm = (AUTO.t % 90 === 45);
  if (AUTO.jumpHold > 0) { st.jump = true; AUTO.jumpHold--; }
  const boss = game.boss;
  if (boss && !boss.dying && game.lockX0 > 0) {
    // Boss 战: 面向Boss保持距离持续开火, 高处Boss朝上瞄准, 定期跳跃躲弹幕
    const dx = boss.cx - p.cx;
    st.right = dx > 140;
    st.left = dx < -140;
    st.up = boss.cy < p.y - 36;
    st.nade = (AUTO.t % 190 === 60) && Math.abs(dx) < 175;
    if (p.onGround && AUTO.jumpCd <= 0 && AUTO.t % 105 === 0) {
      st.jump = true; AUTO.jumpHold = 40; AUTO.jumpCd = 14; AUTO.edge.jump = true;
    }
  } else if (p.onGround) {
    let want = false;
    if (p.hitWall) want = true;
    else {
      const ax = p.cx + 6;   // 贴边才起跳, 保证跳距覆盖坑宽
      const t1 = tileAtPx(ax, p.y + p.h + 2), t2 = tileAtPx(ax, p.y + p.h + 18);
      if (t1 !== '#' && t2 !== '#' && t1 !== '=' && t2 !== '=') want = true;   // 前方沟壑
      if (tileAtPx(p.cx + 14, p.y + p.h - 3) === '^') want = true;             // 前方尖刺
    }
    if (AUTO.t % 160 === 0) want = true;
    // 显式发起跳跃: 落地冷却结束后遇到障碍即起跳(不依赖按键沿)
    if (want && AUTO.jumpCd <= 0) {
      st.jump = true; AUTO.jumpHold = 40; AUTO.jumpCd = 14; AUTO.edge.jump = true;
    }
  }
  if (AUTO.jumpCd > 0) AUTO.jumpCd--;
  AUTO.edge.nade = st.nade && !AUTO.prevNade; AUTO.prevNade = st.nade;
}

// ---------------- 输入 ----------------
const Input = (() => {
  const MAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyZ: 'jump', KeyJ: 'fire', KeyX: 'fire',
    KeyK: 'nade', KeyC: 'nade', Enter: 'confirm', KeyP: 'pause', Escape: 'pause'
  };
  const down = {}, pressed = {};
  window.addEventListener('keydown', e => {
    AudioSys.resume();
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM' && !e.repeat) {
      const m = AudioSys.toggleMute();
      if (window.game) game.toast(m ? 'SOUND OFF' : 'SOUND ON');
    }
    if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
    const a = MAP[e.code];
    if (a) { if (!e.repeat && !down[a]) pressed[a] = true; down[a] = true; }
    if (DEBUG) debugKey(e.code);
  });
  function debugKey(code) {
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
      const i = +code.slice(-1) - 1;
      if (i <= LEVEL_COUNT - 1) { game.lives = 3; game.loadLevel(i); }
    } else if (code === 'KeyG') {
      game.godMode = !game.godMode;
      if (game.player) {
        game.player.god = game.godMode;
        game.player.inv = game.godMode ? 99999 : 0;
      }
      game.toast('GOD ' + (game.godMode ? 'ON' : 'OFF'));
    } else if (code === 'KeyT') {
      AUTO.on = !AUTO.on; game.toast('AUTOPILOT ' + (AUTO.on ? 'ON' : 'OFF'));
    } else if (code === 'KeyN' && game.level) {
      game.player.x = game.level.bossCol * TILE - 220;
      game.player.y = 14 * TILE - 40;
      game.camX = game.player.x - 200;
      game.toast('WARP TO BOSS');
    }
  }
  window.addEventListener('keyup', e => { const a = MAP[e.code]; if (a) down[a] = false; });
  window.addEventListener('blur', () => { for (const k in down) down[k] = false; });
  return {
    down(a) { if (AUTO.on) return !!AUTO.st[a]; return !!down[a]; },
    pressed(a) { if (AUTO.on) return !!AUTO.edge[a]; return !!pressed[a]; },
    // 触屏/程序化写入 (带按下沿检测)
    set(a, v) {
      if (v) { if (!down[a]) pressed[a] = true; down[a] = true; }
      else down[a] = false;
    },
    clear() {
      for (const k in pressed) delete pressed[k];
      AUTO.edge.jump = false; AUTO.edge.nade = false;
    }
  };
})();

// ---------------- 触屏支持 ----------------
const IS_TOUCH = /[?&]touch=1/.test(location.search) ||
                 (window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
                 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch');

(function initTouchUI() {
  if (!IS_TOUCH) return;
  const dpad = document.getElementById('dpad');
  const zones = {
    left: document.querySelector('.dz-l'), right: document.querySelector('.dz-r'),
    up: document.querySelector('.dz-u'), down: document.querySelector('.dz-d')
  };
  const menuTap = () => {   // 非战斗状态点按 = 确认
    if (game.state !== 'play' && game.state !== 'pause') { Input.set('confirm', true); Input.set('confirm', false); }
  };
  // 动作键 (多指各算一份)
  const bindBtn = (id, action) => {
    const el = document.getElementById(id), ptrs = new Set();
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); AudioSys.resume();
      ptrs.add(e.pointerId); el.classList.add('on');
      Input.set(action, true); menuTap();
    });
    const off = e => {
      ptrs.delete(e.pointerId);
      if (!ptrs.size) { el.classList.remove('on'); Input.set(action, false); }
    };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };
  bindBtn('bt-fire', 'fire');
  bindBtn('bt-jump', 'jump');
  bindBtn('bt-nade', 'nade');
  // 方向键: 支持拇指滑动换向
  let dpPid = null, curZone = null;
  const zoneOf = (x, y) => {
    const r = dpad.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 16) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  const applyZone = z => {
    if (z === curZone) return;
    for (const a of ['left', 'right', 'up', 'down']) {
      Input.set(a, a === z);
      zones[a].classList.toggle('on', a === z);
    }
    curZone = z;
  };
  dpad.addEventListener('pointerdown', e => {
    e.preventDefault(); AudioSys.resume();
    dpPid = e.pointerId; dpad.setPointerCapture(e.pointerId);
    applyZone(zoneOf(e.clientX, e.clientY)); menuTap();
  });
  dpad.addEventListener('pointermove', e => { if (e.pointerId === dpPid) applyZone(zoneOf(e.clientX, e.clientY)); });
  const dpUp = e => { if (e.pointerId === dpPid) { dpPid = null; applyZone(null); } };
  dpad.addEventListener('pointerup', dpUp);
  dpad.addEventListener('pointercancel', dpUp);
  // 点画布 = 菜单确认
  canvas.addEventListener('pointerdown', e => { AudioSys.resume(); menuTap(); });
  // 系统按钮
  document.getElementById('sb-pause').addEventListener('pointerdown', e => {
    e.preventDefault();
    if (game.state === 'play') { game.state = 'pause'; AudioSys.suspendAudio(); Sfx.uiMove(); }
    else if (game.state === 'pause') { game.state = 'play'; AudioSys.resume(); Sfx.uiSel(); }
  });
  document.getElementById('sb-mute').addEventListener('pointerdown', e => {
    e.preventDefault(); game.toast(AudioSys.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
  });
  document.getElementById('sb-fs').addEventListener('pointerdown', e => { e.preventDefault(); toggleFullscreen(); });
  // 切后台自动暂停
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'play') { game.state = 'pause'; AudioSys.suspendAudio(); }
  });
  // 某些浏览器全屏的元素可能不是整页: 动态把手柄移入全屏元素, 退出后还原
  const touchui = document.getElementById('touchui');
  const onFsChange = () => {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs && !fs.contains(touchui)) fs.appendChild(touchui);
    else if (!fs && touchui.parentElement !== wrap) wrap.appendChild(touchui);
  };
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, onFsChange));
})();

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
  } else {
    // 全屏整个页面而非画布容器, 否则虚拟手柄层(#touchui)会被隐藏
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen();
      if (p && p.then) p.then(() => {
        // 安卓 Chrome: 全屏后锁定横屏; iOS 不支持则静默忽略
        if (screen.orientation && screen.orientation.lock)
          screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {});
    } catch (e) {}
  }
}
function fit() {
  const w = window.innerWidth, h = window.innerHeight;
  // 触屏竖屏: 画面在上, 底部留给虚拟手柄
  const portrait = IS_TOUCH && h > w;
  const availH = portrait ? Math.max(160, h - 240) : h;
  const s = Math.min(w / VW, availH / VH);
  canvas.style.width = Math.round(VW * s) + 'px';
  canvas.style.height = Math.round(VH * s) + 'px';
  wrap.style.alignItems = portrait ? 'flex-start' : 'center';
  wrap.style.paddingTop = portrait ? '12px' : '0';
}
window.addEventListener('resize', fit); fit();
// 进/出全屏瞬间尺寸可能延迟生效, 多次重算避免画面停在旧大小
document.addEventListener('fullscreenchange', () => { fit(); setTimeout(fit, 60); setTimeout(fit, 300); });

// ---------------- 游戏对象 ----------------
const game = {
  state: 'title', t: 0, stateT: 0,
  levelIdx: 0, level: null,
  player: null,
  enemies: [], pbullets: [], ebullets: [], grenades: [], pickups: [], particles: [],
  boss: null, bossDefeated: false,
  camX: 0, camYOff: 0, shake: 0,
  lockX0: 0, lockX1: 0,
  score: 0, hi: +(localStorage.getItem('sv_hi') || 0), lives: 3, nextLifeAt: 10000,
  respawnPt: null, crateWpn: 0,
  toastMsg: '', toastT: 0,
  tallyDone: false, bonus: 0,

  toast(msg) { this.toastMsg = msg; this.toastT = 100; },
  addScore(n) {
    this.score += n;
    if (this.score >= this.nextLifeAt) {
      this.lives++; this.nextLifeAt += 15000;
      Sfx.lifeUp(); this.toast('1UP!');
    }
    if (this.score > this.hi) { this.hi = this.score; localStorage.setItem('sv_hi', this.hi); }
  },

  // ---------- 粒子特效 ----------
  fxSpark(x, y, n, color, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (Math.random() * 1.5 + .5) * (spd || 1);
      this.particles.push(new Particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 10 + Math.random() * 12, color, type: 'spark' }));
    }
  },
  fxPoof(x, y, n) {
    for (let i = 0; i < n; i++)
      this.particles.push(new Particle({
        x: x + (Math.random() - .5) * 10, y: y + (Math.random() - .5) * 6,
        vx: (Math.random() - .5) * .6, vy: -Math.random() * .5,
        life: 20 + Math.random() * 16, size: 2 + Math.random() * 2, grow: .1,
        color: '#c9cfd8', type: 'smoke'
      }));
  },
  fxDebris(x, y, n, color) {
    for (let i = 0; i < n; i++)
      this.particles.push(new Particle({
        x, y, vx: (Math.random() - .5) * 3, vy: -Math.random() * 3 - .5,
        grav: .22, life: 26 + Math.random() * 20, size: 1 + Math.random() * 2,
        color, type: 'deb'
      }));
  },
  fxFlash(x, y, r, color) {
    this.particles.push(new Particle({ x, y, size: r, life: 6, color, type: 'flash' }));
  },
  fxText(x, y, str, color) {
    this.particles.push(new Particle({ x, y, vy: -.5, life: 46, str, color, type: 'txt' }));
  },
  fxCasing(x, y, dir) {
    this.particles.push(new Particle({
      x, y, vx: -dir * (Math.random() * .8 + .3), vy: -1.8 - Math.random(),
      grav: .25, life: 22, size: 1, color: '#e8b34a', type: 'deb'
    }));
  },
  fxBoom(x, y, r) {
    this.particles.push(new Particle({ x, y, size: r * .5, life: 8, color: '#fff3b0', type: 'flash' }));
    this.particles.push(new Particle({ x, y, size: 3, grow: r * .09, life: 18, color: '#ffd23e', type: 'ring' }));
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * .4;
      this.particles.push(new Particle({
        x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
        size: 2 + Math.random() * (r * .16), grow: -.12,
        life: 12 + Math.random() * 10, type: 'fire'
      }));
    }
    for (let i = 0; i < 6; i++)
      this.particles.push(new Particle({
        x: x + (Math.random() - .5) * r, y: y + (Math.random() - .5) * r,
        vx: (Math.random() - .5) * .5, vy: -.4 - Math.random() * .6,
        life: 26 + Math.random() * 20, size: 2 + Math.random() * 3, grow: .12,
        color: '#6e747e', type: 'smoke'
      }));
    this.fxDebris(x, y, 5, '#8b93a1');
    this.shake = Math.min(10, this.shake + r * .16);
  },

  explode(x, y, r, dmg, friendly) {
    this.fxBoom(x, y, r); Sfx.explode();
    if (friendly) {
      for (const e of this.enemies)
        if (!e.dead && Math.hypot(e.cx - x, e.cy - y) < r + e.w * .5) e.hurt(dmg);
      if (this.boss && !this.boss.dying && this.boss.intro <= 0 &&
          Math.hypot(this.boss.cx - x, this.boss.cy - y) < r + this.boss.w * .5)
        this.boss.hurt(dmg);
    } else {
      const p = this.player;
      if (p && !p.dead && p.inv <= 0 && Math.hypot(p.cx - x, p.cy - y) < r + 8)
        p.hurt(dmg, Math.sign(p.cx - x) || 1);
    }
  },

  // ---------- 关卡加载 ----------
  loadLevel(i) {
    this.levelIdx = i;
    this.level = parseLevel(LEVEL_DEFS[i]());
    this.enemies = []; this.pbullets = []; this.ebullets = [];
    this.grenades = []; this.pickups = []; this.particles = [];
    this.boss = null; this.bossDefeated = false;
    this.lockX0 = this.lockX1 = 0;
    for (const s of this.level.spawns)
      this.enemies.push(spawnEnemy(s.code, s.x, s.y, this.level.elite));
    this.player = new Player(this.level.spawn.x - 5, this.level.spawn.y);
    this.respawnPt = { x: this.level.spawn.x - 5, y: this.level.spawn.y };
    this.camX = Math.max(0, Math.min(this.level.pxW - VW, this.player.cx - 120));
    this.shake = 0;
    this.state = 'intro'; this.stateT = 0; this.tallyDone = false;
    if (IS_TOUCH) this.toast('TIP: FS BUTTON = FULLSCREEN');
    Music.stop();
  },
  startRun() {
    this.score = 0; this.lives = 3; this.nextLifeAt = 10000; this.crateWpn = 0;
    Sfx.uiSel();
    this.loadLevel(0);
  },

  onPlayerDeath() { this.lives--; },

  respawn() {
    let rx = this.respawnPt.x, ry = this.respawnPt.y;
    if (this.lockX0 > 0) { rx = this.lockX0 + 60; ry = 14 * TILE - 22; }
    this.player = new Player(rx, ry);
    this.player.inv = 90;
    if (this.godMode) { this.player.god = true; this.player.inv = 99999; }
    this.camX = Math.max(this.lockX0, Math.min(this.level.pxW - VW, this.player.cx - 120));
  },

  spawnBoss() {
    const pxW = this.level.pxW;
    this.lockX0 = pxW - VW; this.lockX1 = pxW;
    const Cls = BOSS_CLASSES[this.level.bossType];
    const groundTop = 14 * TILE;
    const y = this.level.bossType === 1 ? groundTop - 38
            : this.level.bossType === 2 ? 60
            : groundTop - 62;
    this.boss = new Cls(pxW - 170, y);
    this.boss.x = pxW - this.boss.w - 40;
    Music.play('boss'); Sfx.bossRoar();
    this.shake = 7;
    if (this.player.x < this.lockX0 + 4) this.player.x = this.lockX0 + 8;
  },

  bossCleared() {
    this.bossDefeated = true;
    this.addScore(BOSS_SCORES[this.level.bossType]);
    this.pickups.push(new Pickup('life', this.boss.cx, this.boss.cy));
    for (let i = 0; i < 3; i++) this.pickups.push(new Pickup('gem', this.boss.cx + (i - 1) * 14, this.boss.cy + 8));
    Music.stop(); Sfx.sting('win');
    this.state = 'clear'; this.stateT = 0; this.tallyDone = false;
  },

  // ---------- 更新 ----------
  update() {
    this.t++;
    if (this.toastT > 0) this.toastT--;
    const autoConfirm = AUTO.on && (this.t % 120 === 60);
    const st = this.state;
    if (st === 'title') {
      if (Input.pressed('confirm') || autoConfirm) this.startRun();
      return;
    }
    if (st === 'intro') {
      this.stateT++;
      if (Input.pressed('confirm') || autoConfirm || this.stateT > 150) {
        this.state = 'play'; this.stateT = 0;
        Music.play(this.level.music);
      }
      return;
    }
    if (st === 'gameover') {
      this.stateT++;
      if (this.stateT > 30 && (Input.pressed('confirm') || autoConfirm)) {
        this.lives = 3; Sfx.uiSel();
        this.loadLevel(this.levelIdx);
      } else if (this.stateT > 30 && Input.down('pause')) {
        this.state = 'title'; Music.stop(); Sfx.uiSel();
      }
      return;
    }
    if (st === 'clear') {
      this.stateT++;
      this.updateFx();
      if (this.stateT === 80 && !this.tallyDone) {
        this.tallyDone = true;
        this.bonus = this.lives * 1000 + this.player.hp * 250;
        this.addScore(this.bonus);
        Sfx.pickup();
      }
      if ((this.stateT > 260 || (this.stateT > 90 && (Input.pressed('confirm') || autoConfirm)))) {
        if (this.levelIdx + 1 < LEVEL_COUNT) { Sfx.uiSel(); this.loadLevel(this.levelIdx + 1); }
        else { this.state = 'victory'; this.stateT = 0; Music.stop(); }
      }
      return;
    }
    if (st === 'victory') {
      this.stateT++;
      // 烟花
      if (this.stateT % 22 === 0)
        this.fxBoom(60 + Math.random() * 360, 30 + Math.random() * 120, 10 + Math.random() * 14);
      this.updateFx();
      if (this.stateT > 60 && Input.pressed('confirm')) { this.state = 'title'; Sfx.uiSel(); }
      return;
    }
    if (st === 'pause') {
      if (Input.pressed('pause') || Input.pressed('confirm')) {
        this.state = 'play'; AudioSys.resume(); Sfx.uiSel();
      }
      return;
    }
    if (st !== 'play') return;

    // ====== play ======
    if (Input.pressed('pause')) { this.state = 'pause'; AudioSys.suspendAudio(); Sfx.uiMove(); return; }
    this.stateT++;
    const p = this.player, lv = this.level;
    if (AUTO.on && !p.dead) updateAutopilot(p);

    p.update();
    if (p.dead && p.deadT > 85) {
      if (this.lives > 0) this.respawn();
      else {
        this.state = 'gameover'; this.stateT = 0;
        Music.stop(); Sfx.sting('lose');
      }
      return;
    }
    if (p.y > lv.pxH + 40) p.fallDie();

    // 敌人
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.activated || e.type === 'crate') {
        if (e.cx > this.camX - 340 && e.cx < this.camX + VW + 340) e.update();
      } else e.tryActivate(p);
      if (e.y > lv.pxH + 60) e.dead = true;
      // 接触伤害
      if (e.touchDmg && !p.dead && p.inv <= 0 && overlap(e, p))
        p.hurt(1, Math.sign(p.cx - e.cx) || 1);
    }
    // Boss
    if (this.boss) {
      this.boss.update();
      if (!this.boss.dying && this.boss.intro <= 0 && !p.dead && p.inv <= 0 && overlap(this.boss, p))
        p.hurt(1, Math.sign(p.cx - this.boss.cx) || 1);
    } else if (!this.bossDefeated && p.cx > lv.bossCol * TILE + 8) {
      this.spawnBoss();
    }

    // 玩家子弹
    for (const b of this.pbullets) {
      b.update();
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || !e.activated && e.type !== 'crate') continue;
        if (b.x > e.x - 1 && b.x < e.x + e.w + 1 && b.y > e.y - 1 && b.y < e.y + e.h + 1) {
          b.dead = true; this.fxSpark(b.x, b.y, 2, '#ffd23e', 1); e.hurt(b.dmg); break;
        }
      }
      if (!b.dead && this.boss && !this.boss.dying && this.boss.intro <= 0 &&
          b.x > this.boss.x && b.x < this.boss.x + this.boss.w && b.y > this.boss.y && b.y < this.boss.y + this.boss.h) {
        b.dead = true; this.fxSpark(b.x, b.y, 2, '#ffd23e', 1); this.boss.hurt(b.dmg);
      }
    }
    // 敌方子弹
    for (const b of this.ebullets) {
      b.update();
      if (b.dead || p.dead || p.inv > 0) continue;
      let hit = false;
      if (b.kind === 'wave') {
        hit = b.x + 6 > p.x && b.x - 6 < p.x + p.w && b.y + 6 > p.y && b.y - 4 < p.y + p.h;
      } else {
        hit = b.x > p.x - 2 && b.x < p.x + p.w + 2 && b.y > p.y - 2 && b.y < p.y + p.h + 2;
      }
      if (hit) {
        b.dead = true;
        p.hurt(1, Math.sign(b.vx) || 1);
      }
    }
    // 手雷 / 拾取物
    for (const gr of this.grenades) gr.update();
    for (const pk of this.pickups) {
      pk.update();
      if (!pk.dead && !p.dead && overlap(pk, p)) pk.apply(p);
    }
    this.updateFx();

    // 检查点
    for (const cp of lv.checkpoints) {
      if (!cp.passed && p.cx > cp.x) {
        cp.passed = true;
        this.respawnPt = { x: cp.x - 5, y: cp.y - 22 };
        Sfx.checkpoint(); this.toast('CHECKPOINT');
        this.fxText(cp.x, cp.y - 40, 'CHECKPOINT', '#7dff8a');
      }
    }
    // 相机
    const target = p.cx + p.face * 26 - VW / 2;
    this.camX += (target - this.camX) * .12;
    const lo = this.lockX0 > 0 ? this.lockX0 : 0;
    const hiW = this.lockX1 > 0 ? this.lockX1 : lv.pxW;
    this.camX = Math.max(lo, Math.min(hiW - VW, this.camX));

    // 清理
    this.enemies = this.enemies.filter(e => !e.dead);
    this.pbullets = this.pbullets.filter(b => !b.dead);
    this.ebullets = this.ebullets.filter(b => !b.dead);
    this.grenades = this.grenades.filter(g => !g.dead);
    this.pickups = this.pickups.filter(k => !k.dead);
  },
  updateFx() {
    for (const pa of this.particles) pa.update();
    this.particles = this.particles.filter(pa => pa.life > 0);
  },

  // ---------- 渲染 ----------
  draw() {
    if (this.state === 'title') { this.drawTitle(); ctx.drawImage(Overlay, 0, 0); return; }
    if (this.state === 'intro') { this.drawIntro(); ctx.drawImage(Overlay, 0, 0); return; }
    if (this.state === 'victory') { this.drawVictory(); ctx.drawImage(Overlay, 0, 0); return; }

    const dx = (Math.random() - .5) * this.shake, dy = (Math.random() - .5) * this.shake;
    ctx.save();
    ctx.translate(Math.round(dx), Math.round(dy));
    this.drawWorld();
    this.drawHUD();
    if (this.state === 'pause') this.drawPause();
    if (this.state === 'gameover') this.drawGameOver();
    if (this.state === 'clear') this.drawClear();
    ctx.restore();
    ctx.drawImage(Overlay, 0, 0);
    this.shake *= .86; if (this.shake < .3) this.shake = 0;
  },

  drawWorld() {
    const lv = this.level, cam = this.camX;
    paintBG(ctx, cam, lv.theme, this.t);
    // 装饰
    for (const d of lv.decorList)
      if (d.x > cam - 40 && d.x < cam + VW + 40)
        ctx.drawImage(d.img, Math.round(d.x - cam), Math.round(d.y - d.img.height));
    // 瓦片
    const x0 = Math.max(0, Math.floor(cam / TILE)), x1 = Math.min(lv.W - 1, Math.ceil((cam + VW) / TILE));
    for (let y = 0; y < ROWS; y++) for (let x = x0; x <= x1; x++) {
      const c = lv.grid[y][x];
      if (c === '.') continue;
      const sx = x * TILE - cam, sy = y * TILE;
      if (c === '#') {
        const above = y > 0 ? lv.grid[y - 1][x] : '.';
        ctx.drawImage(above === '#' ? lv.tiles['#'].inn : lv.tiles['#'].top, Math.round(sx), sy);
      } else ctx.drawImage(lv.tiles[c], Math.round(sx), sy);
    }
    // 检查点旗
    for (const cp of lv.checkpoints) {
      const fx = Math.round(cp.x - cam);
      if (fx < -20 || fx > VW + 20) continue;
      ctx.fillStyle = '#8b93a1'; ctx.fillRect(fx - 1, cp.y - 34, 2, 34);
      ctx.fillStyle = '#5a6270'; ctx.fillRect(fx - 3, cp.y - 2, 6, 2);
      if (cp.passed) {
        drawSpr(ctx, Sprites.flag, fx + 1, cp.y - 34, false);
      } else {
        ctx.fillStyle = '#5a6270'; ctx.fillRect(fx + 1, cp.y - 16, 7, 5);
      }
    }
    // 实体
    for (const pk of this.pickups) pk.draw(ctx);
    for (const gr of this.grenades) gr.draw(ctx);
    for (const e of this.enemies)
      if (e.cx > cam - 60 && e.cx < cam + VW + 60 && e.y > -60) e.draw(ctx);
    if (this.boss) this.boss.draw(ctx);
    if (this.player) this.player.draw(ctx);
    for (const b of this.pbullets) b.draw(ctx);
    for (const b of this.ebullets) b.draw(ctx);
    for (const pa of this.particles) pa.draw(ctx);
    // 提示牌
    if (this.state === 'play' && this.player) {
      for (const h of lv.hints) {
        if (Math.abs(this.player.cx - h.x) < 72) {
          const bw = 150, bx = VW / 2 - bw / 2, by = 214;
          ctx.globalAlpha = .85;
          ctx.fillStyle = '#10141c'; ctx.fillRect(bx, by, bw, 8 + h.lines.length * 8);
          ctx.strokeStyle = '#3a4150'; ctx.strokeRect(bx + .5, by + .5, bw - 1, 7 + h.lines.length * 8);
          ctx.globalAlpha = 1;
          h.lines.forEach((ln, i) => drawTextC(ctx, ln, VW / 2, by + 4 + i * 8, '#ffd23e', 1));
          break;
        }
      }
    }
  },

  drawHUD() {
    const p = this.player;
    // 生命值
    for (let i = 0; i < p.maxHp; i++)
      ctx.drawImage(i < p.hp ? Sprites.heartFull : Sprites.heartEmpty, 5 + i * 9, 5);
    // 命数 / 武器 / 手雷
    ctx.drawImage(Sprites.face, 5, 15);
    drawText(ctx, '×' + this.lives, 14, 16, '#dfe6ee', 1);
    const wColors = { R: '#dfe6ee', S: '#ff9a2a', H: '#5ad1ff' };
    ctx.fillStyle = '#10141c'; ctx.fillRect(30, 14, 11, 9);
    ctx.strokeStyle = wColors[p.weapon]; ctx.strokeRect(30.5, 14.5, 10, 8);
    drawText(ctx, p.weapon, 33, 16, wColors[p.weapon], 1);
    drawSpr(ctx, Sprites.nade, 45, 14, false);
    drawText(ctx, '×' + p.nades, 55, 16, '#7ba35c', 1);
    // 分数
    const sc = String(this.score).padStart(7, '0');
    drawText(ctx, 'SCORE', VW - 5 - textW(sc) - 4 - textW('SCORE') - 3, 5, '#8b93a1', 1);
    drawText(ctx, sc, VW - 5 - textW(sc), 5, '#ffd23e', 1);
    const hi = 'HI ' + String(this.hi).padStart(7, '0');
    drawText(ctx, hi, VW - 5 - textW(hi), 13, '#5f6a7e', 1);
    // 关卡指示
    drawTextC(ctx, lv_name(this), VW / 2, 5, '#5f6a7e', 1);
    // Boss 血条
    if (this.boss && this.boss.intro <= 0 && !this.boss.dying) {
      const bw = 180, bx = VW / 2 - bw / 2, by = 17;
      drawTextC(ctx, this.boss.name, VW / 2, by - 2, '#ff5a3c', 1);
      ctx.fillStyle = '#10141c'; ctx.fillRect(bx, by + 7, bw, 5);
      ctx.fillStyle = '#ff3b55'; ctx.fillRect(bx + 1, by + 8, (bw - 2) * this.boss.hp / this.boss.maxHp, 3);
      ctx.strokeStyle = '#3a4150'; ctx.strokeRect(bx + .5, by + 7.5, bw - 1, 4);
    }
    // 提示条
    if (this.toastT > 0 && this.toastMsg)
      drawTextC(ctx, this.toastMsg, VW / 2, 254, (this.toastT >> 3) % 2 ? '#ffd23e' : '#fff', 1);
  },

  drawTitle() {
    paintBG(ctx, this.t * .5, 'fort', this.t);
    ctx.fillStyle = 'rgba(4,6,12,.52)'; ctx.fillRect(0, 0, VW, VH);
    drawTextC(ctx, 'STEEL', VW / 2 + 1, 39, '#141824', 5);
    drawTextC(ctx, 'STEEL', VW / 2, 36, '#dfe6ee', 5);
    drawTextC(ctx, 'VANGUARD', VW / 2 + 1, 75, '#141824', 5);
    drawTextC(ctx, 'VANGUARD', VW / 2, 72, '#ff8c1a', 5);
    ctx.fillStyle = '#8b93a1'; ctx.fillRect(VW / 2 - 84, 104, 168, 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillStyle = '#dfe6ee';
    ctx.fillText('钢 铁 先 锋', VW / 2, 120);
    ctx.textAlign = 'left';
    if ((this.t >> 4) % 2 === 0)
      drawTextC(ctx, IS_TOUCH ? 'TAP TO START' : 'PRESS ENTER', VW / 2, 142, '#ffd23e', 2);
    const ctl = IS_TOUCH ? [
      'LEFT PAD ... MOVE + AIM UP/DOWN',
      'RIGHT ...... FIRE / JUMP / NADE',
      'TAP SCREEN . CONFIRM MENUS',
      'II PAUSE  M MUTE  FS FULLSCREEN'
    ] : [
      'MOVE ......... ARROWS / A D',
      'JUMP ......... SPACE / Z',
      'FIRE ......... J / X    AIM UP: W / UP',
      'GRENADE ...... K / C',
      'PAUSE P   MUTE M   FULLSCREEN F'
    ];
    ctl.forEach((s, i) => drawTextC(ctx, s, VW / 2, 168 + i * 9, '#8b93a1', 1));
    drawTextC(ctx, 'HI-SCORE ' + String(this.hi).padStart(7, '0'), VW / 2, 222, '#5f6a7e', 1);
    drawTextC(ctx, '3 MISSIONS - 3 BOSSES - GLORY AWAITS', VW / 2, 244, '#3f4654', 1);
    drawText(ctx, 'V1.0', VW - 24, VH - 9, '#3f4654', 1);
  },

  drawIntro() {
    const lv = this.level;
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#1b2336'; ctx.fillRect(0, 96, VW, 1); ctx.fillRect(0, 178, VW, 1);
    drawTextC(ctx, 'MISSION 0' + (this.levelIdx + 1), VW / 2, 32, '#ff5a3c', 3);
    drawTextC(ctx, lv.name, VW / 2, 112, '#dfe6ee', 3);
    drawTextC(ctx, lv.sub, VW / 2, 140, '#8b93a1', 1);
    const stories = [
      'THE IRON LEGION HAS LANDED. RETAKE THE JUNGLE.',
      'PUSH THROUGH THE RUINS. REACH THE FORTRESS GATE.',
      'BREACH THE CORE. END THIS WAR.'
    ];
    drawTextC(ctx, stories[this.levelIdx], VW / 2, 156, '#5f6a7e', 1);
    if ((this.t >> 4) % 2 === 0)
      drawTextC(ctx, 'GET READY', VW / 2, 206, '#ffd23e', 2);
    drawTextC(ctx, IS_TOUCH ? 'TAP: SKIP' : 'ENTER: SKIP', VW / 2, 248, '#3f4654', 1);
  },

  drawClear() {
    ctx.fillStyle = 'rgba(4,8,6,.62)'; ctx.fillRect(0, 70, VW, 130);
    drawTextC(ctx, 'MISSION COMPLETE', VW / 2, 84, '#7dff8a', 2);
    const rows = [
      ['SCORE', String(this.score - (this.tallyDone ? this.bonus : 0)).padStart(7, '0')],
      ['LIVES BONUS', this.tallyDone ? '+' + this.lives * 1000 : ''],
      ['HP BONUS', this.tallyDone ? '+' + this.player.hp * 250 : '']
    ];
    let yy = 112;
    for (const [k, v] of rows) {
      if (!v && k !== 'SCORE') continue;
      drawText(ctx, k, VW / 2 - 90, yy, '#8b93a1', 1);
      drawText(ctx, v, VW / 2 + 90 - textW(v), yy, '#dfe6ee', 1);
      yy += 12;
    }
    if (this.tallyDone) {
      drawText(ctx, 'TOTAL', VW / 2 - 90, yy + 4, '#ffd23e', 1);
      drawText(ctx, String(this.score).padStart(7, '0'), VW / 2 + 90 - textW(String(this.score)), yy + 4, '#ffd23e', 1);
    }
    if (this.stateT > 90 && (this.t >> 4) % 2 === 0)
      drawTextC(ctx, IS_TOUCH ? 'TAP TO CONTINUE' : 'PRESS ENTER', VW / 2, 182, '#fff', 1);
  },

  drawGameOver() {
    ctx.fillStyle = 'rgba(10,2,4,.72)'; ctx.fillRect(0, 0, VW, VH);
    drawTextC(ctx, 'GAME OVER', VW / 2 + 1, 89, '#2a0c14', 3);
    drawTextC(ctx, 'GAME OVER', VW / 2, 86, '#ff3b55', 3);
    drawTextC(ctx, 'SCORE ' + String(this.score).padStart(7, '0'), VW / 2, 122, '#dfe6ee', 1);
    drawTextC(ctx, 'HI    ' + String(this.hi).padStart(7, '0'), VW / 2, 134, '#8b93a1', 1);
    if ((this.t >> 4) % 2 === 0)
      drawTextC(ctx, IS_TOUCH ? 'TAP: CONTINUE' : 'ENTER: CONTINUE', VW / 2, 162, '#ffd23e', 1);
    drawTextC(ctx, 'ESC: TITLE', VW / 2, 176, '#5f6a7e', 1);
  },

  drawPause() {
    ctx.fillStyle = 'rgba(4,6,12,.66)'; ctx.fillRect(0, 0, VW, VH);
    drawTextC(ctx, 'PAUSED', VW / 2, 100, '#dfe6ee', 3);
    drawTextC(ctx, 'P: RESUME   M: MUTE   F: FULLSCREEN', VW / 2, 136, '#8b93a1', 1);
  },

  drawVictory() {
    paintBG(ctx, this.t * .3, 'jungle', this.t);
    ctx.fillStyle = 'rgba(4,8,12,.45)'; ctx.fillRect(0, 0, VW, VH);
    for (const pa of this.particles) pa.draw(ctx);
    drawTextC(ctx, 'MISSION ACCOMPLISHED', VW / 2, 46, '#7dff8a', 2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('钢铁先锋', VW / 2, 92);
    ctx.textAlign = 'left';
    drawTextC(ctx, 'THE IRON LEGION HAS FALLEN.', VW / 2, 108, '#dfe6ee', 1);
    drawTextC(ctx, 'YOU ARE THE STEEL VANGUARD.', VW / 2, 120, '#dfe6ee', 1);
    drawTextC(ctx, 'FINAL SCORE ' + String(this.score).padStart(7, '0'), VW / 2, 148, '#ffd23e', 2);
    drawTextC(ctx, 'HI-SCORE    ' + String(this.hi).padStart(7, '0'), VW / 2, 168, '#8b93a1', 1);
    if (this.stateT > 60 && (this.t >> 4) % 2 === 0)
      drawTextC(ctx, IS_TOUCH ? 'TAP TO CONTINUE' : 'PRESS ENTER', VW / 2, 200, '#fff', 1);
    drawTextC(ctx, 'THANK YOU FOR PLAYING', VW / 2, 226, '#5f6a7e', 1);
  }
};
function lv_name(g) { return 'MISSION 0' + (g.levelIdx + 1) + ' - ' + g.level.name; }

window.game = game;

// ---------------- 主循环 ----------------
let last = performance.now(), acc = 0;
function tick(now) {
  acc += Math.min(now - last, DEBUG ? 1500 : 80); last = now;
  let guard = 0;
  while (acc >= 16.667 && guard++ < 150) {
    game.update();
    Input.clear();
    acc -= 16.667;
  }
  game.draw();
}
function frame(now) { requestAnimationFrame(frame); tick(now); }
requestAnimationFrame(frame);
if (DEBUG) setInterval(() => tick(performance.now()), 250); // 后台节流时保持运行(仅调试)

// 调试自动启动: ?debug=1&auto=1[&boss=1][&lv=2] — 自动开局+自动驾驶+无敌
if (DEBUG) {
  const q = new URLSearchParams(location.search);
  if (q.get('auto') === '1') {
    AUTO.on = true;
    game.godMode = true;
    const lv = Math.min(LEVEL_COUNT - 1, Math.max(0, (+q.get('lv') || 1) - 1 || 0));
    game.lives = 3;
    game.loadLevel(lv);
    game.player.god = true; game.player.inv = 99999;
    if (q.get('boss') === '1') {
      game.player.x = game.level.bossCol * TILE - 220;
      game.player.y = 14 * TILE - 40;
      game.camX = Math.max(0, Math.min(game.level.pxW - VW, game.player.cx - 120));
    }
  }
}
requestAnimationFrame(frame);
