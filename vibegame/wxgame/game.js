// ============================================================
// game.js - 自动构建, 勿手改 (源码见 js/ 与 wxgame/_shim.js _boot.js)
// 构建命令: node build-wx.js
// ============================================================

// ===== wxgame/_shim.js =====
// ============================================================
// _shim.js - 微信小游戏平台垫片 (打包时置于 bundle 最前)
// 提供 window/document/localStorage/AudioContext 等浏览器全局的等价物
// ============================================================
(function () {
  if (typeof wx === 'undefined' || !wx.createCanvas) return; // 非微信环境直通
  const sys = wx.getSystemInfoSync();
  const dpr = sys.pixelRatio || 1;

  // 第一个 createCanvas 是上屏画布
  const screenCanvas = wx.createCanvas();
  screenCanvas.width = sys.screenWidth * dpr;
  screenCanvas.height = sys.screenHeight * dpr;
  const sctx = screenCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = false;

  // 游戏专用离屏画布 (480x270, 与网页版一致)
  const gameCanvas = wx.createCanvas();
  gameCanvas.width = 480;
  gameCanvas.height = 270;
  gameCanvas.addEventListener = function () {};
  gameCanvas.removeEventListener = function () {};
  gameCanvas.style = gameCanvas.style || {};

  const noop = function () {};
  const mkStubEl = function () {
    return {
      style: {}, classList: { add: noop, toggle: noop, contains: function () { return false; } },
      addEventListener: noop, removeEventListener: noop,
      appendChild: noop, contains: function () { return false; },
      setPointerCapture: noop, parentElement: null
    };
  };

  // window → 全局自身 (保持 window.xxx 写法可用)
  globalThis.window = globalThis;
  window.innerWidth = sys.screenWidth;
  window.innerHeight = sys.screenHeight;
  window.devicePixelRatio = dpr;
  window.addEventListener = noop;
  window.matchMedia = null; // IS_TOUCH 走 navigator.maxTouchPoints 分支
  globalThis.navigator = { maxTouchPoints: 1, userAgent: 'wx-minigame' };
  globalThis.location = { search: '' };
  if (typeof performance === 'undefined') globalThis.performance = { now: function () { return Date.now(); } };
  globalThis.localStorage = {
    getItem: function (k) { const v = wx.getStorageSync(k); return v === '' || v == null ? null : v; },
    setItem: function (k, val) { try { wx.setStorageSync(k, String(val)); } catch (e) {} }
  };

  // document 垫片
  const els = { game: gameCanvas, wrap: mkStubEl() };
  ['touchui', 'dpad', 'btns', 'bt-fire', 'bt-jump', 'bt-nade', 'sysbtns', 'sb-pause', 'sb-mute', 'sb-fs']
    .forEach(function (id) { els[id] = mkStubEl(); });
  globalThis.document = {
    createElement: function (tag) { return tag === 'canvas' ? wx.createCanvas() : mkStubEl(); },
    getElementById: function (id) { return els[id] || mkStubEl(); },
    addEventListener: noop, removeEventListener: noop,
    documentElement: mkStubEl(), body: mkStubEl(),
    hidden: false, fullscreenElement: null
  };

  // WebAudio → wx.createWebAudioContext (基础库 2.19.0+; 不可用则静音运行)
  try {
    if (wx.createWebAudioContext) window.AudioContext = function () { return wx.createWebAudioContext(); };
  } catch (e) {}

  globalThis.__WX_BOOT = { screenCanvas: screenCanvas, sctx: sctx, gameCanvas: gameCanvas, sys: sys, dpr: dpr };
})();


// ===== js/audio.js =====
// ============================================================
// audio.js - WebAudio 程序化音效 + 芯片音乐 (无外部文件)
// ============================================================
const AudioSys = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let muted = false, noiseBuf = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.42; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    // 白噪声缓冲
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.8;
    return muted;
  }
  const now = () => ctx ? ctx.currentTime : 0;

  // ---- 合成基础件 ----
  function blip(f0, f1, dur, type, vol, dest) {
    if (!ctx || muted) return;
    const t = now(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, vol, f0, f1, q) {
    if (!ctx || muted) return;
    const t = now(), s = ctx.createBufferSource(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true;
    flt.type = 'lowpass'; flt.Q.value = q || 1;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(sfxGain);
    s.start(t); s.stop(t + dur + .02);
  }

  // ---- 音效表 ----
  const Sfx = {
    shoot()      { blip(900, 240, .07, 'square', .11); noise(.04, .05, 3500, 900); },
    mgShoot()    { blip(760, 300, .05, 'square', .08); },
    spreadShoot(){ blip(520, 160, .10, 'sawtooth', .10); noise(.06, .06, 2600, 500); },
    eShoot()     { blip(330, 170, .10, 'square', .06); },
    jump()       { blip(190, 540, .12, 'square', .10); },
    land()       { noise(.05, .05, 700, 150); },
    nadeThrow()  { blip(500, 800, .06, 'triangle', .09); },
    explode()    { noise(.38, .30, 1600, 60, 1); blip(150, 40, .35, 'triangle', .20); },
    bigExplode() { noise(.8, .40, 1800, 40, 1); blip(110, 30, .7, 'triangle', .28); blip(70, 24, .9, 'sawtooth', .12); },
    hurt()       { blip(300, 70, .22, 'sawtooth', .16); noise(.12, .10, 900, 200); },
    enemyDie()   { noise(.16, .16, 1400, 120); blip(400, 90, .14, 'square', .08); },
    crateBreak() { noise(.12, .16, 1100, 200, 2); blip(240, 100, .08, 'triangle', .10); },
    pickup()     { blip(660, 660, .06, 'square', .10); setTimeout(() => blip(990, 990, .09, 'square', .10), 55); },
    weaponUp()   { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, f, .07, 'square', .10), i * 55)); },
    lifeUp()     { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => blip(f, f, .09, 'square', .10), i * 70)); },
    checkpoint() { [392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, f, .08, 'triangle', .12), i * 70)); },
    clank()      { blip(1400, 900, .05, 'square', .07); noise(.04, .06, 4000, 1500, 3); },
    bossRoar()   { blip(70, 40, .7, 'sawtooth', .22); noise(.7, .16, 500, 60); },
    stomp()      { noise(.25, .25, 500, 40); blip(70, 32, .3, 'triangle', .22); },
    laserCharge(){ blip(120, 1200, .5, 'sawtooth', .07); },
    laserFire()  { noise(.5, .18, 5000, 800, 4); blip(1800, 400, .5, 'sawtooth', .09); },
    missile()    { noise(.3, .08, 900, 2200, 2); },
    playerDie()  { blip(600, 60, .5, 'sawtooth', .16); noise(.4, .18, 1200, 80); },
    uiMove()     { blip(440, 660, .05, 'square', .07); },
    uiSel()      { blip(660, 990, .09, 'square', .10); },
    sting(type) {
      if (type === 'win')  [523, 523, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, f, .14, 'square', .11), i * 110));
      if (type === 'lose') [330, 311, 294, 220].forEach((f, i) => setTimeout(() => blip(f, f * .97, .3, 'sawtooth', .10), i * 220));
    }
  };

  // ---- 芯片音乐 ----
  const N = m => 440 * Math.pow(2, (m - 69) / 12);
  // 每步为 8 分音符; 0 = 休止; 鼓: k底鼓 s军鼓 h踩镲
  const TRACKS = {
    title: { bpm: 84, steps: 32,
      bass: [40,0,0,0,40,0,0,0,45,0,0,0,43,0,0,0,40,0,0,0,40,0,0,0,47,0,0,0,43,0,0,0],
      lead: [64,0,67,0,71,0,74,0,72,0,71,0,67,0,64,0,64,0,67,0,71,0,76,0,74,0,71,0,72,0,0,0],
      drum: 'k.h.s.h.k.h.s.hh' },
    jungle: { bpm: 112, steps: 32,
      bass: [40,0,40,0,43,0,45,0,40,0,40,0,47,0,45,0,40,0,40,0,43,0,45,0,52,0,50,0,47,0,43,0],
      lead: [64,0,67,0,71,0,69,0,67,0,64,0,62,0,64,0,64,0,67,0,71,0,74,0,72,0,71,0,67,0,64,0],
      drum: 'k.h.s.h.k.h.s.hk.h.s.h.k.hks.h' },
    city: { bpm: 96, steps: 32,
      bass: [45,0,0,45,0,48,0,0,45,0,0,45,0,52,0,50,45,0,0,45,0,48,0,0,53,0,52,0,50,0,48,0],
      lead: [69,0,72,0,76,0,74,0,72,0,69,0,68,0,69,0,69,0,72,0,76,0,79,0,77,0,76,0,72,0,69,0],
      drum: 'k..hs..hk..hs..hk..hs..hk..hshh' },
    fort: { bpm: 128, steps: 32,
      bass: [41,41,0,41,41,0,44,0,41,41,0,41,46,0,44,0,41,41,0,41,41,0,44,0,48,0,46,0,44,0,43,0],
      lead: [65,0,0,68,0,0,72,0,70,0,68,0,65,0,63,0,65,0,0,68,0,0,72,0,75,0,74,0,72,0,70,0],
      drum: 'k.hks.hkk.hks.hkk.hks.hkk.hks.hk' },
    boss: { bpm: 140, steps: 32,
      bass: [38,38,0,38,41,0,38,0,38,38,0,38,44,0,43,0,38,38,0,38,41,0,44,0,46,0,44,0,41,0,38,0],
      lead: [62,0,65,0,69,0,68,0,65,0,62,0,61,0,62,0,62,0,65,0,69,0,74,0,73,0,69,0,65,0,62,0],
      drum: 'k.hks.hkk.hks.hkk.hks.hkk.hks.hk' }
  };

  const Music = {
    cur: null, step: 0, nextT: 0, timer: null,
    play(name) {
      init(); if (!ctx) return;
      this.cur = TRACKS[name] || null; this.step = 0; this.nextT = now() + .1;
      if (!this.timer) this.timer = setInterval(() => this.tick(), 30);
    },
    stop() { this.cur = null; },
    tick() {
      if (!ctx || !this.cur || muted) { if (this.cur) this.nextT = Math.max(this.nextT, now()); return; }
      const spb = 60 / this.cur.bpm / 2;
      while (this.nextT < now() + .14) {
        this.sched(this.cur, this.step, this.nextT, spb);
        this.step = (this.step + 1) % this.cur.steps;
        this.nextT += spb;
      }
    },
    sched(tr, i, t, spb) {
      const dn = tr.drum[i % tr.drum.length];
      if (tr.bass[i]) this.tone(N(tr.bass[i]), t, spb * .9, 'square', .055);
      if (tr.lead[i]) this.tone(N(tr.lead[i]), t, spb * .8, 'square', .030);
      if (dn === 'h') this.tickN(t, .018, 6000);
      else if (dn === 's') this.tickN(t, .05, 1800);
      else if (dn === 'k') this.tone(70, t, .1, 'triangle', .09);
    },
    tone(f, t, dur, type, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur + .02);
    },
    tickN(t, vol, fq) {
      const s = ctx.createBufferSource(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
      s.buffer = noiseBuf; flt.type = 'highpass'; flt.frequency.value = fq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + .05);
      s.connect(flt); flt.connect(g); g.connect(musicGain);
      s.start(t); s.stop(t + .08);
    }
  };

  return { resume, suspendAudio, toggleMute, get muted() { return muted; }, Sfx, Music, get ctx() { return ctx; } };
})();
const Sfx = AudioSys.Sfx, Music = AudioSys.Music;


// ===== js/sprites.js =====
// ============================================================
// sprites.js - 程序化像素美术: 角色/瓦片/背景/字体
// ============================================================

// ---------- 基础构建 ----------
function buildSprite(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch === '.' || ch === ' ') continue;
    g.fillStyle = pal[ch] || '#f0f';
    g.fillRect(x, y, 1, 1);
  }
  c.white = whiteOf(c);
  return c;
}
function whiteOf(c) {
  const w = document.createElement('canvas'); w.width = c.width; w.height = c.height;
  const g = w.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w.width, w.height);
  return w;
}
// 翻转绘制 (屏幕坐标)
function drawSpr(g, img, x, y, flip, white) {
  x = Math.round(x); y = Math.round(y);
  const im = white ? img.white : img;
  if (flip) {
    g.save(); g.translate(x + im.width, y); g.scale(-1, 1);
    g.drawImage(im, 0, 0); g.restore();
  } else g.drawImage(im, x, y);
}
// 种子随机
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return [c, g];
}

// ---------- 3x5 像素字体 ----------
const GLYPH = {
  A: ['010','101','111','101','101'], B: ['110','101','110','101','110'],
  C: ['011','100','100','100','011'], D: ['110','101','101','101','110'],
  E: ['111','100','110','100','111'], F: ['111','100','110','100','100'],
  G: ['011','100','101','101','011'], H: ['101','101','111','101','101'],
  I: ['111','010','010','010','111'], J: ['001','001','001','101','010'],
  K: ['101','110','100','110','101'], L: ['100','100','100','100','111'],
  M: ['101','111','111','101','101'], N: ['110','101','101','101','101'],
  O: ['010','101','101','101','010'], P: ['110','101','110','100','100'],
  Q: ['010','101','101','110','011'], R: ['110','101','110','110','101'],
  S: ['011','100','010','001','110'], T: ['111','010','010','010','010'],
  U: ['101','101','101','101','111'], V: ['101','101','101','101','010'],
  W: ['101','101','111','111','101'], X: ['101','101','010','101','101'],
  Y: ['101','101','010','010','010'], Z: ['111','001','010','100','111'],
  '0': ['111','101','101','101','111'], '1': ['010','110','010','010','111'],
  '2': ['110','001','010','100','111'], '3': ['110','001','010','001','110'],
  '4': ['101','101','111','001','001'], '5': ['111','100','110','001','110'],
  '6': ['011','100','111','101','111'], '7': ['111','001','001','010','010'],
  '8': ['111','101','111','101','111'], '9': ['111','101','111','001','110'],
  '.': ['000','000','000','000','010'], ':': ['000','010','000','010','000'],
  '!': ['010','010','010','000','010'], '-': ['000','000','111','000','000'],
  '+': ['000','010','111','010','000'], '/': ['001','001','010','100','100'],
  '>': ['100','010','001','010','100'], '<': ['001','010','100','010','001'],
  "'": ['010','010','000','000','000'], ',': ['000','000','000','010','100'],
  '?': ['110','001','010','000','010'], '×': ['000','101','010','101','000'],
  ' ': ['000','000','000','000','000']
};
function textW(str, sc) { sc = sc || 1; return str.length * 4 * sc - sc; }
function drawText(g, str, x, y, color, sc) {
  sc = sc || 1; g.fillStyle = color;
  let cx = Math.round(x);
  str = String(str).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const gl = GLYPH[str[i]];
    if (gl) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
      if (gl[r][c] === '1') g.fillRect(cx + c * sc, Math.round(y) + r * sc, sc, sc);
    cx += 4 * sc;
  }
}
function drawTextC(g, str, cx, y, color, sc) { drawText(g, str, cx - textW(str, sc) / 2, y, color, sc); }

