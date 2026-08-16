/* ============================================================
 * 守护小村姑 · GUARD MAIDEN
 * 体素风 FPS × 时停塔防 × 村民护送
 *  - WASD/鼠标 第一人称射击僵尸
 *  - 金币来自僵尸掉落
 *  - B 键时停 → 俯视 2D 视角建塔(塔会被啃)
 *  - 护送 20 名村民进城;阵亡过半即败
 * ============================================================ */
'use strict';

/* ================= i18n ================= */
const LANG = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const STR = {
  zh: {
    buildHint: 'B — 时停建造', buildTitle: '时停 · 建造模式',
    buildTip: '滚轮缩放 · WASD/右键拖动平移 · 只能建在英雄周围 · 右键点塔拆除(50%)',
    buildExit: '返回战斗 [B]',
    tagline: '僵尸围村!你是最后的英雄——一边开枪,一边时停建塔,护送 20 名村民逃进东边城市。阵亡过半,村子就完了。',
    cMove: '移动', cLook: '视角 / 左键射击', cG: '手雷 AOE', cH: '圣光·治疗村民和塔', cS: '圣盾·周围村民免伤6秒', cB: '时停建造塔防', cJ: '跳跃',
    dE: '😊 简单', dN: '⚔️ 普通', dH: '💀 困难',
    bestLabel: '最佳护送', start: '▶ 出发护送', foot: '僵尸会啃塔 · 金币来自僵尸掉落 · 活着进城就是分数',
    again: '↻ 再来一局', paused: '暂停', resume: '继续游戏', deadTxt: '你倒下了…',
    wave: n => `☠ 尸潮 ${n} 来袭!`, waveSub: '僵尸被村民的气息吸引,从四面八方涌来!',
    intro: '护送村民 → 东边城市!', introSub: '跟紧队伍!僵尸马上就到',
    savedMsg: '村民入城!', deadMsg: '村民被吃了!', loseTitle: '村子陷落…', winTitle: '护送成功!',
    loseSub: '超过一半的村民被僵尸吞噬', winSub: n => `${n} 名村民活着走进了城门`,
    score: '得分', againHint: '点击屏幕锁定鼠标开始射击',
    sell: '拆除', sellDesc: '点击一座塔拆除,返还 50% 造价',
    towerSaved: '入城', buildFirst: '时停中…放好塔再回去!',
    outOfRange: '离英雄太远,不能建!', shieldOn: '🛡️ 圣盾展开!',
    demoBtn: '🤖 自动演示 · AI 托管',
    aiOn: '🤖 AI 托管开启 · P 接管', aiOff: '🎮 手动操作',
    aiTag: sp => `🤖 AI 演示中 · P 接管 · T 加速 x${sp}`,
    speedMsg: n => `⏩ 模拟速度 x${n}`,
  },
  en: {
    buildHint: 'B — Time-stop & Build', buildTitle: 'TIME STOP · BUILD',
    buildTip: 'Wheel zoom · WASD / RMB-drag pan · Build only near the hero · RMB on tower to sell (50%)',
    buildExit: 'Back to fight [B]',
    tagline: 'Zombies swarm the village! You are the last hero — shoot, build towers in time-stop, escort 20 villagers to the east city. Lose more than half and the village falls.',
    cMove: 'Move', cLook: 'Look / LMB shoot', cG: 'Grenade AOE', cH: 'Holy Light heals', cS: 'Aegis: villagers immune 6s', cB: 'Time-stop build', cJ: 'Jump',
    dE: '😊 Easy', dN: '⚔️ Normal', dH: '💀 Hard',
    bestLabel: 'Best escort', start: '▶ START ESCORT', foot: 'Zombies chew towers · Coins drop from zombies · Every survivor is score',
    again: '↻ PLAY AGAIN', paused: 'PAUSED', resume: 'RESUME', deadTxt: 'You fell…',
    wave: n => `☠ WAVE ${n} INCOMING!`, waveSub: 'Zombies smell the villagers and pour in from all sides!',
    intro: 'Escort villagers → EAST CITY!', introSub: 'Stay close! They are coming',
    savedMsg: 'Villager saved!', deadMsg: 'Villager eaten!', loseTitle: 'VILLAGE FELL…', winTitle: 'ESCORT SUCCESS!',
    loseSub: 'More than half of the villagers were devoured', winSub: n => `${n} villagers walked through the gate alive`,
    score: 'SCORE', againHint: 'Click screen to lock mouse and shoot',
    sell: 'SELL', sellDesc: 'Click a tower to sell it back for 50%',
    towerSaved: 'saved', buildFirst: 'Time stopped… place towers, then return!',
    outOfRange: 'Too far from the hero!', shieldOn: '🛡️ AEGIS UP!',
    demoBtn: '🤖 AUTO DEMO · AI plays',
    aiOn: '🤖 AI takeover ON · P to grab controls', aiOff: '🎮 Manual control',
    aiTag: sp => `🤖 AI DEMO · P takeover · T speed x${sp}`,
    speedMsg: n => `⏩ Sim speed x${n}`,
  }
};
const L = k => typeof k === 'function' ? k() : (STR[LANG][k] || k);
(function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = STR[LANG][el.dataset.i18n];
    if (v !== undefined) el.textContent = v;
  });
})();

/* ================= 工具 ================= */
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
function pointSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - ax, pz - az);
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/* ================= 音频(合成,零素材) ================= */
const Sfx = (() => {
  let ctx = null, master = null;
  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.4; master.connect(ctx.destination);
      } catch (e) { }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return !!ctx;
  }
  function tone(freq, dur, type = 'square', vol = 0.5, slide = 0) {
    if (!ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  function noise(dur, vol = 0.4, freq = 1000, q = 1) {
    if (!ensure()) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }
  return {
    unlock: ensure,
    shot() { noise(0.08, 0.3, 2400); tone(190, 0.06, 'square', 0.16, -120); },
    hit() { noise(0.05, 0.22, 900); },
    zdeath() { tone(140, 0.4, 'sawtooth', 0.3, -100); noise(0.25, 0.2, 500); },
    coin() { tone(1150, 0.09, 'sine', 0.25); setTimeout(() => tone(1550, 0.14, 'sine', 0.22), 55); },
    boom() { noise(0.5, 0.55, 300, 2); tone(60, 0.5, 'sine', 0.5, -30); },
    chew() { noise(0.09, 0.24, 350, 3); },
    horn() { tone(98, 0.7, 'sawtooth', 0.35); tone(147, 0.7, 'sawtooth', 0.22); },
    scream() { tone(880, 0.3, 'sine', 0.14, 340); },
    heal() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.2), i * 70)); },
    place() { tone(300, 0.08, 'square', 0.25); noise(0.06, 0.2, 600); },
    sell() { tone(500, 0.1, 'square', 0.2); setTimeout(() => tone(350, 0.12, 'square', 0.18), 60); },
    towerDown() { tone(180, 0.4, 'sawtooth', 0.3, -120); noise(0.35, 0.3, 400); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'square', 0.22), i * 130)); },
    lose() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone(f, 0.45, 'sawtooth', 0.25), i * 200)); },
  };
})();

/* ================= 常量 ================= */
const CELL = 2, HALF = 78;            // 网格 2m,地图 156×156
const TOTAL_VILLAGERS = 20;
const LOSE_DEAD = Math.floor(TOTAL_VILLAGERS / 2) + 1;   // 阵亡 ≥11 即败
const GATE_X = 75, GATE_Z = 4, GATE_HALF_W = 2.6;

// 村→城 路径点(S 形穿越全图,~183m)
const PATH = [
  [-72, 0], [-58, -14], [-40, -6], [-26, 12], [-8, 4],
  [8, -14], [26, -8], [44, 10], [62, 2], [74, GATE_Z]
];
const PATH_LEN = (() => { let s = 0; for (let i = 1; i < PATH.length; i++) s += dist2d(...PATH[i - 1], ...PATH[i]); return s; })();

// 传送门(僵尸出生点):西×3 + 北×3 + 南×3
const PORTALS = [
  [-75, -40], [-75, 0], [-75, 40],
  [-48, -75], [0, -75], [48, -75],
  [-48, 75], [0, 75], [48, 75]
];

const ZTYPES = {
  walker: { hp: 34, speed: 2.45, dmg: 9, coin: 2, scale: 1.0, atkR: 1.4, chew: 12, skin: 0x5d9455, shirt: 0x2e8b8b, pants: 0x35357a, name: 'walker' },
  runner: { hp: 20, speed: 3.8, dmg: 7, coin: 2, scale: 0.85, atkR: 1.3, chew: 9, skin: 0x7ab863, shirt: 0x8a5a3a, pants: 0x4a3a5a, name: 'runner' },
  archer: { hp: 26, speed: 2.6, dmg: 6, coin: 3, scale: 0.95, atkR: 11, chew: 8, skin: 0x6f9a58, shirt: 0x4a4456, pants: 0x33313f, bow: true, name: 'archer' },
  brute: { hp: 105, speed: 1.3, dmg: 16, coin: 5, scale: 1.4, atkR: 1.9, chew: 24, skin: 0x4a7a44, shirt: 0x555566, pants: 0x333344, name: 'brute' },
  giant: { hp: 400, speed: 1.1, dmg: 26, coin: 15, scale: 2.25, atkR: 2.6, chew: 42, skin: 0x3d6b3a, shirt: 0x2a2a3a, pants: 0x22222e, name: 'giant' },
};

/* 难度:波间隔 / 僵尸血量 / 数量 / 起始金币 / 弓箭手比例(间隔按大地图行程校准) */
const DIFFS = {
  easy:   { waveInt: 30, hpMul: 0.85, cntMul: 0.8,  coinStart: 45, archerMul: 0.6 },
  normal: { waveInt: 24, hpMul: 1.0,  cntMul: 1.0,  coinStart: 30, archerMul: 1.0 },
  hard:   { waveInt: 19, hpMul: 1.25, cntMul: 1.35, coinStart: 25, archerMul: 1.4 },
};

const TOWERS = {
  arrow: { name: LANG === 'zh' ? '箭塔' : 'Arrow', ico: '🏹', cost: 15, hp: 70, range: 14, rate: 0.55, dmg: 9, desc: LANG === 'zh' ? '高射速单发 · 守小路' : 'Fast single shot · guards lanes' },
  cannon: { name: LANG === 'zh' ? '炮塔' : 'Cannon', ico: '💥', cost: 45, hp: 90, range: 13, rate: 1.7, dmg: 26, desc: LANG === 'zh' ? '范围爆炸伤害' : 'AOE splash damage' },
  frost: { name: LANG === 'zh' ? '冰霜塔' : 'Frost', ico: '❄️', cost: 30, hp: 60, range: 8, rate: 0, dmg: 0, desc: LANG === 'zh' ? '范围减速55%+持续冻伤' : '55% slow aura + chip dmg' },
  wall: { name: LANG === 'zh' ? '木墙' : 'Wall', ico: '🧱', cost: 10, hp: 260, range: 0, rate: 0, dmg: 0, desc: LANG === 'zh' ? '高血量肉盾,拖住僵尸' : 'Meat shield. Zombies chew it' },
};

const BUILD_R = 26;        // 建造范围:英雄周围 26m
const SHIELD_R = 15;       // 圣盾半径
const SHIELD_T = 6;        // 圣盾持续
const SHIELD_CD = 22;      // 圣盾冷却

/* ================= 渲染基础 ================= */
if (typeof THREE === 'undefined') {
  $('engine-error').classList.remove('hidden');
  throw new Error('three.js failed to load');
}
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12182b);
scene.fog = new THREE.Fog(0x12182b, 46, 130);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize); onResize();

/* 灯光:夜晚黄昏 */
scene.add(new THREE.HemisphereLight(0x6f86b8, 0x2a3a24, 0.85));
const moonLight = new THREE.DirectionalLight(0xcfd8ff, 0.5);
moonLight.position.set(40, 60, -20); scene.add(moonLight);

/* ================= 世界搭建 ================= */
const staticBlocked = new Set();   // 静态占格(路/房/树/门),不可建造
const cellKey = (cx, cz) => cx + ',' + cz;
const cellOf = (x, z) => [Math.floor((x + HALF) / CELL), Math.floor((z + HALF) / CELL)];
const cellCenter = (cx, cz) => [-HALF + cx * CELL + CELL / 2, -HALF + cz * CELL + CELL / 2];

function pathDist(x, z) {
  let d = 1e9;
  for (let i = 1; i < PATH.length; i++)
    d = Math.min(d, pointSegDist(x, z, PATH[i - 1][0], PATH[i - 1][1], PATH[i][0], PATH[i][1]));
  return d;
}
function inGateZone(x, z) { return x > 69 && Math.abs(z - GATE_Z) < 7; }

