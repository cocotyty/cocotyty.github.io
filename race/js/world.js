/* ============================================================
 * 狂飙公路 · world.js
 * 无尽世界:弯道中心线 / 路面条带 / 护栏条带 / 景物池化 / 昼夜循环
 * 约定:玩家 s 沿道路增长;l 为横向偏移(+右);世界渲染坐标
 *       worldX = cx(s)+l, worldZ = -(s - playerS)
 * ============================================================ */
'use strict';

const World = (() => {

  /* ---------- 道路几何常量 ---------- */
  const LANE_W = 3.3;
  const LANES = [-4.95, -1.65, 1.65, 4.95];   // 负 = 对向车道
  const ROAD_HALF = 6.7;                       // 沥青半宽
  const SHOULDER_OUT = 8.1;                    // 硬路肩外沿
  const SEG = 5, SEGN = 96;                    // 路面条带:5m × 96 段
  const VIEW = 430;                            // 景物生成视距
  const DAY_LEN = 10000, DAY_START = 0.34;     // 昼夜周期(米/天),起步=午后

  /* ---------- 中心线(四重正弦弯道:慢漂 + 中弯 + 急弯) ----------
   * 最小曲率半径 ~560m,最大偏航 ~12°,260m 视距内走向变化可达 ~25° */
  function cx(s) {
    return 24 * Math.sin(s * 0.0009) +
           14 * Math.sin(s * 0.0021 + 1.7) +
            8 * Math.sin(s * 0.0043 + 4.2) +
           10 * Math.sin(s * 0.0125 + 2.6);
  }
  function dcx(s) {
    return 24 * 0.0009 * Math.cos(s * 0.0009) +
           14 * 0.0021 * Math.cos(s * 0.0021 + 1.7) +
            8 * 0.0043 * Math.cos(s * 0.0043 + 4.2) +
           10 * 0.0125 * Math.cos(s * 0.0125 + 2.6);
  }
  /* 曲率(≈cx''):正 = 右弯;main.js 用作离心甩出与车身侧倾 */
  function d2cx(s) {
    return -(24 * 0.0009 * 0.0009) * Math.sin(s * 0.0009)
         - (14 * 0.0021 * 0.0021) * Math.sin(s * 0.0021 + 1.7)
         - ( 8 * 0.0043 * 0.0043) * Math.sin(s * 0.0043 + 4.2)
         - (10 * 0.0125 * 0.0125) * Math.sin(s * 0.0125 + 2.6);
  }
  /* 行进方向朝 -Z 的偏航角 */
  function yawAt(s) { return Math.atan2(-dcx(s), 1); }

  /* ---------- 区域:0 城市 1 郊区 2 乡野,每 1000m 一换(120m 渐变) ---------- */
  function zoneAt(s) { return Math.floor((((s % 3000) + 3000) % 3000) / 1000); }
  function zoneWeights(s) {
    const z = ((s % 3000) + 3000) % 3000;
    const T = 120, sm = x => x * x * (3 - 2 * x);
    const w = [0, 0, 0];
    const idx = Math.floor(z / 1000), frac = z / 1000 - idx;
    let bl = 0;
    if (frac > 1 - T / 1000) bl = sm((frac - (1 - T / 1000)) / (T / 1000));
    w[idx] += 1 - bl; w[(idx + 1) % 3] += bl;
    return w;
  }

  /* ============================================================
   * Canvas 纹理
   * ============================================================ */
  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* 沥青路面:双黄线 / 虚线 / 边线,u 横向 v 纵向(12m 一循环) */
  const px = l => (l + ROAD_HALF) / (ROAD_HALF * 2) * 256;
  const roadTex = canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#3b3b42'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.09)';
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    c.fillStyle = '#cfcfc6';
    c.fillRect(px(-6.45), 0, 5, h);
    c.fillRect(px(6.45) - 5, 0, 5, h);
    c.fillStyle = '#c9a53d';
    c.fillRect(px(-0.22), 0, 4, h);
    c.fillRect(px(0.22) - 4, 0, 4, h);
    c.fillStyle = '#d8d8cf';
    [-3.3, 3.3].forEach(l => c.fillRect(px(l) - 2, 0, 4, h / 6));
  });

  /* 人行横道斑马纹 */
  const zebraTex = canvasTex(256, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(232,232,226,.93)';
    for (let x = 6; x < w; x += 24) c.fillRect(x, 0, 12, h);
  });

  /* 楼房立面:漫射 + 夜间窗户发光贴图 */
  function facadeTextures(seed) {
    const cols = 4 + (seed % 2), rows = 7 + (seed % 3);
    const mapCv = document.createElement('canvas'), emiCv = document.createElement('canvas');
    mapCv.width = emiCv.width = 128; mapCv.height = emiCv.height = 256;
    const m = mapCv.getContext('2d'), e = emiCv.getContext('2d');
    const bgs = ['#b8bcc4', '#c4b8a8', '#a8b4bc', '#bcc4a8', '#b0a8b4'];
    m.fillStyle = bgs[seed % bgs.length]; m.fillRect(0, 0, 128, 256);
    m.fillStyle = 'rgba(0,0,0,.12)';
    for (let y = 0; y < 256; y += 32) m.fillRect(0, y, 128, 2);
    e.fillStyle = '#000'; e.fillRect(0, 0, 128, 256);
    const cw = 128 / cols, ch = 256 / rows;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const x = q * cw + cw * 0.22, y = r * ch + ch * 0.2;
      const ww = cw * 0.56, hh = ch * 0.55;
      m.fillStyle = '#2c3844'; m.fillRect(x, y, ww, hh);
      m.fillStyle = 'rgba(255,255,255,.16)'; m.fillRect(x, y, ww, hh * 0.3);
      if (Math.random() < 0.55) {
        e.fillStyle = Math.random() < 0.8 ? '#ffd98a' : '#b8e0ff';
        e.fillRect(x, y, ww, hh);
      }
    }
    const mt = new THREE.CanvasTexture(mapCv), et = new THREE.CanvasTexture(emiCv);
    [mt, et].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    return { map: mt, emissiveMap: et };
  }
  const facades = [0, 1, 2].map(i => facadeTextures(i));

  /* 广告牌 */
  function billboardTex(lines, bg, fg) {
    return canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      lines.forEach((ln, i) => {
        c.font = (ln.big ? 'bold 34px' : '22px') + ' sans-serif';
        c.fillText(ln.t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 38);
      });
    });
  }
  const billboardTexes = [
    billboardTex([{ t: 'VIBE GAME', big: true }, { t: 'cocotyty.github.io' }], '#1a2a4a', '#ffe08a'),
    billboardTex([{ t: '狂飙公路', big: true }, { t: 'TURBO HIGHWAY ∞' }], '#431a2a', '#ff9ab0'),
    billboardTex([{ t: '零依赖', big: true }, { t: 'VANILLA JS · NO BUILD' }], '#1a3a2a', '#9affc0'),
    billboardTex([{ t: 'DPIG ★45', big: true }, { t: 'github.com/cocotyty/dpig' }], '#3a3210', '#ffe66e')
  ];

  /* 龙门架指示牌 */
  const gantryTex = canvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#175a2e'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8e8e0'; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#f0f0e8'; c.textAlign = 'center';
    c.font = 'bold 34px sans-serif'; c.fillText('ENDLESS ∞', w / 2, 42);
    c.font = '26px sans-serif'; c.fillText('下一出口: 无尽', w / 2, 76);
  });

  /* 粒子光斑(main.js 使用) */
  const glowTex = canvasTex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;

  /* ============================================================
   * 昼夜关键帧
   * ============================================================ */
  const PHASES = [
    { t: 0.00, top: '#4a90d9', hor: '#cfe6f2', fog: '#bcd8e6', sun: 1.05, sunC: '#fff3da', hemi: 0.8, night: 0, elev: 0.9 },
    { t: 0.30, top: '#3a6fb8', hor: '#cfe0e8', fog: '#bcd4e0', sun: 1.0,  sunC: '#ffedc4', hemi: 0.75, night: 0, elev: 0.55 },
    { t: 0.42, top: '#35548e', hor: '#ff9a5a', fog: '#e8a068', sun: 0.85, sunC: '#ff9d5c', hemi: 0.6, night: 0.1, elev: 0.16 },
    { t: 0.55, top: '#141c38', hor: '#3a4468', fog: '#2a3350', sun: 0.3,  sunC: '#8090c0', hemi: 0.42, night: 0.6, elev: 0.05 },
    { t: 0.64, top: '#060a18', hor: '#131c34', fog: '#101828', sun: 0.14, sunC: '#9aa8d8', hemi: 0.3, night: 1, elev: 0.02 },
    { t: 0.86, top: '#060a18', hor: '#131c34', fog: '#101828', sun: 0.14, sunC: '#9aa8d8', hemi: 0.3, night: 1, elev: 0.02 },
    { t: 0.95, top: '#3a4a80', hor: '#ffb87a', fog: '#d8a878', sun: 0.55, sunC: '#ffb87a', hemi: 0.5, night: 0.3, elev: 0.1 },
    { t: 1.00, top: '#4a90d9', hor: '#cfe6f2', fog: '#bcd8e6', sun: 1.05, sunC: '#fff3da', hemi: 0.8, night: 0, elev: 0.9 }
  ];
  const _colA = new THREE.Color(), _colB = new THREE.Color(), _colC = new THREE.Color();
  const _sunDir = new THREE.Vector3();
  function lerpHex(a, b, f, out) { out.set(a); _colC.set(b); out.lerp(_colC, f); return out; }

  /* ============================================================
   * 世界构建
   * ============================================================ */
  let scene, camera;
  let asphalt, shoL, shoR, railL, railR, ground, skyMesh, skyCtx, skyTex, sunSprite;
  let hemiL, dirL, mountains;
  const nightMats = [];
  let lampMat;
  let nightFactor = 0, lastPhaseT = -99;
  const cats = [];

  /* 水平条带(路面/路肩) */
  function ribbon(widthL, widthR, mat, y, withUv) {
    const n = SEGN + 1;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 2 * 3);
    const nor = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = i * 2 + 1;
      nor[a * 3 + 1] = 1; nor[b * 3 + 1] = 1;
      if (i < SEGN) idx.push(a, b, a + 2, b, b + 2, a + 2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (withUv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { mesh, geo, widthL, widthR, withUv };
  }

  /* 竖直条带(护栏):cityW 城市权重控制升起/降下 */
  function wallRibbon(lOff, mat) {
    const n = SEGN + 1;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 2 * 3);
    const nor = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = i * 2 + 1;
      nor[a * 3] = -Math.sign(lOff); nor[b * 3] = -Math.sign(lOff);
      if (i < SEGN) idx.push(a, b, a + 2, b, b + 2, a + 2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return { mesh, geo, lOff };
  }

  function updateFlatRibbon(r, playerS) {
    const pos = r.geo.attributes.position.array;
    const uv = r.geo.attributes.uv ? r.geo.attributes.uv.array : null;
    for (let i = 0; i <= SEGN; i++) {
      const s = playerS - 20 + i * SEG;
      const x = cx(s), z = -(s - playerS);
      const a = i * 2, b = i * 2 + 1;
      pos[a * 3] = x + r.widthL; pos[a * 3 + 2] = z;
      pos[b * 3] = x + r.widthR; pos[b * 3 + 2] = z;
      if (uv) {
        uv[a * 2] = 0; uv[a * 2 + 1] = s / 12;
        uv[b * 2] = 1; uv[b * 2 + 1] = s / 12;
      }
    }
    r.geo.attributes.position.needsUpdate = true;
    if (uv) r.geo.attributes.uv.needsUpdate = true;
  }

  function updateRail(r, playerS) {
    const pos = r.geo.attributes.position.array;
    const uv = r.geo.attributes.uv.array;
    for (let i = 0; i <= SEGN; i++) {
      const s = playerS - 20 + i * SEG;
      const x = cx(s) + r.lOff, z = -(s - playerS);
      const w = zoneWeights(s)[0];              // 城市权重:护栏升降
      const y1 = -0.9 + 1.28 * w, y2 = -0.55 + 1.27 * w;
      const a = i * 2, b = i * 2 + 1;
      pos[a * 3] = x; pos[a * 3 + 1] = y1; pos[a * 3 + 2] = z;
      pos[b * 3] = x; pos[b * 3 + 1] = y2; pos[b * 3 + 2] = z;
      const v = s / 4;
      uv[a * 2] = v; uv[a * 2 + 1] = 0;
      uv[b * 2] = v; uv[b * 2 + 1] = 1;
    }
    r.geo.attributes.position.needsUpdate = true;
    r.geo.attributes.uv.needsUpdate = true;
  }

  /* ---------- 景物构建 ---------- */
  const folMats = [
    new THREE.MeshLambertMaterial({ color: 0x2e7d3a }),
    new THREE.MeshLambertMaterial({ color: 0x3f9a44 }),
    new THREE.MeshLambertMaterial({ color: 0x55842e })
  ];
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2c });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x9aa3ae });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x565d68 });

  function mkTree(kind) {
    const g = new THREE.Group();
    const fol = folMats[Math.floor(Math.random() * 3)];
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.7, 6), trunkMat);
    trunk.position.y = 0.85; g.add(trunk);
    if (kind === 0) {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.5 - i * 0.35, 1.7, 7), fol);
        c.position.y = 1.7 + i * 1.05; c.castShadow = true; g.add(c);
      }
    } else {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 0), fol);
      c.position.y = 2.7; c.scale.y = 0.92; c.castShadow = true; g.add(c);
      const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), fol);
      c2.position.set(0.8, 2.1, 0.3); c2.castShadow = true; g.add(c2);
    }
    g.rotation.y = Math.random() * Math.PI * 2;
    const sc = 0.8 + Math.random() * 0.6; g.scale.set(sc, sc, sc);
    return g;
  }
  function mkBush() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), folMats[Math.floor(Math.random() * 3)]);
    b.position.y = 0.45; b.scale.set(1.3, 0.85, 1.1); b.castShadow = true; g.add(b);
    return g;
  }
  function mkBuilding(i) {
    const g = new THREE.Group();
    const w = 8 + Math.random() * 7, d = 8 + Math.random() * 5, h = 10 + Math.random() * 30;
    const f = facades[i % facades.length];
    /* clone 贴图以独立设置 repeat */
    const map = f.map.clone(), emi = f.emissiveMap.clone();
    map.needsUpdate = emi.needsUpdate = true;
    map.wrapS = map.wrapT = emi.wrapS = emi.wrapT = THREE.RepeatWrapping;
    map.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 14)));
    emi.repeat.copy(map.repeat);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, map, emissiveMap: emi,
      emissive: 0xffdf9a, emissiveIntensity: 0
    });
    nightMats.push(mat);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 1.2, d * 0.5),
      new THREE.MeshLambertMaterial({ color: 0x3a3f47 }));
    roof.position.y = h + 0.6; g.add(roof);
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x7a828c }));
    ac.position.set(w * 0.28, h + 0.5, -d * 0.2); g.add(ac);
    return g;
  }
  function mkHouse() {
    const g = new THREE.Group();
    const w = 5.5 + Math.random() * 2, d = 5, h = 3;
    const wall = new THREE.MeshLambertMaterial({
      color: [0xd8c8a8, 0xc8d4d8, 0xd8b8a8, 0xb8ccb8][Math.floor(Math.random() * 4)] });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    body.position.y = h / 2; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 2.2, 4),
      new THREE.MeshLambertMaterial({ color: 0x8a4a32 }));
    roof.position.y = h + 1.1; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.08), VM.dark);
    door.position.set(0, 0.8, -d / 2 - 0.04); g.add(door);
    return g;
  }
  function mkStreetlight() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.4, 6), poleMat);
    pole.position.y = 2.7; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), poleMat);
    arm.position.y = 5.3; g.add(arm);
    lampMat = lampMat || new THREE.MeshLambertMaterial({
      color: 0x8a8f99, emissive: 0xffe9a8, emissiveIntensity: 0 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.26), lampMat);
    lamp.position.y = 5.22; g.add(lamp);
    return g;
  }
  function mkBillboard() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 3.4, 6), poleMat);
    pole.position.y = 1.7; g.add(pole);
    const src = billboardTexes[Math.floor(Math.random() * billboardTexes.length)];
    const tex = src.clone(); tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.4),
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    panel.position.y = 4.2; g.add(panel);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 0.12), VM.dark);
    back.position.y = 4.2; back.position.z = 0.07; g.add(back);
    g.userData.panel = panel;
    return g;
  }
  function mkGantry() {
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.4, 8), poleMat);
      pole.position.set(side * 8.6, 3.2, 0); pole.castShadow = true; g.add(pole);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.4, 0.4), poleMat);
    beam.position.y = 6.3; g.add(beam);
    const tex = gantryTex.clone(); tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.7),
      new THREE.MeshLambertMaterial({ map: tex }));
    sign.position.set(-3.4, 5.1, -0.25); sign.rotation.y = Math.PI; g.add(sign);
    return g;
  }
  function mkZebra() {
    const g = new THREE.Group();
    const tex = zebraTex.clone(); tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 4.2),
      new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02; g.add(m);
    return g;
  }

  /* 类别注册 */
  function regCat(name, count, build, place, opts) {
    const cat = Object.assign({ name, nextS: 90 + Math.random() * 40, entries: [], place }, opts || {});
    for (let i = 0; i < count; i++) {
      const g = build(i);
      g.visible = false;
      scene.add(g);
      cat.entries.push({ g, active: false, s: 0, l: 0, rotY: 0 });
    }
    cats.push(cat);
    return cat;
  }

  let sceneInitDone = false;
  function init(sc, cam) {
    if (sceneInitDone) return;
    sceneInitDone = true;
    scene = sc; camera = cam;

    roadTex.anisotropy = 4;
    asphalt = ribbon(-ROAD_HALF, ROAD_HALF,
      new THREE.MeshLambertMaterial({ map: roadTex }), 0, true);
    scene.add(asphalt.mesh);
    const shoMat = new THREE.MeshLambertMaterial({ color: 0x6e6e74 });
    shoL = ribbon(-SHOULDER_OUT, -ROAD_HALF + 0.05, shoMat, 0.045, false);
    shoR = ribbon(ROAD_HALF - 0.05, SHOULDER_OUT, shoMat, 0.045, false);
    scene.add(shoL.mesh); scene.add(shoR.mesh);

    /* 护栏条带(城市升起) */
    const railWallMat = new THREE.MeshLambertMaterial({
      color: 0xb4bcc8, side: THREE.DoubleSide });
    railL = wallRibbon(-8.06, railWallMat);
    railR = wallRibbon(8.06, railWallMat);
    scene.add(railL.mesh); scene.add(railR.mesh);

    /* 地面 */
    ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 760),
      new THREE.MeshLambertMaterial({ color: 0x4e7a3d }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    scene.add(ground);

    /* 天空穹顶 */
    const skyCv = document.createElement('canvas');
    skyCv.width = 64; skyCv.height = 256;
    skyCtx = skyCv.getContext('2d');
    skyTex = new THREE.CanvasTexture(skyCv);
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(430, 24, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    skyMesh.renderOrder = -10;
    scene.add(skyMesh);

    /* 太阳光斑 */
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffe9b0, transparent: true, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sunSprite.scale.set(90, 90, 1);
    scene.add(sunSprite);

    /* 灯光 */
    hemiL = new THREE.HemisphereLight(0xbfd8f0, 0x3a4a34, 0.8);
    scene.add(hemiL);
    dirL = new THREE.DirectionalLight(0xfff3da, 1.0);
    dirL.castShadow = true;
    dirL.shadow.mapSize.set(1024, 1024);
    const sco = dirL.shadow.camera;
    sco.left = -30; sco.right = 30; sco.top = 70; sco.bottom = -70; sco.near = 2; sco.far = 200;
    dirL.shadow.bias = -0.0015;
    scene.add(dirL); scene.add(dirL.target);
    scene.fog = new THREE.Fog(0xbcd8e6, 55, 260);

    /* 远山剪影 */
    mountains = new THREE.Group();
    const mMat = new THREE.MeshLambertMaterial({ color: 0x6a7d94, fog: false });
    for (let i = 0; i < 14; i++) {
      const ang = Math.PI * 2 * i / 14 + Math.random() * 0.3;
      const rad = 330 + Math.random() * 60;
      const h = 36 + Math.random() * 58;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(50 + Math.random() * 55, h, 4), mMat);
      cone.position.set(Math.sin(ang) * rad, h / 2 - 6, -Math.cos(ang) * rad - 60);
      mountains.add(cone);
    }
    mountains.userData.mat = mMat;
    scene.add(mountains);

    /* ---------- 景物类别 ---------- */
    regCat('building', 26, mkBuilding, (e, s, zw) => {
      if (zw[0] < 0.45 && zw[1] < 0.3) return false;
      const side = Math.random() < 0.5 ? -1 : 1;
      const w = e.g.children[0].geometry.parameters.width;
      e.l = side * (11 + w / 2 + Math.random() * 10);
      e.rotY = 0;
      return true;
    }, { every: () => 24 + Math.random() * 22 });

    regCat('house', 10, mkHouse, (e, s, zw) => {
      if (zw[1] < 0.4) return false;
      const side = Math.random() < 0.5 ? -1 : 1;
      e.l = side * (12.5 + Math.random() * 9);
      e.rotY = 0;
      return true;
    }, { every: () => 34 + Math.random() * 30 });

    regCat('tree', 34, () => mkTree(Math.random() < 0.5 ? 0 : 1), (e) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      e.l = side * (10.5 + Math.random() * 26);
      e.rotY = 0;
      return true;
    }, { every: () => 11 + Math.random() * 14 });

    regCat('bush', 14, mkBush, (e) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      e.l = side * (9.2 + Math.random() * 8);
      e.rotY = 0;
      return true;
    }, { every: () => 18 + Math.random() * 16 });

    regCat('light', 12, mkStreetlight, (e, s, zw) => {
      if (zw[2] > 0.55) return false;
      const side = (Math.floor(s / 42) % 2 === 0) ? 1 : -1;
      e.g.children[1].position.x = -side * 0.85;   // 悬臂
      e.g.children[2].position.x = -side * 1.6;    // 灯头
      e.l = side * 8.45;
      e.rotY = 0;
      return true;
    }, { every: () => 42 });

    regCat('billboard', 3, mkBillboard, (e, s, zw) => {
      if (zw[2] > 0.7) return false;
      const side = Math.random() < 0.5 ? -1 : 1;
      e.l = side * (10.8 + Math.random() * 4);
      e.rotY = Math.PI / 2;                        // 面板朝道路
      return true;
    }, { every: () => 260 + Math.random() * 300 });

    regCat('gantry', 2, mkGantry, (e) => { e.l = 0; e.rotY = 0; return true; },
      { every: () => 480 + Math.random() * 420 });

    regCat('zebra', 4, mkZebra, (e, s, zw) => {
      if (zw[2] > 0.5) return false;
      e.l = 0; e.rotY = 0;
      return true;
    }, { every: () => 300 + Math.random() * 260 });
  }

  /* ---------- 景物生成 / 回收 / 摆放 ---------- */
  function updateScenery(playerS) {
    for (const cat of cats) {
      while (cat.nextS < playerS + VIEW) {
        const s = cat.nextS;
        cat.nextS += cat.every();
        const e = cat.entries.find(x => !x.active);
        if (!e) continue;
        if (!cat.place(e, s, zoneWeights(s + 14))) continue;
        e.active = true; e.s = s;
        e.g.visible = true;
      }
      for (const e of cat.entries) {
        if (!e.active) continue;
        if (e.s < playerS - 26) { e.active = false; e.g.visible = false; continue; }
        e.g.position.set(cx(e.s) + e.l, 0, -(e.s - playerS));
        e.g.rotation.y = yawAt(e.s) + e.rotY;
      }
    }
  }

  /* ---------- 昼夜 ---------- */
  function applyPhase(t, playerS) {
    let a = PHASES[0], b = PHASES[PHASES.length - 1];
    for (let i = 0; i < PHASES.length - 1; i++) {
      if (t >= PHASES[i].t && t <= PHASES[i + 1].t) { a = PHASES[i]; b = PHASES[i + 1]; break; }
    }
    const f = (t - a.t) / Math.max(0.0001, b.t - a.t);
    nightFactor = a.night + (b.night - a.night) * f;

    if (Math.abs(t - lastPhaseT) > 0.004 || lastPhaseT < 0) {
      lastPhaseT = t;
      const top = lerpHex(a.top, b.top, f, _colA).getStyle();
      const mid = lerpHex(a.top, b.hor, f, _colA).getStyle();
      const hor = lerpHex(a.hor, b.hor, f, _colA).getStyle();
      const grd = skyCtx.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, top); grd.addColorStop(0.62, mid); grd.addColorStop(1, hor);
      skyCtx.fillStyle = grd; skyCtx.fillRect(0, 0, 64, 256);
      skyTex.needsUpdate = true;

      scene.fog.color.copy(lerpHex(a.fog, b.fog, f, _colA));
      mountains.userData.mat.color.copy(lerpHex(a.fog, b.fog, f, _colA)).lerp(_colC.set(0x46536a), 0.3);
    }

    dirL.intensity = a.sun + (b.sun - a.sun) * f;
    dirL.color.copy(lerpHex(a.sunC, b.sunC, f, _colB));
    hemiL.intensity = a.hemi + (b.hemi - a.hemi) * f;
    const elev = a.elev + (b.elev - a.elev) * f;
    const az = playerS * 0.0004;
    _sunDir.set(Math.sin(az) * 0.8, Math.max(0.05, elev), Math.cos(az) * 0.45).normalize();
    dirL.target.position.set(cx(playerS + 20), 0, -20);
    dirL.position.copy(dirL.target.position).addScaledVector(_sunDir, 95);
    sunSprite.position.copy(camera.position).addScaledVector(_sunDir, 370);
    sunSprite.material.opacity = Math.max(0, 1 - nightFactor * 1.4) * 0.95;
    sunSprite.material.color.copy(_colB);

    if (lampMat) lampMat.emissiveIntensity = nightFactor * 1.1;
    for (const m of nightMats) m.emissiveIntensity = nightFactor * 0.85;
    return nightFactor;
  }

  /* ---------- 地面颜色随区域 ---------- */
  const gCity = new THREE.Color(0x4a4e52), gSub = new THREE.Color(0x547a40),
        gCountry = new THREE.Color(0x5d8a3f);
  function updateGround(playerS) {
    const zw = zoneWeights(playerS + 30);
    ground.material.color.setRGB(
      gCity.r * zw[0] + gSub.r * zw[1] + gCountry.r * zw[2],
      gCity.g * zw[0] + gSub.g * zw[1] + gCountry.g * zw[2],
      gCity.b * zw[0] + gSub.b * zw[1] + gCountry.b * zw[2]);
    ground.position.x = cx(playerS + 60);
  }

  /* ---------- 每帧 ---------- */
  function update(playerS, camX) {
    updateFlatRibbon(asphalt, playerS);
    updateFlatRibbon(shoL, playerS);
    updateFlatRibbon(shoR, playerS);
    updateRail(railL, playerS);
    updateRail(railR, playerS);
    updateScenery(playerS);
    updateGround(playerS);
    applyPhase((DAY_START + playerS / DAY_LEN) % 1, playerS);
    skyMesh.position.set(camX, 0, 0);
    mountains.position.x = camX;
  }

  return {
    init, update, cx, yawAt, curveAt: d2cx, zoneAt, zoneWeights, LANES, LANE_W,
    ROAD_HALF, SHOULDER_OUT, glowTex,
    get nightFactor() { return nightFactor; }
  };
})();