// ============================================================
// 角色精灵
// ============================================================
const Sprites = {};

// ---- 玩家: 腿 (16x9) ----
const P_PAL = {
  K: '#141824', O: '#57683a', o: '#7d915252', S: '#e8b98d', V: '#ff8c1a',
  G: '#22262e', g: '#4a5160', B: '#2c3038', P: '#6a4a30', W: '#dfe6ee', A: '#8ba06a'
};
(function buildPlayer() {
  const pal = {
    K: '#141824', O: '#5c6e3c', o: '#89a15e', S: '#e8b98d', V: '#ff8c1a',
    G: '#23262e', g: '#4a5160', B: '#2c3038', P: '#6a4a30', W: '#dfe6ee'
  };
  const legsStand = buildSprite([
    "..KKKK....KKKK..",
    ".KOOOK....KOOOK.",
    ".KOKOK....KOKOK.",
    ".KOKOK....KOKOK.",
    ".KOKSKKKKKKSKOK.",
    ".KBBK......KBBK.",
    ".KBBK......KBBK.",
    ".KBBBK....KBBBK.",
    ".KKKKK....KKKKK."
  ], pal);
  const legsRun0 = buildSprite([
    "..KKKKKKKKKK....",
    ".KOOOK....KOOOK.",
    "KOKOK......KOKOK",
    "KOKK........KOKK",
    "KBBK........KBBK",
    "KBBK........KBBK",
    "KBBBK......KBBBK",
    "KKKK........KKKK",
    "................"
  ], pal);
  const legsRun1 = buildSprite([
    "..KKKKKKKKKK....",
    "..KOOOK.KOOOK...",
    "..KOKOK.KOKOK...",
    "..KOKK..KOKK....",
    "..KBBK.KBBK.....",
    "..KBBK.KBBK.....",
    "..KKKK..KBKK....",
    "................",
    "................"
  ], pal);
  const legsJump = buildSprite([
    "..KKKKKKKKKK....",
    ".KOOOK...KOOOK..",
    ".KOKOK...KOKOK..",
    ".KOKK.....KOKK..",
    "KBBBK.....KBBBK.",
    "KBBK.......KBBK.",
    "KKK.........KKK.",
    "................",
    "................"
  ], pal);

  // ---- 躯干 (26x15): 持枪水平 / 朝上 / 朝下 ----
  const torsoFwd = buildSprite([
    "......KKKKKK",
    ".....KOOOOOOK",
    "....KOOOOOOOOK",
    "....KOOOOOSSSK",
    "....KOVVVVSSSK",
    "....KOOOOOSSSK",
    ".....KOOOSSSK",
    "....KKOOOOOKK",
    "...KKKOOOOOKKK",
    "..KPPKOOOOOKPPK",
    ".KPPKOoOoOOKSSKGGGGGGGGGGGW",
    ".KPPK.OoOoOKSSGGGGGGGGGGGG.",
    "..KKK.KGGGK..............",
    "....KOOOOOOK",
    ".....KKKKK"
  ], pal);
  const torsoUp = buildSprite([
    "............GW",
    "............GG",
    "............GG",
    "............GG",
    "......KKKKKKGg",
    ".....KOOOOOKGG",
    "....KOOSSSSKGg",
    "....KOVVSSSKSS",
    "...KKOOOOOKSSK",
    "..KPPKOoOOKSK",
    "..KPPKOoOoOK.",
    "...KKKOOOOK..",
    "....KOOOOOOK",
    "....KOOOOOOK",
    ".....KKKKK"
  ], pal);
  const torsoDown = buildSprite([
    "......KKKKKK",
    ".....KOOOOOOK",
    "....KOOOOOOOOK",
    "....KOOOOOSSSK",
    "....KOVVVVSSSK",
    "....KOOOOOSSSK",
    ".....KOOOSSSK",
    "....KKOOOOOKK",
    "...KKKOOOOOKKK",
    "..KPPKOoOOOKSSK",
    "..KPPKOoOoOKSGG",
    ".KPPK.OoOoOKSGG",
    "..KKK.KOOOK.KGg",
    "...........KGG",
    "............GW"
  ], pal);

  Sprites.player = {
    legs: [legsStand, legsRun0, legsRun1, legsJump],
    torso: { f: torsoFwd, u: torsoUp, d: torsoDown }
  };
})();

// ---- 敌兵 (18x22) ----
(function buildGrunt() {
  const pal = {
    K: '#14161e', N: '#5f6672', n: '#8b93a1', R: '#c8383a', S: '#d8a878',
    G: '#262a32', g: '#464c58', W: '#e8ecf2'
  };
  const head = [
    ".....KKKKKK",
    "....KNNNNNNK",
    "....KRRRRRNK",
    "....KNNNSSSK",
    "....KNnSSSK",
    ".....KNSSSK",
    "....KKNNNNKK"
  ];
  const g0 = buildSprite([...head,
    "...KKNNNNNNKK",
    "..KNKNNnNNKNKGGG",
    "..KNK.NNnN.KSSGG",
    "..KNK.NNnN.KGGGG",
    "..KKK.NNnN.KKK",
    ".....NNnNN",
    "....NNNNNNN",
    "....KNNK.KNNK",
    "....KNNK.KNNK",
    "...KNNK...KNNK",
    "...KNNK...KNNK",
    "...KGGK...KGGK",
    "..KGGGK...KGGGK",
    "..KKKKK...KKKKK"
  ], pal);
  const g1 = buildSprite([...head,
    "...KKNNNNNNKK",
    "..KNKNNnNNKNKGGG",
    "..KNK.NNnN.KSSGG",
    "..KNK.NNnN.KGGGG",
    "..KKK.NNnN.KKK",
    ".....NNnNN",
    "....NNNNNNN",
    ".....KNNNKK",
    ".....KNNKNNK",
    "....KNNK.KNNK",
    "....KGGK..KGGK",
    "...KGGGK..KGGK",
    "...KKKKK..KKKK"
  ], pal);
  const gFire = buildSprite([...head,
    "...KKNNNNNNKK",
    "..KNKNNnNNKNKK",
    "..KNK.NNnN.KSSKGGGGGGGGGW",
    "..KNK.NNnN.KSSGGGGGGGGGG.",
    "..KKK.NNnN.KKK",
    ".....NNnNN",
    "....NNNNNNN",
    "....KNNNKKNNK",
    "...KNNK..KNNK",
    "...KNNK...KNNK",
    "...KGGK...KGGK",
    "..KGGGK...KGGGK",
    "..KKKKK...KKKKK"
  ], pal);
  Sprites.grunt = { n: [g0, g1, gFire], e: null };
})();
// grunt 帧行数据 (供精英配色重建)
const GRUNT_ROWS_0 = [
  ".....KKKKKK", "....KNNNNNNK", "....KRRRRRNK", "....KNNNSSSK", "....KNnSSSK",
  ".....KNSSSK", "....KKNNNNKK", "...KKNNNNNNKK", "..KNKNNnNNKNKGGG", "..KNK.NNnN.KSSGG",
  "..KNK.NNnN.KGGGG", "..KKK.NNnN.KKK", ".....NNnNN", "....NNNNNNN", "....KNNK.KNNK",
  "....KNNK.KNNK", "...KNNK...KNNK", "...KNNK...KNNK", "...KGGK...KGGK",
  "..KGGGK...KGGGK", "..KKKKK...KKKKK"
];
const GRUNT_ROWS_1 = [
  ".....KKKKKK", "....KNNNNNNK", "....KRRRRRNK", "....KNNNSSSK", "....KNnSSSK",
  ".....KNSSSK", "....KKNNNNKK", "...KKNNNNNNKK", "..KNKNNnNNKNKGGG", "..KNK.NNnN.KSSGG",
  "..KNK.NNnN.KGGGG", "..KKK.NNnN.KKK", ".....NNnNN", "....NNNNNNN", ".....KNNNKK",
  ".....KNNKNNK", "....KNNK.KNNK", "....KGGK..KGGK", "...KGGGK..KGGK", "...KKKKK..KKKK"
];
const GRUNT_ROWS_F = [
  ".....KKKKKK", "....KNNNNNNK", "....KRRRRRNK", "....KNNNSSSK", "....KNnSSSK",
  ".....KNSSSK", "....KKNNNNKK", "...KKNNNNNNKK", "..KNKNNnNNKNKK", "..KNK.NNnN.KSSKGGGGGGGGGW",
  "..KNK.NNnN.KSSGGGGGGGGGG.", "..KKK.NNnN.KKK", ".....NNnNN", "....NNNNNNN", "....KNNNKKNNK",
  "...KNNK..KNNK", "...KNNK...KNNK", "...KGGK...KGGK", "..KGGGK...KGGGK", "..KKKKK...KKKKK"
];
(function buildGruntElite() {
  const elitePal = {
    K: '#14161e', N: '#6d3d86', n: '#9a63bd', R: '#f5c542', S: '#d8a878',
    G: '#262a32', g: '#464c58', W: '#e8ecf2'
  };
  Sprites.grunt.e = [
    buildSprite(GRUNT_ROWS_0, elitePal),
    buildSprite(GRUNT_ROWS_1, elitePal),
    buildSprite(GRUNT_ROWS_F, elitePal)
  ];
})();

// ---- 冲锋兵 (16x20) ----
(function buildRunner() {
  const pal = { K: '#181420', N: '#8a4a3a', n: '#b56a50', R: '#e8382e', S: '#d8a878', G: '#262a32' };
  const r0 = buildSprite([
    ".....KKKKKK",
    "....KNNNNNNK",
    "....KRRRRRNK",
    "....KNNNSSSK",
    "....KNnNSSK",
    ".....KNSSK",
    "...KKNNNNKK",
    "..KNNKNNNNK",
    ".KNNNKnnnNK.G",
    ".KNNNKnnnNKGG",
    "..KKKNnNNKGG",
    "....KNnNNK",
    "....KNNNNK",
    "...KNNK.KNNK",
    "..KNNK...KNNK",
    "..KNNK...KNNK",
    ".KNNK.....KNNK",
    ".KGGK.....KGGK",
    "KGGGK......KGGGK",
    "KKKKK......KKKKK"
  ], pal);
  const r1 = buildSprite([
    ".....KKKKKK",
    "....KNNNNNNK",
    "....KRRRRRNK",
    "....KNNNSSSK",
    "....KNnNSSK",
    ".....KNSSK",
    "...KKNNNNKK",
    "..KNNKNNNNK",
    ".KNNNKnnnNK.G",
    ".KNNNKnnnNKGG",
    "..KKKNnNNKGG",
    "....KNnNNK",
    "....KNNNNK",
    ".....KNNNK",
    ".....KNNKNNK",
    "....KNNK.KNK",
    "....KGGK.KGGK",
    "...KGGGK.KGGK",
    "...KKKKK.KKKK",
    "................"
  ], pal);
  Sprites.runner = [r0, r1];
})();

// ---- 无人机 (16x10) ----
(function buildDrone() {
  const pal = { K: '#14161e', d: '#3a4150', D: '#5c6577', R: '#ff3b30', g: '#78829a', C: '#9fe8ff' };
  const body = buildSprite([
    "....KKKKKKKK",
    "...KddddddddK",
    "..KdDDDDDDddK",
    ".KdDDRDDDDDdK",
    ".KddddddddddK",
    "..KddKKKKddK",
    "...KK....KK"
  ], pal);
  Sprites.drone = body;
})();

// ---- 炮塔 (16x12) ----
(function buildTurret() {
  const pal = { K: '#14161e', d: '#414a3a', D: '#6a775a', R: '#ff4838', Y: '#c9a53c' };
  Sprites.turret = buildSprite([
    "....KKKKKKKK",
    "...KddddddddK",
    "..KdDDDDDDddK",
    ".KdDDRDDDDDdK",
    ".KdDDDDDDDdK",
    ".KddddddddddK",
    "KKddKKddKKddKK",
    "KKKK.KK.KK.KKKK"
  ], pal);
})();

// ---- 迫击炮 (16x12) ----
(function buildCannon() {
  const pal = { K: '#14161e', d: '#3d444e', D: '#5f6874', Y: '#c9a53c', g: '#78829a' };
  Sprites.cannon = buildSprite([
    "..........KK",
    ".........KggK",
    "........KggK",
    "...KKKKKKgK",
    "..KdddddDK",
    ".KdDDDDDdK",
    ".KdDYYDDdK",
    ".KdDDDDDdK",
    ".KdddddddK",
    ".KKKKKKKKK",
    ".Kd.....dK",
    ".KKK...KKK"
  ], pal);
})();

// ---- 沙包射手 (18x22) ----
(function buildShooter() {
  const pal = { K: '#14161e', N: '#4a5a6a', n: '#71869a', R: '#e8382e', S: '#d8a878', G: '#262a32', W: '#dfe6ee' };
  Sprites.shooter = buildSprite([
    ".....KKKKKK",
    "....KNNNNNNK",
    "....KNNNSSSK",
    "....KNnSSSSK",
    ".....KNSKK",
    "....KKNNNKK",
    "...KKNNNNNKK",
    "..KNKnnnnNKNK",
    "..KNK.nnn.KSSKGGGGGGGGGW",
    "..KNK.nnn.KSSGGGGGGGGG.",
    "..KKK.nnn.KKK",
    ".....KnnnK",
    "....KNNNNNK",
    "....KNNNNK",
    "....KNNNK",
    "...KKNNKK",
    "..KNNNKNNNK",
    ".KNNNKKKNNNK",
    ".KNNK...KNNK",
    ".KGGK...KGGK",
    "KGGGK...KGGGK",
    "KKKKK...KKKKK"
  ], pal);
})();

// ---- 木箱 (14x14) ----
(function buildCrate() {
  const pal = { K: '#1c1410', W: '#8a5a33', w: '#6d451f', L: '#a5744a', d: '#4f3018' };
  Sprites.crate = buildSprite([
    "KKKKKKKKKKKKKK",
    "KWLLLLLLLLLLwK",
    "KwWWWWWWWWWWwK",
    "KWWdWWWWWWdWK",
    "KWWWWdWWdWWWK",
    "KWWWWWddWWWWK",
    "KWdWWWdWWdWWK",
    "KWWdWWWWWWdWK",
    "KwWWWWWWWWWWwK",
    "KWwwwwwwwwwwWK",
    "KWWWWWWWWWWWWK",
    "KwWWWWWWWWWWwK",
    "KWLLLLLLLLLLwK",
    "KKKKKKKKKKKKKK"
  ], pal);
})();