// —— 地形(顶点色 + 棋盘格草 + 土路)——
(function buildGround() {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, HALF, HALF);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const pd = pathDist(x, z);
    const check = (Math.floor((x + HALF) / CELL) + Math.floor((z + HALF) / CELL)) % 2 === 0;
    const n = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    if (pd < 1.9) c.setHex(0x8f6f4a);
    else if (pd < 2.7) c.setHex(0x7d6142);
    else if (inGateZone(x, z)) c.setHex(0x9a9a92);
    else {
      const base = check ? 0x54963e : 0x4a8a37;
      c.setHex(base);
      if (Math.abs(n) < 0.12) c.setHex(0x5da344);
      if (Math.abs(n) > 0.93) c.setHex(0x417c30);
    }
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.position.y = -0.02; scene.add(ground);
  // 地图边界的深渊色
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(700, 700),
    new THREE.MeshBasicMaterial({ color: 0x0c101c }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.5; scene.add(outer);
})();

// —— 装饰:树 / 草 / 石头 ——
(function decorate() {
  const trunkG = new THREE.BoxGeometry(0.7, 2.6, 0.7);
  const trunkM = new THREE.MeshLambertMaterial({ color: 0x6e5530 });
  const leafG1 = new THREE.BoxGeometry(2.6, 1.8, 2.6);
  const leafG2 = new THREE.BoxGeometry(1.7, 1.3, 1.7);
  const leafM1 = new THREE.MeshLambertMaterial({ color: 0x3a6e2a });
  const leafM2 = new THREE.MeshLambertMaterial({ color: 0x468234 });
  const rockG = new THREE.BoxGeometry(1.1, 0.8, 1.1);
  const rockM = new THREE.MeshLambertMaterial({ color: 0x7a7a74 });
  const tuftG = new THREE.BoxGeometry(0.5, 0.45, 0.5);
  const tuftM = new THREE.MeshLambertMaterial({ color: 0x6fbf4a });
  let placed = 0, guard = 0;
  while (placed < 46 && guard++ < 1400) {
    const x = rand(-HALF + 4, HALF - 8), z = rand(-HALF + 4, HALF - 4);
    if (pathDist(x, z) < 4.5 || inGateZone(x, z) || x < -58) continue;
    if (PORTALS.some(p => dist2d(x, z, p[0], p[1]) < 6)) continue;
    const g = new THREE.Group();
    const t = new THREE.Mesh(trunkG, trunkM); t.position.y = 1.3; g.add(t);
    const l1 = new THREE.Mesh(leafG1, leafM1); l1.position.y = 3.2; g.add(l1);
    const l2 = new THREE.Mesh(leafG2, leafM2); l2.position.y = 4.4; g.add(l2);
    g.position.set(x, 0, z); scene.add(g);
    const [cx, cz] = cellOf(x, z); staticBlocked.add(cellKey(cx, cz));
    placed++;
  }
  for (let i = 0; i < 90; i++) {
    const x = rand(-HALF + 2, HALF - 4), z = rand(-HALF + 2, HALF - 4);
    if (pathDist(x, z) < 2.4) continue;
    const m = new THREE.Mesh(tuftG, tuftM);
    m.position.set(x, 0.2, z); m.rotation.y = rand(0, 3); scene.add(m);
  }
  for (let i = 0; i < 16; i++) {
    const x = rand(-HALF + 6, HALF - 10), z = rand(-HALF + 6, HALF - 6);
    if (pathDist(x, z) < 3.5 || inGateZone(x, z)) continue;
    const m = new THREE.Mesh(rockG, rockM);
    m.position.set(x, 0.35, z); m.rotation.y = rand(0, 3); scene.add(m);
  }
})();

// —— 村子(西端)——
const VILLAGE_SPAWN = new THREE.Vector3(-72, 0, 2);
(function buildVillage() {
  const wallM = new THREE.MeshLambertMaterial({ color: 0xcbb79a });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x8a4a3a });
  const doorM = new THREE.MeshLambertMaterial({ color: 0x5a3c22 });
  function house(x, z, w, d, h, rot) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM);
    body.position.y = h / 2; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.6, 4), roofM);
    roof.position.y = h + h * 0.3; roof.rotation.y = Math.PI / 4; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), doorM);
    door.position.set(0, 0.75, d / 2 + 0.05); g.add(door);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffc766 }));
    glow.position.set(w * 0.28, h * 0.62, d / 2 + 0.05); g.add(glow);
    g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
    for (let ox = -Math.ceil(w / 2); ox <= Math.ceil(w / 2); ox++)
      for (let oz = -Math.ceil(d / 2); oz <= Math.ceil(d / 2); oz++) {
        const [cx, cz] = cellOf(x + ox * CELL * 0.7, z + oz * CELL * 0.7);
        staticBlocked.add(cellKey(cx, cz));
      }
  }
  house(-73, -9, 5, 5, 3, 0.4);
  house(-75, 11, 6, 5, 3.4, -0.3);
  house(-66, -16, 4.5, 4.5, 2.8, 0.9);
  house(-67, 16, 4.5, 4.5, 2.8, -0.8);
  // 水井
  const well = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x8a8a86 }));
  ring.position.y = 0.5; well.add(ring);
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x3a7ecf }));
  water.position.y = 0.95; well.add(water);
  well.position.set(-69, 0, 3); scene.add(well);
})();

// —— 城市大门(东端)——
(function buildGate() {
  const stoneM = new THREE.MeshLambertMaterial({ color: 0x8f9298 });
  const darkM = new THREE.MeshLambertMaterial({ color: 0x6a6d73 });
  const goldM = new THREE.MeshBasicMaterial({ color: 0xf2cf46 });
  // 两侧城墙
  const north = new THREE.Mesh(new THREE.BoxGeometry(3, 11, (HALF - 1) + GATE_Z - GATE_HALF_W), stoneM);
  north.position.set(GATE_X, 5.5, (-HALF + 1 + GATE_Z - GATE_HALF_W) / 2); scene.add(north);
  const south = new THREE.Mesh(new THREE.BoxGeometry(3, 11, HALF - 1 - GATE_Z - GATE_HALF_W), stoneM);
  south.position.set(GATE_X, 5.5, (HALF - 1 + GATE_Z + GATE_HALF_W) / 2); scene.add(south);
  // 门楣 + 双塔
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, GATE_HALF_W * 2 + 1.2), darkM);
  lintel.position.set(GATE_X, 8.2, GATE_Z); scene.add(lintel);
  for (const dz of [-GATE_HALF_W - 0.8, GATE_HALF_W + 0.8]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(3.6, 13, 3.6), darkM);
    t.position.set(GATE_X, 6.5, GATE_Z + dz); scene.add(t);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.06), goldM);
    flag.position.set(GATE_X, 12.4, GATE_Z + dz + 1.9); scene.add(flag);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, GATE_HALF_W * 2),
    goldM); arch.position.set(GATE_X - 1.8, 10, GATE_Z); scene.add(arch);
  // 城内暖光
  const cityLight = new THREE.PointLight(0xffc766, 1.1, 30);
  cityLight.position.set(GATE_X + 4, 6, GATE_Z); scene.add(cityLight);
  // 建造禁区
  for (let cz = 0; cz < HALF; cz++) for (let cx = 35; cx < HALF; cx++) {
    const [x, z] = cellCenter(cx, cz);
    if (x > 69) staticBlocked.add(cellKey(cx, cz));
  }
})();

// —— 火把(沿路)——
(function torches() {
  const poleM = new THREE.MeshLambertMaterial({ color: 0x6e5530 });
  const fireM = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  let count = 0;
  for (let i = 1; i < PATH.length - 1; i++) {
    const [x, z] = PATH[i];
    const dx = PATH[i + 1][0] - PATH[i - 1][0], dz = PATH[i + 1][1] - PATH[i - 1][1];
    const len = Math.hypot(dx, dz) || 1;
    const px = x + (-dz / len) * 3.2, pz = z + (dx / len) * 3.2;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 0.22), poleM);
    pole.position.y = 1.1; g.add(pole);
    const fire = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), fireM);
    fire.position.y = 2.35; g.add(fire);
    g.position.set(px, 0, pz); scene.add(g);
    if (count < 3) {
      const l = new THREE.PointLight(0xff9d45, 0.8, 13);
      l.position.set(px, 2.6, pz); scene.add(l);
    }
    count++;
    const [cx, cz] = cellOf(px, pz); staticBlocked.add(cellKey(cx, cz));
  }
})();

// —— 传送门 ——
PORTALS.forEach(([x, z]) => {
  const g = new THREE.Group();
  const frameM = new THREE.MeshLambertMaterial({ color: 0x1c1226 });
  const glowM = new THREE.MeshBasicMaterial({ color: 0xc026d3 });
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6 + Math.abs(i) * 0.6, 0.6), frameM);
    p.position.set(i * 1.1, 1 + Math.abs(i) * 0.3, 0); g.add(p);
  }
  const glow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8, 0.25), glowM);
  glow.position.y = 1.5; g.add(glow);
  g.position.set(x, 0, z);
  g.lookAt(new THREE.Vector3(0, 0, 0)); g.position.y = 0;
  scene.add(g);
  const [cx, cz] = cellOf(x, z); staticBlocked.add(cellKey(cx, cz));
});

// —— 星空 + 月亮 ——
(function sky() {
  const n = 220, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = 180 + rand(0, 60), y = rand(40, 170);
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.4, sizeAttenuation: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xf4f0dc, fog: false }));
  moon.position.set(90, 110, -140); scene.add(moon);
})();

// 路径格子 → 不可建塔
for (let cx = 0; cx < HALF; cx++) for (let cz = 0; cz < HALF; cz++) {
  const [x, z] = cellCenter(cx, cz);
  if (pathDist(x, z) < 2.8) staticBlocked.add(cellKey(cx, cz));
}

/* ================= 模型工厂 ================= */
const shadowGeo = new THREE.CircleGeometry(0.55, 10); shadowGeo.rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

function blobShadow(scale = 1) {
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.position.y = 0.03; m.scale.setScalar(scale); m.renderOrder = 1;
  return m;
}
function hpBar(width = 1.2, y = 2.2) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x220000, transparent: true, opacity: 0.9, depthWrite: false }));
  const fgGeo = new THREE.PlaneGeometry(width, 0.12);
  fgGeo.translate(width / 2, 0, 0);
  const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0x7cd63e, depthWrite: false }));
  fg.position.set(-width / 2, 0, 0.01);
  g.add(bg); g.add(fg);
  g.position.y = y; g.visible = false; g.renderOrder = 2;
  g.userData.fg = fg; g.userData.width = width;
  return g;
}
/* 俯视建造模式的位置标记(菱形色块,仅建造时可见) */
function mkMarker(color, size) {
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 4);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.y = 0.07; m.renderOrder = 3; m.visible = false;
  return m;
}

// —— 村民模型 —— */
function makeVillager() {
  const g = new THREE.Group();
  const mats = [];
  const M = hex => { const m = new THREE.MeshLambertMaterial({ color: hex, transparent: true }); mats.push(m); return m; };
  const robe = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.35, 0.6), M(0x7a5a3a));
  robe.position.y = 0.68; g.add(robe);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.16, 0.62), M(0x4a3a28));
  belt.position.y = 0.72; g.add(belt);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), M(0xc8a17a));
  head.position.y = 1.68; g.add(head);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), M(0xb9905f));
  nose.position.set(0, 1.62, 0.36); g.add(nose);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.1), M(0x503a24));
  brow.position.set(0, 1.82, 0.33); g.add(brow);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), M(0x7a5a3a));
  armL.position.set(-0.54, 1.0, 0.18); armL.rotation.x = -1.1; g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), M(0x7a5a3a));
  armR.position.set(0.54, 1.0, 0.18); armR.rotation.x = -1.1; g.add(armR);
  g.add(blobShadow(0.8));
  const bar = hpBar(1.1, 2.35); g.add(bar);
  const marker = mkMarker(0x7cd63e, 1.0); g.add(marker);
  g.userData = { mats, bar, robe, head, marker };
  return g;
}

// —— 僵尸模型 ——
function makeZombie(t) {
  const g = new THREE.Group();
  const mats = [];
  const M = hex => { const m = new THREE.MeshLambertMaterial({ color: hex }); mats.push(m); return m; };
  const s = t.scale;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), M(t.pants));
  legL.position.set(-0.17, 0.38, 0); g.add(legL);
  const legR = legL.clone(); legR.material = M(t.pants); legR.position.x = 0.17; g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.38), M(t.shirt));
  torso.position.y = 1.17; g.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.22), M(t.skin));
  armL.position.set(-0.5, 1.4, 0.28); armL.rotation.x = -1.35; g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.22), M(t.skin));
  armR.position.set(0.5, 1.4, 0.28); armR.rotation.x = -1.35; g.add(armR);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), M(t.skin));
  head.position.y = 1.92; g.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a0a0a });
  const eL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.05), eyeM);
  eL.position.set(-0.14, 1.98, 0.31); g.add(eL);
  const eR = eL.clone(); eR.position.x = 0.14; g.add(eR);
  if (t.bow) {   // 弓箭手:兜帽 + 手持弓
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.3, 0.66), M(0x2a2733));
    hood.position.y = 2.14; g.add(hood);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.85, 0.09), M(0x6e4a2a));
    bow.position.set(0.5, 1.45, 0.42); bow.rotation.z = 0.2; g.add(bow);
    armR.rotation.x = -1.5;
  }
  g.scale.setScalar(s);
  g.add(blobShadow(0.75 * s));
  const bar = hpBar(1.0, 2.55); g.add(bar);
  const marker = mkMarker(0xff5b4d, 1.0 + (s - 1) * 0.8); g.add(marker);
  g.userData = { mats, bar, legL, legR, armL, armR, head, eyeM, marker };
  return g;
}

