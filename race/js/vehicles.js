/* ============================================================
 * 狂飙公路 · vehicles.js
 * 低多边形车辆/行人模型(纯 Box/Cylinder 拼装,零素材文件)
 * 约定:车头朝 -Z,原点在车轮触地面
 * ============================================================ */
'use strict';

/* ---------- 共享材质 ---------- */
const VM = {
  tire:  new THREE.MeshLambertMaterial({ color: 0x17171c }),
  hub:   new THREE.MeshLambertMaterial({ color: 0x8a8f99 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x18242f }),
  dark:  new THREE.MeshLambertMaterial({ color: 0x22262e }),
  chrome:new THREE.MeshLambertMaterial({ color: 0xb4bac4 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ae, metalness: 0.6, roughness: 0.35 }),
  cyber: new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.85, roughness: 0.28 }),
  head:  new THREE.MeshLambertMaterial({ color: 0xfff6cc, emissive: 0xffeeaa, emissiveIntensity: 0.9 }),
  tail:  new THREE.MeshLambertMaterial({ color: 0x8a1e18, emissive: 0xff2412, emissiveIntensity: 0.35 }),
  blink: new THREE.MeshLambertMaterial({ color: 0x9a5a10, emissive: 0xffa020, emissiveIntensity: 0 }),
  red:   new THREE.MeshLambertMaterial({ color: 0xd23422 }),
  redD:  new THREE.MeshLambertMaterial({ color: 0x8a1f14 }),
  white: new THREE.MeshLambertMaterial({ color: 0xf2f4f6 }),
  black: new THREE.MeshLambertMaterial({ color: 0x14161c }),
  blue:  new THREE.MeshLambertMaterial({ color: 0x2a5aa0 }),
  skin:  new THREE.MeshLambertMaterial({ color: 0xd9a066 }),
  lampGlow: new THREE.MeshLambertMaterial({ color: 0xfffbe0, emissive: 0xfff3b0, emissiveIntensity: 1 })
};