// ---- 补给品 ----
(function buildPickups() {
  Sprites.med = buildSprite([
    "KKKKKKKKKKKK",
    "KWWWWRRWWWWK",
    "KWWWWRRWWWWK",
    "KWRRRRRRRRWK",
    "KWRRRRRRRRWK",
    "KWWWWRRWWWWK",
    "KWWWWRRWWWWK",
    "KKKKKKKKKKKK"
  ], { K: '#1a1c24', W: '#f0f4f8', R: '#e8382e' });
  Sprites.nade = buildSprite([
    "....KK.KK",
    "...KgK.KgK",
    "..KGGKKGGK",
    ".KGGGKGGGK",
    ".KGgGKGgGK",
    ".KGGGKGGGK",
    ".KGGGKGGGK",
    "..KKK.KKK"
  ], { K: '#181c18', G: '#4a6a38', g: '#7ba35c' });
  Sprites.gem = buildSprite([
    "....C",
    "...CCC",
    "..CCWCC",
    ".CCWWWCC",
    "CCCWWCCCC",
    ".CCWWWCC",
    "..CCWCC",
    "...CCC",
    "....C"
  ], { C: '#38d1e0', W: '#c8f8ff' });
  Sprites.life = buildSprite([
    "KKKKKKKK",
    "KRRRRRRK",
    "KRWWRRRK",
    "KRWRRRRK",
    "KRRRRRRK",
    "KRRRRRRK",
    ".KRRRRK.",
    "..KKKK"
  ], { K: '#1a1c24', R: '#ff5a3c', W: '#ffd9c8' });
  Sprites.wS = buildSprite([
    "KKKKKKKKKK",
    "KGGGGGGGGK",
    "KGgGGgGGgK",
    "KGggGGggGK",
    "KGgGGgGGgK",
    "KGGGGGGGGK",
    "KKKKKKKKKK"
  ], { K: '#1a1c24', G: '#3a4150', g: '#ff9a2a' });
  Sprites.wH = Sprites.wH || buildSprite([
    "KKKKKKKKKK",
    "KGGGGGGGGK",
    "KGgGgGgGgK",
    "KGgGgGgGgK",
    "KGgGgGgGgK",
    "KGGGGGGGGK",
    "KKKKKKKKKK"
  ], { K: '#1a1c24', G: '#3a4150', g: '#5ad1ff' });
})();

// ---- UI 小件 ----
(function buildUI() {
  const hp = { R: '#ff3b55', P: '#ffb3c0', K: '#2a0c14' };
  Sprites.heartFull = buildSprite([
    ".RR..RR.",
    "RRRRRRRR",
    "RPRRRRRR",
    "RRRRRRRR",
    ".RRRRRR.",
    "..RRRR..",
    "...RR..."
  ], hp);
  Sprites.heartEmpty = buildSprite([
    ".KK..KK.",
    "KKKKKKKK",
    "KKKKKKKK",
    "KKKKKKKK",
    ".KKKKKK.",
    "..KKKK..",
    "...KK..."
  ], hp);
  Sprites.face = buildSprite([
    "..KKKKK",
    ".KOOOOK",
    "KOOOOOK",
    "KOVVSOK",
    "KOOOOOK",
    ".KOOOK",
    "..KKK"
  ], { K: '#141824', O: '#5c6e3c', V: '#ff8c1a', S: '#e8b98d' });
  Sprites.flag = buildSprite([
    "KRRRRRRW",
    "KRRRRRRW",
    "KRRRRWRR",
    "KRRRRRRW",
    ".KKKKKK"
  ], { K: '#d8dce4', R: '#ff5a3c', W: '#ffd9c8' });
})();

// ============================================================
// 瓦片集 (按主题)
// ============================================================
function makeTileset(theme) {
  const T = {};
  const [top, tg] = mkCanvas(16, 16);
  const [inn, ig] = mkCanvas(16, 16);
  const [plat, pg] = mkCanvas(16, 16);
  const [spike, sg] = mkCanvas(16, 16);
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  let rnd = mulberry32(theme === 'jungle' ? 11 : theme === 'city' ? 22 : 33);

  if (theme === 'jungle') {
    // 草皮顶
    R(tg, 0, 0, 16, 4, '#4e9a3a'); R(tg, 0, 0, 16, 1, '#79c95c');
    for (let i = 0; i < 6; i++) R(tg, (rnd() * 15) | 0, 1 + (rnd() * 2) | 0, 1, 2, '#3b7a2c');
    R(tg, 0, 4, 16, 12, '#6b4a2f'); R(tg, 0, 4, 16, 1, '#57391f');
    for (let i = 0; i < 5; i++) R(tg, 1 + (rnd() * 13) | 0, 6 + (rnd() * 8) | 0, 2, 2, '#7d583a');
    for (let i = 0; i < 4; i++) R(tg, (rnd() * 14) | 0, 6 + (rnd() * 9) | 0, 2, 1, '#4a3018');
    // 内部
    R(ig, 0, 0, 16, 16, '#63452b');
    for (let i = 0; i < 6; i++) R(ig, (rnd() * 13) | 0, (rnd() * 13) | 0, 2 + (rnd() * 2) | 0, 2, '#755538');
    for (let i = 0; i < 5; i++) R(ig, (rnd() * 14) | 0, (rnd() * 14) | 0, 2, 1, '#4e341d');
    R(ig, 0, 0, 16, 1, '#57391f');
    // 木平台
    R(pg, 0, 0, 16, 5, '#8a5a33'); R(pg, 0, 0, 16, 1, '#a5744a'); R(pg, 0, 4, 16, 1, '#5e3a1c');
    R(pg, 7, 1, 1, 3, '#5e3a1c'); R(pg, 15, 1, 1, 3, '#5e3a1c');
    // 尖刺
    R(sg, 0, 12, 16, 4, '#63452b'); R(sg, 0, 12, 16, 1, '#57391f');
    for (let i = 0; i < 4; i++) {
      const bx = i * 4;
      R(sg, bx + 1, 6, 1, 6, '#aab4c4'); R(sg, bx + 2, 4, 1, 8, '#d7dfe8'); R(sg, bx + 3, 6, 1, 6, '#8892a2');
    }
  } else if (theme === 'city') {
    // 混凝土顶
    R(tg, 0, 0, 16, 3, '#9aa0aa'); R(tg, 0, 0, 16, 1, '#c4cad2');
    R(tg, 0, 3, 16, 13, '#6e747e');
    for (let i = 0; i < 4; i++) R(tg, (rnd() * 12) | 0, 5 + (rnd() * 9) | 0, 2 + (rnd() * 2) | 0, 1, '#5a606a');
    R(tg, 3, 6, 1, 7, '#5a606a'); R(tg, 10, 4, 1, 5, '#5a606a'); R(tg, 4, 12, 6, 1, '#5a606a');
    for (let i = 0; i < 3; i++) R(tg, (rnd() * 14) | 0, (rnd() * 12 + 3) | 0, 1, 1, '#8c929c');
    R(ig, 0, 0, 16, 16, '#676d77');
    for (let i = 0; i < 5; i++) R(ig, (rnd() * 12) | 0, (rnd() * 14) | 0, 3, 1, '#585e68');
    R(ig, 0, 0, 16, 1, '#565c66');
    R(ig, 0, 15, 16, 1, '#585e68');
    // 钢梁平台
    R(pg, 0, 0, 16, 5, '#5a6270'); R(pg, 0, 0, 16, 1, '#8a94a4'); R(pg, 0, 4, 16, 1, '#3c424e');
    R(pg, 2, 1, 1, 3, '#3c424e'); R(pg, 13, 1, 1, 3, '#3c424e'); R(pg, 7, 2, 2, 1, '#c9a53c');
    // 尖刺
    R(sg, 0, 12, 16, 4, '#676d77');
    for (let i = 0; i < 4; i++) {
      const bx = i * 4;
      R(sg, bx + 1, 6, 1, 6, '#98a2b2'); R(sg, bx + 2, 3, 1, 9, '#c8d2e0'); R(sg, bx + 2, 3, 1, 3, '#eef4fc');
    }
  } else {
    // 要塞金属顶 (警示条)
    R(tg, 0, 0, 16, 3, '#454c5a'); R(tg, 0, 0, 16, 1, '#6a7386');
    for (let i = 0; i < 4; i++) { R(tg, i * 4, 1, 2, 2, '#c9a53c'); }
    R(tg, 0, 3, 16, 13, '#39404e');
    R(tg, 0, 3, 16, 1, '#2c3240');
    for (let i = 0; i < 3; i++) R(tg, 2 + (rnd() * 11) | 0, 5 + (rnd() * 8) | 0, 2, 2, '#434b5c');
    R(tg, 1, 5, 1, 1, '#6a7386'); R(tg, 14, 9, 1, 1, '#6a7386');
    R(ig, 0, 0, 16, 16, '#363d4a');
    R(ig, 0, 0, 16, 1, '#2a303c'); R(ig, 0, 15, 16, 1, '#2a303c');
    R(ig, 0, 0, 1, 16, '#2a303c'); R(ig, 15, 0, 1, 16, '#2a303c');
    R(ig, 2, 2, 1, 1, '#525c70'); R(ig, 13, 2, 1, 1, '#525c70');
    R(ig, 2, 13, 1, 1, '#525c70'); R(ig, 13, 13, 1, 1, '#525c70');
    if (rnd() < .5) { R(ig, 6, 6, 4, 4, '#1c2130'); R(ig, 7, 7, 2, 2, '#37e0c8'); }
    // 金属平台
    R(pg, 0, 0, 16, 5, '#4a5262'); R(pg, 0, 0, 16, 1, '#79839a'); R(pg, 0, 4, 16, 1, '#2c3240');
    R(pg, 1, 1, 1, 3, '#2c3240'); R(pg, 14, 1, 1, 3, '#2c3240');
    // 尖刺 (通电)
    R(sg, 0, 12, 16, 4, '#363d4a');
    for (let i = 0; i < 4; i++) {
      const bx = i * 4;
      R(sg, bx + 1, 6, 1, 6, '#5c7a86'); R(sg, bx + 2, 3, 1, 9, '#37e0c8'); R(sg, bx + 2, 3, 1, 4, '#c8fff8');
    }
  }
  T['#'] = { top, inn };
  T['='] = plat; T['^'] = spike;
  return T;
}