// —— 塔模型 ——
function makeTowerMesh(type) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xa9825a });
  const woodD = new THREE.MeshLambertMaterial({ color: 0x6e5530 });
  const stone = new THREE.MeshLambertMaterial({ color: 0x8f9298 });
  const head = new THREE.Group(); head.name = 'head';
  if (type === 'arrow') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 1.7), stone); base.position.y = 0.8; g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.3), woodD); top.position.y = 2.05; g.add(top);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.22), wood); bow.position.y = 2.8; head.add(bow);
    const bow2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.7), wood); bow2.position.y = 2.8; head.add(bow2);
    head.position.y = 0; g.add(head);
  } else if (type === 'cannon') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 1.9), stone); base.position.y = 0.65; g.add(base);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), woodD); ring.position.y = 1.5; g.add(ring);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
    barrel.position.set(0, 2.05, 0.55); head.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
    muzzle.position.set(0, 2.05, 1.35); head.add(muzzle);
    g.add(head);
  } else if (type === 'frost') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x231a33 })); base.position.y = 0.55; g.add(base);
    const ice = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff })); ice.position.y = 1.75; ice.name = 'spin'; head.add(ice);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.3, 20),
      new THREE.MeshBasicMaterial({ color: 0x6fd8e8, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.name = 'aura'; g.add(ring);
    g.add(head);
  } else { // wall
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 0.9), wood); b1.position.y = 0.58; g.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 0.9), wood); b2.position.y = 1.73; g.add(b2);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 1.0), woodD); beam.position.y = 2.4; g.add(beam);
  }
  g.add(blobShadow(0.95));
  return g;
}

/* ================= 实体状态 ================= */
const state = {
  mode: 'menu',          // menu | play | build | over | pause
  trans: null,           // 相机补间 {from,to,quatFrom,quatTo,t,dur,next}
  time: 0, playT: 0,
  coins: 30, kills: 0,
  saved: 0, dead: 0,
  wave: 0, nextWaveT: 8, waveActive: false,
  diff: DIFFS[localStorage.getItem('gm_diff')] ? localStorage.getItem('gm_diff') : 'normal',
  best: JSON.parse(localStorage.getItem('gm_best') || 'null'),
};
const DIFF = () => DIFFS[state.diff];
function setDiff(d, save = true) {
  if (!DIFFS[d]) return;
  state.diff = d;
  if (save) { try { localStorage.setItem('gm_diff', d); } catch (e) { } }
  document.querySelectorAll('.diff-btn').forEach(x => x.classList.toggle('sel', x.dataset.d === d));
}
document.querySelectorAll('.diff-btn').forEach(b =>
  b.addEventListener('click', () => { setDiff(b.dataset.d); Sfx.hit(); }));
setDiff(state.diff, false);
const towers = new Map();     // cellKey -> tower obj
const zombies = [];
const villagers = [];
const projectiles = [];
const coinsArr = [];
let buildSel = 'arrow', buildTool = 'build';   // build | sell

/* ---------- 玩家 ---------- */
const player = {
  pos: new THREE.Vector3(-70, 0, 2), vel: new THREE.Vector3(),
  yaw: -Math.PI / 2, pitch: 0,
  hp: 120, maxHp: 120, lastHurt: -99,
  fireCd: 0, grenades: 1, gCd: 0, hCd: 0, sCd: 0, shieldT: 0,
  dead: false, deadT: 0, invuln: 0,
  firing: false,
};

/* ---------- 枪械视图模型 ---------- */
const gunGroup = new THREE.Group();
(function makeGun() {
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c3038 });
  const woodM = new THREE.MeshLambertMaterial({ color: 0x8a6134 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98d });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.42), dark);
  body.position.set(0, 0, -0.1); gunGroup.add(body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.3), dark);
  barrel.position.set(0, 0.045, -0.42); gunGroup.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.16), woodM);
  stock.position.set(0, -0.02, 0.2); gunGroup.add(stock);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark);
  mag.position.set(0, -0.12, -0.08); gunGroup.add(mag);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.16), skin);
  hand.position.set(0.005, -0.1, 0.12); gunGroup.add(hand);
  const tip = new THREE.Object3D(); tip.position.set(0, 0.05, -0.6); tip.name = 'tip';
  gunGroup.add(tip);
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xffe66e, transparent: true, opacity: 0 }));
  flash.position.copy(tip.position); flash.name = 'flash'; gunGroup.add(flash);
  gunGroup.position.set(0.32, -0.26, -0.55);
  gunGroup.visible = false;   // 菜单阶段隐藏,进战斗再显示
  camera.add(gunGroup);
  scene.add(camera);
})();
const muzzleLight = new THREE.PointLight(0xffd9a0, 0, 9);
scene.add(muzzleLight);

/* ---------- 建造模式相机参数 ---------- */
const buildCam = { x: 0, z: 0, y: 82, panning: false };

/* ---------- 网格辅助(建造模式,只铺英雄周围) ---------- */
const gridHelper = new THREE.Group();
(function makeGrid() {
  const GRID_R = BUILD_R + 2;   // 比可建半径大一圈
  const pts = [];
  for (let i = 0; i <= GRID_R / CELL; i++) {
    const v = -GRID_R + i * CELL;
    pts.push(v, 0.06, -GRID_R, v, 0.06, GRID_R);
    pts.push(-GRID_R, 0.06, v, GRID_R, 0.06, v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  gridHelper.add(new THREE.LineSegments(g,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 })));
  gridHelper.visible = false;
  scene.add(gridHelper);
})();

/* ---------- 建造幽灵预览 ---------- */
const ghost = new THREE.Group();
const ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.2, 1.9),
  new THREE.MeshBasicMaterial({ color: 0x7cd63e, transparent: true, opacity: 0.35 }));
ghostBox.position.y = 1.1; ghost.add(ghostBox);
const ghostRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 40),
  new THREE.MeshBasicMaterial({ color: 0xf2cf46, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
ghostRing.rotation.x = -Math.PI / 2; ghostRing.position.y = 0.1; ghost.add(ghostRing);
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0x6fd8e8, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
rangeRing.rotation.x = -Math.PI / 2; rangeRing.position.y = 0.12; ghost.add(rangeRing);
ghost.visible = false; scene.add(ghost);

/* 建造范围圈(英雄周围) */
const buildRangeRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 72),
  new THREE.MeshBasicMaterial({ color: 0xf2cf46, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
buildRangeRing.rotation.x = -Math.PI / 2;
buildRangeRing.scale.setScalar(BUILD_R);
buildRangeRing.position.y = 0.14;
buildRangeRing.visible = false;
scene.add(buildRangeRing);

/* 圣盾罩(技能激活时可见) */
const shieldDome = new THREE.Mesh(
  new THREE.SphereGeometry(SHIELD_R, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xf2cf46, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
shieldDome.visible = false;
scene.add(shieldDome);
const shieldRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 60),
  new THREE.MeshBasicMaterial({ color: 0xf2cf46, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
shieldRing.rotation.x = -Math.PI / 2;
shieldRing.scale.setScalar(SHIELD_R);
shieldRing.visible = false;
scene.add(shieldRing);

/* ================= 粒子 / 特效池 ================= */
const particles = [];
(function initParticles() {
  const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  for (let i = 0; i < 320; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    m.visible = false; scene.add(m);
    particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1, grav: 1 });
  }
})();
let particleIdx = 0;
function spawnParticle(x, y, z, color, spread, up, life, grav = 1, scale = 1) {
  const p = particles[particleIdx++ % particles.length];
  p.mesh.visible = true;
  p.mesh.position.set(x, y, z);
  p.mesh.scale.setScalar(scale);
  p.mesh.material.color.setHex(color);
  p.mesh.material.opacity = 1;
  p.vel.set(rand(-spread, spread), rand(up * 0.3, up), rand(-spread, spread));
  p.life = p.max = life; p.grav = grav;
}
function burst(pos, color, n, spread = 2.4, up = 3.5, scale = 1) {
  for (let i = 0; i < n; i++)
    spawnParticle(pos.x, pos.y, pos.z, color, spread, up, rand(0.35, 0.8), 1, scale);
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.mesh.visible) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= 9 * p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.y *= -0.4; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    p.mesh.material.opacity = p.life / p.max;
  }
}

/* 冲击波环 */
const rings = [];
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 42),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  rings.push({ mesh: m, life: 0, max: 1, r: 5 });
}
let ringIdx = 0;
function spawnRing(x, z, r, color) {
  const g = rings[ringIdx++ % rings.length];
  g.mesh.visible = true; g.mesh.position.set(x, 0.15, z);
  g.mesh.material.color.setHex(color);
  g.life = g.max = 0.5; g.r = r;
}
function updateRings(dt) {
  for (const g of rings) {
    if (!g.mesh.visible) continue;
    g.life -= dt;
    if (g.life <= 0) { g.mesh.visible = false; continue; }
    const t = 1 - g.life / g.max;
    g.mesh.scale.setScalar(0.4 + t * g.r);
    g.mesh.material.opacity = 1 - t;
  }
}

/* 曳光弹 */
const tracers = [];
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe66e, transparent: true }));
  m.visible = false; scene.add(m);
  tracers.push({ mesh: m, life: 0 });
}
let tracerIdx = 0;
function spawnTracer(from, to) {
  const t = tracers[tracerIdx++ % tracers.length];
  const d = from.distanceTo(to);
  t.mesh.visible = true;
  t.mesh.position.copy(from).lerp(to, 0.5);
  t.mesh.scale.set(1, 1, d);
  t.mesh.lookAt(to);
  t.life = 0.07;
}
function updateTracers(dt) {
  for (const t of tracers) {
    if (!t.mesh.visible) continue;
    t.life -= dt;
    if (t.life <= 0) { t.mesh.visible = false; continue; }
    t.mesh.material.opacity = t.life / 0.07;
  }
}

/* ================= 金币 ================= */
const coinGeo = new THREE.BoxGeometry(0.34, 0.34, 0.08);
const coinMat = new THREE.MeshBasicMaterial({ color: 0xf2cf46 });
function dropCoins(x, z, total) {
  let left = total;
  while (left > 0) {
    const v = left >= 3 && Math.random() < 0.5 ? 2 : 1;
    left -= v;
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(x + rand(-0.8, 0.8), 0.55, z + rand(-0.8, 0.8));
    scene.add(m);
    coinsArr.push({ mesh: m, value: v, t: rand(0, 6), magnet: false });
  }
  if (coinsArr.length > 110) {
    const old = coinsArr.shift();
    state.coins += old.value; scene.remove(old.mesh);
  }
}
function updateCoins(dt) {
  for (let i = coinsArr.length - 1; i >= 0; i--) {
    const c = coinsArr[i];
    c.t += dt;
    c.mesh.rotation.y = c.t * 3.2;
    c.mesh.position.y = 0.55 + Math.sin(c.t * 3) * 0.12;
    const d = dist2d(c.mesh.position.x, c.mesh.position.z, player.pos.x, player.pos.z);
    if (!player.dead && d < 6.5) c.magnet = true;
    if (c.magnet && !player.dead) {
      const dx = player.pos.x - c.mesh.position.x, dz = player.pos.z - c.mesh.position.z;
      const dd = Math.hypot(dx, dz) || 1;
      c.mesh.position.x += dx / dd * 14 * dt;
      c.mesh.position.z += dz / dd * 14 * dt;
      if (dd < 1.2) {
        state.coins += c.value; Sfx.coin();
        scene.remove(c.mesh); coinsArr.splice(i, 1);
        continue;
      }
    }
  }
}