/* 工具:往 group 里放一个 box */
function bx(g, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
/* 工具:车轮(轴向 X) */
function wheel(g, x, y, z, r, wd) {
  const geo = new THREE.CylinderGeometry(r, r, wd, 10);
  geo.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(geo, VM.tire);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/* ============================================================
 * 玩家车辆定义
 * maxSpeed m/s | accel m/s² | handling 横向速度 m/s | hp 耐久
 * wid/len 碰撞盒
 * ============================================================ */
const VEHICLE_DEFS = [
  { id: 'hatch',  emoji: '🚗', zh: '小汽车', en: 'City Hatch',   color: 0x3fa34d,
    maxSpeed: 38, accel: 9.0,  handling: 6.6, hp: 100, wid: 1.9, len: 4.1 },
  { id: 'police', emoji: '🚓', zh: '警车',   en: 'Police',       color: 0xf2f4f6,
    maxSpeed: 41, accel: 11.0, handling: 6.9, hp: 110, wid: 2.0, len: 4.7 },
  { id: 'fire',   emoji: '🚒', zh: '消防车', en: 'Fire Truck',   color: 0xd23422,
    maxSpeed: 33, accel: 6.0,  handling: 4.3, hp: 190, wid: 2.4, len: 7.4 },
  { id: 'truck',  emoji: '🚚', zh: '大卡车', en: 'Semi Truck',   color: 0x2a5aa0,
    maxSpeed: 43, accel: 5.6,  handling: 3.9, hp: 170, wid: 2.5, len: 8.6 },
  { id: 'cyber',  emoji: '⚡', zh: '赛博皮卡', en: 'Cybertruck', color: 0xcfd6dd,
    maxSpeed: 45, accel: 12.0, handling: 5.7, hp: 95,  wid: 2.2, len: 5.2 },
  { id: 'sport',  emoji: '🏎️', zh: 'GT跑车', en: 'GT Sports',    color: 0xe8483f,
    maxSpeed: 46, accel: 13.0, handling: 7.6, hp: 80,  wid: 1.95, len: 4.4 }
];

/* 通用轿车底盘(玩家向,细节多) */
function carBase(g, def, bodyMat) {
  const r = {};
  const W = def.wid, L = def.len;
  /* 车身 */
  const body = bx(g, W, 0.58, L, bodyMat, 0, 0.55, 0);
  body.castShadow = true;
  /* 底裙 */
  bx(g, W * 0.96, 0.22, L * 0.9, VM.dark, 0, 0.28, 0);
  /* 座舱 */
  const cab = bx(g, W * 0.86, 0.52, L * 0.5, VM.glass, 0, 1.08, L * 0.06);
  cab.castShadow = true;
  /* 车顶 */
  bx(g, W * 0.8, 0.07, L * 0.38, bodyMat, 0, 1.36, L * 0.08);
  /* 保险杠 */
  bx(g, W * 0.98, 0.24, 0.16, VM.dark, 0, 0.4, -L / 2 - 0.04);
  bx(g, W * 0.98, 0.24, 0.16, VM.dark, 0, 0.4, L / 2 + 0.04);
  /* 车灯 */
  r.heads = [
    bx(g, 0.3, 0.14, 0.08, VM.head, -W / 2 + 0.28, 0.68, -L / 2 - 0.02),
    bx(g, 0.3, 0.14, 0.08, VM.head,  W / 2 - 0.28, 0.68, -L / 2 - 0.02)
  ];
  r.tails = [
    bx(g, 0.34, 0.13, 0.08, VM.tail, -W / 2 + 0.3, 0.72, L / 2 + 0.02),
    bx(g, 0.34, 0.13, 0.08, VM.tail,  W / 2 - 0.3, 0.72, L / 2 + 0.02)
  ];
  r.blinkMats = [];
  /* 车轮 */
  const wr = 0.34, wb = Math.min(W / 2 + 0.02, 0.98);
  r.wheels = [
    wheel(g, -wb, wr, -L * 0.32, wr, 0.26),
    wheel(g,  wb, wr, -L * 0.32, wr, 0.26),
    wheel(g, -wb, wr,  L * 0.32, wr, 0.26),
    wheel(g,  wb, wr,  L * 0.32, wr, 0.26)
  ];
  r.steerWheels = [r.wheels[0], r.wheels[1]];
  return r;
}

function buildPlayer(def) {
  const g = new THREE.Group();
  const r = { group: g, def };
  const W = def.wid, L = def.len;
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.color });

  if (def.id === 'hatch') {
    Object.assign(r, carBase(g, def, bodyMat));
  }
  else if (def.id === 'police') {
    Object.assign(r, carBase(g, def, bodyMat));
    /* 车门黑条纹 */
    bx(g, W + 0.02, 0.3, L * 0.42, VM.black, 0, 0.62, L * 0.05);
    bx(g, W + 0.02, 0.12, L * 0.9, VM.black, 0, 0.34, 0);
    /* 车顶警灯 */
    const barBase = bx(g, W * 0.7, 0.09, 0.24, VM.dark, 0, 1.42, L * 0.05);
    r.barRed  = new THREE.MeshLambertMaterial({ color: 0x700e0e, emissive: 0xff2020, emissiveIntensity: 0.2 });
    r.barBlue = new THREE.MeshLambertMaterial({ color: 0x0e2070, emissive: 0x2040ff, emissiveIntensity: 0.2 });
    bx(g, W * 0.3, 0.12, 0.2, r.barRed,  -W * 0.17, 1.52, L * 0.05);
    bx(g, W * 0.3, 0.12, 0.2, r.barBlue, W * 0.17, 1.52, L * 0.05);
    r.barLights = []; // main.js 会挂 PointLight
    barBase.castShadow = false;
  }
  else if (def.id === 'fire') {
    /* 底盘 + 红色厢体 + 白色驾驶舱 + 顶部梯子 */
    const body = bx(g, W, 1.35, L, VM.red, 0, 1.0, 0.35);
    body.castShadow = true;
    bx(g, W * 0.98, 0.26, L * 0.94, VM.dark, 0, 0.3, 0.35);
    const cab = bx(g, W * 0.96, 0.85, 1.7, VM.white, 0, 1.05, -L / 2 + 0.85);
    cab.castShadow = true;
    bx(g, W * 0.8, 0.44, 0.06, VM.glass, 0, 1.28, -L / 2 + 0.02);
    /* 厢体白色饰条 */
    bx(g, W + 0.02, 0.2, L * 0.8, VM.white, 0, 0.62, 0.45);
    /* 梯子 */
    const lad = new THREE.Group();
    bx(lad, 0.5, 0.07, 4.4, VM.steel, 0, 0, 0);
    bx(lad, 0.5, 0.05, 0.06, VM.steel, 0, 0.1, 1.4);
    bx(lad, 0.5, 0.05, 0.06, VM.steel, 0, 0.1, -1.4);
    lad.position.set(0, 1.85, 0.7); lad.rotation.x = -0.06;
    g.add(lad);
    /* 警灯(红) */
    r.heads = [bx(g, 0.3, 0.16, 0.08, VM.head, -W / 2 + 0.3, 0.78, -L / 2 - 0.02),
               bx(g, 0.3, 0.16, 0.08, VM.head,  W / 2 - 0.3, 0.78, -L / 2 - 0.02)];
    r.tails = [bx(g, 0.36, 0.3, 0.08, VM.tail, -W / 2 + 0.32, 1.0, L / 2 + 0.33),
               bx(g, 0.36, 0.3, 0.08, VM.tail,  W / 2 - 0.32, 1.0, L / 2 + 0.33)];
    r.blinkMats = [];
    const wb = W / 2 + 0.02;
    r.wheels = [
      wheel(g, -wb, 0.42, -L * 0.36, 0.42, 0.3), wheel(g, wb, 0.42, -L * 0.36, 0.42, 0.3),
      wheel(g, -wb, 0.42,  L * 0.18, 0.42, 0.3), wheel(g, wb, 0.42,  L * 0.18, 0.42, 0.3),
      wheel(g, -wb, 0.42,  L * 0.38, 0.42, 0.3), wheel(g, wb, 0.42,  L * 0.38, 0.42, 0.3)
    ];
    r.steerWheels = [r.wheels[0], r.wheels[1]];
  }
  else if (def.id === 'truck') {
    /* 牵引车头 + 大挂箱 */
    const cab = bx(g, W * 0.92, 1.5, 2.1, bodyMat, 0, 1.15, -L / 2 + 1.15);
    cab.castShadow = true;
    bx(g, W * 0.8, 0.55, 0.08, VM.glass, 0, 1.55, -L / 2 + 0.08);
    bx(g, W * 0.94, 0.5, 1.0, VM.chrome, 0, 0.45, -L / 2 + 0.2);   // 前保险杠
    bx(g, W * 0.92, 0.3, 0.8, VM.dark, 0, 0.35, -L / 2 + 1.2);      // 台阶
    const box = bx(g, W, 2.15, L - 2.6, VM.steel, 0, 1.55, 1.5);
    box.castShadow = true;
    bx(g, W * 0.7, 0.5, 2.2, VM.dark, 0, 2.85, 1.5);                // 顶部货柜
    r.heads = [bx(g, 0.34, 0.2, 0.08, VM.head, -W / 2 + 0.35, 0.85, -L / 2 - 0.03),
               bx(g, 0.34, 0.2, 0.08, VM.head,  W / 2 - 0.35, 0.85, -L / 2 - 0.03)];
    r.tails = [bx(g, 0.3, 0.16, 0.08, VM.tail, -W / 2 + 0.3, 0.7, L / 2 + 0.02),
               bx(g, 0.3, 0.16, 0.08, VM.tail,  W / 2 - 0.3, 0.7, L / 2 + 0.02)];
    r.blinkMats = [];
    const wb = W / 2 + 0.02;
    r.wheels = [
      wheel(g, -wb, 0.46, -L * 0.38, 0.46, 0.32), wheel(g, wb, 0.46, -L * 0.38, 0.46, 0.32),
      wheel(g, -wb, 0.46, -L * 0.24, 0.46, 0.32), wheel(g, wb, 0.46, -L * 0.24, 0.46, 0.32),
      wheel(g, -wb, 0.46,  L * 0.3,  0.46, 0.32), wheel(g, wb, 0.46,  L * 0.3,  0.46, 0.32)
    ];
    r.steerWheels = [r.wheels[0], r.wheels[1]];
  }
  else if (def.id === 'cyber') {
    /* 棱角楔形:倾斜座舱 + 金属拉丝 */
    const body = bx(g, W, 0.5, L, VM.cyber, 0, 0.52, 0);
    body.castShadow = true;
    const cab = bx(g, W * 0.88, 0.42, L * 0.42, VM.cyber, 0, 0.98, L * 0.1);
    cab.rotation.x = 0.045; cab.castShadow = true;
    bx(g, W * 0.84, 0.3, L * 0.3, VM.glass, 0, 1.16, L * 0.14);     // 前风挡
    bx(g, W * 0.98, 0.16, 0.24, VM.dark, 0, 0.42, -L / 2 - 0.06);   // 前杠棱面
    bx(g, W * 0.98, 0.16, 0.24, VM.dark, 0, 0.42, L / 2 + 0.06);
    bx(g, 0.1, 0.08, 0.5, VM.cyber, 0, 1.22, -L * 0.46);            // 脊线
    r.heads = [bx(g, 0.26, 0.1, 0.06, VM.head, -W / 2 + 0.25, 0.62, -L / 2 - 0.06),
               bx(g, 0.26, 0.1, 0.06, VM.head,  W / 2 - 0.25, 0.62, -L / 2 - 0.06)];
    r.tails = [bx(g, 0.3, 0.1, 0.06, VM.tail, -W / 2 + 0.28, 0.66, L / 2 + 0.06),
               bx(g, 0.3, 0.1, 0.06, VM.tail,  W / 2 - 0.28, 0.66, L / 2 + 0.06)];
    r.blinkMats = [];
    const wb = W / 2 + 0.02;
    r.wheels = [
      wheel(g, -wb, 0.4, -L * 0.33, 0.4, 0.28), wheel(g, wb, 0.4, -L * 0.33, 0.4, 0.28),
      wheel(g, -wb, 0.4,  L * 0.33, 0.4, 0.28), wheel(g, wb, 0.4,  L * 0.33, 0.4, 0.28)
    ];
    r.steerWheels = [r.wheels[0], r.wheels[1]];
  }
  else if (def.id === 'sport') {
    const body = bx(g, W, 0.44, L, bodyMat, 0, 0.48, 0);
    body.castShadow = true;
    bx(g, W * 0.96, 0.2, L * 0.88, VM.dark, 0, 0.26, 0);
    const cab = bx(g, W * 0.78, 0.4, L * 0.36, VM.glass, 0, 0.88, L * 0.1);
    cab.rotation.x = 0.1; cab.castShadow = true;
    /* 尾翼 */
    bx(g, W * 0.9, 0.06, 0.34, VM.dark, 0, 1.06, L / 2 - 0.16);
    bx(g, 0.08, 0.26, 0.08, VM.dark, -W * 0.34, 0.92, L / 2 - 0.16);
    bx(g, 0.08, 0.26, 0.08, VM.dark,  W * 0.34, 0.92, L / 2 - 0.16);
    /* 前唇 */
    bx(g, W * 0.94, 0.1, 0.2, VM.dark, 0, 0.24, -L / 2 - 0.06);
    r.heads = [bx(g, 0.3, 0.1, 0.08, VM.head, -W / 2 + 0.28, 0.56, -L / 2 - 0.03),
               bx(g, 0.3, 0.1, 0.08, VM.head,  W / 2 - 0.28, 0.56, -L / 2 - 0.03)];
    r.tails = [bx(g, 0.32, 0.1, 0.08, VM.tail, -W / 2 + 0.3, 0.68, L / 2 + 0.03),
               bx(g, 0.32, 0.1, 0.08, VM.tail,  W / 2 - 0.3, 0.68, L / 2 + 0.03)];
    r.blinkMats = [];
    const wb = W / 2 + 0.02;
    r.wheels = [
      wheel(g, -wb, 0.32, -L * 0.34, 0.32, 0.26), wheel(g, wb, 0.32, -L * 0.34, 0.32, 0.26),
      wheel(g, -wb, 0.34,  L * 0.34, 0.34, 0.3),  wheel(g, wb, 0.34,  L * 0.34, 0.34, 0.3)
    ];
    r.steerWheels = [r.wheels[0], r.wheels[1]];
  }

  /* 所有 box 投影设置(车轮统一) */
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return r;
}