// ============================================================
// 视差背景 + 地面装饰
// ============================================================
function paintBG(g, camX, theme, t) {
  const W = 480, H = 270;
  const sky = g.createLinearGradient(0, 0, 0, H);
  if (theme === 'jungle') {
    sky.addColorStop(0, '#3d8ec9'); sky.addColorStop(.55, '#7cc4e8'); sky.addColorStop(1, '#c8ecd8');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // 太阳
    g.fillStyle = '#fff3c8'; g.beginPath(); g.arc(400, 46, 17, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,243,200,.25)'; g.beginPath(); g.arc(400, 46, 24, 0, 7); g.fill();
    // 云
    drawClouds(g, camX * .08, t, '#ffffff', .8);
    // 远山
    hills(g, camX * .18, 168, '#3a7d59', 90, 42);
    hills(g, camX * .32, 192, '#2c6347', 60, 34);
    // 远处丛林冠层
    canopy(g, camX * .45, 210, '#1f4a35');
  } else if (theme === 'city') {
    sky.addColorStop(0, '#2a2140'); sky.addColorStop(.5, '#6b3a5c'); sky.addColorStop(.82, '#c96a4a'); sky.addColorStop(1, '#e8925a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd9a0'; g.beginPath(); g.arc(150, 150, 26, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,217,160,.2)'; g.beginPath(); g.arc(150, 150, 36, 0, 7); g.fill();
    drawClouds(g, camX * .06, t, '#3d2c50', 1);
    skyline(g, camX * .16, 120, '#241b38', 90, 4, 21);
    skyline(g, camX * .3, 150, '#33244d', 70, 3, 17, true);
  } else {
    sky.addColorStop(0, '#05070f'); sky.addColorStop(1, '#101a30');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // 星
    const rs = mulberry32(7);
    for (let i = 0; i < 40; i++) {
      const x = (rs() * 960) % 480, y = rs() * 150;
      g.fillStyle = (i % 5 === Math.floor(t / 30) % 5) ? '#fff' : '#8a94b0';
      g.fillRect((x - camX * .04 + 960) % 480, y, 1, 1);
    }
    g.fillStyle = '#dfe6f4'; g.beginPath(); g.arc(390, 42, 12, 0, 7); g.fill();
    g.fillStyle = '#b9c2d8'; g.beginPath(); g.arc(386, 40, 3, 0, 7); g.fill();
    g.beginPath(); g.arc(394, 46, 2, 0, 7); g.fill();
    // 巨墙
    const wx = -(camX * .2) % 64;
    g.fillStyle = '#141a28';
    for (let x = wx - 64; x < 480; x += 64) { g.fillRect(x, 40, 62, 240); }
    g.fillStyle = '#1b2336';
    const wx2 = -(camX * .35) % 48;
    for (let x = wx2 - 48; x < 480; x += 48) {
      g.fillRect(x, 100, 46, 180);
      const rs2 = mulberry32(Math.floor((x + camX * .35) / 48) * 13 + 5);
      if (rs2() < .3) { g.fillStyle = Math.floor(t / 20) % 2 ? '#ff7a2a' : '#a33f14'; g.fillRect(x + 20, 118, 6, 10); g.fillStyle = '#1b2336'; }
    }
    g.fillStyle = '#0c111c'; g.fillRect(0, 196, 480, 80);
  }
}
function drawClouds(g, off, t, color, alpha) {
  g.globalAlpha = alpha; g.fillStyle = color;
  const rs = mulberry32(4);
  for (let i = 0; i < 5; i++) {
    const bx = rs() * 640, by = 24 + rs() * 60, s = .7 + rs() * .8;
    const x = ((bx - off) % 640 + 640) % 640 - 80;
    g.fillRect(x, by, 44 * s, 8 * s); g.fillRect(x + 8 * s, by - 5 * s, 26 * s, 6 * s); g.fillRect(x + 5 * s, by + 6 * s, 30 * s, 5 * s);
  }
  g.globalAlpha = 1;
}
function hills(g, off, baseY, color, amp, wl) {
  g.fillStyle = color; g.beginPath(); g.moveTo(0, 270);
  const o = off * .5;
  for (let x = 0; x <= 480; x += 8) {
    const y = baseY - Math.abs(Math.sin((x + o) / wl)) * amp - Math.sin((x + o) / (wl * .37)) * amp * .3;
    g.lineTo(x, y);
  }
  g.lineTo(480, 270); g.closePath(); g.fill();
}
function canopy(g, off, baseY, color) {
  g.fillStyle = color; g.fillRect(0, baseY + 14, 480, 270 - baseY);
  const o = off;
  for (let x = -20; x < 500; x += 14) {
    const y = baseY + Math.sin((x + o) * .8) * 3 + Math.sin((x + o) * .23) * 5;
    g.beginPath(); g.arc((x + 48000 - o % 14) % 520 - 20, y, 9, Math.PI, 0); g.fill();
  }
}
function skyline(g, off, baseY, color, amp, winW, bh, lit) {
  const rs = mulberry32(9);
  g.fillStyle = color;
  const step = winW;
  const start = Math.floor(off / step) - 1;
  for (let i = start; i < start + 480 / step + 3; i++) {
    const r1 = mulberry32(i * 31 + 7);
    const hgt = bh + r1() * amp;
    const x = i * step - off;
    g.fillRect(x, baseY + (90 - hgt), step - 3, hgt + 200);
    if (r1() < .3) g.fillRect(x + step / 2 - 1, baseY + (90 - hgt) - 8, 2, 8); // 天线
    if (lit) {
      const r2 = mulberry32(i * 53 + 3);
      for (let wy = 0; wy < 8; wy++) for (let wx = 0; wx < 3; wx++) {
        if (r2() < .18) { g.fillStyle = Math.floor((i + wy + wx) % 3) ? '#e8b34a' : '#8a6a2a'; g.fillRect(x + 2 + wx * 5, baseY + 96 - hgt + 4 + wy * 9, 3, 4); g.fillStyle = color; }
      }
    }
  }
}

// 地面装饰精灵
function makeDecor(theme) {
  const list = [];
  const [c1, g1] = mkCanvas(30, 40); // 棕榈/灯柱/管道
  const [c2, g2] = mkCanvas(22, 12); // 灌木/碎石/通风口
  const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (theme === 'jungle') {
    R(g1, 13, 6, 4, 34, '#4a3520'); R(g1, 14, 6, 1, 34, '#6b4e2e');
    for (let i = 0; i < 6; i++) R(g1, 12 + (i % 2), 8 + i * 5, 3, 1, '#3a2818');
    const fr = ['#2f6e3c', '#3c8a4a', '#2a5f34'];
    for (let a = 0; a < 5; a++) {
      const ang = -Math.PI / 2 + (a - 2) * .6;
      for (let r = 6; r < 14; r += 2) {
        const x = 15 + Math.cos(ang) * r, y = 8 + Math.sin(ang) * r * .7;
        R(g1, x - 2, y, 4, 2, fr[a % 3]);
      }
    }
    R(g1, 10, 6, 10, 3, '#2a5f34');
    R(g2, 2, 4, 18, 8, '#2c6347'); R(g2, 5, 2, 8, 4, '#3c8a4a'); R(g2, 13, 3, 6, 3, '#357a42');
    R(g2, 4, 9, 4, 3, '#1f4a35'); R(g2, 12, 8, 5, 4, '#1f4a35');
  } else if (theme === 'city') {
    R(g1, 5, 4, 3, 36, '#3c424e'); R(g1, 2, 0, 10, 5, '#5a6270');
    R(g1, 10, 2, 6, 2, '#5a6270'); R(g1, 14, 0, 4, 3, '#c9a53c'); // 断路灯
    R(g2, 0, 6, 8, 6, '#5a606a'); R(g2, 6, 3, 7, 9, '#4c525c'); R(g2, 12, 7, 9, 5, '#565c66');
    R(g2, 3, 4, 3, 3, '#6e747e'); R(g2, 14, 5, 4, 3, '#6e747e');
  } else {
    R(g1, 8, 0, 10, 40, '#2c3240'); R(g1, 9, 0, 2, 40, '#434b5c'); R(g1, 6, 6, 14, 3, '#1c2130'); R(g1, 6, 26, 14, 3, '#1c2130');
    R(g2, 2, 2, 18, 10, '#2c3240'); R(g2, 4, 4, 14, 3, '#1c2130');
    for (let i = 0; i < 4; i++) R(g2, 4 + i * 4, 5, 2, 1, '#37e0c8');
  }
  list.push(c1, c2);
  return [c1, c2];
}

// CRT 扫描线 + 暗角
const Overlay = (() => {
  const [c, g] = mkCanvas(480, 270);
  g.fillStyle = 'rgba(0,0,0,.10)';
  for (let y = 0; y < 270; y += 2) g.fillRect(0, y, 480, 1);
  const vg = g.createRadialGradient(240, 135, 120, 240, 135, 300);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.38)');
  g.fillStyle = vg; g.fillRect(0, 0, 480, 270);
  return c;
})();


// ===== js/levels.js =====
// ============================================================
// levels.js - 关卡数据 (建造器 API, 避免手写 ASCII 错位)
// 图例: '#'实心 '='单向平台 '^'尖刺
// 实体: P出生 X木箱 F检查点 B Boss触发
//       1步兵 2冲锋兵 3无人机 4炮塔 5沙包射手 6迫击炮
// ============================================================
const TILE = 16, ROWS = 17;

function LevelBuilder(w) {
  const g = [...Array(ROWS)].map(() => Array(w).fill('.'));
  const api = {
    g, w,
    ground(x0, x1, top) {
      top = top === undefined ? 14 : top;
      for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) g[y][x] = '#';
    },
    plat(x0, x1, y) { for (let x = x0; x <= x1; x++) g[y][x] = '='; },
    spikes(x0, x1, y) { y = y === undefined ? 13 : y; for (let x = x0; x <= x1; x++) g[y][x] = '^'; },
    ceiling(x0, x1, rows) { for (let x = x0; x <= x1; x++) for (let y = 0; y < rows; y++) g[y][x] = '#'; },
    wall(x, y0, y1) { for (let y = y0; y <= y1; y++) g[y][x] = '#'; },
    put(ch, x, y) { g[y][x] = ch; }
  };
  return api;
}

// ---------------- 第 1 关: 丛林突击 ----------------
function buildLevel1() {
  const W = 176, L = LevelBuilder(W);
  L.ground(0, 26, 14);                       // 起步高地
  L.put('P', 3, 12);
  L.put('X', 10, 12);
  L.ground(18, 26, 12);                      // 上台阶
  L.ground(27, 33, 14); L.put('1', 29, 12);  // 下坡 + 步兵
  // 坑 34-36
  L.ground(37, 52, 14);
  L.put('X', 44, 12); L.put('X', 47, 12); L.put('1', 49, 12);
  L.ground(53, 57, 11); L.put('4', 55, 9);   // 炮塔土丘
  L.ground(58, 63, 14); L.put('2', 60, 12);
  // 坑 64-67, 带浮板
  L.plat(65, 66, 12);
  L.ground(68, 86, 14);
  L.plat(72, 75, 11); L.put('X', 73, 10);
  L.plat(78, 81, 9);  L.put('X', 79, 8);
  L.put('3', 74, 5); L.put('3', 82, 5);
  L.put('F', 84, 12);                        // 检查点 1
  L.ground(87, 90, 13); L.put('1', 88, 11);  // 阶梯上
  L.ground(91, 94, 12); L.put('1', 92, 10);
  L.ground(95, 101, 14);
  // 坑 102-104
  L.ground(105, 122, 14);
  L.put('4', 108, 12);
  L.put('2', 113, 12);
  L.put('X', 116, 12); L.put('X', 119, 12);
  L.plat(110, 113, 9); L.put('5', 111, 8);   // 高台射手
  L.ground(123, 131, 14); L.spikes(124, 129);
  L.plat(123, 125, 11); L.plat(127, 131, 11);// 尖刺桥
  L.ground(132, 149, 14);
  L.put('F', 134, 12);                       // 检查点 2
  L.put('3', 138, 5); L.put('3', 144, 5);
  L.put('1', 140, 12); L.put('1', 146, 12);
  L.put('X', 148, 12);
  // Boss 战区
  L.ground(150, 175, 14);
  L.wall(175, 4, 13);
  L.plat(154, 157, 11); L.plat(165, 168, 11);
  L.put('B', 151, 12);
  return {
    W, grid: L.g, theme: 'jungle', music: 'jungle',
    name: 'JUNGLE STRIKE', sub: 'MISSION 01 - BEACHHEAD LANDING',
    bossType: 1,
    hints: [
      { x: 6 * TILE, lines: ['MOVE: ARROWS / A D', 'JUMP: SPACE / Z'] },
      { x: 39 * TILE, lines: ['FIRE: J / X', 'GRENADE: K / C'] }
    ]
  };
}

// ---------------- 第 2 关: 城市废墟 ----------------
function buildLevel2() {
  const W = 192, L = LevelBuilder(W);
  L.ground(0, 18, 14); L.put('P', 3, 12); L.put('X', 8, 12);
  L.plat(8, 11, 11);
  L.ground(12, 18, 8); L.put('5', 15, 6);    // 楼顶射手
  L.ground(19, 30, 14); L.put('6', 24, 12); L.put('1', 27, 12);
  // 坑 31-33
  L.ground(34, 48, 14);
  L.ground(40, 42, 11); L.put('4', 41, 9);   // 掩体炮塔
  L.put('1', 46, 12);
  L.plat(45, 47, 11);
  L.ground(49, 55, 10); L.put('F', 51, 8);   // 高台检查点
  L.put('3', 54, 5);
  // 坑 56-59
  L.plat(57, 58, 12);
  L.ground(60, 78, 14);
  L.plat(63, 65, 11); L.put('X', 64, 10);
  L.plat(67, 69, 9);  L.put('5', 68, 8);
  L.plat(71, 73, 11); L.put('X', 72, 10);
  L.put('2', 76, 12);
  L.plat(72, 74, 11);   // 上楼路线: 地面→11层→9层→楼顶
  L.ground(79, 84, 7); L.put('5', 82, 5);    // 高楼废墟
  L.plat(76, 78, 9);
  // 坑 85-88
  L.plat(86, 87, 12);
  L.ground(89, 108, 14);
  L.put('1', 92, 12); L.put('1', 97, 12); L.put('1', 102, 12);
  L.put('4', 99, 12);
  L.spikes(94, 96);
  L.put('X', 105, 12);
  L.ground(109, 116, 11); L.put('6', 112, 9);// 碎石高台迫击炮
  // 坑 117-119
  L.ground(120, 141, 14);
  L.put('F', 121, 12);
  L.put('2', 124, 12); L.put('2', 126, 12); L.put('2', 128, 12);
  L.put('3', 130, 5); L.put('3', 134, 5);
  L.plat(132, 135, 9); L.put('5', 133, 8);
  L.put('X', 137, 12);
  L.ground(142, 152, 14); L.spikes(143, 150);
  L.plat(142, 144, 11); L.plat(147, 149, 11);// 尖刺长桥
  L.ground(153, 165, 14);
  L.put('1', 156, 12); L.put('1', 160, 12); L.put('4', 163, 12);
  // Boss 战区
  L.ground(166, 191, 14);
  L.wall(191, 3, 13);
  L.plat(170, 173, 11); L.plat(180, 183, 11);
  L.put('B', 168, 12);
  return {
    W, grid: L.g, theme: 'city', music: 'city',
    name: 'RUINED CITY', sub: 'MISSION 02 - SECTOR 9 PUSH',
    bossType: 2,
    hints: [{ x: 20 * TILE, lines: ['WARNING: MORTAR FIRE', 'KEEP MOVING!'] }]
  };
}

// ---------------- 第 3 关: 钢铁要塞 ----------------
function buildLevel3() {
  const W = 176, L = LevelBuilder(W);
  L.ceiling(6, 146, 5);                      // 通道顶
  L.ground(0, 30, 14); L.put('P', 3, 12);
  L.put('4', 10, 12); L.put('1', 16, 12); L.put('X', 20, 12); L.put('3', 24, 7);
  L.ground(31, 38, 14); L.spikes(32, 35);
  L.plat(32, 35, 11);                        // 尖刺桥
  L.ground(39, 58, 14);
  L.put('F', 41, 12);
  L.plat(43, 45, 9); L.put('5', 44, 8);
  L.put('2', 48, 12);
  L.plat(51, 53, 9); L.put('5', 52, 8);
  L.put('6', 56, 12);
  // 坑 59-61
  L.ground(62, 80, 14);
  L.put('3', 66, 7); L.put('3', 70, 7); L.put('3', 74, 7);
  L.put('4', 68, 12); L.put('4', 76, 12);
  L.ground(81, 97, 14); L.spikes(82, 96);
  L.plat(82, 84, 11); L.plat(87, 89, 11); L.plat(92, 94, 11);
  L.put('5', 88, 10);
  L.ground(98, 112, 14);
  L.put('F', 100, 12);
  L.put('X', 103, 12); L.put('X', 106, 12);
  L.put('6', 109, 12);
  L.ground(113, 120, 11); L.put('4', 116, 9);
  // 坑 121-123
  L.ground(124, 140, 14);
  L.put('1', 127, 12); L.put('1', 131, 12); L.put('1', 135, 12);
  L.put('3', 129, 7); L.put('3', 133, 7);
  L.put('4', 138, 12);
  L.ground(141, 147, 14); L.put('F', 143, 12);
  // Boss 战区 (顶棚到146为止, 战区露天)
  L.ground(148, 175, 14);
  L.wall(175, 4, 13);
  L.plat(152, 155, 11); L.plat(162, 165, 11);
  L.put('B', 150, 12);
  return {
    W, grid: L.g, theme: 'fort', music: 'fort',
    name: 'IRON FORTRESS', sub: 'MISSION 03 - CORE BREACH',
    bossType: 3, elite: true,
    hints: [{ x: 8 * TILE, lines: ['FINAL ASSAULT', 'ELITE GUARDS AHEAD'] }]
  };
}