/* ================= 村民 ================= */
function spawnVillagers() {
  for (let i = 0; i < TOTAL_VILLAGERS; i++) {
    const g = makeVillager();
    const off = (i % 2 === 0 ? 1 : -1) * rand(0.5, 1.5);
    const v = {
      mesh: g, seg: 0, t: -rand(0, 2.2),               // 负值 = 出发延迟(2.2s 内全部上路)
      off, hp: 26, maxHp: 26, panic: false, state: 'wait', // wait|walk|dying|saved
      anim: rand(0, 6), screamCd: 0,
    };
    g.position.set(VILLAGE_SPAWN.x + rand(-2, 2), 0, VILLAGE_SPAWN.z + off * 1.4);
    scene.add(g);
    villagers.push(v);
  }
}
function pathPoint(seg, t, off) {
  const a = PATH[seg], b = PATH[Math.min(seg + 1, PATH.length - 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  return [a[0] + dx * t + nx * off, a[1] + dz * t + nz * off, Math.atan2(dx, dz)];
}
function updateVillagers(dt) {
  for (const v of villagers) {
    if (v.state === 'dying') {
      v.dieT -= dt;
      v.mesh.rotation.x = Math.min(Math.PI / 2, v.mesh.rotation.x + dt * 4);
      if (v.dieT < 0.5) v.mesh.userData.mats.forEach(m => m.opacity = Math.max(0, v.dieT * 2));
      if (v.dieT <= 0) { scene.remove(v.mesh); v.state = 'gone'; }
      continue;
    }
    if (v.state === 'saved') {
      v.saveT -= dt;
      if (v.saveT < 0.4) v.mesh.userData.mats.forEach(m => m.opacity = Math.max(0, v.saveT * 2.5));
      if (v.saveT <= 0) { scene.remove(v.mesh); v.state = 'gone'; }
      continue;
    }
    if (v.state === 'gone') continue;
    if (v.state === 'wait') {
      v.t += dt;
      if (v.t >= 0) v.state = 'walk';
      else {
        // 还没出发就被逼近 → 立刻逃命
        for (const z of zombies) {
          if (z.dying) continue;
          if (dist2d(z.mesh.position.x, z.mesh.position.z, v.mesh.position.x, v.mesh.position.z) < 14) {
            v.state = 'walk'; v.t = 0; break;
          }
        }
        if (v.state === 'wait') continue;
      }
    }
    // panic 检查
    v.panic = false;
    for (const z of zombies) {
      if (z.dying) continue;
      if (dist2d(z.mesh.position.x, z.mesh.position.z, v.mesh.position.x, v.mesh.position.z) < 10) { v.panic = true; break; }
    }
    if (v.panic) {
      v.screamCd -= dt;
      if (v.screamCd <= 0) { Sfx.scream(); v.screamCd = rand(2.5, 5); }
    }
    // 前进(恐慌→力竭:先跑为快,跑久了会被追上,英雄必须解围)
    if (v.panic) v.stam = Math.min(10, (v.stam || 0) + dt);
    else v.stam = Math.max(0, (v.stam || 0) - dt * 0.6);
    let speed;
    if (v.stam > 8) speed = 1.8;                       // 力竭
    else speed = v.panic ? 3.45 : 2.2;
    const a = PATH[v.seg], b = PATH[v.seg + 1];
    const segLen = dist2d(a[0], a[1], b[0], b[1]);
    v.t += speed * dt / segLen;
    while (v.t >= 1 && v.seg < PATH.length - 2) { v.t -= 1; v.seg++; }
    if (v.seg >= PATH.length - 2 && v.t >= 1) {
      // 走完最后一段 → 直走进城
      v.cityT = (v.cityT || 0) + speed * dt;
      v.mesh.position.x = PATH[PATH.length - 1][0] + v.cityT;
      v.mesh.position.z = GATE_Z + v.off * 0.5;
      v.mesh.rotation.y = Math.PI / 2;
      if (v.mesh.position.x > GATE_X + 2.5) {
        v.state = 'saved'; v.saveT = 0.8; state.saved++;
        banner(L('savedMsg'), null, '#7cd63e', 0.9);
        burst(v.mesh.position, 0x7cd63e, 8, 1.5, 3);
        updateHUD();
        checkEnd();
        continue;
      }
    } else {
      const [x, z, rot] = pathPoint(v.seg, v.t, v.off);
      v.mesh.position.set(x, 0, z);
      v.mesh.rotation.y = rot;
    }
    // 动画
    v.anim += dt * (v.panic ? 13 : 7);
    v.mesh.position.y = Math.abs(Math.sin(v.anim)) * (v.panic ? 0.14 : 0.06);
    v.mesh.rotation.z = Math.sin(v.anim) * 0.06;
    // 血条
    const bar = v.mesh.userData.bar;
    if (v.hp < v.maxHp) {
      bar.visible = true;
      bar.userData.fg.scale.x = v.hp / v.maxHp;
      bar.quaternion.copy(camera.quaternion);
    }
  }
}
function hurtVillager(v, dmg) {
  if (v.state !== 'walk' && v.state !== 'wait') return;
  // 圣盾:英雄周围村民免伤
  if (player.shieldT > 0 &&
    dist2d(v.mesh.position.x, v.mesh.position.z, player.pos.x, player.pos.z) < SHIELD_R) {
    burst(v.mesh.position.clone().setY(1.6), 0xf2cf46, 3, 1, 1.5, 0.5);
    return;
  }
  v.hp -= dmg;
  burst(v.mesh.position.clone().setY(1.2), 0xa01818, 5, 1.6, 2.5, 0.7);
  if (v.hp <= 0) {
    v.state = 'dying'; v.dieT = 0.9; state.dead++;
    banner(L('deadMsg'), null, '#ff3b30', 0.9);
    Sfx.scream();
    updateHUD();
    if (state.dead >= LOSE_DEAD) gameOver(false);
    else checkEnd();
  }
}

/* ================= 僵尸 ================= */
function spawnZombie(typeName, x, z) {
  const t = ZTYPES[typeName];
  const g = makeZombie(t);
  g.position.set(x + rand(-1.5, 1.5), 0, z + rand(-1.5, 1.5));
  scene.add(g);
  const hp = Math.round(t.hp * DIFF().hpMul);
  zombies.push({
    mesh: g, type: t, hp, maxHp: hp,
    target: null, retargetT: 0, atkT: 0, slowT: 0, flashT: 0,
    kb: new THREE.Vector3(), anim: rand(0, 6), dying: false, dieT: 0,
  });
}
function zombieDamage(z, dmg, kbDir) {
  if (z.dying) return;
  z.hp -= dmg;
  z.flashT = 0.12;
  if (kbDir) {
    z.kb.x += kbDir.x * 6; z.kb.z += kbDir.z * 6; z.kb.y += 3;
  }
  if (z.hp <= 0) {
    z.dying = true; z.dieT = 0.8;
    state.kills++;
    dropCoins(z.mesh.position.x, z.mesh.position.z, z.type.coin);
    Sfx.zdeath();
  } else Sfx.hit();
}
function updateZombies(dt) {
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    const g = z.mesh;
    if (z.dying) {
      z.dieT -= dt;
      g.rotation.x = Math.min(Math.PI / 2, g.rotation.x + dt * 5);
      g.position.y = Math.max(0, g.position.y - dt * 0.5);
      if (z.dieT < 0.4) g.userData.mats.forEach(m => { m.transparent = true; m.opacity = Math.max(0, z.dieT * 2.5); });
      if (z.dieT <= 0) { scene.remove(g); zombies.splice(i, 1); }
      continue;
    }
    // 受击红闪 / 冰霜蓝调
    if (z.flashT > 0) z.flashT -= dt;
    if (z.slowT > 0) z.slowT -= dt;
    const emissive = z.flashT > 0 ? 0x881111 : (z.slowT > 0 ? 0x113366 : 0x000000);
    for (const m of g.userData.mats) if (m.emissive) m.emissive.setHex(emissive);

    // 重新索敌
    z.retargetT -= dt;
    if (z.retargetT <= 0 || !validTarget(z.target)) {
      z.retargetT = 0.45;
      z.target = pickTarget(z);
    }
    const tgt = z.target;
    let tx = g.position.x, tz = g.position.z, tReach = 1e9;
    if (tgt === 'player') { tx = player.pos.x; tz = player.pos.z; }
    else if (tgt && tgt.mesh) { tx = tgt.mesh.position.x; tz = tgt.mesh.position.z; }
    const dTarget = dist2d(g.position.x, g.position.z, tx, tz);
    const atkRange = z.type.atkR;

    // 移动
    let speed = z.type.speed * (z.slowT > 0 ? 0.45 : 1);
    let mvx = 0, mvz = 0;
    if (dTarget > atkRange * 0.85) {
      const dx = tx - g.position.x, dz = tz - g.position.z;
      const d = Math.hypot(dx, dz) || 1;
      mvx = dx / d * speed; mvz = dz / d * speed;
      g.rotation.y = Math.atan2(dx, dz);
    }
    // 同类分离
    for (const o of zombies) {
      if (o === z || o.dying) continue;
      const dx = g.position.x - o.mesh.position.x, dz = g.position.z - o.mesh.position.z;
      const dd = dx * dx + dz * dz;
      const rr = (z.type.scale + o.type.scale) * 0.55;
      if (dd < rr * rr && dd > 0.0001) {
        const d = Math.sqrt(dd);
        mvx += dx / d * 2.4; mvz += dz / d * 2.4;
      }
    }
    // 击退衰减
    z.kb.multiplyScalar(Math.max(0, 1 - 5 * dt));
    let nx = g.position.x + (mvx + z.kb.x) * dt;
    let nz = g.position.z + (mvz + z.kb.z) * dt;

    // 塔碰撞 → 啃塔
    let chewTower = null;
    for (const [, tw] of towers) {
      const r = tw.type === 'wall' ? 1.35 : 1.25;
      const dx = nx - tw.mesh.position.x, dz = nz - tw.mesh.position.z;
      const dd = Math.hypot(dx, dz);
      if (dd < r + 0.45 * z.type.scale && dd > 0.001) {
        const push = (r + 0.45 * z.type.scale - dd);
        nx += dx / dd * push; nz += dz / dd * push;
        if (!chewTower || tw.hp < chewTower.hp) chewTower = tw;
      }
    }
    nx = clamp(nx, -HALF + 1, HALF - 1);
    nz = clamp(nz, -HALF + 1, HALF - 1);
    g.position.x = nx; g.position.z = nz;

    // 攻击判定(弓箭手远程放箭)
    z.atkT -= dt;
    if (z.atkT <= 0) {
      let attacked = false;
      if (tgt === 'player' && dTarget < atkRange && !player.dead && player.invuln <= 0) {
        if (z.type.bow) { fireEnemyArrow(z, 'player'); z.atkT = 2.4; }
        else { hurtPlayer(z.type.dmg); z.atkT = 0.9; }
        attacked = true;
      } else if (tgt && tgt.mesh && dTarget < atkRange && tgt.state !== 'dying' && tgt.state !== 'saved' && tgt.state !== 'gone') {
        if (z.type.bow) { fireEnemyArrow(z, tgt); z.atkT = 2.4; }
        else { hurtVillager(tgt, z.type.dmg); z.atkT = 1.0; }
        attacked = true;
      }
      if (!attacked && chewTower) {
        damageTower(chewTower, z.type.chew);
        z.atkT = 0.8;
        // 面向塔啃
        const dx = chewTower.mesh.position.x - g.position.x, dz = chewTower.mesh.position.z - g.position.z;
        g.rotation.y = Math.atan2(dx, dz);
      }
    }

    // 行走动画
    z.anim += dt * (6 + z.type.speed * 2.5);
    const sw = Math.sin(z.anim);
    g.userData.legL.rotation.x = sw * 0.7;
    g.userData.legR.rotation.x = -sw * 0.7;
    g.userData.armL.rotation.x = -1.35 + Math.sin(z.anim * 0.7) * 0.12;
    g.userData.armR.rotation.x = -1.35 - Math.sin(z.anim * 0.7) * 0.12;
    g.position.y = Math.abs(sw) * 0.05;

    // 血条
    const bar = g.userData.bar;
    if (z.hp < z.maxHp) {
      bar.visible = true;
      bar.userData.fg.scale.x = Math.max(0, z.hp / z.maxHp);
      bar.quaternion.copy(camera.quaternion);
    }
  }
}
function validTarget(t) {
  if (t === 'player') return !player.dead;
  return t && t.mesh && (t.state === 'walk' || t.state === 'wait');
}
function pickTarget(z) {
  let best = null, bestScore = 1e9;
  for (const v of villagers) {
    if (v.state !== 'walk' && v.state !== 'wait') continue;
    const d = dist2d(z.mesh.position.x, z.mesh.position.z, v.mesh.position.x, v.mesh.position.z);
    const s = d - 10;   // 坚决优先扑向村民
    if (s < bestScore) { bestScore = s; best = v; }
  }
  if (!player.dead) {
    const d = dist2d(z.mesh.position.x, z.mesh.position.z, player.pos.x, player.pos.z);
    if (d - 1.5 < bestScore) { best = 'player'; }
  }
  return best;
}

/* ================= 塔 ================= */
function placeTower(type, cx, cz) {
  const def = TOWERS[type];
  const [x, z] = cellCenter(cx, cz);
  const mesh = makeTowerMesh(type);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const bar = hpBar(1.6, type === 'wall' ? 2.7 : 3.4);
  mesh.add(bar);
  const tw = { type, def, mesh, hp: def.hp, maxHp: def.hp, cd: 0, key: cellKey(cx, cz), bar, tick: 0 };
  mesh.userData.tower = tw;
  if (type === 'frost') {
    const aura = mesh.getObjectByName('aura');
    if (aura) aura.scale.setScalar(def.range / 1.17);
  }
  towers.set(tw.key, tw);
  return tw;
}
function damageTower(tw, dmg) {
  tw.hp -= dmg;
  Sfx.chew();
  burst(tw.mesh.position.clone().setY(1.2), 0x8a6134, 3, 1.4, 2, 0.6);
  if (tw.hp <= 0) {
    towers.delete(tw.key);
    scene.remove(tw.mesh);
    burst(tw.mesh.position.clone().setY(1), 0xa9825a, 18, 2.6, 4);
    Sfx.towerDown();
    banner(LANG === 'zh' ? '塔被啃掉了!' : 'Tower chewed down!', null, '#ff3b30', 0.9);
  }
}
function updateTowers(dt) {
  for (const [, tw] of towers) {
    if (tw.hp < tw.maxHp) {
      tw.bar.visible = true;
      tw.bar.userData.fg.scale.x = Math.max(0, tw.hp / tw.maxHp);
      tw.bar.quaternion.copy(camera.quaternion);
    }
    const def = tw.def;
    if (def.rate <= 0) {
      // 冰霜:光环
      tw.tick -= dt;
      const spin = tw.mesh.getObjectByName('aura');
      if (spin) spin.rotation.z += dt * 0.8;
      for (const z of zombies) {
        if (z.dying) continue;
        if (dist2d(z.mesh.position.x, z.mesh.position.z, tw.mesh.position.x, tw.mesh.position.z) < def.range) {
          z.slowT = 0.3;
          if (tw.tick <= 0) { z.hp -= 4; if (z.hp <= 0) zombieDamage(z, 0); }
        }
      }
      if (tw.tick <= 0) tw.tick = 0.8;
      continue;
    }
    if (tw.type === 'wall') continue;
    tw.cd -= dt;
    // 索敌:最近
    let best = null, bd = def.range;
    for (const z of zombies) {
      if (z.dying) continue;
      const d = dist2d(z.mesh.position.x, z.mesh.position.z, tw.mesh.position.x, tw.mesh.position.z);
      if (d < bd) { bd = d; best = z; }
    }
    const head = tw.mesh.getObjectByName('head');
    if (best) {
      const dx = best.mesh.position.x - tw.mesh.position.x, dz = best.mesh.position.z - tw.mesh.position.z;
      if (head) head.rotation.y = Math.atan2(dx, dz);
      if (tw.cd <= 0) {
        tw.cd = def.rate;
        if (tw.type === 'arrow') {
          fireArrow(tw.mesh.position.clone().setY(2.8), best, def.dmg);
        } else {
          fireCannon(tw.mesh.position.clone().setY(2.1), best.mesh.position.clone(), def.dmg);
        }
      }
    }
  }
}

/* ================= 投射物 ================= */
function fireArrow(from, targetZ, dmg) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xe8e2cf }));
  m.position.copy(from); scene.add(m);
  projectiles.push({ kind: 'arrow', mesh: m, target: targetZ, speed: 30, dmg });
}
function fireCannon(from, to, dmg) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x222228 }));
  m.position.copy(from); scene.add(m);
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  const T = clamp(d / 13, 0.3, 1.2);
  const vel = new THREE.Vector3(dx / d * 13, (0 - from.y + 0.5 * 16 * T * T) / T, dz / d * 13);
  projectiles.push({ kind: 'cannon', mesh: m, vel, dmg, life: 2.5 });
}
function fireEnemyArrow(z, target) {
  const from = z.mesh.position.clone().setY(1.5 * z.type.scale);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xd05a4a }));
  m.position.copy(from); scene.add(m);
  projectiles.push({ kind: 'earrow', mesh: m, target, speed: 17, dmg: z.type.dmg });
  Sfx.hit();
}
function fireGrenade() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const from = camera.position.clone().addScaledVector(dir, 0.8);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: 0x3a4a2e }));
  m.position.copy(from); scene.add(m);
  projectiles.push({ kind: 'grenade', mesh: m, vel: dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 5, 0)), dmg: 70, life: 3 });
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    let dead = false;
    if (p.kind === 'arrow') {
      const t = p.target;
      if (!t || t.dying || !t.mesh.parent) { dead = true; }
      else {
        const to = t.mesh.position.clone().setY(1.2 * t.type.scale);
        const d = p.mesh.position.distanceTo(to);
        if (d < 0.9) {
          zombieDamage(t, p.dmg);
          burst(to, 0xaa2222, 4, 1.5, 2, 0.6);
          dead = true;
        } else {
          const dir = to.clone().sub(p.mesh.position).normalize();
          p.mesh.position.addScaledVector(dir, p.speed * dt);
          p.mesh.lookAt(to);
        }
      }
    } else if (p.kind === 'earrow') {
      // 僵尸弓箭手:追踪村民或玩家
      const t = p.target;
      let to = null;
      if (t === 'player') {
        if (!player.dead) to = player.pos.clone().setY(1.5);
      } else if (t && t.mesh && (t.state === 'walk' || t.state === 'wait')) {
        to = t.mesh.position.clone().setY(1.2);
      }
      if (!to) dead = true;
      else {
        const d = p.mesh.position.distanceTo(to);
        if (d < 1.0) {
          if (t === 'player') hurtPlayer(p.dmg);
          else hurtVillager(t, p.dmg);
          burst(to, 0xd05a4a, 3, 1.2, 1.8, 0.5);
          dead = true;
        } else {
          const dir = to.clone().sub(p.mesh.position).normalize();
          p.mesh.position.addScaledVector(dir, p.speed * dt);
          p.mesh.lookAt(to);
        }
      }
    } else {
      // cannon / grenade:抛物线
      p.vel.y -= 16 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.life -= dt;
      if (p.life <= 0) dead = true;
      if (p.mesh.position.y <= 0.15) dead = true;
      if (!dead && p.kind === 'grenade') {
        for (const z of zombies) {
          if (z.dying) continue;
          if (p.mesh.position.distanceTo(z.mesh.position.clone().setY(1)) < 1.1 * z.type.scale) { dead = true; break; }
        }
      }
      if (dead && p.kind !== 'arrow' && p.kind !== 'earrow') explode(p.mesh.position, p.dmg, p.kind === 'grenade' ? 4.6 : 3.4);
    }
    if (dead) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
}
function explode(pos, dmg, radius) {
  Sfx.boom();
  spawnRing(pos.x, pos.z, radius, 0xffb347);
  burst(pos, 0xff8c1a, 16, 3, 5, 1.3);
  burst(pos, 0xffe66e, 10, 2, 4, 0.9);
  for (const z of zombies) {
    if (z.dying) continue;
    const d = dist2d(pos.x, pos.z, z.mesh.position.x, z.mesh.position.z);
    if (d < radius) {
      const fall = 1 - d / radius * 0.6;
      const dir = new THREE.Vector3(z.mesh.position.x - pos.x, 0, z.mesh.position.z - pos.z).normalize();
      zombieDamage(z, dmg * fall, dir);
    }
  }
}

