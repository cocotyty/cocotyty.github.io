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