// ---------------- 解析 ----------------
function parseLevel(def) {
  const grid = def.grid.map(r => r.slice());
  const lv = {
    W: def.W, H: ROWS, pxW: def.W * TILE, pxH: ROWS * TILE,
    theme: def.theme, music: def.music, name: def.name, sub: def.sub,
    bossType: def.bossType, elite: !!def.elite, hints: def.hints || [],
    grid, spawn: null, checkpoints: [], spawns: [], bossCol: -1
  };
  const dropRow = (x, y) => {          // 向下找支撑面
    for (let r = y + 1; r < ROWS; r++) {
      const c = grid[r][x];
      if (c === '#' || c === '=') return r;
    }
    return 14;
  };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < def.W; x++) {
    const c = grid[y][x];
    if ('P123456XFB'.includes(c)) {
      const px = x * TILE + 8, row = dropRow(x, y);
      const py = c === '3' ? y * TILE : row * TILE;
      if (c === 'P') lv.spawn = { x: px, y: py - 24 };
      else if (c === 'F') lv.checkpoints.push({ x: px, y: row * TILE, passed: false });
      else if (c === 'B') lv.bossCol = x;
      else lv.spawns.push({ code: c, x: px, y: py });
      grid[y][x] = '.';
    }
  }
  lv.tiles = makeTileset(def.theme);
  lv.decor = makeDecor(def.theme);
  // 地面装饰随机摆放
  const rnd = mulberry32(def.W * 7 + 3);
  lv.decorList = [];
  for (let x = 2; x < def.W - 2; x++) {
    if (rnd() < .14) {
      for (let y = 4; y < ROWS; y++) {
        if (grid[y][x] === '#' && grid[y - 1][x] === '.') {
          lv.decorList.push({ img: lv.decor[rnd() < .4 ? 0 : 1], x: x * TILE + (rnd() * 6 - 3), y: y * TILE });
          break;
        }
      }
    }
  }
  return lv;
}

const LEVEL_DEFS = [buildLevel1, buildLevel2, buildLevel3];
const LEVEL_COUNT = LEVEL_DEFS.length;


// ===== js/entities.js =====
// ============================================================
// entities.js - 玩家 / 敌人 / Boss / 弹道 / 粒子
// ============================================================
const GRAV = .32, MAXFALL = 6.5;

// ---------- 瓦片查询 ----------
function tileAtPx(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || tx >= game.level.W) return '#';
  if (ty < 0 || ty >= ROWS) return '.';
  return game.level.grid[ty][tx];
}
const solidPx = (px, py) => tileAtPx(px, py) === '#';

function collideX(e) {
  const dir = Math.sign(e.vx); if (!dir) return false;
  const edge = dir > 0 ? e.x + e.w : e.x;
  const ys = [e.y + 2, e.y + e.h * .5, e.y + e.h - 2];
  for (const yy of ys) {
    if (solidPx(edge, yy)) {
      e.x = dir > 0 ? Math.floor(edge / TILE) * TILE - e.w - .01
                    : (Math.floor(edge / TILE) + 1) * TILE + .01;
      e.vx = 0; e.hitWall = true; return true;
    }
  }
  return false;
}
function collideY(e) {
  e.onGround = false;
  const dir = Math.sign(e.vy); if (!dir) return false;
  const xs = [e.x + 1, e.x + e.w - 1];
  if (dir > 0) {
    const feet = e.y + e.h;
    for (const xx of xs) {
      const t = tileAtPx(xx, feet), tTop = Math.floor(feet / TILE) * TILE;
      if (t === '#' || (t === '=' && e.prevBottom <= tTop + .5)) {
        e.y = tTop - e.h; e.vy = 0; e.onGround = true; return true;
      }
    }
  } else {
    for (const xx of xs)
      if (solidPx(xx, e.y)) {
        e.y = (Math.floor(e.y / TILE) + 1) * TILE + .01; e.vy = 0; return true;
      }
  }
  return false;
}
function moveEntity(e) {
  e.hitWall = false;
  e.prevBottom = e.y + e.h;
  e.x += e.vx; collideX(e);
  e.y += e.vy; collideY(e);
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// 锚点翻转绘制: 翻转时保持身体位置不动 (世界坐标, 内部换算屏幕坐标)
function drawSprA(g, img, ax, anchorCol, y, flip, white) {
  const im = white ? img.white : img;
  ax -= game.camX;
  y = Math.round(y);
  if (flip) {
    const dx = Math.round(ax + anchorCol - im.width);
    g.save(); g.translate(dx + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore();
  } else g.drawImage(im, Math.round(ax - anchorCol), y);
}

// ============================================================
// 玩家
// ============================================================
const WEAPONS = {
  R: { cd: 9, dmg: 6, spd: 4.6, sfx: 'shoot' },
  H: { cd: 5, dmg: 4, spd: 5.2, sfx: 'mgShoot' },
  S: { cd: 16, dmg: 3, spd: 4.2, sfx: 'spreadShoot' }
};
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 10; this.h = 21;
    this.vx = 0; this.vy = 0; this.face = 1; this.onGround = false;
    this.hp = 4; this.maxHp = 4; this.inv = 0;
    this.dead = false; this.deadT = 0;
    this.weapon = 'R'; this.fireCd = 0; this.nades = 3; this.nadeCd = 0;
    this.coyote = 0; this.jbuf = 0; this.animT = 0; this.aim = 'f';
    this.jumpHeld = false; this.muzzleT = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  hurt(dmg, kdir) {
    if (this.inv > 0 || this.dead) return;
    this.hp -= dmg; game.shake = 5; Sfx.hurt();
    this.inv = 70; this.vx = (kdir || 1) * 1.8; this.vy = -2.4;
    game.fxSpark(this.cx, this.cy, 6, '#ff6a5a', 2);
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true; this.deadT = 0;
    this.hp = 0; Sfx.playerDie();
    game.fxDebris(this.cx, this.cy, 8, '#8ba06a'); game.fxPoof(this.cx, this.cy, 5);
    game.onPlayerDeath();
  }
  fallDie() {
    if (this.dead) return;
    if (this.god) {  // 调试无敌: 坠落时温和传送回检查点
      this.hp = this.maxHp;
      this.x = game.respawnPt.x; this.y = game.respawnPt.y - 30;
      this.vx = 0; this.vy = 0; this.inv = 60;
      game.camX = Math.max(0, Math.min(game.level.pxW - VW, this.cx - 120));
      return;
    }
    this.hp = 0; this.die();
  }

  update() {
    if (this.dead) {
      this.deadT++;
      this.vy = Math.min(this.vy + GRAV, MAXFALL); this.y += this.vy;
      return;
    }
    if (this.inv > 0) this.inv--;
    if (this.fireCd > 0) this.fireCd--;
    if (this.nadeCd > 0) this.nadeCd--;
    if (this.muzzleT > 0) this.muzzleT--;
    const inL = Input.down('left'), inR = Input.down('right');
    this.vx = (inR ? 1 : 0) - (inL ? 1 : 0) ? ((inR ? 1 : 0) - (inL ? 1 : 0)) * 1.55 : 0;
    if (this.vx !== 0) { this.face = Math.sign(this.vx); this.animT++; }

    // 瞄准方向
    this.aim = Input.down('up') ? 'u' : (Input.down('down') && !this.onGround) ? 'd' : 'f';

    // 跳跃: 缓冲 + 土狼时间 + 可变高度
    if (Input.pressed('jump')) this.jbuf = 7;
    if (this.jbuf > 0) this.jbuf--;
    if (this.onGround) this.coyote = 7; else if (this.coyote > 0) this.coyote--;
    if (this.jbuf > 0 && this.coyote > 0) {
      this.vy = -6.15; this.jbuf = 0; this.coyote = 0;
      this.jumpHeld = true; Sfx.jump();
      game.fxPoof(this.cx, this.y + this.h, 2);
    }
    if (this.jumpHeld && !Input.down('jump')) { if (this.vy < -2.2) this.vy = -2.2; this.jumpHeld = false; }

    // 重力
    this.vy = Math.min(this.vy + GRAV, MAXFALL);
    const wasGround = this.onGround;
    moveEntity(this);
    if (!wasGround && this.onGround) { Sfx.land(); game.fxPoof(this.cx, this.y + this.h, 2); }

    // 开火
    if (Input.down('fire') && this.fireCd <= 0) this.fire();
    if (Input.pressed('nade') && this.nades > 0 && this.nadeCd <= 0) {
      this.nades--; this.nadeCd = 20; Sfx.nadeThrow();
      game.grenades.push(new Grenade(this.cx + this.face * 6, this.y + 6, this.face * 2.4, -4.4, 'p'));
    }

    // 尖刺
    if (this.inv <= 0) {
      const c = tileAtPx(this.cx, this.y + this.h - 2);
      if (c === '^') this.hurt(2, -this.face);
    }
    // Boss 战区边界
    if (game.lockX0 > 0) {
      this.x = Math.max(this.x, game.lockX0 + 4);
      this.x = Math.min(this.x, game.lockX1 - this.w - 4);
    }
  }

  fire() {
    const W = WEAPONS[this.weapon];
    this.fireCd = W.cd; this.muzzleT = 4;
    Sfx[W.sfx]();
    const f = this.face, s = W.spd;
    let mx, my, dx, dy;
    if (this.aim === 'u')      { mx = this.cx + f * 4; my = this.y - 1; dx = 0; dy = -1; }
    else if (this.aim === 'd') { mx = this.cx + f * 4; my = this.y + 16; dx = 0; dy = 1; }
    else                       { mx = this.cx + f * 17; my = this.y + 9; dx = f; dy = 0; }
    game.fxFlash(mx, my, 3, '#ffd23e');
    game.fxCasing(this.cx - f * 2, this.y + 10, f);
    if (this.weapon === 'S') {
      for (const a of [-.7, 0, .7]) {
        const ax = dx * Math.cos(a) - dy * Math.sin(a), ay = dx * Math.sin(a) + dy * Math.cos(a);
        game.pbullets.push(new Bullet(mx, my, ax * s, ay * s, W.dmg, 'p'));
      }
    } else if (this.weapon === 'H') {
      game.pbullets.push(new Bullet(mx, my, dx * s, dy * s + (Math.random() - .5) * .35, W.dmg, 'p'));
    } else {
      game.pbullets.push(new Bullet(mx, my, dx * s, dy * s, W.dmg, 'p'));
    }
  }

  draw(g) {
    if (this.dead) { // 死亡: 后仰闪烁
      if ((this.deadT >> 2) % 2 === 0) {
        drawSprA(g, Sprites.player.torso.f, this.cx, 8, this.y, this.face < 0);
        drawSprA(g, Sprites.player.legs[3], this.cx, 8, this.y + 12, this.face < 0);
      }
      return;
    }
    if (this.inv > 0 && this.inv < 9999 && (this.inv >> 2) % 2 === 0) return; // 受击无敌闪烁(上帝模式除外)
    const flip = this.face < 0;
    let legI;
    if (!this.onGround) legI = 3;
    else if (Math.abs(this.vx) > .1) legI = 1 + ((this.animT / 7) | 0) % 2;
    else legI = 0;
    const white = false;
    drawSprA(g, Sprites.player.legs[legI], this.cx, 8, this.y + 12, flip);
    drawSprA(g, Sprites.player.torso[this.aim], this.cx, 8, this.y, flip);
    if (this.muzzleT > 0) {
      const m = this.muzzlePos();
      const mx = Math.round(m.x - game.camX), my = Math.round(m.y);
      g.fillStyle = '#fff3b0';
      g.fillRect(mx - 2, my - 2, 4, 4);
      g.fillStyle = '#ffd23e';
      g.fillRect(mx - 3, my - 1, 6, 2);
    }
  }
  muzzlePos() {
    const f = this.face;
    if (this.aim === 'u') return { x: this.cx + f * 4, y: this.y - 1 };
    if (this.aim === 'd') return { x: this.cx + f * 4, y: this.y + 16 };
    return { x: this.cx + f * 17, y: this.y + 9 };
  }
}

// ============================================================
// 敌人
// ============================================================
class Enemy {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.dead = false; this.flash = 0;
    this.activated = false; this.touchDmg = 0; this.score = 100;
    this.t = 0; this.face = -1; this.dir = -1; this.type = '?';
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 5;
    if (this.hp <= 0) this.die(); else Sfx.clank();
  }
  die() {
    this.dead = true;
    game.addScore(this.score);
    game.fxPoof(this.cx, this.cy, 4);
    game.fxDebris(this.cx, this.cy, 6, '#8b93a1');
    game.fxText(this.cx, this.y - 4, '+' + this.score, '#ffd23e');
    Sfx.enemyDie();
    this.dropLoot();
  }
  dropLoot() {
    const r = Math.random();
    if (r < .10) game.pickups.push(new Pickup('gem', this.cx, this.cy));
    else if (r < .16) game.pickups.push(new Pickup('med', this.cx, this.cy));
  }
  tryActivate(p) {
    if (this.activated) return true;
    if (Math.abs(p.cx - this.cx) < 340 && Math.abs(p.cy - this.cy) < 170) this.activated = true;
    return this.activated;
  }
  onScreen(m) { return this.cx > game.camX - (m || 60) && this.cx < game.camX + 480 + (m || 60); }
}

class Grunt extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 12, 20);
    this.type = 'grunt'; this.elite = elite;
    this.hp = elite ? 22 : 12; this.score = elite ? 200 : 100;
    this.cd = 40; this.shots = 0; this.moving = true;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (Math.abs(dx) < 170 && Math.abs(dy) < 34 && !p.dead) {
      this.face = Math.sign(dx) || 1; this.moving = false; this.vx = 0;
      if (--this.cd <= 0 && this.onScreen(20)) {
        game.ebullets.push(new Bullet(this.cx + this.face * 12, this.y + 8, this.face * 1.9, 0, 1, 'e'));
        Sfx.eShoot(); this.shots++;
        if (this.shots >= 3) { this.shots = 0; this.cd = this.elite ? 55 : 85; }
        else this.cd = 13;
      }
    } else {
      this.moving = true;
      this.vx = this.dir * .4; this.face = this.dir;
      // 悬崖/墙转身
      const ahead = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
      if (this.hitWall || (this.onGround && !solidPx(ahead, this.y + this.h + 3) && tileAtPx(ahead, this.y + this.h + 3) !== '=')) this.dir *= -1;
    }
    this.vy = Math.min(this.vy + GRAV, MAXFALL);
    moveEntity(this);
  }
  draw(g) {
    const set = this.elite ? Sprites.grunt.e : Sprites.grunt.n;
    const frame = this.moving ? ((this.t / 9 | 0) % 2) : (this.shots > 0 ? 2 : 0);
    drawSprA(g, set[frame], this.cx, 6, this.y, this.face < 0, this.flash > 0);
  }
}

class Runner extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 12, 20);
    this.type = 'runner'; this.elite = elite;
    this.hp = elite ? 18 : 10; this.score = elite ? 250 : 150;
    this.touchDmg = 1;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    if (p.dead) { this.vx = 0; }
    else {
      this.face = Math.sign(p.cx - this.cx) || 1;
      this.vx = this.face * (this.elite ? 2.0 : 1.65);
      if (this.hitWall && this.onGround) this.vy = -5.4; // 跳过障碍
    }
    this.vy = Math.min(this.vy + GRAV, MAXFALL);
    moveEntity(this);
    if (this.onGround && this.t % 8 === 0) game.fxPoof(this.cx - this.face * 5, this.y + this.h, 1);
  }
  draw(g) {
    drawSprA(g, Sprites.runner[(this.t / 5 | 0) % 2], this.cx, 6, this.y, this.face < 0, this.flash > 0);
  }
}