/* ============================================================
 * NPC 车辆(简化版)
 * ============================================================ */
function buildNPC(color, kind) {
  const g = new THREE.Group();
  const r = { group: g };
  const bodyMat = new THREE.MeshLambertMaterial({ color });

  if (kind === 'sedan' || kind === 'taxi') {
    const W = 1.9, L = 4.3;
    bx(g, W, 0.56, L, bodyMat, 0, 0.54, 0);
    bx(g, W * 0.95, 0.2, L * 0.86, VM.dark, 0, 0.28, 0);
    bx(g, W * 0.85, 0.5, L * 0.44, VM.glass, 0, 1.05, 0.2);
    bx(g, W * 0.8, 0.06, L * 0.34, bodyMat, 0, 1.32, 0.2);
    r.heads = [bx(g, 0.28, 0.13, 0.07, VM.head, -0.5, 0.66, -L / 2 - 0.02),
               bx(g, 0.28, 0.13, 0.07, VM.head, 0.5, 0.66, -L / 2 - 0.02)];
    r.tails = [bx(g, 0.3, 0.12, 0.07, VM.tail, -0.5, 0.68, L / 2 + 0.02),
               bx(g, 0.3, 0.12, 0.07, VM.tail, 0.5, 0.68, L / 2 + 0.02)];
    if (kind === 'taxi') {
      bx(g, 0.66, 0.18, 0.3, VM.lampGlow, 0, 1.42, 0.2);
      bx(g, W + 0.02, 0.24, L * 0.5, VM.dark, 0, 0.6, 0);
    }
    r.wid = 1.9; r.len = 4.3;
    r.wheels = [wheel(g, -0.94, 0.32, -1.4, 0.32, 0.24), wheel(g, 0.94, 0.32, -1.4, 0.32, 0.24),
                wheel(g, -0.94, 0.32, 1.4, 0.32, 0.24),  wheel(g, 0.94, 0.32, 1.4, 0.32, 0.24)];
  }
  else if (kind === 'van') {
    const W = 2.05, L = 5.0;
    bx(g, W, 1.3, L, bodyMat, 0, 0.95, 0);
    bx(g, W * 0.96, 0.3, L * 0.94, VM.dark, 0, 0.3, 0);
    bx(g, W * 0.9, 0.5, 0.9, VM.glass, 0, 1.35, -L / 2 + 0.48);
    bx(g, W * 0.86, 0.34, L * 0.55, VM.glass, 0, 1.45, 0.9);
    r.heads = [bx(g, 0.26, 0.14, 0.07, VM.head, -0.6, 0.68, -L / 2 - 0.02),
               bx(g, 0.26, 0.14, 0.07, VM.head, 0.6, 0.68, -L / 2 - 0.02)];
    r.tails = [bx(g, 0.26, 0.24, 0.07, VM.tail, -0.68, 0.9, L / 2 + 0.02),
               bx(g, 0.26, 0.24, 0.07, VM.tail, 0.68, 0.9, L / 2 + 0.02)];
    r.wid = 2.05; r.len = 5.0;
    r.wheels = [wheel(g, -1.0, 0.36, -1.6, 0.36, 0.26), wheel(g, 1.0, 0.36, -1.6, 0.36, 0.26),
                wheel(g, -1.0, 0.36, 1.7, 0.36, 0.26),  wheel(g, 1.0, 0.36, 1.7, 0.36, 0.26)];
  }
  else if (kind === 'bus') {
    const W = 2.45, L = 8.6;
    bx(g, W, 2.1, L, bodyMat, 0, 1.45, 0);
    bx(g, W * 0.96, 0.4, L * 0.94, VM.dark, 0, 0.34, 0);
    bx(g, W * 0.92, 0.7, 0.9, VM.glass, 0, 1.95, -L / 2 + 0.5);
    /* 侧窗带 */
    const winMat = VM.glass;
    bx(g, W + 0.02, 0.55, L * 0.8, winMat, 0, 1.95, 0.5);
    r.heads = [bx(g, 0.3, 0.18, 0.07, VM.head, -0.75, 0.75, -L / 2 - 0.02),
               bx(g, 0.3, 0.18, 0.07, VM.head, 0.75, 0.75, -L / 2 - 0.02)];
    r.tails = [bx(g, 0.28, 0.28, 0.07, VM.tail, -0.8, 1.0, L / 2 + 0.02),
               bx(g, 0.28, 0.28, 0.07, VM.tail, 0.8, 1.0, L / 2 + 0.02)];
    r.wid = 2.45; r.len = 8.6;
    r.wheels = [wheel(g, -1.2, 0.44, -2.9, 0.44, 0.3), wheel(g, 1.2, 0.44, -2.9, 0.44, 0.3),
                wheel(g, -1.2, 0.44, 2.9, 0.44, 0.3),  wheel(g, 1.2, 0.44, 2.9, 0.44, 0.3)];
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return r;
}

/* 摩托车(带骑手) */
function buildMoto() {
  const g = new THREE.Group();
  const r = { group: g };
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc22a68 });
  bx(g, 0.34, 0.3, 1.5, bodyMat, 0, 0.62, 0);
  bx(g, 0.3, 0.16, 0.5, VM.dark, 0, 0.8, 0.3);                      // 座椅
  bx(g, 0.66, 0.06, 0.06, VM.chrome, 0, 0.95, -0.62);               // 车把
  bx(g, 0.06, 0.3, 0.06, VM.chrome, -0.3, 0.8, -0.62);
  bx(g, 0.06, 0.3, 0.06, VM.chrome, 0.3, 0.8, -0.62);
  r.heads = [bx(g, 0.18, 0.14, 0.08, VM.head, 0, 0.78, -0.78)];
  r.tails = [bx(g, 0.14, 0.1, 0.06, VM.tail, 0, 0.7, 0.78)];
  /* 骑手 */
  bx(g, 0.36, 0.5, 0.3, VM.dark, 0, 1.08, 0.18);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8e8ee }));
  head.position.set(0, 1.46, 0.05); g.add(head);
  bx(g, 0.1, 0.1, 0.1, VM.glass, 0, 1.48, -0.1);                    // 头盔镜片
  bx(g, 0.4, 0.34, 0.18, VM.dark, 0, 1.12, -0.2);                   // 手臂前伸
  r.wid = 0.9; r.len = 2.0;
  r.wheels = [wheel(g, 0, 0.32, -0.72, 0.32, 0.12), wheel(g, 0, 0.32, 0.74, 0.32, 0.14)];
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return r;
}