/* ================= 自动演示 AI =================
 * P 键随时接管/交出;T 键加速模拟(x1/x2/x4)
 * 行为:跟队尾 → 优先扑向威胁僵尸并放风筝射击 → 捡金币
 *       按局势放手雷/圣盾/圣光,有钱自动在路径旁建塔 */
const ai = {
  enabled: false, speed: 1,
  moveX: 0, moveZ: 0, aimYaw: 0, aimPitch: 0,
  decideT: 0, buildT: 8, target: null,
};
function normAngle(a) { return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
function aiUpdate(dt) {
  if (player.dead) { player.firing = false; return; }
  ai.decideT -= dt;
  if (ai.decideT <= 0) { ai.decideT = 0.25; aiDecide(); }
  ai.buildT -= dt;
  if (ai.buildT <= 0) { ai.buildT = 5; aiTryBuild(); }
  // 平滑转向
  const dy = normAngle(ai.aimYaw - player.yaw);
  player.yaw += clamp(dy, -7 * dt, 7 * dt);
  player.pitch += clamp(ai.aimPitch - player.pitch, -5 * dt, 5 * dt);
  player.firing = ai.target && !ai.target.dying && Math.abs(dy) < 0.25;
}
function aiDecide() {
  // ---- 威胁评估:距村民<18 或 距玩家<10 的最近僵尸(弓箭手优先击杀) ----
  let threat = null, tScore = 1e9;
  for (const z of zombies) {
    if (z.dying) continue;
    const dzp = dist2d(z.mesh.position.x, z.mesh.position.z, player.pos.x, player.pos.z);
    let near = dzp < 10 ? dzp : 1e9;
    for (const v of villagers) {
      if (v.state !== 'walk' && v.state !== 'wait') continue;
      const d = dist2d(z.mesh.position.x, z.mesh.position.z, v.mesh.position.x, v.mesh.position.z);
      if (d < near) near = d;
    }
    if (near < 18) {
      const score = near / (z.type.bow ? 2.2 : 1);   // 弓箭手远程磨村民,权重最高
      if (score < tScore) { tScore = score; threat = z; }
    }
  }
  ai.target = threat;
  // ---- 瞄准:优先威胁,否则 40m 内最近僵尸 ----
  let aimZ = threat;
  if (!aimZ) {
    let bd = 40;
    for (const z of zombies) {
      if (z.dying) continue;
      const d = dist2d(z.mesh.position.x, z.mesh.position.z, player.pos.x, player.pos.z);
      if (d < bd) { bd = d; aimZ = z; }
    }
  }
  if (aimZ) {
    const dx = aimZ.mesh.position.x - player.pos.x, dz = aimZ.mesh.position.z - player.pos.z;
    const dh = Math.hypot(dx, dz) || 1;
    ai.aimYaw = Math.atan2(-dx, -dz);
    ai.aimPitch = Math.atan2(1.1 * aimZ.type.scale - 1.68, dh);
  }
  // ---- 移动目标 ----
  let gx = player.pos.x, gz = player.pos.z, keep = 0;
  if (threat) {
    // 风筝:与威胁保持 ~12m
    const d = dist2d(threat.mesh.position.x, threat.mesh.position.z, player.pos.x, player.pos.z);
    keep = clamp((d - 12) / 6, -1, 1);   // >0 靠近, <0 后撤
    gx = threat.mesh.position.x; gz = threat.mesh.position.z;
  } else {
    // 跟随队尾(进度最低的行走村民)后方
    let tail = null, tp = 1e9;
    for (const v of villagers) {
      if (v.state !== 'walk') continue;
      const p = v.seg + v.t;
      if (p < tp) { tp = p; tail = v; }
    }
    if (tail) {
      const dx = player.pos.x - tail.mesh.position.x, dz = player.pos.z - tail.mesh.position.z;
      const d = Math.hypot(dx, dz) || 1;
      gx = tail.mesh.position.x + dx / d * 4; gz = tail.mesh.position.z + dz / d * 4;
      keep = clamp((d - 4) / 5, 0, 1);
    }
  }
  // 捡金币:无威胁专程去捡(16m),有威胁也顺路吸(7m 内)
  let mx = 0, mz = 0;
  if (keep !== 0) {
    const dx = gx - player.pos.x, dz = gz - player.pos.z, d = Math.hypot(dx, dz) || 1;
    mx = dx / d * keep; mz = dz / d * keep;
  }
  const coinR = threat ? 7 : 18;
  let coin = null, cd2 = coinR * coinR;
  for (const c of coinsArr) {
    const d2 = (c.mesh.position.x - player.pos.x) ** 2 + (c.mesh.position.z - player.pos.z) ** 2;
    if (d2 < cd2) { cd2 = d2; coin = c; }
  }
  if (coin) {
    const cdx = coin.mesh.position.x - player.pos.x, cdz = coin.mesh.position.z - player.pos.z;
    const cd = Math.hypot(cdx, cdz) || 1;
    if (!threat) { mx = cdx / cd; mz = cdz / cd; }
    else { mx += cdx / cd * 0.7; mz += cdz / cd * 0.7; }
  }
  ai.moveX = clamp(mx, -1, 1); ai.moveZ = clamp(mz, -1, 1);
  // ---- 技能 ----
  if (player.gCd <= 0) {
    // 手雷:6m 内 ≥3 只僵尸的簇,簇心距玩家 < 24
    for (const z of zombies) {
      if (z.dying) continue;
      if (dist2d(z.mesh.position.x, z.mesh.position.z, player.pos.x, player.pos.z) > 24) continue;
      let n = 0, cx = 0, cz = 0;
      for (const o of zombies) {
        if (o.dying) continue;
        if (dist2d(o.mesh.position.x, o.mesh.position.z, z.mesh.position.x, z.mesh.position.z) < 6) {
          n++; cx += o.mesh.position.x; cz += o.mesh.position.z;
        }
      }
      if (n >= 3) { aiThrowGrenade(cx / n, cz / n); break; }
    }
  }
  if (player.sCd <= 0) {
    for (const v of villagers) {
      if (v.state !== 'walk' && v.state !== 'wait') continue;
      let danger = false;
      for (const z of zombies) {
        if (z.dying) continue;
        if (dist2d(z.mesh.position.x, z.mesh.position.z, v.mesh.position.x, v.mesh.position.z) < 3.5) { danger = true; break; }
      }
      if (danger) { castShield(); break; }
    }
  }
  if (player.hCd <= 0) {
    const hurtV = villagers.some(v => (v.state === 'walk') && v.hp < v.maxHp * 0.6 &&
      dist2d(v.mesh.position.x, v.mesh.position.z, player.pos.x, player.pos.z) < 12);
    const hurtT = [...towers.values()].some(tw => tw.hp < tw.maxHp * 0.55 &&
      dist2d(tw.mesh.position.x, tw.mesh.position.z, player.pos.x, player.pos.z) < 12);
    if (hurtV || hurtT) castHeal();
  }
}
function aiThrowGrenade(tx, tz) {
  player.gCd = 6;
  const from = new THREE.Vector3(player.pos.x, 1.7, player.pos.z);
  const d = clamp(dist2d(tx, tz, from.x, from.z), 6, 24);
  const T = d / 17;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: 0x3a4a2e }));
  m.position.copy(from); scene.add(m);
  projectiles.push({
    kind: 'grenade', mesh: m, dmg: 70, life: 3,
    vel: new THREE.Vector3((tx - from.x) / (d || 1) * 17, (0 - from.y + 0.5 * 16 * T * T) / T, (tz - from.z) / (d || 1) * 17),
  });
  updateSkillUI();
}
function aiTryBuild() {
  if (state.coins < 15) return;
  // 统计现有塔
  let nf = 0, nc = 0;
  for (const [, tw] of towers) { if (tw.type === 'frost') nf++; if (tw.type === 'cannon') nc++; }
  let type = null;
  if (nf < 1 && state.coins >= TOWERS.frost.cost) type = 'frost';
  else if (nc < 1 && state.coins >= TOWERS.cannon.cost + 10) type = 'cannon';
  else if (state.coins >= TOWERS.arrow.cost) type = 'arrow';
  if (!type) return;
  // 英雄周围 BUILD_R 内找"靠路径 + 僵尸多"的空格
  const pcx = Math.floor((player.pos.x + HALF) / CELL), pcz = Math.floor((player.pos.z + HALF) / CELL);
  let best = null, bestScore = -1;
  for (let cx = pcx - 13; cx <= pcx + 13; cx++) for (let cz = pcz - 13; cz <= pcz + 13; cz++) {
    if (!cellBuildable(cx, cz)) continue;
    const [x, z] = cellCenter(cx, cz);
    const pd = pathDist(x, z);
    if (pd < 3 || pd > 9) continue;    // 贴路但不挡路
    let score = (9 - pd) * 0.5;
    for (const zb of zombies) {
      if (zb.dying) continue;
      if (dist2d(zb.mesh.position.x, zb.mesh.position.z, x, z) < 15) score += 2;
    }
    if (score > bestScore) { bestScore = score; best = [cx, cz]; }
  }
  if (!best) return;
  state.coins -= TOWERS[type].cost;
  placeTower(type, best[0], best[1]);
  spawnRing(cellCenter(best[0], best[1])[0], cellCenter(best[0], best[1])[1], 3, 0xf2cf46);
  Sfx.place();
  banner(`🤖 ${TOWERS[type].ico} ${TOWERS[type].name}`, null, '#6fd8e8', 1);
  updateHUD();
}