class Drone extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 14, 10);
    this.type = 'drone'; this.elite = elite;
    this.hp = elite ? 13 : 8; this.score = elite ? 300 : 200;
    this.baseY = y; this.touchDmg = 1; this.cd = 90;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx;
    this.face = Math.sign(dx) || 1;
    this.vx = Math.max(-.95, Math.min(.95, dx * .02));
    this.x += this.vx;
    this.y = this.baseY + Math.sin(this.t * .05) * 9;
    if (--this.cd <= 0 && !p.dead && Math.abs(dx) < 36 && p.cy > this.cy && this.onScreen(20)) {
      this.cd = this.elite ? 95 : 130;
      game.grenades.push(new Grenade(this.cx, this.y + this.h, 0, 1, 'bomb'));
    }
  }
  draw(g) {
    const bob = Math.sin(this.t * .3) > 0 ? 1 : 0;
    const scx = Math.round(this.cx - game.camX);
    g.fillStyle = '#78829a';
    const rw = bob ? 14 : 6;
    g.fillRect(scx - rw, Math.round(this.y - 2), rw * 2, 1);
    drawSprA(g, Sprites.drone, this.cx, 8, this.y, this.face < 0, this.flash > 0);
    // 警示灯
    if ((this.t >> 3) % 2 === 0) { g.fillStyle = '#ff3b30'; g.fillRect(scx - 1, Math.round(this.y + 2), 2, 2); }
  }
}

class Turret extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 16, 12);
    this.type = 'turret'; this.elite = elite;
    this.hp = elite ? 46 : 30; this.score = 300;
    this.cd = 70; this.ang = Math.PI;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = (p.cy - 4) - (this.y + 4);
    this.ang = Math.atan2(dy, dx);
    if (--this.cd <= 0 && Math.hypot(dx, dy) < 270 && !p.dead && this.onScreen(20)) {
      this.cd = this.elite ? 58 : 80;
      const s = 1.9;
      game.ebullets.push(new Bullet(this.cx + Math.cos(this.ang) * 10, this.y + 4 + Math.sin(this.ang) * 10,
        Math.cos(this.ang) * s, Math.sin(this.ang) * s, 1, 'e'));
      Sfx.eShoot();
    }
  }
  draw(g) {
    drawSprA(g, Sprites.turret, this.cx, 8, this.y, false, this.flash > 0);
    g.save();
    g.translate(Math.round(this.cx - game.camX), Math.round(this.y + 4));
    g.rotate(this.ang);
    g.fillStyle = this.flash > 0 ? '#fff' : '#23262e';
    g.fillRect(0, -1, 11, 3);
    g.fillStyle = this.flash > 0 ? '#fff' : '#4a5160';
    g.fillRect(7, -1, 3, 3);
    g.restore();
  }
}

class Shooter extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 12, 21);
    this.type = 'shooter'; this.elite = elite;
    this.hp = elite ? 24 : 14; this.score = elite ? 250 : 150;
    this.cd = 50; this.shots = 0;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (Math.hypot(dx, dy) < 240 && !p.dead) {
      if (--this.cd <= 0 && this.onScreen(20)) {
        let bx = Math.sign(dx), by = Math.sign(dy);
        if (bx && by) { bx *= .72; by *= .72; }
        else if (!bx && !by) bx = 1;
        const l = Math.hypot(bx, by) || 1;
        game.ebullets.push(new Bullet(this.cx + bx * 12 / l, this.cy + by * 12 / l,
          bx / l * 1.75, by / l * 1.75, 1, 'e'));
        Sfx.eShoot(); this.shots++;
        if (this.shots >= 2) { this.shots = 0; this.cd = this.elite ? 65 : 95; }
        else this.cd = 14;
      }
    }
  }
  draw(g) {
    drawSprA(g, Sprites.shooter, this.cx, 6, this.y, false, this.flash > 0);
  }
}

class Cannon extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 16, 12);
    this.type = 'cannon'; this.elite = elite;
    this.hp = elite ? 38 : 24; this.score = 250;
    this.cd = 100;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = (p.y + 10) - this.cy;
    if (--this.cd <= 0 && Math.abs(dx) < 300 && !p.dead && this.onScreen(20)) {
      this.cd = this.elite ? 100 : 135;
      const T = 75, G2 = .18;
      game.grenades.push(new Grenade(this.cx, this.y - 4, dx / T, dy / T - .5 * G2 * T, 'shell'));
      Sfx.nadeThrow();
    }
  }
  draw(g) {
    drawSprA(g, Sprites.cannon, this.cx, 8, this.y, false, this.flash > 0);
    if (this.cd < 20 && (this.t >> 2) % 2 === 0) {
      g.fillStyle = '#ffd23e';
      g.fillRect(Math.round(this.cx - game.camX + 4), Math.round(this.y - 4), 2, 2);
    }
  }
}

class Crate extends Enemy {
  constructor(x, y) {
    super(x, y - 14, 14, 14);
    this.type = 'crate'; this.hp = 10; this.score = 50;
    this.activated = true;
  }
  update() {}
  die() {
    this.dead = true;
    game.addScore(this.score);
    game.fxDebris(this.cx, this.cy, 8, '#8a5a33');
    game.fxPoof(this.cx, this.cy, 3);
    Sfx.crateBreak();
    const r = Math.random();
    let kind = 'gem';
    if (r < .30) kind = 'gem';
    else if (r < .50) kind = 'nade';
    else if (r < .70) kind = 'med';
    else kind = (game.crateWpn++ % 2) ? 'wS' : 'wH';
    game.pickups.push(new Pickup(kind, this.cx, this.y));
  }
  draw(g) {
    drawSprA(g, Sprites.crate, this.cx, 7, this.y, false, this.flash > 0);
  }
}

function spawnEnemy(code, x, y, elite) {
  switch (code) {
    case '1': return new Grunt(x - 6, y - 20, elite);
    case '2': return new Runner(x - 6, y - 20, elite);
    case '3': return new Drone(x - 7, y, elite);
    case '4': return new Turret(x - 8, y - 12, elite);
    case '5': return new Shooter(x - 6, y - 21, elite);
    case '6': return new Cannon(x - 8, y - 12, elite);
    case 'X': return new Crate(x, y);
  }
}

// ============================================================
// Boss
// ============================================================
class Boss {
  constructor(x, y, w, h, hp, name) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = hp; this.maxHp = hp; this.name = name;
    this.flash = 0; this.dying = false; this.dieT = 0; this.t = 0;
    this.touchDmg = 1; this.dead = false; this.intro = 60;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get phase2() { return this.hp < this.maxHp * .45; }
  hurt(dmg) {
    if (this.dying || this.intro > 0) return;
    this.hp -= dmg; this.flash = 4;
    if (this.hp <= 0) { this.hp = 0; this.startDeath(); }
  }
  startDeath() {
    this.dying = true; this.dieT = 0;
    game.shake = 10; Sfx.bossRoar();
    Music.stop();
  }
  updateDeath() {
    this.dieT++;
    game.shake = Math.max(game.shake, 4);
    if (this.dieT % 9 === 0) {
      const ex = this.x + Math.random() * this.w, ey = this.y + Math.random() * this.h;
      game.fxBoom(ex, ey, 14 + Math.random() * 10);
      Sfx.explode();
    }
    if (this.dieT > 110) {
      game.fxBoom(this.cx, this.cy, 40);
      Sfx.bigExplode(); game.shake = 14;
      this.dead = true;
      game.bossCleared();
    }
  }
  flashOverlay(g) {
    if (this.flash > 0) {
      this.flash--;
      g.globalAlpha = .55; g.fillStyle = '#fff';
      g.fillRect(Math.round(this.x - game.camX), Math.round(this.y), this.w, this.h);
      g.globalAlpha = 1;
    }
  }
}

// ---- Boss 1: 铁骡运兵车 ----
class Boss1 extends Boss {
  constructor(x, y) {
    super(x, y, 66, 38, 320, 'IRON MULE');
    this.groundY = y; this.dir = -1; this.turretAng = Math.PI;
    this.cd1 = 90; this.cd2 = 260; this.cd3 = 60; this.treadT = 0;
  }
  update() {
    if (this.dying) return this.updateDeath();
    this.t++; if (this.intro > 0) { this.intro--; return; }
    const p = game.player;
    // 行进
    const spd = this.phase2 ? .8 : .55;
    this.x += this.dir * spd; this.treadT += spd;
    if (this.x < game.lockX0 + 20) this.dir = 1;
    if (this.x + this.w > game.lockX1 - 20) this.dir = -1;
    const tx = p.cx - this.cx, ty = (p.cy - 6) - (this.y + 6);
    this.turretAng = Math.atan2(ty, tx);
    if (p.dead) return;
    // 扇形弹幕
    if (--this.cd1 <= 0) {
      this.cd1 = this.phase2 ? 80 : 115;
      const bx = this.cx + Math.cos(this.turretAng) * 16, by = this.y + 6 + Math.sin(this.turretAng) * 16;
      for (let i = -2; i <= 2; i++) {
        const a = this.turretAng + i * .21;
        game.ebullets.push(new Bullet(bx, by, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 1, 'e'));
      }
      Sfx.eShoot(); game.fxFlash(bx, by, 3, '#ffd23e');
    }
    // 二阶段: 直射三连
    if (this.phase2 && --this.cd3 <= 0) {
      this.cd3 = 55;
      const bx = this.cx, by = this.y + 8;
      game.ebullets.push(new Bullet(bx, by, Math.sign(tx) * 2.6, ty * .006, 1, 'e'));
      Sfx.eShoot();
    }
    // 放兵
    if (--this.cd2 <= 0) {
      this.cd2 = 330;
      const alive = game.enemies.filter(e => e.bossMinion && !e.dead).length;
      if (alive < 2) {
        for (let i = 0; i < 2; i++) {
          const g = new Grunt(this.cx + this.dir * 20, this.y - 4, false);
          g.bossMinion = true; g.dir = this.dir;
          game.enemies.push(g);
        }
        game.fxPoof(this.cx + this.dir * 18, this.y, 4);
      }
    }
  }
  draw(g) {
    const X = Math.round(this.x - game.camX), Y = Math.round(this.y);
    const p2 = this.phase2;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(X + x, Y + y, w, h); };
    // 履带
    R(0, 24, 66, 14, '#22262e');
    g.fillStyle = '#3a4150';
    for (let i = 0; i < 5; i++) { const wx = 8 + i * 12; g.beginPath(); g.arc(X + wx, Y + 31, 5, 0, 7); g.fill(); }
    g.fillStyle = '#141824';
    for (let i = 0; i < 9; i++) { const lx = ((i * 9 + this.treadT) % 66); g.fillRect(X + lx, Y + 24, 3, 2); g.fillRect(X + (lx + 60) % 66, Y + 36, 3, 2); }
    // 车体
    R(2, 12, 62, 14, p2 ? '#6e5238' : '#5c6e3c');
    R(2, 12, 62, 3, p2 ? '#8f6f4c' : '#7d9152');
    R(6, 9, 54, 4, p2 ? '#8f6f4c' : '#7d9152');
    R(2, 24, 62, 2, '#3e4c2a');
    // 舱门+徽章
    R(10, 15, 10, 8, '#4a5a30'); R(12, 17, 6, 4, '#c8383a');
    R(46, 16, 14, 6, '#3e4c2a');
    if (p2 && (this.t >> 3) % 2 === 0) { R(60, 16, 4, 4, '#ff5a3c'); }
    // 炮塔
    const tx = this.cx - game.camX, ty = Y + 6;
    g.save(); g.translate(Math.round(tx), Math.round(ty)); g.rotate(this.turretAng);
    g.fillStyle = '#23262e'; g.fillRect(6, -2, 18, 4);
    g.fillStyle = '#4a5160'; g.fillRect(18, -2, 5, 4);
    g.restore();
    g.fillStyle = p2 ? '#7d5a3a' : '#6a7752';
    g.beginPath(); g.arc(Math.round(tx), Math.round(ty), 9, Math.PI, 0); g.fill();
    g.fillStyle = '#c8383a'; g.fillRect(Math.round(tx) - 2, Math.round(ty) - 6, 4, 3);
    // 受击闪白
    g.globalAlpha = .5; g.fillStyle = '#fff';
    if (this.flash > 0) { this.flash--; g.fillRect(X, Y + 9, 66, 29); }
    g.globalAlpha = 1;
    if (this.intro > 0 && (this.intro >> 2) % 2 === 0) {
      drawTextC(g, '!! WARNING !!', 240, 60, '#ff5a3c', 2);
    }
  }
}