/* 自行车(带骑手) */
function buildBicycle() {
  const g = new THREE.Group();
  const r = { group: g };
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x2e8857 });
  bx(g, 0.06, 0.06, 1.0, frameMat, 0, 0.62, 0.05);                  // 上管
  bx(g, 0.06, 0.06, 0.85, frameMat, 0, 0.42, 0.12).rotation.x = 0.5; // 下管
  bx(g, 0.06, 0.5, 0.06, frameMat, 0, 0.45, -0.45);                 // 前叉
  bx(g, 0.06, 0.42, 0.06, frameMat, 0, 0.45, 0.55);                 // 座杆
  bx(g, 0.5, 0.05, 0.05, VM.dark, 0, 0.92, -0.45);                  // 车把
  bx(g, 0.26, 0.05, 0.24, VM.dark, 0, 0.98, 0.5);                   // 车座
  /* 骑手 */
  const shirt = new THREE.MeshLambertMaterial({ color: 0xd8b13c });
  bx(g, 0.36, 0.48, 0.26, shirt, 0, 1.22, 0.18);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), VM.skin);
  head.position.set(0, 1.58, 0.1); g.add(head);
  bx(g, 0.34, 0.3, 0.14, shirt, 0, 1.28, -0.16);                    // 手臂
  /* 腿(踩踏板动画) */
  r.legs = [];
  const l1 = new THREE.Group(), l2 = new THREE.Group();
  bx(l1, 0.11, 0.5, 0.11, VM.dark, 0, -0.25, 0); l1.position.set(-0.12, 0.95, 0.2);
  bx(l2, 0.11, 0.5, 0.11, VM.dark, 0, -0.25, 0); l2.position.set(0.12, 0.95, 0.2);
  g.add(l1); g.add(l2); r.legs = [l1, l2];
  r.wid = 0.8; r.len = 1.7;
  r.wheels = [wheel(g, 0, 0.34, -0.62, 0.34, 0.06), wheel(g, 0, 0.34, 0.68, 0.34, 0.06)];
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return r;
}