/* ================= 玩家 ================= */
const keys = {};
function hurtPlayer(dmg) {
  if (player.dead || state.mode !== 'play') return;
  player.hp -= dmg;
  player.lastHurt = state.playT;
  Sfx.hit();
  $('dmg-flash').style.opacity = 0.9;
  setTimeout(() => $('dmg-flash').style.opacity = 0, 180);
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; player.deadT = 6;
    $('dead-overlay').classList.remove('hidden');
    banner(LANG === 'zh' ? '你倒下了!村民危险!' : 'You fell! Villagers in danger!', null, '#ff3b30', 1.4);
  }
  updateHUD();
}
function updatePlayer(dt) {
  player.invuln -= dt;
  if (player.fireCd > 0) player.fireCd -= dt;
  if (player.gCd > 0) player.gCd -= dt;
  if (player.hCd > 0) player.hCd -= dt;
  if (player.sCd > 0) player.sCd -= dt;
  // 圣盾视觉
  if (player.shieldT > 0) {
    player.shieldT -= dt;
    shieldDome.visible = true;
    shieldRing.visible = true;
    shieldDome.position.set(player.pos.x, 0.2, player.pos.z);
    shieldRing.position.set(player.pos.x, 0.16, player.pos.z);
    shieldDome.material.opacity = 0.09 + Math.abs(Math.sin(state.playT * 5)) * 0.07;
    if (player.shieldT <= 0) { shieldDome.visible = false; shieldRing.visible = false; }
  }
  if (player.dead) {
    player.deadT -= dt;
    $('dead-count').textContent = Math.ceil(player.deadT);
    if (player.deadT <= 0) {
      player.dead = false;
      player.hp = player.maxHp;
      player.pos.set(VILLAGE_SPAWN.x + 2, 0, VILLAGE_SPAWN.z);
      player.invuln = 2.5;
      $('dead-overlay').classList.add('hidden');
      banner(LANG === 'zh' ? '英雄归来!' : 'Hero returns!', null, '#7cd63e', 1);
    }
    return;
  }
  // 回血
  if (state.playT - player.lastHurt > 5 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 3.5 * dt);
  }
  // 移动
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3();
  if (ai.enabled) {
    aiUpdate(dt);
    move.set(ai.moveX, 0, ai.moveZ);
  } else {
    if (keys['KeyW']) move.add(fwd);
    if (keys['KeyS']) move.sub(fwd);
    if (keys['KeyA']) move.sub(right);
    if (keys['KeyD']) move.add(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(keys['ShiftLeft'] ? 8.8 : 6.4);
    // 触屏摇杆
    if (touch.active) {
      move.addScaledVector(fwd, touch.jy).addScaledVector(right, touch.jx);
    }
  }
  player.pos.x += move.x * dt;
  player.pos.z += move.z * dt;
  // 重力跳跃
  player.vel.y -= 26 * dt;
  player.pos.y += player.vel.y * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.canJump = true; }
  // 塔碰撞
  for (const [, tw] of towers) {
    const r = tw.type === 'wall' ? 1.35 : 1.25;
    const dx = player.pos.x - tw.mesh.position.x, dz = player.pos.z - tw.mesh.position.z;
    const dd = Math.hypot(dx, dz);
    if (dd < r + 0.5 && dd > 0.001) {
      const push = r + 0.5 - dd;
      player.pos.x += dx / dd * push; player.pos.z += dz / dd * push;
    }
  }
  player.pos.x = clamp(player.pos.x, -HALF + 1, HALF - 1);
  player.pos.z = clamp(player.pos.z, -HALF + 1, HALF - 1);
  // 相机
  camera.position.set(player.pos.x, player.pos.y + 1.68, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  // 开火
  if (player.firing && player.fireCd <= 0) shoot();
}
function shoot() {
  player.fireCd = 0.16;
  Sfx.shot();
  // 枪口闪光
  const flash = gunGroup.getObjectByName('flash');
  flash.material.opacity = 1;
  setTimeout(() => flash.material.opacity = 0, 45);
  const tip = new THREE.Vector3();
  gunGroup.getObjectByName('tip').getWorldPosition(tip);
  muzzleLight.position.copy(tip); muzzleLight.intensity = 2.2;
  // 射线检测(球体)
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  let hitT = 60, hitZ = null;
  for (const z of zombies) {
    if (z.dying) continue;
    const c = z.mesh.position.clone().setY(1.15 * z.type.scale);
    const r = 0.62 * z.type.scale + 0.15;
    const oc = origin.clone().sub(c);
    const b = oc.dot(dir);
    const cc = oc.dot(oc) - r * r;
    const disc = b * b - cc;
    if (disc > 0) {
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < hitT) { hitT = t; hitZ = z; }
    }
  }
  if (dir.y < -0.02) {
    const tg = -(origin.y) / dir.y;
    if (tg > 0 && tg < hitT) hitT = tg;
  }
  const hitPoint = origin.addScaledVector(dir, hitT);
  spawnTracer(tip, hitPoint);
  if (hitZ) {
    zombieDamage(hitZ, 12);
    burst(hitPoint, 0xaa2222, 4, 1.6, 2.2, 0.6);
  } else if (hitT < 60) {
    burst(hitPoint, 0x9a8a6a, 3, 1.2, 1.6, 0.5);
  }
}
function castGrenade() {
  if (state.mode !== 'play' || player.gCd > 0 || player.dead) return;
  player.gCd = 6;
  fireGrenade();
  updateSkillUI();
}
function castHeal() {
  if (state.mode !== 'play' || player.hCd > 0 || player.dead) return;
  player.hCd = 15;
  Sfx.heal();
  spawnRing(player.pos.x, player.pos.z, 12, 0x7cd63e);
  burst(player.pos.clone().setY(1), 0x9fe86a, 14, 2.4, 4);
  for (const v of villagers) {
    if (v.state === 'walk' && v.hp < v.maxHp &&
      dist2d(v.mesh.position.x, v.mesh.position.z, player.pos.x, player.pos.z) < 12)
      v.hp = Math.min(v.maxHp, v.hp + 25);
  }
  for (const [, tw] of towers) {
    if (tw.hp < tw.maxHp && dist2d(tw.mesh.position.x, tw.mesh.position.z, player.pos.x, player.pos.z) < 12)
      tw.hp = Math.min(tw.maxHp, tw.hp + 40);
  }
  if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 35);
  updateSkillUI();
}
function castShield() {
  if (state.mode !== 'play' || player.sCd > 0 || player.dead) return;
  player.sCd = SHIELD_CD;
  player.shieldT = SHIELD_T;
  Sfx.heal();
  banner(L('shieldOn'), null, '#f2cf46', 1.1);
  spawnRing(player.pos.x, player.pos.z, SHIELD_R, 0xf2cf46);
  burst(player.pos.clone().setY(1.2), 0xf2cf46, 12, 2.2, 3.5);
  updateSkillUI();
}

/* ================= 波次 ================= */
const pendingSpawns = [];   // {type, at} — 基于playT,时停期间不会推进
function spawnWave() {
  state.wave++;
  const D = DIFF();
  state.nextWaveT = state.playT + D.waveInt;
  const n = state.wave;
  const walkers = Math.round((5 + n * 2) * D.cntMul);
  const runners = n >= 2 ? Math.round(n * 1.5 * D.cntMul) : 0;
  const archers = n >= 2 ? Math.max(1, Math.round(n * 0.8 * D.archerMul)) : 0;
  const brutes = n >= 3 ? Math.floor((n - 1) / 2 * D.cntMul) : 0;
  const giant = n % 5 === 0 ? 1 : 0;
  const list = [];
  for (let i = 0; i < walkers; i++) list.push('walker');
  for (let i = 0; i < runners; i++) list.push('runner');
  for (let i = 0; i < archers; i++) list.push('archer');
  for (let i = 0; i < brutes; i++) list.push('brute');
  for (let i = 0; i < giant; i++) list.push('giant');
  list.sort(() => Math.random() - 0.5);
  let delay = 0.5;
  for (const type of list) {
    delay += rand(0.15, 0.7);
    pendingSpawns.push({ type, at: state.playT + delay });
  }
  Sfx.horn();
  banner(STR[LANG].wave(n), STR[LANG].waveSub, '#ff3b30', 2.2);
}
function updatePendingSpawns() {
  for (let i = pendingSpawns.length - 1; i >= 0; i--) {
    const s = pendingSpawns[i];
    if (state.playT < s.at) continue;
    if (zombies.length > 44) { s.at = state.playT + 2; continue; }
    spawnZombie(s.type, ...pickPortal());
    pendingSpawns.splice(i, 1);
  }
}
function pickPortal() {
  // 70% 概率:从"离队尾(进度最低、已在行走的村民)最近的3个门"里选,从后方/侧翼追击
  let pool = PORTALS;
  let tail = null, tailProg = 1e9;
  for (const v of villagers) {
    if (v.state !== 'walk') continue;   // 只看已上路的村民,避免开局轰炸村口
    const prog = v.seg + v.t;
    if (prog < tailProg) { tailProg = prog; tail = v; }
  }
  if (tail && Math.random() < 0.7) {
    pool = [...PORTALS].sort((a, b) =>
      dist2d(a[0], a[1], tail.mesh.position.x, tail.mesh.position.z) -
      dist2d(b[0], b[1], tail.mesh.position.x, tail.mesh.position.z)).slice(0, 3);
  }
  const p = pool[randi(0, pool.length - 1)];
  return [p[0] * 0.94, p[1] * 0.94];
}