// ---- Boss 2: 秃鹫炮艇 ----
class Boss2 extends Boss {
  constructor(x, y) {
    super(x, y, 60, 26, 430, 'VULTURE');
    this.mode = 'hover'; this.modeT = 0; this.cd = 60;
    this.homeY = y; this.bombN = 0;
  }
  update() {
    if (this.dying) return this.updateDeath();
    this.t++; if (this.intro > 0) { this.intro--; return; }
    const p = game.player;
    this.modeT++;
    const spd = this.phase2 ? 1.35 : 1.0;
    // 悬停巡航
    if (this.mode === 'hover') {
      const targetX = p.cx - 30 + Math.sin(this.t * .02) * 60;
      this.x += Math.max(-spd, Math.min(spd, (targetX - this.x) * .03));
      this.y = this.homeY + Math.sin(this.t * .045) * 14;
      if (--this.cd <= 0 && !p.dead) {
        const r = Math.random();
        if (r < .45) { this.mode = 'bomb'; this.modeT = 0; this.bombN = this.phase2 ? 4 : 3; this.cd = 46; }
        else if (r < .8) { this.mode = 'missile'; this.modeT = 0; this.mslN = this.phase2 ? 5 : 3; this.cd = 34; }
        else { this.mode = 'strafe'; this.modeT = 0; this.strafeDir = this.x < p.cx ? 1 : -1; this.cd = 30; }
      }
    }
    // 投弹
    else if (this.mode === 'bomb') {
      this.x += Math.sin(this.t * .1) * .4;
      if (--this.cd <= 0 && this.bombN > 0) {
        this.cd = 42; this.bombN--;
        game.grenades.push(new Grenade(this.cx - 4 + Math.random() * 8, this.y + this.h, (Math.random() - .5) * .6, .8, 'bomb'));
        Sfx.nadeThrow();
      }
      if (this.bombN <= 0 && this.cd <= 0) { this.mode = 'hover'; this.cd = this.phase2 ? 60 : 90; }
    }
    // 导弹齐射
    else if (this.mode === 'missile') {
      if (--this.cd <= 0 && this.mslN > 0) {
        this.cd = 32; this.mslN--;
        game.ebullets.push(new Bullet(this.cx + (this.mslN % 2 ? -20 : 20), this.y + this.h, 0, .4, 1, 'e', 'missile'));
        Sfx.missile();
      }
      if (this.mslN <= 0 && this.cd <= 0) { this.mode = 'hover'; this.cd = this.phase2 ? 55 : 85; }
    }
    // 低空扫射
    else if (this.mode === 'strafe') {
      const targetY = 170;
      this.y += Math.max(-1.2, Math.min(1.2, (targetY - this.y) * .05));
      this.x += this.strafeDir * (this.phase2 ? 1.6 : 1.2);
      if (this.x < game.lockX0 + 10 || this.x + this.w > game.lockX1 - 10) this.strafeDir *= -1;
      if (--this.cd <= 0) {
        this.cd = 16;
        const bx = this.cx + this.strafeDir * 26, by = this.y + 16;
        for (const vy of [-.35, 0, .35])
          game.ebullets.push(new Bullet(bx, by, this.strafeDir * 2.3, vy, 1, 'e'));
        Sfx.eShoot(); game.fxFlash(bx, by, 2, '#ffd23e');
      }
      if (this.modeT > 260) { this.mode = 'hover'; this.cd = 70; }
    }
  }
  draw(g) {
    const X = Math.round(this.x - game.camX), Y = Math.round(this.y);
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(X + x, Y + y, w, h); };
    // 旋翼
    const spin = Math.sin(this.t * .9) > 0;
    R(28, 0, 3, 6, '#23262e');
    g.fillStyle = '#39404e';
    if (spin) g.fillRect(X + 28 - 30, Y + 0, 60, 2);
    else g.fillRect(X + 28 - 16, Y + 0, 32, 2);
    // 机身
    R(6, 6, 48, 14, '#414a58'); R(6, 6, 48, 3, '#5f6a7e');
    R(10, 18, 38, 4, '#31384a');
    R(2, 9, 6, 8, '#31384a'); R(52, 8, 8, 10, '#4a5468');
    // 座舱
    R(48, 8, 10, 7, '#9fe8ff'); R(50, 9, 6, 3, '#d8fbff');
    // 机腹炮
    R(26, 20, 8, 5, '#23262e');
    if (this.mode === 'strafe' && (this.t >> 2) % 2 === 0) R(this.strafeDir > 0 ? 34 : 22, 21, 4, 3, '#ffd23e');
    // 挂架
    R(14, 19, 8, 4, '#31384a'); R(38, 19, 8, 4, '#31384a');
    // 尾焰
    if ((this.t >> 2) % 2 === 0) { R(0, 11, 4, 3, '#ff9a2a'); R(-2, 12, 3, 1, '#ffd23e'); }
    // 相位2 红灯
    if (this.phase2 && (this.t >> 3) % 2 === 0) R(28, 8, 4, 3, '#ff3b30');
    g.globalAlpha = .5; g.fillStyle = '#fff';
    if (this.flash > 0) { this.flash--; g.fillRect(X, Y, 60, 26); }
    g.globalAlpha = 1;
    if (this.intro > 0 && (this.intro >> 2) % 2 === 0)
      drawTextC(g, '!! WARNING !!', 240, 60, '#ff5a3c', 2);
  }
}

// ---- Boss 3: 铁狱守卫 (机甲) ----
class Boss3 extends Boss {
  constructor(x, y) {
    super(x, y, 46, 62, 620, 'IRON WARDEN');
    this.groundY = y; this.state = 'idle'; this.stateT = 0;
    this.pattern = 0; this.cd = 80; this.walkT = 0;
    this.laser = null; this.armAng = 0;
  }
  update() {
    if (this.dying) return this.updateDeath();
    this.t++; if (this.intro > 0) { this.intro--; return; }
    const p = game.player;
    this.stateT++;
    const dx = p.cx - this.cx;
    // 激光持续检测
    if (this.laser) {
      const L = this.laser; L.t++;
      if (L.t < 45) { // 蓄力: 缓慢追踪
        L.ang += Math.max(-.02, Math.min(.02, Math.atan2(p.cy - L.y, p.cx - L.x) - L.ang));
        if (L.t === 1) Sfx.laserCharge();
      } else if (L.t === 45) { Sfx.laserFire(); game.shake = 6; }
      else if (L.t > 45 && L.t < 90 && !p.dead) {
        // 直线判定
        const ex = L.x, ey = L.y, c = Math.cos(L.ang), s = Math.sin(L.ang);
        const px = p.cx - ex, py = p.cy - ey;
        const proj = px * c + py * s;
        if (proj > 0 && proj < 340) {
          const d = Math.abs(px * s - py * c);
          if (d < 7) p.hurt(1, Math.sign(Math.cos(L.ang)) || 1);
        }
      }
      if (L.t >= 100) this.laser = null;
    }
    switch (this.state) {
      case 'idle': {
        if (--this.cd <= 0 && !p.dead) {
          this.pattern = (this.pattern + 1) % (this.phase2 ? 4 : 3);
          if (this.pattern === 0) { this.state = 'cannon'; this.stateT = 0; this.volley = this.phase2 ? 8 : 5; }
          else if (this.pattern === 1) { this.state = 'stompJump'; this.stateT = 0; }
          else if (this.pattern === 2) { this.state = 'laserAtk'; this.stateT = 0; }
          else { this.state = 'deploy'; this.stateT = 0; }
        }
        // 缓慢逼近
        else {
          this.face = Math.sign(dx) || 1;
          if (Math.abs(dx) > 70) { this.x += this.face * (this.phase2 ? .5 : .3); this.walkT++; }
        }
        break;
      }
      case 'cannon': {
        this.face = Math.sign(dx) || 1;
        if (this.stateT % 16 === 0 && this.volley > 0) {
          this.volley--;
          const bx = this.cx + this.face * 26, by = this.y + 20;
          const base = Math.atan2(p.cy - by, p.cx - bx);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * .16 + (Math.random() - .5) * .06;
            game.ebullets.push(new Bullet(bx, by, Math.cos(a) * 2.1, Math.sin(a) * 2.1, 1, 'e'));
          }
          Sfx.eShoot(); game.fxFlash(bx, by, 3, '#ffd23e');
        }
        if (this.volley <= 0 && this.stateT > 50) { this.state = 'idle'; this.cd = this.phase2 ? 46 : 75; }
        break;
      }
      case 'stompJump': {
        if (this.stateT === 1) this.vy = -4.6;
        this.vy = (this.vy || 0) + .3;
        this.y += this.vy;
        if (this.y >= this.groundY) {
          this.y = this.groundY; this.vy = 0;
          game.shake = 9; Sfx.stomp();
          game.fxPoof(this.cx - 18, this.y + this.h, 5); game.fxPoof(this.cx + 18, this.y + this.h, 5);
          for (const dir of [-1, 1])
            game.ebullets.push(new Bullet(this.cx + dir * 20, this.y + this.h - 8, dir * 1.7, 0, 1, 'e', 'wave'));
          this.state = 'idle'; this.cd = this.phase2 ? 42 : 70;
        }
        break;
      }
      case 'laserAtk': {
        if (this.stateT === 1)
          this.laser = { x: this.cx + this.face * 8, y: this.y + 10, ang: Math.atan2(p.cy - this.y - 10, p.cx - this.cx), t: 0 };
        if (this.stateT > 110) { this.state = 'idle'; this.cd = this.phase2 ? 50 : 80; }
        break;
      }
      case 'deploy': {
        if (this.stateT === 20) {
          for (let i = 0; i < 2; i++) {
            const d = new Drone(this.cx + (i ? 30 : -30), this.y - 10, true);
            d.bossMinion = true; d.activated = true;
            game.enemies.push(d);
          }
          game.fxPoof(this.cx - 30, this.y, 3); game.fxPoof(this.cx + 30, this.y, 3);
        }
        if (this.stateT > 60) { this.state = 'idle'; this.cd = 70; }
        break;
      }
    }
    this.x = Math.max(game.lockX0 + 12, Math.min(game.lockX1 - this.w - 12, this.x));
  }
  draw(g) {
    const X = Math.round(this.x - game.camX), Y = Math.round(this.y);
    const p2 = this.phase2;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(X + x, Y + y, w, h); };
    const walk = Math.sin(this.walkT * .15) * 2;
    // 腿
    R(6, 34, 10, 22 + walk, '#2c3240'); R(30, 34, 10, 22 - walk, '#2c3240');
    R(4, 56 + walk, 14, 5, '#23262e'); R(28, 56 - walk, 14, 5, '#23262e');
    R(7, 38, 4, 12, '#3c4454'); R(31, 38, 4, 12, '#3c4454');
    // 躯干
    R(2, 8, 42, 28, '#3a4250'); R(2, 8, 42, 4, '#525c70');
    R(4, 12, 38, 20, '#2f3644');
    // 核心发光
    const coreC = p2 ? ((this.t >> 3) % 2 ? '#ff5a3c' : '#c8383a') : '#37e0c8';
    R(18, 18, 10, 10, '#1c2130'); R(20, 20, 6, 6, coreC); R(21, 21, 4, 2, '#c8fff8');
    // 肩甲
    R(0, 6, 12, 10, '#434b5c'); R(34, 6, 12, 10, '#434b5c');
    R(0, 6, 12, 3, '#5f6a80'); R(34, 6, 12, 3, '#5f6a80');
    // 头
    R(16, 0, 14, 9, '#434b5c'); R(18, 3, 10, 4, '#1c2130');
    R(20, 4, 6, 2, '#ff3b30'); // 眼
    // 臂炮
    const f = this.face;
    R(f > 0 ? 36 : 0, 18, 10, 8, '#31384a');
    R(f > 0 ? 42 : -6, 19, 10, 6, '#23262e');
    R(f > 0 ? 50 : -12, 20, 4, 4, '#4a5160');
    if (this.state === 'cannon' && (this.stateT >> 2) % 2 === 0)
      R(f > 0 ? 52 : -16, 19, 4, 5, '#ffd23e');
    // 激光
    if (this.laser) {
      const L = this.laser;
      const sx = L.x - game.camX, sy = L.y;
      if (L.t < 45) { // 蓄力指示线
        g.strokeStyle = 'rgba(255,90,60,' + (.15 + .2 * Math.sin(L.t * .4)) + ')';
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(L.ang) * 340, sy + Math.sin(L.ang) * 340); g.stroke();
        g.fillStyle = '#ff5a3c'; g.fillRect(sx - 2, sy - 2, 5, 5);
      } else if (L.t < 90) {
        g.strokeStyle = '#ff5a3c'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(L.ang) * 340, sy + Math.sin(L.ang) * 340); g.stroke();
        g.strokeStyle = '#ffd8c8'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(L.ang) * 340, sy + Math.sin(L.ang) * 340); g.stroke();
        g.lineWidth = 1;
        if (L.t % 3 === 0) game.fxSpark(L.x + Math.cos(L.ang) * (Math.random() * 300), L.y + Math.sin(L.ang) * (Math.random() * 300), 2, '#ff9a7a', 1);
      }
    }
    g.globalAlpha = .5; g.fillStyle = '#fff';
    if (this.flash > 0) { this.flash--; g.fillRect(X, Y, 46, 62); }
    g.globalAlpha = 1;
    if (this.intro > 0 && (this.intro >> 2) % 2 === 0)
      drawTextC(g, '!! WARNING !!', 240, 60, '#ff5a3c', 2);
  }
}
const BOSS_CLASSES = [null, Boss1, Boss2, Boss3];
const BOSS_SCORES = [0, 2000, 3000, 5000];

