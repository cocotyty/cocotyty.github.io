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