/* ================= HUD ================= */
function updateHUD() {
  $('hp-fill').style.width = (player.hp / player.maxHp * 100) + '%';
  $('hp-num').textContent = Math.ceil(player.hp);
  $('coin-num').textContent = state.coins;
  $('v-alive').textContent = Math.max(0, TOTAL_VILLAGERS - state.saved - state.dead);
  $('v-saved').textContent = state.saved;
  $('v-dead').textContent = state.dead;
  $('z-num').textContent = zombies.filter(z => !z.dying).length;
  $('w-num').textContent = Math.max(1, state.wave);
}
function updateSkillUI() {
  const g = $('cd-grenade'), h = $('cd-heal'), s = $('cd-shield');
  g.style.display = player.gCd > 0 ? 'flex' : 'none';
  if (player.gCd > 0) g.textContent = Math.ceil(player.gCd);
  h.style.display = player.hCd > 0 ? 'flex' : 'none';
  if (player.hCd > 0) h.textContent = Math.ceil(player.hCd);
  if (player.shieldT > 0) {
    s.style.display = 'flex';
    s.style.background = 'rgba(242,207,70,.85)';
    s.style.color = '#1a1408';
    s.textContent = Math.ceil(player.shieldT);
  } else {
    s.style.background = '';
    s.style.color = '';
    s.style.display = player.sCd > 0 ? 'flex' : 'none';
    if (player.sCd > 0) s.textContent = Math.ceil(player.sCd);
  }
}
/* ================= 小地图(以主角为中心) ================= */
const mmCanvas = $('minimap');
const mmCtx = mmCanvas ? mmCanvas.getContext('2d') : null;
function drawMinimap() {
  if (!mmCtx) return;
  const S = 150, R = S / 2, sc = 1.55;
  const c = mmCtx;
  c.clearRect(0, 0, S, S);
  c.save();
  c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
  c.fillStyle = '#10141f'; c.fillRect(0, 0, S, S);
  const px = player.pos.x, pz = player.pos.z;
  const X = x => R + (x - px) * sc, Y = z => R + (z - pz) * sc;
  // 护送路线
  c.strokeStyle = '#8f6f4a'; c.lineWidth = 3; c.beginPath();
  PATH.forEach(([x, z], i) => i ? c.lineTo(X(x), Y(z)) : c.moveTo(X(x), Y(z)));
  c.stroke();
  // 城门
  c.fillStyle = '#f2cf46'; c.fillRect(X(GATE_X) - 3, Y(GATE_Z) - 7, 6, 14);
  // 塔
  c.fillStyle = '#e8b98d';
  for (const [, tw] of towers)
    c.fillRect(X(tw.mesh.position.x) - 2, Y(tw.mesh.position.z) - 2, 4, 4);
  // 村民
  c.fillStyle = '#7cd63e';
  for (const v of villagers) {
    if (v.state !== 'walk' && v.state !== 'wait') continue;
    c.beginPath(); c.arc(X(v.mesh.position.x), Y(v.mesh.position.z), 2.2, 0, 7); c.fill();
  }
  // 僵尸
  c.fillStyle = '#ff5b4d';
  for (const z of zombies) {
    if (z.dying) continue;
    const r = 2.2 + (z.type.scale - 1) * 1.6;
    c.beginPath(); c.arc(X(z.mesh.position.x), Y(z.mesh.position.z), r, 0, 7); c.fill();
  }
  // 圣盾范围
  if (player.shieldT > 0) {
    c.strokeStyle = '#f2cf46'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(R, R, SHIELD_R * sc, 0, 7); c.stroke();
  }
  // 主角箭头(朝向)
  c.save();
  c.translate(R, R);
  c.rotate(-player.yaw);
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(0, 2.5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
  c.restore();
  c.restore();
}

let bannerTimer = null, subTimer = null;
function banner(text, sub, color = '#ff3b30', dur = 1.6) {  const b = $('banner');
  b.textContent = text;
  b.style.color = color;
  b.classList.remove('hidden', 'peace');
  if (color === '#7cd63e') b.classList.add('peace');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), dur * 1000);
  if (sub) {
    const s = $('sub-banner');
    s.textContent = sub;
    s.classList.remove('hidden');
    clearTimeout(subTimer);
    subTimer = setTimeout(() => s.classList.add('hidden'), dur * 1000 + 400);
  }
}

/* ================= 建造模式 ================= */
const buildUI = $('build-ui');
function enterBuild() {
  if (state.mode !== 'play') return;
  state.mode = 'build';
  player.firing = false;
  document.exitPointerLock && document.exitPointerLock();
  // 建造相机对准玩家(只看英雄周围)
  buildCam.x = clamp(player.pos.x, -HALF + 8, HALF - 8);
  buildCam.z = clamp(player.pos.z, -HALF + 8, HALF - 8);
  buildCam.y = 44;
  gunGroup.visible = false;
  tweenCamera(new THREE.Vector3(buildCam.x, buildCam.y, buildCam.z + 0.01),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
  gridHelper.position.set(player.pos.x, 0, player.pos.z);
  gridHelper.visible = true;
  ghost.visible = false;
  buildUI.classList.remove('hidden');
  $('crosshair').classList.add('hidden');
  // 建造范围圈 + 敌我位置标记
  buildRangeRing.position.set(player.pos.x, 0.14, player.pos.z);
  buildRangeRing.visible = true;
  for (const v of villagers) if (v.mesh.userData.marker) v.mesh.userData.marker.visible = true;
  for (const z of zombies) if (!z.dying && z.mesh.userData.marker) z.mesh.userData.marker.visible = true;
  renderBuildPanel();
  Sfx.place();
}
function exitBuild() {
  if (state.mode !== 'build') return;
  state.mode = 'play';
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  gunGroup.visible = true;
  tweenCamera(new THREE.Vector3(player.pos.x, player.pos.y + 1.68, player.pos.z), q, () => {
    $('hud-bc').textContent = isTouch ? '' : L('againHint');
    setTimeout(() => $('hud-bc').textContent = '', 2500);
  });
  gridHelper.visible = false;
  ghost.visible = false;
  buildUI.classList.add('hidden');
  $('crosshair').classList.remove('hidden');
  buildRangeRing.visible = false;
  for (const v of villagers) if (v.mesh.userData.marker) v.mesh.userData.marker.visible = false;
  for (const z of zombies) if (z.mesh.userData.marker) z.mesh.userData.marker.visible = false;
  Sfx.sell();
  if (!isTouch) lockPointer();
}
function tweenCamera(toPos, toQuat, onDone) {
  state.trans = {
    fromPos: camera.position.clone(), fromQuat: camera.quaternion.clone(),
    toPos, toQuat, t: 0, dur: 0.5, onDone
  };
}
function renderBuildPanel() {
  const panel = $('build-panel');
  let html = '';
  for (const [id, t] of Object.entries(TOWERS)) {
    html += `<div class="b-card ${buildSel === id && buildTool === 'build' ? 'sel' : ''} ${state.coins < t.cost ? 'poor' : ''}" data-t="${id}">
      <div class="b-ico">${t.ico}</div><div class="b-name">${t.name}</div>
      <div class="b-cost">🪙${t.cost}</div><div class="b-hp">HP ${t.hp}</div></div>`;
  }
  html += `<div class="b-card ${buildTool === 'sell' ? 'sel' : ''}" data-t="__sell">
    <div class="b-ico">🔨</div><div class="b-name">${L('sell')}</div>
    <div class="b-cost">+50%</div><div class="b-hp">&nbsp;</div></div>`;
  panel.innerHTML = html;
  panel.querySelectorAll('.b-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.t;
      if (id === '__sell') { buildTool = 'sell'; }
      else { buildTool = 'build'; buildSel = id; }
      $('build-desc').textContent = id === '__sell' ? L('sellDesc') : `${TOWERS[id].name}: ${TOWERS[id].desc}`;
      renderBuildPanel();
      Sfx.hit();
    });
  });
  $('build-desc').textContent = buildTool === 'sell' ? L('sellDesc') : `${TOWERS[buildSel].name}: ${TOWERS[buildSel].desc}`;
}
// 建造格有效?(须在英雄 BUILD_R 范围内)
function cellBuildable(cx, cz) {
  if (cx < 1 || cz < 1 || cx >= HALF - 1 || cz >= HALF - 1) return false;
  const key = cellKey(cx, cz);
  if (staticBlocked.has(key) || towers.has(key)) return false;
  const [x, z] = cellCenter(cx, cz);
  if (dist2d(x, z, player.pos.x, player.pos.z) > BUILD_R) return false;
  return true;
}
function cellInRange(cx, cz) {
  const [x, z] = cellCenter(cx, cz);
  return dist2d(x, z, player.pos.x, player.pos.z) <= BUILD_R;
}
// 鼠标 → 地面交点
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function screenToGround(nx, ny) {
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  const pt = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, pt) ? pt : null;
}
function updateBuildHover(nx, ny) {
  const pt = screenToGround(nx, ny);
  if (!pt) { ghost.visible = false; return; }
  const [cx, cz] = cellOf(pt.x, pt.z);
  const [x, z] = cellCenter(cx, cz);
  if (buildTool === 'sell') {
    ghost.visible = false;
    return;
  }
  ghost.visible = true;
  ghost.position.set(x, 0, z);
  const ok = cellBuildable(cx, cz) && state.coins >= TOWERS[buildSel].cost;
  ghostBox.material.color.setHex(ok ? 0x7cd63e : 0xff3b30);
  const range = TOWERS[buildSel].range;
  rangeRing.visible = range > 0;
  if (range > 0) rangeRing.scale.setScalar(range);
}
function tryBuildAt(nx, ny) {
  if (buildTool === 'sell') return;
  const pt = screenToGround(nx, ny);
  if (!pt) return;
  const [cx, cz] = cellOf(pt.x, pt.z);
  const def = TOWERS[buildSel];
  if (!cellInRange(cx, cz)) { Sfx.hit(); banner(L('outOfRange'), null, '#ff3b30', 0.9); return; }
  if (!cellBuildable(cx, cz)) { Sfx.hit(); return; }
  if (state.coins < def.cost) { Sfx.hit(); banner(LANG === 'zh' ? '金币不足!' : 'Not enough coins!', null, '#ff3b30', 0.8); return; }
  state.coins -= def.cost;
  placeTower(buildSel, cx, cz);
  Sfx.place();
  const cc = cellCenter(cx, cz);
  spawnRing(cc[0], cc[1], 3, 0xf2cf46);
  updateHUD(); renderBuildPanel();
}
function trySellAt(nx, ny) {
  const pt = screenToGround(nx, ny);
  if (!pt) return;
  const [cx, cz] = cellOf(pt.x, pt.z);
  const tw = towers.get(cellKey(cx, cz));
  if (tw) {
    const refund = Math.floor(tw.def.cost * 0.5);
    state.coins += refund;
    towers.delete(tw.key);
    scene.remove(tw.mesh);
    burst(tw.mesh.position.clone().setY(1), 0xa9825a, 10, 2, 3);
    Sfx.sell();
    banner(`+${refund} 🪙`, null, '#f2cf46', 0.7);
    updateHUD(); renderBuildPanel();
  }
}
function updateBuildCam(dt) {
  const sp = 42 * (buildCam.y / 80);
  if (keys['KeyW']) buildCam.z -= sp * dt;
  if (keys['KeyS']) buildCam.z += sp * dt;
  if (keys['KeyA']) buildCam.x -= sp * dt;
  if (keys['KeyD']) buildCam.x += sp * dt;
  // 平移锁定在英雄周围小范围
  buildCam.x = clamp(clamp(buildCam.x, player.pos.x - 14, player.pos.x + 14), -HALF + 8, HALF - 8);
  buildCam.z = clamp(clamp(buildCam.z, player.pos.z - 14, player.pos.z + 14), -HALF + 8, HALF - 8);
  if (state.trans) return;   // 补间中不接管
  camera.position.set(buildCam.x, buildCam.y, buildCam.z + 0.01);
  camera.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
}