/* 行人(走路动画) */
const PED_SHIRTS = [0xd8574a, 0x4d7dd8, 0x57a05a, 0xd8b13c, 0x9a5ad8, 0xdd8ba0, 0x5abfc0, 0xe0e0e0];
const PED_PANTS  = [0x2a3a55, 0x3a3a44, 0x55432a, 0x243f2e];
function buildPed() {
  const g = new THREE.Group();
  const r = { group: g };
  const shirt = new THREE.MeshLambertMaterial({ color: PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: PED_PANTS[Math.floor(Math.random() * PED_PANTS.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)] });
  skin.color.offsetHSL(0, -0.5, 0.18);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  bx(g, 0.4, 0.55, 0.24, shirt, 0, 1.05, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), bodyMat);
  head.position.set(0, 1.45, 0); head.castShadow = true; g.add(head);
  /* 四肢(枢轴在肩/髋) */
  r.limbs = [];
  const mkLimb = (mat, x, y, len) => {
    const lg = new THREE.Group();
    bx(lg, 0.11, len, 0.12, mat, 0, -len / 2, 0);
    lg.position.set(x, y, 0);
    g.add(lg); return lg;
  };
  r.limbs.push(mkLimb(pants, -0.11, 0.78, 0.72));   // 左腿
  r.limbs.push(mkLimb(pants,  0.11, 0.78, 0.72));   // 右腿
  r.limbs.push(mkLimb(shirt, -0.26, 1.28, 0.6));    // 左臂
  r.limbs.push(mkLimb(shirt,  0.26, 1.28, 0.6));    // 右臂
  r.wid = 0.6; r.len = 0.5;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return r;
}