// ============================================================
// 弹道
// ============================================================
class Bullet {
  constructor(x, y, vx, vy, dmg, side, kind) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.side = side; this.kind = kind || 'n';
    this.dead = false; this.life = kind === 'wave' ? 110 : 260;
    this.w = 2; this.h = 2;
  }
  update() {
    const steps = 2;
    for (let i = 0; i < steps && !this.dead; i++) {
      if (this.kind === 'missile') {
        const p = game.player;
        if (!p.dead) {
          const want = Math.atan2(p.cy - this.y, p.cx - this.x);
          let cur = Math.atan2(this.vy, this.vx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          cur += Math.max(-.045, Math.min(.045, d));
          const spd = Math.min(2.5, Math.hypot(this.vx, this.vy) + .05);
          this.vx = Math.cos(cur) * spd; this.vy = Math.sin(cur) * spd;
        }
        game.fxSpark(this.x, this.y, 1, '#ff9a2a', .6);
      }
      if (this.kind === 'wave') {
        // 贴地冲击波
        if (!solidPx(this.x, this.y + 10) && tileAtPx(this.x, this.y + 10) !== '=') { this.dead = true; break; }
        game.fxSpark(this.x, this.y + (Math.random() * 8 - 4), 1, '#ff9a2a', .8);
      }
      this.x += this.vx / steps; this.y += this.vy / steps;
      const t = tileAtPx(this.x, this.y);
      if (t === '#') {
        if (this.kind === 'missile') game.explode(this.x, this.y, 16, 1, false);
        else game.fxSpark(this.x, this.y, 2, '#d8dce4', 1);
        this.dead = true; break;
      }
    }
    if (--this.life <= 0) this.dead = true;
    if (this.x < game.camX - 90 || this.x > game.camX + 570 || this.y > ROWS * TILE + 20 || this.y < -30) this.dead = true;
  }
  draw(g) {
    const x = Math.round(this.x - game.camX), y = Math.round(this.y);
    if (this.side === 'p') {
      g.strokeStyle = '#ffd23e'; g.beginPath();
      g.moveTo(x - this.vx * 1.6, y - this.vy * 1.6); g.lineTo(x, y); g.stroke();
      g.fillStyle = '#fff3b0'; g.fillRect(x - 1, y - 1, 2, 2);
    } else if (this.kind === 'missile') {
      g.fillStyle = '#8b93a1'; g.fillRect(x - 3, y - 1, 6, 3);
      g.fillStyle = '#ff9a2a'; g.fillRect(x - Math.sign(this.vx) * 5 - 1, y - 1, 3, 2);
    } else if (this.kind === 'wave') {
      g.fillStyle = '#ff9a2a';
      g.fillRect(x - 5, y + 2, 10, 3);
      g.fillStyle = '#ffd23e';
      g.fillRect(x - 2, y - 3 + Math.sin(this.life * .8) * 2, 4, 5);
    } else {
      g.fillStyle = '#ff5a3c'; g.fillRect(x - 2, y - 2, 4, 4);
      g.fillStyle = '#ffd8c8'; g.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}

class Grenade {
  constructor(x, y, vx, vy, kind) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.kind = kind; // 'p' 玩家 | 'bomb' 无人机 | 'shell' 迫击炮
    this.dead = false;
    this.fuse = kind === 'p' ? 55 : kind === 'shell' ? 78 : 46;
    this.grav = kind === 'p' ? .21 : .18;
  }
  update() {
    this.vy += this.grav;
    const nx = this.x + this.vx;
    if (solidPx(nx + Math.sign(this.vx) * 2, this.y)) this.vx *= -.5;
    else this.x = nx;
    const ny = this.y + this.vy;
    if (this.vy > 0 && (solidPx(this.x, ny + 2) || tileAtPx(this.x, ny + 2) === '=')) {
      if (this.kind !== 'p') { this.explodeNow(); return; }
      this.y = Math.floor((ny + 2) / TILE) * TILE - 2;
      this.vy *= -.38; this.vx *= .62;
      if (Math.abs(this.vy) < .5) this.vy = 0;
    } else if (this.vy < 0 && solidPx(this.x, ny - 2)) this.vy = 0;
    else this.y = ny;
    if (this.kind === 'p' && this.fuse < 50 && this.fuse % 8 < 2)
      game.fxSpark(this.x, this.y, 1, '#ffd23e', .5);
    if (--this.fuse <= 0) this.explodeNow();
  }
  explodeNow() {
    this.dead = true;
    if (this.kind === 'p') game.explode(this.x, this.y, 27, 30, true);
    else if (this.kind === 'shell') game.explode(this.x, this.y, 22, 1, false);
    else game.explode(this.x, this.y, 18, 1, false);
  }
  draw(g) {
    const x = Math.round(this.x - game.camX), y = Math.round(this.y);
    if (this.kind === 'p') {
      g.fillStyle = '#4a6a38'; g.fillRect(x - 2, y - 3, 4, 5);
      g.fillStyle = '#7ba35c'; g.fillRect(x - 1, y - 3, 2, 2);
      if (this.fuse % 6 < 3) { g.fillStyle = '#ffd23e'; g.fillRect(x - 1, y - 5, 2, 2); }
    } else {
      g.fillStyle = '#3a4150'; g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = this.fuse % 6 < 3 ? '#ff5a3c' : '#8b93a1'; g.fillRect(x, y - 4, 2, 2);
    }
  }
}

// ============================================================
// 拾取物
// ============================================================
const PICKUP_INFO = {
  gem: { spr: 'gem', label: '+500' },
  med: { spr: 'med', label: 'HP +1' },
  nade: { spr: 'nade', label: 'NADE +3' },
  wS: { spr: 'wS', label: 'SPREAD!' },
  wH: { spr: 'wH', label: 'MACHINE GUN!' },
  life: { spr: 'life', label: '1UP!' }
};
class Pickup {
  constructor(kind, x, y) {
    this.kind = kind; this.x = x - 5; this.y = y - 10; this.w = 10; this.h = 10;
    this.vy = -1.4; this.vx = (Math.random() - .5) * .8;
    this.t = 0; this.dead = false; this.life = 640; this.rest = false;
  }
  get cx() { return this.x + 5; }
  update() {
    this.t++;
    if (!this.rest) {
      this.vy += .12;
      const ny = this.y + this.vy;
      if (this.vy > 0 && (tileAtPx(this.x + 5, ny + 10) === '#' || tileAtPx(this.x + 5, ny + 10) === '=')) {
        this.y = Math.floor((ny + 10) / TILE) * TILE - 10; this.vy = 0; this.vx = 0; this.rest = true;
      } else this.y = ny;
      this.x += this.vx;
    }
    if (--this.life <= 0) this.dead = true;
  }
  apply(p) {
    this.dead = true;
    const info = PICKUP_INFO[this.kind];
    let color = '#ffd23e';
    switch (this.kind) {
      case 'gem': game.addScore(500); Sfx.pickup(); break;
      case 'med': p.hp = Math.min(p.maxHp, p.hp + 1); Sfx.pickup(); color = '#7dff8a'; break;
      case 'nade': p.nades = Math.min(9, p.nades + 3); Sfx.pickup(); break;
      case 'wS': p.weapon = 'S'; p.nades = Math.min(9, p.nades + 1); Sfx.weaponUp(); color = '#ff9a2a'; break;
      case 'wH': p.weapon = 'H'; p.nades = Math.min(9, p.nades + 1); Sfx.weaponUp(); color = '#5ad1ff'; break;
      case 'life': game.lives++; Sfx.lifeUp(); color = '#ff5a3c'; break;
    }
    game.fxText(this.cx, this.y - 6, info.label, color);
  }
  draw(g) {
    if (this.life < 120 && (this.life >> 2) % 2 === 0) return;
    const img = Sprites[PICKUP_INFO[this.kind].spr];
    const bob = this.rest ? Math.sin(this.t * .1) * 2 : 0;
    drawSpr(g, img, this.cx - img.width / 2 - game.camX, this.y - game.camYOff + bob, false);
    // 光晕
    g.globalAlpha = .18 + .1 * Math.sin(this.t * .15);
    g.fillStyle = '#fff';
    g.fillRect(Math.round(this.cx - game.camX - 7), Math.round(this.y + bob - 4), 14, 14);
    g.globalAlpha = 1;
  }
}

// ============================================================
// 粒子
// ============================================================
class Particle {
  constructor(o) {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.grav = 0;
    this.life = 30; this.size = 2; this.color = '#fff'; this.type = 'spark';
    this.grow = 0; this.str = '';
    Object.assign(this, o);
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += this.grav;
    if (this.grow) this.size += this.grow;
    this.life--;
  }
  draw(g) {
    const x = Math.round(this.x - game.camX), y = Math.round(this.y - game.camYOff);
    const a = Math.max(0, Math.min(1, this.life / 20));
    switch (this.type) {
      case 'spark':
        g.strokeStyle = this.color; g.globalAlpha = a;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - this.vx * 2, y - this.vy * 2); g.stroke();
        break;
      case 'deb':
        g.fillStyle = this.color; g.globalAlpha = a;
        g.fillRect(x, y, this.size, this.size);
        break;
      case 'smoke':
        g.fillStyle = this.color; g.globalAlpha = a * .5;
        g.beginPath(); g.arc(x, y, Math.max(.5, this.size), 0, 7); g.fill();
        break;
      case 'fire': {
        const fr = Math.max(.5, this.size);
        g.globalAlpha = a;
        g.fillStyle = '#ffd23e';
        g.beginPath(); g.arc(x, y, fr, 0, 7); g.fill();
        g.fillStyle = '#ff7a2a';
        g.beginPath(); g.arc(x, y, fr * .6, 0, 7); g.fill();
        break;
      }
      case 'flash':
        g.globalAlpha = a * .9;
        g.fillStyle = this.color;
        g.beginPath(); g.arc(x, y, Math.max(.5, this.size), 0, 7); g.fill();
        break;
      case 'ring':
        g.strokeStyle = this.color; g.globalAlpha = a;
        g.beginPath(); g.arc(x, y, Math.max(.5, this.size), 0, 7); g.stroke();
        break;
      case 'txt':
        g.globalAlpha = Math.min(1, a * 2);
        drawText(g, this.str, x - textW(this.str) / 2, y, this.color, 1);
        break;
    }
    g.globalAlpha = 1;
  }
}


// ===== js/main.js =====
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


// ===== wxgame/_boot.js =====
// ============================================================
// _boot.js - 微信小游戏启动器 (打包时置于 bundle 最后)
// 屏幕合成(letterbox缩放) + 纯Canvas虚拟手柄 + 生命周期
// ============================================================
(function () {
  const B = globalThis.__WX_BOOT;
  if (!B || typeof wx === 'undefined') return;
  const screenCanvas = B.screenCanvas, sctx = B.sctx, gameCanvas = B.gameCanvas, dpr = B.dpr;
  const SW = screenCanvas.width, SH = screenCanvas.height;

  // 16:9 letterbox 缩放
  const scale = Math.min(SW / 480, SH / 270);
  const dw = 480 * scale, dh = 270 * scale;
  const ox = (SW - dw) / 2, oy = (SH - dh) / 2;

  const M = Math.min(SW, SH);
  const dp = { x: M * .17, y: SH - M * .17, r: M * .125 };                       // 方向垫
  const btns = [
    { x: SW - M * .14, y: SH - M * .16, r: M * .10, a: 'fire', label: 'FIRE',
      c0: 'rgba(200,56,58,.5)', c1: 'rgba(255,90,60,.8)' },
    { x: SW - M * .14 - M * .225, y: SH - M * .125, r: M * .08, a: 'jump', label: 'JUMP',
      c0: 'rgba(70,120,200,.45)', c1: 'rgba(90,150,255,.72)' },
    { x: SW - M * .115, y: SH - M * .16 - M * .24, r: M * .062, a: 'nade', label: 'NADE',
      c0: 'rgba(90,150,70,.44)', c1: 'rgba(120,200,90,.7)' }
  ];
  const sysBts = [
    { x: SW - M * .05, y: M * .06, r: M * .034, label: 'II', act: 'pause' },
    { x: SW - M * .05 - M * .09, y: M * .06, r: M * .034, label: 'M', act: 'mute' }
  ];

  const hits = new Map();
  let padPid = null, padZone = null;
  const setZone = function (z) {
    if (z === padZone) return;
    ['left', 'right', 'up', 'down'].forEach(function (a) { Input.set(a, a === z); });
    padZone = z;
  };
  const zoneOf = function (x, y) {
    const dx = x - dp.x, dy = y - dp.y, d = Math.hypot(dx, dy);
    if (d > dp.r * 1.3) return undefined;   // 不在垫区
    if (d < dp.r * .18) return null;        // 中心死区
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  const inCircle = function (x, y, c, k) { return Math.hypot(x - c.x, y - c.y) < c.r * (k || 1.15); };
  const menuTap = function () {
    if (game.state !== 'play' && game.state !== 'pause') { Input.set('confirm', true); Input.set('confirm', false); }
  };
  const sysTap = function (b) {
    if (b.act === 'pause') {
      if (game.state === 'play') { game.state = 'pause'; AudioSys.suspendAudio(); }
      else if (game.state === 'pause') { game.state = 'play'; AudioSys.resume(); }
    } else if (b.act === 'mute') game.toast(AudioSys.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
  };

  const onTouch = function (type, e) {
    const list = type === 'start' ? e.touches : (e.changedTouches || []);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const x = t.clientX != null ? t.clientX : t.x;
      const y = t.clientY != null ? t.clientY : t.y;
      if (x == null) continue;
      const px = x * dpr, py = y * dpr;
      if (type === 'start') {
        AudioSys.resume();
        let used = false;
        for (let j = 0; j < sysBts.length; j++) if (inCircle(px, py, sysBts[j], 1.4)) { sysTap(sysBts[j]); hits.set(t.identifier, {}); used = true; break; }
        if (used) continue;
        const z = zoneOf(px, py);
        if (z !== undefined) { padPid = t.identifier; setZone(z); hits.set(t.identifier, { pad: true }); continue; }
        for (let j = 0; j < btns.length; j++) if (inCircle(px, py, btns[j])) { hits.set(t.identifier, { btn: btns[j] }); Input.set(btns[j].a, true); used = true; break; }
        if (used) continue;
        menuTap();
        hits.set(t.identifier, {});
      } else if (type === 'move') {
        const h = hits.get(t.identifier);
        if (h && h.pad && t.identifier === padPid) setZone(zoneOf(px, py));
      }
    }
    if (type === 'end' || type === 'cancel') {
      const ends = e.changedTouches || [];
      for (let i = 0; i < ends.length; i++) {
        const h = hits.get(ends[i].identifier);
        if (!h) continue;
        if (h.pad && ends[i].identifier === padPid) { padPid = null; setZone(null); }
        if (h.btn) Input.set(h.btn.a, false);
        hits.delete(ends[i].identifier);
      }
    }
  };
  wx.onTouchStart(function (e) { onTouch('start', e); });
  wx.onTouchMove(function (e) { onTouch('move', e); });
  wx.onTouchEnd(function (e) { onTouch('end', e); });
  wx.onTouchCancel(function (e) { onTouch('cancel', e); });
  wx.onHide(function () { if (game.state === 'play') { game.state = 'pause'; AudioSys.suspendAudio(); } });

  // ---- 手柄绘制 ----
  const circle = function (c, fill, stroke) {
    sctx.beginPath(); sctx.arc(c.x, c.y, c.r, 0, 7);
    if (fill) { sctx.fillStyle = fill; sctx.fill(); }
    if (stroke) { sctx.strokeStyle = stroke; sctx.lineWidth = 2 * dpr; sctx.stroke(); }
  };
  const label = function (c, txt, size) {
    sctx.fillStyle = 'rgba(255,255,255,.95)';
    sctx.font = 'bold ' + Math.round(size) + 'px monospace';
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.fillText(txt, c.x, c.y);
    sctx.textAlign = 'left'; sctx.textBaseline = 'alphabetic';
  };
  const arrows = [
    { a: 'left', dx: -1, dy: 0, ch: '\u25C0' }, { a: 'right', dx: 1, dy: 0, ch: '\u25B6' },
    { a: 'up', dx: 0, dy: -1, ch: '\u25B2' }, { a: 'down', dx: 0, dy: 1, ch: '\u25BC' }
  ];
  const drawPad = function () {
    circle(dp, 'rgba(16,20,28,.45)', 'rgba(140,150,170,.4)');
    for (let i = 0; i < arrows.length; i++) {
      const ar = arrows[i];
      const c = { x: dp.x + ar.dx * dp.r * .55, y: dp.y + ar.dy * dp.r * .55, r: dp.r * .33 };
      circle(c, Input.down(ar.a) ? 'rgba(255,170,46,.65)' : 'rgba(60,70,90,.45)', 'rgba(140,150,170,.35)');
      label(c, ar.ch, c.r * .9);
    }
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      circle(b, Input.down(b.a) ? b.c1 : b.c0, 'rgba(140,150,170,.45)');
      label(b, b.label, b.r * (b.label.length > 4 ? .38 : .5));
    }
    for (let i = 0; i < sysBts.length; i++) {
      circle(sysBts[i], 'rgba(16,20,28,.5)', 'rgba(140,150,170,.35)');
      label(sysBts[i], sysBts[i].label, sysBts[i].r * .8);
    }
  };

  // ---- 合成循环: 游戏画面缩放上屏 + 叠加手柄 ----
  const blit = function () {
    requestAnimationFrame(blit);
    sctx.fillStyle = '#000'; sctx.fillRect(0, 0, SW, SH);
    sctx.drawImage(gameCanvas, 0, 0, 480, 270, ox, oy, dw, dh);
    drawPad();
  };
  requestAnimationFrame(blit);
})();