/* ================= 流程 ================= */
function startGame() {
  resetWorld();
  state.mode = 'play';
  state.trans = null;
  state.playT = 0; state.wave = 0; state.nextWaveT = 10;
  state.coins = DIFF().coinStart; state.kills = 0; state.saved = 0; state.dead = 0;
  pendingSpawns.length = 0;
  player.pos.set(-70, 0, 2); player.vel.set(0, 0, 0);
  player.yaw = -Math.PI / 2; player.pitch = 0;
  player.hp = player.maxHp; player.dead = false; player.invuln = 1;
  player.gCd = 0; player.hCd = 0; player.fireCd = 0;
  player.sCd = 0; player.shieldT = 0;
  shieldDome.visible = false; shieldRing.visible = false;
  spawnVillagers();
  $('scr-menu').classList.add('hidden');
  $('scr-over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('crosshair').classList.remove('hidden');
  gunGroup.visible = true;
  if (isTouch) $('touch-ui').classList.remove('hidden');
  else {
    lockPointer();
    $('hud-bc').textContent = L('againHint');
    setTimeout(() => $('hud-bc').textContent = '', 2600);
  }
  banner(L('intro'), L('introSub'), '#7cd63e', 2.4);
  updateHUD(); updateSkillUI();
}
function resetWorld() {
  for (const z of zombies) scene.remove(z.mesh); zombies.length = 0;
  for (const v of villagers) scene.remove(v.mesh); villagers.length = 0;
  for (const [, tw] of towers) scene.remove(tw.mesh); towers.clear();
  for (const p of projectiles) scene.remove(p.mesh); projectiles.length = 0;
  for (const c of coinsArr) scene.remove(c.mesh); coinsArr.length = 0;
  particles.forEach(p => p.mesh.visible = false);
  rings.forEach(r => r.mesh.visible = false);
  $('dead-overlay').classList.add('hidden');
}
function checkEnd() {
  const resolved = state.saved + state.dead;
  if (resolved >= TOTAL_VILLAGERS) gameOver(true);
}
function gameOver(win) {
  if (state.mode === 'over') return;
  state.mode = 'over';
  document.exitPointerLock && document.exitPointerLock();
  $('touch-ui').classList.add('hidden');
  $('crosshair').classList.add('hidden');
  $('dead-overlay').classList.add('hidden');
  const score = state.saved * 100 + state.coins;
  const title = $('over-title');
  title.textContent = win ? L('winTitle') : L('loseTitle');
  title.className = 'over-title ' + (win ? 'win' : 'lose');
  $('over-sub').textContent = win ? STR[LANG].winSub(state.saved) : L('loseSub');
  $('over-score').textContent = score;
  $('over-detail').innerHTML =
    `🏰 ${L('towerSaved')}: <b>${state.saved}</b> / ${TOTAL_VILLAGERS} &nbsp; 💀: <b>${state.dead}</b><br>` +
    `🧟 ${LANG === 'zh' ? '击杀' : 'kills'}: <b>${state.kills}</b> &nbsp; 🪙: <b>${state.coins}</b> &nbsp; ` +
    `${LANG === 'zh' ? '尸潮' : 'waves'}: <b>${Math.max(1, state.wave)}</b>`;
  const stars = win ? (state.saved >= 18 ? '★★★' : state.saved >= 14 ? '★★' : '★') : '☆';
  $('over-stars').textContent = stars;
  if (!state.best || score > state.best.score) {
    state.best = { score, saved: state.saved };
    localStorage.setItem('gm_best', JSON.stringify(state.best));
  }
  setTimeout(() => $('scr-over').classList.remove('hidden'), 600);
  updateAiTag();
  win ? Sfx.win() : Sfx.lose();
}
function updateBestUI() {
  $('menu-best').textContent = state.best ? `${state.best.saved}/20 · ${state.best.score}` : '--';
}

/* ================= 输入:键鼠 ================= */
const isTouch = ('ontouchstart' in window) && navigator.maxTouchPoints > 0;
function lockPointer() {
  try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch (e) { /* 无手势上下文会抛错,忽略 */ }
}
canvas.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state.mode === 'play') {
    if (e.code === 'KeyQ') castGrenade();
    if (e.code === 'KeyE') castHeal();
    if (e.code === 'KeyR') castShield();
    if (e.code === 'KeyP') {
      ai.enabled = !ai.enabled;
      player.firing = false;
      banner(L(ai.enabled ? 'aiOn' : 'aiOff'), null, '#6fd8e8', 1.2);
      updateAiTag();
    }
    if (e.code === 'KeyT') {
      ai.speed = ai.speed === 1 ? 2 : ai.speed === 2 ? 4 : 1;
      banner(STR[LANG].speedMsg(ai.speed), null, '#6fd8e8', 0.9);
      updateAiTag();
    }
    if (e.code === 'KeyB') enterBuild();
    if (e.code === 'Space') {
      if (player.canJump && !player.dead) { player.vel.y = 8.6; player.canJump = false; }
      e.preventDefault();
    }
  } else if (state.mode === 'build') {
    if (e.code === 'KeyB' || e.code === 'Escape') exitBuild();
  }
});
document.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousedown', e => {
  Sfx.unlock();
  if (state.mode === 'play') {
    if (!isTouch && document.pointerLockElement !== canvas) {
      lockPointer();
      return;
    }
    if (e.button === 0) player.firing = true;
    if (e.button === 2) castGrenade();
  }
});
document.addEventListener('mouseup', e => { if (e.button === 0) player.firing = false; });

document.addEventListener('mousemove', e => {
  if (state.mode === 'play' && document.pointerLockElement === canvas) {
    player.yaw -= e.movementX * 0.0024;
    player.pitch = clamp(player.pitch - e.movementY * 0.0024, -1.35, 1.35);
  } else if (state.mode === 'build') {
    if (state.trans) return;
    mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNY = -(e.clientY / window.innerHeight) * 2 + 1;
    if (buildDrag.active) {
      const dx = e.clientX - buildDrag.x, dy = e.clientY - buildDrag.y;
      buildDrag.moved += Math.abs(dx) + Math.abs(dy);
      buildCam.x -= dx * (buildCam.y / 420);
      buildCam.z -= dy * (buildCam.y / 420);
      buildDrag.x = e.clientX; buildDrag.y = e.clientY;
    }
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state.mode === 'play' && !isTouch) {
    state.mode = 'pause';
    player.firing = false;
    $('scr-pause').classList.remove('hidden');
    $('crosshair').classList.add('hidden');
  }
});

/* 建造模式鼠标(挂 document,build-ui 本体 pointer-events:none 会穿透) */
let mouseNX = 0, mouseNY = 0;
const buildDrag = { active: false, x: 0, y: 0, moved: 0 };
document.addEventListener('mousedown', e => {
  if (state.mode !== 'build' || state.trans) return;
  if (e.target.closest('.b-card') || e.target.closest('#btn-build-exit')) return;
  mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNY = -(e.clientY / window.innerHeight) * 2 + 1;
  if (e.button === 2) { buildDrag.active = true; buildDrag.moved = 0; buildDrag.x = e.clientX; buildDrag.y = e.clientY; }
  if (e.button === 0) tryBuildAt(mouseNX, mouseNY);
});
document.addEventListener('mouseup', e => {
  if (state.mode !== 'build' || state.trans) return;
  if (e.button === 2) {
    if (!buildDrag.moved) trySellAt(mouseNX, mouseNY);
    buildDrag.active = false;
  }
});
canvas.addEventListener('wheel', e => {
  if (state.mode === 'build' && !state.trans) {
    buildCam.y = clamp(buildCam.y + e.deltaY * 0.06, 28, 64);
    e.preventDefault();
  }
}, { passive: false });

$('btn-build-exit').addEventListener('click', exitBuild);
$('sk-build').addEventListener('click', () => { if (state.mode === 'play') enterBuild(); });

/* ================= 输入:触屏 ================= */
const touch = { active: false, jx: 0, jy: 0, lookId: -1, lastX: 0, lastY: 0, pinch: 0 };
(function initTouch() {
  if (!isTouch) return;
  const joy = $('joy'), knob = $('joy-knob');
  let joyId = -1, cx = 0, cy = 0;
  joy.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const r = joy.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    touch.active = true;
    Sfx.unlock();
  }, { passive: false });
  joy.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      let dx = (t.clientX - cx) / 42, dy = (t.clientY - cy) / 42;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      touch.jx = dx; touch.jy = -dy;
      knob.style.left = 50 + dx * 30 + '%';
      knob.style.top = 50 + dy * 30 + '%';
    }
  }, { passive: false });
  const joyEnd = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyId = -1; touch.active = false; touch.jx = touch.jy = 0;
      knob.style.left = '50%'; knob.style.top = '50%';
    }
  };
  joy.addEventListener('touchend', joyEnd);
  joy.addEventListener('touchcancel', joyEnd);

  const pad = $('look-pad');
  pad.addEventListener('touchstart', e => {
    e.preventDefault();
    if (state.mode === 'build') {
      // 建造:单指 = 放置/拆除,双指 = 缩放
      if (e.touches.length === 2) {
        touch.pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      } else {
        const t = e.changedTouches[0];
        touch.tapX = t.clientX; touch.tapY = t.clientY; touch.tapMoved = 0; touch.lookId = t.identifier;
        touch.lastX = t.clientX; touch.lastY = t.clientY;
      }
      Sfx.unlock();
      return;
    }
    const t = e.changedTouches[0];
    touch.lookId = t.identifier; touch.lastX = t.clientX; touch.lastY = t.clientY;
  }, { passive: false });
  pad.addEventListener('touchmove', e => {
    e.preventDefault();
    if (state.mode === 'build') {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (touch.pinch > 0) buildCam.y = clamp(buildCam.y - (d - touch.pinch) * 0.25, 28, 64);
        touch.pinch = d;
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier !== touch.lookId) continue;
        const dx = t.clientX - touch.lastX, dy = t.clientY - touch.lastY;
        touch.tapMoved += Math.abs(dx) + Math.abs(dy);
        mouseNX = (t.clientX / window.innerWidth) * 2 - 1;
        mouseNY = -(t.clientY / window.innerHeight) * 2 + 1;
        if (touch.tapMoved > 10) {   // 拖动 = 平移
          buildCam.x -= dx * (buildCam.y / 420);
          buildCam.z -= dy * (buildCam.y / 420);
        }
        touch.lastX = t.clientX; touch.lastY = t.clientY;
      }
      return;
    }
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.lookId) continue;
      player.yaw -= (t.clientX - touch.lastX) * 0.005;
      player.pitch = clamp(player.pitch - (t.clientY - touch.lastY) * 0.005, -1.35, 1.35);
      touch.lastX = t.clientX; touch.lastY = t.clientY;
    }
  }, { passive: false });
  pad.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.lookId) continue;
      if (state.mode === 'build' && touch.tapMoved <= 10) {
        const nx = (touch.tapX / window.innerWidth) * 2 - 1;
        const ny = -(touch.tapY / window.innerHeight) * 2 + 1;
        if (buildTool === 'sell') trySellAt(nx, ny);
        else tryBuildAt(nx, ny);
      }
      touch.lookId = -1; touch.pinch = 0;
    }
  }, { passive: false });

  const fireBtn = $('tb-fire');
  fireBtn.addEventListener('touchstart', e => { e.preventDefault(); player.firing = true; Sfx.unlock(); }, { passive: false });
  fireBtn.addEventListener('touchend', e => { e.preventDefault(); player.firing = false; }, { passive: false });
  $('tb-g').addEventListener('touchstart', e => { e.preventDefault(); castGrenade(); }, { passive: false });
  $('tb-h').addEventListener('touchstart', e => { e.preventDefault(); castHeal(); }, { passive: false });
  $('tb-s').addEventListener('touchstart', e => { e.preventDefault(); castShield(); }, { passive: false });
  $('tb-b').addEventListener('touchstart', e => { e.preventDefault(); if (state.mode === 'play') enterBuild(); }, { passive: false });
})();

/* ================= 按钮 ================= */
function updateAiTag() {
  const el = $('ai-tag');
  if (state.mode === 'play' && ai.enabled) {
    el.textContent = STR[LANG].aiTag(ai.speed);
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}
$('btn-start').addEventListener('click', () => { Sfx.unlock(); ai.enabled = false; ai.speed = 1; startGame(); updateAiTag(); });
$('btn-demo').addEventListener('click', () => {
  Sfx.unlock(); ai.enabled = true; ai.speed = 1; ai.buildT = 3;
  startGame(); updateAiTag();
  banner(L('aiOn'), null, '#6fd8e8', 1.6);
});
$('btn-again').addEventListener('click', () => { Sfx.unlock(); startGame(); });
$('btn-resume').addEventListener('click', () => {
  $('scr-pause').classList.add('hidden');
  state.mode = 'play';
  $('crosshair').classList.remove('hidden');
  if (!isTouch) lockPointer();
});
canvas.addEventListener('click', () => {
  if (state.mode === 'play' && !isTouch && document.pointerLockElement !== canvas)
    lockPointer();
});
$('sk-grenade').addEventListener('click', castGrenade);
$('sk-heal').addEventListener('click', castHeal);
$('sk-shield').addEventListener('click', castShield);

/* ================= 主循环 ================= */
let lastT = performance.now();
let hudTick = 0;
function stepWorld(dt) {
  state.playT += dt;
  updatePlayer(dt);
  updateVillagers(dt);
  updateZombies(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  updateCoins(dt);
  updateParticles(dt);
  updateRings(dt);
  updateTracers(dt);
  updatePendingSpawns();
  if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 22);
  if (state.playT >= state.nextWaveT) spawnWave();
}
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  state.time += dt;

  // 相机补间
  if (state.trans) {
    const tr = state.trans;
    tr.t += dt / tr.dur;
    const k = tr.t >= 1 ? 1 : (1 - Math.pow(1 - tr.t, 3));  // easeOutCubic
    camera.position.lerpVectors(tr.fromPos, tr.toPos, k);
    camera.quaternion.slerpQuaternions
      ? camera.quaternion.slerpQuaternions(tr.fromQuat, tr.toQuat, k)
      : THREE.Quaternion.slerp(tr.fromQuat, tr.toQuat, camera.quaternion, k);
    if (tr.t >= 1) {
      const done = tr.onDone;
      state.trans = null;
      done && done();
    }
  }

  if (state.mode === 'play') {
    const steps = ai.speed;
    for (let i = 0; i < steps; i++) stepWorld(dt);
    drawMinimap();
    hudTick -= dt;
    if (hudTick <= 0) { hudTick = 0.2; updateHUD(); updateSkillUI(); }
  } else if (state.mode === 'build') {
    updateBuildCam(dt);
    if (!state.trans) updateBuildHover(mouseNX, mouseNY);
    // 冻结世界(时停)
  } else if (state.mode === 'over') {
    updateParticles(dt);
    updateRings(dt);
  }

  renderer.render(scene, camera);
}

updateBestUI();
// 菜单背景:相机绕村子缓慢环绕(暂停时保持视角不动)
let menuAngle = 0;
(function menuLoop() {
  if (state.mode === 'menu') {
    menuAngle += 0.0012;
    camera.position.set(-56 + Math.cos(menuAngle) * 26, 16, Math.sin(menuAngle) * 26);
    camera.lookAt(-54, 2, 0);
  }
  requestAnimationFrame(menuLoop);
})();
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  player.firing = false;
  touch.active = false;
});
loop();
