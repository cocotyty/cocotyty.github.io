/* ============================================================
 * 狂飙公路 · main.js
 * 游戏主逻辑:状态机 / 玩家物理 / 疯狂车流 AI / 道具 / 碰撞
 * / HUD / 镜头 / 纪录 / 触屏+键盘输入
 * ============================================================ */
'use strict';

/* ============================================================
 * i18n
 * ============================================================ */
const I18N = {
  zh: {
    rotate: '请旋转设备至横屏游玩<br>ROTATE TO LANDSCAPE',
    engineErr: '3D 引擎加载失败 — 请检查网络后刷新<br>(需要 jsdelivr CDN 访问)',
    tagline: '一条永无尽头的公路,一群不守规矩的司机。<br>选一辆车,避开逆行与横穿的行人,跑得越远越好。',
    bestLabel: '最长里程', start: '▶ 出发!',
    stSpeed: '极速', stAccel: '加速', stHand: '操控', stHp: '耐久',
    helpDesktop: '⌨ ← → / A D 转向 · ↑ / W 油门 · ↓ / S 刹车<br>自动巡航,道具即时生效,撞车掉血',
    helpTouch: '📱 ◀ ▶ 转向 · ⚡ 油门 · 🛑 刹车 · 谨防逆行车辆与横穿马路的行人',
    paused: '暂停', resume: '▶ 继续', quit: '← 返回车库',
    gameOver: 'GAME OVER', newRecord: '新纪录!', retry: '再来一局', changeCar: '换车',
    soundOn: '音效:开', soundOff: '音效:关',
    warnWrong: '⚠ 逆行车辆 ', m: 'm',
    toastRepair: '🔧 修理 +35 HP', toastShield: '🛡 护盾激活 5s', toastTurbo: '⚡ 涡轮全开!4s 内横冲直撞',
    toastCoin: '+1 🪙', go: '出发!', newRecordToast: '🏆 超越纪录!', hurt: '-{d} HP',
    vehBest: '本车最佳: {m}', noVehBest: '此车尚无纪录', coinsLabel: '金币'
  },
  en: {
    rotate: 'Please rotate to landscape<br>ROTATE TO LANDSCAPE',
    engineErr: 'Failed to load 3D engine — check network & refresh<br>(jsdelivr CDN required)',
    tagline: 'One endless highway, a bunch of reckless drivers.<br>Pick a car, dodge wrong-way maniacs and jaywalkers, go the distance.',
    bestLabel: 'Best distance', start: '▶ DRIVE!',
    stSpeed: 'Speed', stAccel: 'Accel', stHand: 'Handling', stHp: 'Durability',
    helpDesktop: '⌨ ← → / A D steer · ↑ / W throttle · ↓ / S brake<br>Auto-cruise, instant power-ups, collisions cost HP',
    helpTouch: '📱 ◀ ▶ steer · ⚡ throttle · 🛑 brake<br>Beware wrong-way drivers & jaywalking pedestrians',
    paused: 'PAUSED', resume: '▶ RESUME', quit: '← GARAGE',
    gameOver: 'GAME OVER', newRecord: 'NEW RECORD!', retry: 'RETRY', changeCar: 'GARAGE',
    soundOn: 'Sound: ON', soundOff: 'Sound: OFF',
    warnWrong: '⚠ WRONG WAY ', m: 'm',
    toastRepair: '🔧 REPAIR +35 HP', toastShield: '🛡 SHIELD 5s', toastTurbo: '⚡ TURBO! RAM ANYTHING for 4s',
    toastCoin: '+1 🪙', go: 'GO!', newRecordToast: '🏆 NEW RECORD!', hurt: '-{d} HP',
    vehBest: 'Car best: {m}', noVehBest: 'No record with this car', coinsLabel: 'coins'
  }
};
let LANG = 'zh';
try {
  const sv = localStorage.getItem('race-lang');
  if (sv === 'zh' || sv === 'en') LANG = sv;
  else LANG = ((navigator.language || '')).toLowerCase().startsWith('zh') ? 'zh' : 'en';
} catch (e) { /* noop */ }
const t = (k, vars) => {
  let s = (I18N[LANG] && I18N[LANG][k]) || I18N.zh[k] || k;
  if (vars) for (const key in vars) s = s.replace('{' + key + '}', vars[key]);
  return s;
};

/* ============================================================
 * 工具 & DOM
 * ============================================================ */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, f) => a + (b - a) * f;
const rnd = (a, b) => a + Math.random() * (b - a);
const fmtM = m => (m >= 10000 ? (m / 1000).toFixed(1) + 'k' : Math.floor(m)) + ' ' + t('m');

/* ============================================================
 * 游戏主体
 * ============================================================ */
const Game = (() => {

  let renderer, scene, camera;
  let state = 'boot';         // menu | play | pause | over
  let timeScale = 1, elapsed = 0;
  let camShake = 0, camX = 0, camFov = 62;
  let fpsEMA = 60, degraded = 0;

  /* ---------- 玩家 ---------- */
  const player = {
    def: null, model: null, s: 40, l: 1.65, speed: 0, steer: 0,
    hp: 100, invuln: 0, shield: 0, turbo: 0,
    runStart: 0, dist: 0, coins: 0, destroys: 0,
    railCd: 0, beatRecord: false, spot: null, shieldMesh: null,
    wheelSpin: 0, dead: false, deadT: 0
  };

  /* ---------- 输入 ---------- */
  const input = { left: false, right: false, up: false, down: false };

  /* ---------- 纪录 ---------- */
  function loadBest() {
    let g = 0, map = {};
    try {
      g = parseInt(localStorage.getItem('race_best') || '0', 10) || 0;
      map = JSON.parse(localStorage.getItem('race_best_veh') || '{}');
    } catch (e) { /* noop */ }
    return { global: g, map };
  }
  let records = loadBest();

  /* ============================================================
   * 车流 & 行人池
   * ============================================================ */
  const NPCCOLORS = [0xc23b2e, 0x2f6fc4, 0xe0e0e0, 0x3b3b42, 0xd8b13c, 0x4a9a52, 0x9a4a8a, 0xe07b2e, 0x557788];
  const traffic = [];        // 所有池化实体
  let warnCd = 0;

  function makeCarEntry() {
    const roll = Math.random();
    let kind = 'sedan', color = NPCCOLORS[Math.floor(Math.random() * NPCCOLORS.length)];
    if (roll < 0.12) kind = 'taxi', color = 0xe8b820;
    else if (roll < 0.3) kind = 'van';
    else if (roll < 0.38) kind = 'bus', color = 0x3a7a9a;
    const m = buildNPC(color, kind);
    const tailMat = m.tails[0].material.clone();
    const headMat = m.heads[0].material.clone();
    m.tails.forEach(x => x.material = tailMat);
    m.heads.forEach(x => x.material = headMat);
    scene.add(m.group); m.group.visible = false;
    return {
      type: 'car', kind, m, tailMat, headMat, active: false,
      s: 0, l: 0, speed: 0, dir: 1, wrongWay: false,
      mode: 'normal', modeT: 0, targetL: 0, baseL: 0,
      phase: 0, latV: 0, brake: 0, len: m.len, wid: m.wid
    };
  }
  function makeMotoEntry() {
    const m = buildMoto();
    const tailMat = m.tails[0].material.clone();
    m.tails.forEach(x => x.material = tailMat);
    scene.add(m.group); m.group.visible = false;
    return { type: 'moto', m, tailMat, active: false, s: 0, l: 0, speed: 0,
      phase: rnd(0, 9), baseL: 0, len: m.len, wid: m.wid };
  }
  function makeBikeEntry() {
    const m = buildBicycle();
    scene.add(m.group); m.group.visible = false;
    return { type: 'bike', m, active: false, s: 0, l: 0, speed: 4.5,
      wobble: rnd(0, 9), len: m.len, wid: m.wid };
  }
  function makePedEntry() {
    const m = buildPed();
    scene.add(m.group); m.group.visible = false;
    return { type: 'ped', m, active: false, s: 0, l: 0, latV: 0,
      crossing: true, phase: rnd(0, 9), fly: false, vy: 0, spin: 0, len: 0.5, wid: 0.6 };
  }

  function initTraffic() {
    for (let i = 0; i < 14; i++) traffic.push(makeCarEntry());
    for (let i = 0; i < 4; i++) traffic.push(makeMotoEntry());
    for (let i = 0; i < 3; i++) traffic.push(makeBikeEntry());
    for (let i = 0; i < 8; i++) traffic.push(makePedEntry());
  }

  function freeSpot(s, l, self) {
    for (const e of traffic) {
      if (!e.active || e === self) continue;
      if (Math.abs(e.s - s) < 24 && Math.abs(e.l - l) < 2.3) return false;
    }
    return true;
  }

  /* 生成计时器 */
  const spawnT = { car: 0, onc: 0.8, wrong: 4, moto: 3, bike: 5, ped: 2.5, item: 2 };
  function difficulty() { return clamp((player.s - player.runStart) / 850, 0, 3); }

  function updateSpawns(dt) {
    const D = difficulty();
    const p = player;

    spawnT.car -= dt;
    if (spawnT.car <= 0) {
      spawnT.car = rnd(1.5, 2.6) / (1 + D * 0.5);
      const e = traffic.find(x => x.type === 'car' && !x.active);
      if (e) {
        const l = World.LANES[Math.random() < 0.5 ? 2 : 3] + rnd(-0.3, 0.3);
        const s = p.s + rnd(165, 245);
        if (freeSpot(s, l, e)) {
          const r = Math.random();
          e.mode = r < 0.24 + D * 0.06 ? 'changer' : (r < 0.38 ? 'braker' : 'normal');
          e.active = true; e.wrongWay = false; e.dir = 1;
          e.s = s; e.l = l; e.baseL = l; e.targetL = l; e.latV = 0;
          e.speed = rnd(16, 23) + D * 2.2; e.brake = 0; e.modeT = rnd(2, 6);
          e.m.group.visible = true;
        }
      }
    }

    spawnT.onc -= dt;
    if (spawnT.onc <= 0) {
      spawnT.onc = rnd(1.8, 3.2) / (1 + D * 0.4);
      const e = traffic.find(x => x.type === 'car' && !x.active);
      if (e) {
        const l = World.LANES[Math.random() < 0.6 ? 0 : 1] + rnd(-0.25, 0.25);
        const s = p.s + rnd(185, 255);
        if (freeSpot(s, l, e)) {
          e.active = true; e.wrongWay = false; e.dir = -1; e.mode = 'normal';
          e.s = s; e.l = l; e.baseL = l; e.targetL = l; e.latV = 0;
          e.speed = rnd(19, 27); e.brake = 0;
          e.m.group.visible = true;
        }
      }
    }

    /* 逆行者:250m 后解锁,距离越远越频繁 */
    if (p.dist > 250) {
      spawnT.wrong -= dt;
      if (spawnT.wrong <= 0) {
        spawnT.wrong = rnd(9, 15) / (0.6 + D);
        const e = traffic.find(x => x.type === 'car' && !x.active);
        if (e) {
          const l = World.LANES[Math.random() < 0.5 ? 2 : 3];
          const s = p.s + rnd(215, 260);
          if (freeSpot(s, l, e)) {
            e.active = true; e.wrongWay = true; e.dir = -1; e.mode = 'wrong';
            e.s = s; e.l = l; e.baseL = l; e.targetL = l; e.latV = 0;
            e.speed = rnd(13, 19) + D * 1.5; e.brake = 0;
            e.m.group.visible = true;
            if (warnCd <= 0) { Sfx.warn(); warnCd = 2.5; }
          }
        }
      }
    }

    spawnT.moto -= dt;
    if (spawnT.moto <= 0) {
      spawnT.moto = rnd(5, 9) / (1 + D * 0.4);
      const e = traffic.find(x => x.type === 'moto' && !x.active);
      if (e) {
        const l = rnd(0.8, 5.6), s = p.s + rnd(160, 220);
        if (freeSpot(s, l, e)) {
          e.active = true; e.s = s; e.l = l; e.baseL = l;
          e.speed = rnd(25, 31) + D * 2;
          e.m.group.visible = true;
        }
      }
    }

    spawnT.bike -= dt;
    if (spawnT.bike <= 0) {
      spawnT.bike = rnd(7, 12);
      const e = traffic.find(x => x.type === 'bike' && !x.active);
      if (e) {
        const l = rnd(5.0, 6.0), s = p.s + rnd(120, 180);
        if (freeSpot(s, l, e)) {
          e.active = true; e.s = s; e.l = l; e.speed = rnd(4, 5.5);
          e.m.group.visible = true;
        }
      }
    }

    spawnT.ped -= dt;
    if (spawnT.ped <= 0) {
      spawnT.ped = rnd(4.5, 8) / (1 + D * 0.35);
      const e = traffic.find(x => x.type === 'ped' && !x.active);
      if (e) {
        const side = Math.random() < 0.5 ? 1 : -1;
        e.active = true;
        e.s = p.s + rnd(95, 150);
        e.l = side * 8.8;
        e.crossing = Math.random() < 0.68;
        e.latV = e.crossing ? -side * rnd(1.2, 1.9) : 0;
        e.fly = false; e.vy = 0; e.spin = 0;
        e.m.group.visible = true;
      }
    }
  }

  /* ---------- 实体行为 ---------- */
  function updateTraffic(dt) {
    const p = player;
    const night = World.nightFactor;
    for (const e of traffic) {
      if (!e.active) continue;

      if (e.type === 'car') {
        /* 同向车行为 */
        if (e.dir === 1 && !e.wrongWay) {
          e.modeT -= dt;
          if (e.mode === 'normal' && e.modeT <= 0) {
            e.modeT = rnd(4, 9);
            if (Math.random() < 0.5) {          // 温和变道
              e.targetL = World.LANES[2 + Math.floor(Math.random() * 2)];
              e.mode = 'drift';
            }
          } else if (e.mode === 'changer' && e.modeT <= 0) {
            e.modeT = rnd(1.2, 2.2);
            /* 玩家在后方接近 → 朝玩家当前车道甩过去 */
            const ds = e.s - p.s;
            if (ds > 4 && ds < 34 && p.speed > e.speed - 2) e.targetL = clamp(p.l, -5.5, 5.5);
            else e.targetL = World.LANES[Math.random() < 0.5 ? 0 : 3];
          } else if (e.mode === 'braker' && e.modeT <= 0) {
            e.modeT = rnd(1.5, 2.5);
            const ds = e.s - p.s;
            if (ds > 3 && ds < 13 && p.speed > e.speed + 2 && Math.abs(e.l - p.l) < 2.2) {
              e.brake = 1.6;                    // 急刹挑衅
            }
          }
          if (e.brake > 0) { e.brake -= dt; e.speed = Math.max(6, e.speed - 26 * dt); }
          else e.speed = Math.min(e.speed + 3 * dt, rnd(16, 23) + difficulty() * 2);
        }
        /* 横向趋近 targetL */
        if (e.mode !== 'wrong') {
          const rate = (e.mode === 'drift') ? 1.4 : (e.mode === 'changer' ? 3.6 : 1.4);
          const dl = e.targetL - e.l;
          if (Math.abs(dl) > 0.05) e.l += clamp(dl, -rate * dt, rate * dt);
        }
        /* 防追尾同类 */
        if (e.dir === 1) {
          for (const o of traffic) {
            if (!o.active || o === e || o.dir !== 1 || o.type === 'ped') continue;
            if (o.s > e.s && o.s - e.s < 9 && Math.abs(o.l - e.l) < 1.8) {
              e.speed = Math.min(e.speed, o.speed * 0.96);
            }
          }
        }
        e.s += e.speed * dt * e.dir;
        /* 尾灯/大灯 */
        e.tailMat.emissiveIntensity = (e.brake > 0 ? 2.2 : 0.35) + night * 0.6;
        e.headMat.emissiveIntensity = 0.5 + night * 0.9;
        if (e.wrongWay) {                       // 危险双闪
          const flash = Math.sin(elapsed * 14) > 0 ? 2.4 : 0.2;
          e.tailMat.emissiveIntensity = flash;
          e.headMat.emissiveIntensity = flash;
        }
      }
      else if (e.type === 'moto') {
        e.s += e.speed * dt;
        e.l = e.baseL + Math.sin(elapsed * 1.9 + e.phase) * 1.15;
        e.m.group.rotation.z = Math.cos(elapsed * 1.9 + e.phase) * 0.22;
        e.tailMat.emissiveIntensity = 0.4 + night * 0.5;
      }
      else if (e.type === 'bike') {
        e.s += e.speed * dt;
        e.wobble += dt;
        e.l += Math.sin(e.wobble * 0.7) * 0.12 * dt;
        const spin = e.speed * dt / 0.34;
        e.m.wheels.forEach(w => w.rotation.x -= spin);
        e.m.legs.forEach((lg, i) => lg.rotation.x = Math.sin(elapsed * 9 + i * Math.PI) * 0.7);
      }
      else if (e.type === 'ped') {
        if (e.fly) {                            // 被撞飞(卡通)
          e.s += 0; e.l += e.latV * dt;
          e.vy -= 18 * dt;
          e.m.group.position.y += e.vy * dt;
          e.m.group.rotation.x += e.spin * dt;
          if (e.m.group.position.y < 0.2 && e.vy < 0) {
            e.m.group.position.y = 0.2; e.vy = 0; e.latV *= 0.3; e.spin *= 0.5;
          }
        } else if (e.crossing) {
          e.l += e.latV * dt;
          const sw = Math.sin(elapsed * 7 + e.phase);
          e.m.limbs[0].rotation.x = sw * 0.7;
          e.m.limbs[1].rotation.x = -sw * 0.7;
          e.m.limbs[2].rotation.x = -sw * 0.55;
          e.m.limbs[3].rotation.x = sw * 0.55;
          e.m.group.rotation.y = e.latV > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {                                // 沿人行道散步
          e.s += 1.3 * dt * (e.phase > 4.5 ? 1 : -1);
          const sw = Math.sin(elapsed * 6 + e.phase);
          e.m.limbs[0].rotation.x = sw * 0.55;
          e.m.limbs[1].rotation.x = -sw * 0.55;
          e.m.group.rotation.y = e.phase > 4.5 ? Math.PI : 0;
        }
      }

      /* 车轮滚动 */
      if (e.type === 'car' || e.type === 'moto') {
        const spin = e.speed * dt / 0.34;
        e.m.wheels.forEach(w => w.rotation.x -= spin * (e.dir === 1 ? 1 : -1));
      }

      /* 回收 */
      if (e.s < p.s - 32 || e.s > p.s + 430 || Math.abs(e.l) > 13.5) {
        e.active = false; e.m.group.visible = false;
        if (e.type === 'ped') { e.m.group.rotation.x = 0; e.m.group.position.y = 0; }
        continue;
      }

      /* 摆放(行人 y 已在飞起逻辑处理,此处统一设 x/z) */
      const gy = (e.type === 'ped' && e.fly) ? e.m.group.position.y : 0;
      e.m.group.position.set(World.cx(e.s) + e.l, gy, -(e.s - p.s));
      if (e.type !== 'ped' && e.type !== 'moto') {
        e.m.group.rotation.y = World.yawAt(e.s) + (e.dir === 1 ? 0 : Math.PI);
      } else if (e.type === 'moto') {
        e.m.group.rotation.y = World.yawAt(e.s);
      }
    }
  }

  function clearTraffic() {
    for (const e of traffic) {
      e.active = false;
      e.m.group.visible = false;
    }
  }

  /* ============================================================
   * 道具
   * ============================================================ */
  const items = [];
  let itemMeshLib = null;
  function buildItemMeshes() {
    itemMeshLib = {
      coin: new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.12, 14),
        new THREE.MeshLambertMaterial({ color: 0xf2cf46, emissive: 0xc9971a, emissiveIntensity: 0.55 })),
      repair: null, shield: null, turbo: null
    };
    const rg = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color: 0xf0f0ea }));
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.74),
      new THREE.MeshLambertMaterial({ color: 0xd23430, emissive: 0x991812, emissiveIntensity: 0.4 }));
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.74), c1.material);
    rg.add(box); rg.add(c1); rg.add(c2);
    itemMeshLib.repair = rg;
    itemMeshLib.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshLambertMaterial({ color: 0x4dd7ff, emissive: 0x1a7a9a, emissiveIntensity: 0.7 }));
    const tg = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 8),
      new THREE.MeshLambertMaterial({ color: 0xff8c1a, emissive: 0xb84e00, emissiveIntensity: 0.7 }));
    cone.rotation.x = -Math.PI / 2;
    tg.add(cone);
    itemMeshLib.turbo = tg;
  }
  function spawnItem(type, s, l) {
    let mesh;
    if (type === 'coin') mesh = itemMeshLib.coin.clone();
    else if (type === 'repair') mesh = itemMeshLib.repair.clone();
    else if (type === 'shield') mesh = itemMeshLib.shield.clone();
    else mesh = itemMeshLib.turbo.clone();
    mesh.visible = true;
    scene.add(mesh);
    items.push({ type, s, l, mesh, phase: rnd(0, 9) });
  }
  function updateSpawnsItems(dt) {
    spawnT.item -= dt;
    if (spawnT.item > 0) return;
    spawnT.item = rnd(2.2, 3.6);
    const r = Math.random();
    const s = player.s + rnd(110, 190);
    const l = World.LANES[Math.random() < 0.75 ? 2 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 4)];
    if (r < 0.5) {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) spawnItem('coin', s + i * 3.4, l);
    }
    else if (r < 0.68) spawnItem('repair', s, l);
    else if (r < 0.84) spawnItem('shield', s, l);
    else spawnItem('turbo', s, l);
  }
  function updateItems(dt) {
    const p = player;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.s < p.s - 24) { scene.remove(it.mesh); items.splice(i, 1); continue; }
      it.mesh.position.set(World.cx(it.s) + it.l,
        1.05 + Math.sin(elapsed * 3 + it.phase) * 0.14, -(it.s - p.s));
      it.mesh.rotation.y += dt * 2.4;
      /* 拾取 */
      if (!player.dead &&
          Math.abs(it.s - p.s) < (2.4 + p.def.len / 2) &&
          Math.abs(it.l - p.l) < 1.8) {
        if (it.type === 'coin') { p.coins++; Sfx.coin(); }
        else if (it.type === 'repair') {
          p.hp = Math.min(p.def.hp, p.hp + 35);
          Sfx.pickup(); toast(t('toastRepair'));
        }
        else if (it.type === 'shield') { p.shield = 5; Sfx.shield(); toast(t('toastShield')); }
        else { p.turbo = 4; Sfx.turbo(); toast(t('toastTurbo')); }
        burst(it.mesh.position.x, 1.1, it.mesh.position.z, 0xffe66e, 8, 4, 0.5);
        scene.remove(it.mesh); items.splice(i, 1);
      }
    }
  }
  function clearItems() {
    for (const it of items) scene.remove(it.mesh);
    items.length = 0;
  }

  /* ============================================================
   * 粒子
   * ============================================================ */
  const parts = [];
  function initParticles() {
    for (let i = 0; i < 56; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: World.glowTex, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1
      }));
      sp.visible = false; sp.scale.set(0.5, 0.5, 1);
      scene.add(sp);
      parts.push({ sp, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, x: 0, y: 0, s: 0 });
    }
  }
  function burst(x, y, z, color, n, spd, life) {
    let c = 0;
    for (const p of parts) {
      if (p.life > 0) continue;
      p.life = p.maxLife = life * rnd(0.6, 1.3);
      const a = Math.random() * Math.PI * 2, v = rnd(0.3, 1) * spd;
      p.vx = Math.sin(a) * v; p.vz = Math.cos(a) * v * 0.6; p.vy = rnd(0.2, 1) * spd * 0.7;
      p.x = x; p.y = y; p.s = player.s + z;   // z 为相对玩家的偏移
      p.sp.material.color.set(color);
      p.sp.visible = true;
      if (++c >= n) break;
    }
  }
  function updateParticles(dt) {
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 9 * dt;
      if (p.y < 0.1) { p.y = 0.1; p.vy *= -0.4; }
      const f = p.life / p.maxLife;
      p.sp.position.set(p.x, p.y, -(p.s - player.s));
      const sc = 0.35 + f * 0.85;
      p.sp.scale.set(sc, sc, 1);
      p.sp.material.opacity = f;
    }
  }

  /* ============================================================
   * 玩家
   * ============================================================ */
  function buildPlayerModel(def) {
    if (player.model) {
      scene.remove(player.model.group);
      player.model.group.traverse(o => {
        if (o.isMesh) { o.geometry.dispose(); }
      });
    }
    const m = buildPlayer(def);
    scene.add(m.group);
    player.model = m;
    player.def = def;

    /* 大灯 */
    if (player.spot) { scene.remove(player.spot); scene.remove(player.spot.target); }
    const spot = new THREE.SpotLight(0xfff2cc, 0.3, 65, 0.55, 0.55, 1.2);
    spot.position.set(0, 1.15, -def.len / 2 + 0.4);
    const tgt = new THREE.Object3D(); tgt.position.set(0, 0.15, -32);
    m.group.add(tgt); m.group.add(spot);
    spot.target = tgt;
    player.spot = spot;

    /* 护盾罩 */
    const sh = new THREE.Mesh(new THREE.SphereGeometry(Math.max(def.wid, def.len / 2.4) * 1.05, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x4dd7ff, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    sh.position.y = 0.9; sh.visible = false;
    m.group.add(sh);
    player.shieldMesh = sh;
  }

  function updatePlayer(dt) {
    const p = player, def = p.def;
    if (p.dead) {
      p.deadT += dt;
      p.speed = Math.max(0, p.speed - 30 * dt);
      p.s += p.speed * dt;
      return;
    }

    /* 转向 */
    const steerIn = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    p.steer = lerp(p.steer, steerIn, 1 - Math.exp(-dt * 9));
    p.l += p.steer * def.handling * dt;
    /* 弯道离心:高速过弯被甩向弯外,需打反向修正 */
    p.l -= p.speed * p.speed * World.curveAt(p.s) * 0.55 * dt;

    /* 纵向:自动巡航 / 全油门 / 刹车 / 涡轮 */
    const D = difficulty();
    const cruise = def.maxSpeed * 0.56;
    let target = input.up ? def.maxSpeed : cruise;
    let accel = def.accel * (input.up ? 1 : 0.55);
    if (p.turbo > 0) { target *= 1.34; accel *= 2.0; }
    /* 出界:压过边线即上草地/路肩(减速,防止路肩白嫖) */
    const offroad = Math.abs(p.l) > 6.35;
    if (offroad) { target *= 0.55; accel *= 0.6; }
    if (input.down) p.speed -= 30 * dt;
    if (p.speed < target) p.speed = Math.min(target, p.speed + accel * dt);
    else p.speed = Math.max(target, p.speed - 8 * dt);
    p.speed = clamp(p.speed, 0, def.maxSpeed * 1.4);

    p.s += p.speed * dt;
    p.dist = p.s - p.runStart;

    /* 护栏 / 边界 */
    const cityW = World.zoneWeights(p.s)[0];
    const lMax = lerp(10.6, 7.02, cityW);
    if (Math.abs(p.l) > lMax) {
      p.l = clamp(p.l, -lMax, lMax);
      if (cityW > 0.55 && p.railCd <= 0 && p.speed > 8) {
        p.railCd = 0.5;
        damage(3, null, true);
        burst(World.cx(p.s) + p.l + Math.sign(p.l) * 1, 0.7, 0, 0xffd070, 6, 5, 0.4);
      }
      p.speed *= (1 - 1.6 * dt);
    }
    p.railCd -= dt;

    /* 效果计时 */
    if (p.invuln > 0) p.invuln -= dt;
    if (p.shield > 0) p.shield -= dt;
    if (p.turbo > 0) p.turbo -= dt;

    /* 涡轮尾焰 */
    if (p.turbo > 0 && Math.random() < 0.7) {
      burst(World.cx(p.s) + p.l + rnd(-0.4, 0.4), 0.55, def.len / 2, 0xff8c1a, 2, 3, 0.3);
    }

    /* 里程碑提示 */
    const mile = Math.floor(p.dist / 500);
    if (mile > (p._mile || 0)) { p._mile = mile; if (mile > 0) toast(mile * 500 + ' ' + t('m') + ' ✓'); }

    /* 破纪录一次性提示 */
    if (!p.beatRecord && records.global > 120 && p.dist > records.global) {
      p.beatRecord = true; toast(t('newRecordToast')); Sfx.record();
    }

    /* 摆放 */
    const g = p.model.group;
    g.position.set(World.cx(p.s) + p.l, 0, 0);
    g.rotation.y = World.yawAt(p.s) + p.steer * 0.1;
    const lean = clamp(p.speed * p.speed * World.curveAt(p.s) * 0.012, -0.1, 0.1);
    g.rotation.z = -p.steer * 0.09 + lean;
    if (offroad) g.position.y = Math.abs(Math.sin(elapsed * 30)) * 0.06;

    /* 车轮 */
    p.wheelSpin -= p.speed * dt / 0.36;
    p.model.wheels.forEach(w => w.rotation.x = p.wheelSpin);
    p.model.steerWheels.forEach(w => w.rotation.y = p.steer * -0.32);

    /* 车灯 */
    const night = World.nightFactor;
    p.spot.intensity = 0.25 + night * 1.9;
    p.model.heads.forEach(h => h.material.emissiveIntensity = 0.7 + night * 0.6);
    p.model.tails.forEach(x => x.material.emissiveIntensity = input.down ? 2.2 : 0.3 + night * 0.5);

    /* 警车灯条 */
    if (def.id === 'police' && p.model.barRed) {
      const on = Math.sin(elapsed * 12) > 0;
      p.model.barRed.emissiveIntensity = on ? 2.6 : 0.15;
      p.model.barBlue.emissiveIntensity = on ? 0.15 : 2.6;
    }

    /* 无敌闪烁 */
    g.visible = !(p.invuln > 0 && Math.sin(elapsed * 28) > 0.2);

    /* 护盾罩 */
    p.shieldMesh.visible = p.shield > 0;
    if (p.shield > 0) {
      const sc2 = 1 + Math.sin(elapsed * 6) * 0.04;
      p.shieldMesh.scale.set(sc2, sc2, sc2);
      p.shieldMesh.material.opacity = 0.16 + Math.sin(elapsed * 6) * 0.07;
    }
  }

  /* ---------- 碰撞 ---------- */
  function collisions() {
    const p = player;
    if (p.dead) return;
    for (const e of traffic) {
      if (!e.active) continue;
      const hitS = Math.abs(e.s - p.s) < (e.len + p.def.len) / 2 * 0.82;
      const hitL = Math.abs(e.l - p.l) < (e.wid + p.def.wid) / 2 * 0.8;
      if (!hitS || !hitL) continue;

      const ex = World.cx(e.s) + e.l;
      const px = World.cx(p.s) + p.l;
      const mz = -(e.s - p.s);

      if (e.type === 'ped') {
        if (!e.fly) {
          e.fly = true; e.vy = 5.5; e.latV = Math.sign(e.l - p.l || 1) * 4; e.spin = rnd(6, 11);
          burst(ex, 1.2, mz, 0xffffff, 5, 3, 0.35);
          Sfx.crash(0.4);
          if (p.shield <= 0 && p.turbo <= 0) {
            damage(Math.round(15 + p.speed * 0.3), null);
            p.speed *= 0.78;
          }
        }
        continue;
      }

      /* 车辆碰撞 */
      const sameDir = e.dir === 1;
      const closing = sameDir ? Math.abs(p.speed - e.speed) : (p.speed + e.speed);
      if (p.shield > 0 || p.turbo > 0) {
        /* 神挡杀神 */
        burst(ex, 1.1, mz, 0xff8c1a, 12, 7, 0.7);
        burst(ex, 1.1, mz, 0xffd070, 8, 5, 0.5);
        e.active = false; e.m.group.visible = false;
        p.destroys++; p.coins += 2;
        Sfx.crash(0.55);
        if (p.turbo <= 0) p.speed *= 0.92;
        continue;
      }
      if (p.invuln > 0) continue;

      let dmg;
      if (e.type === 'moto' || e.type === 'bike') dmg = 8 + p.speed * 0.35;
      else if (sameDir) dmg = 9 + closing * 1.05;
      else dmg = 22 + closing * 1.15;          // 迎面:致命
      dmg = Math.round(dmg);
      damage(dmg, e);
      /* 减速 + 弹开 */
      p.speed *= sameDir ? 0.55 : 0.26;
      const push = Math.sign(p.l - e.l || (Math.random() < 0.5 ? 1 : -1));
      p.l += push * 0.65;
      if (e.type === 'car') { e.l -= push * 0.35; e.speed *= sameDir ? 0.8 : 1; }
      if (e.type === 'moto') { e.active = false; e.m.group.visible = false; }
      burst((ex + px) / 2, 1.0, mz, 0xffcf70, 10, 6, 0.55);
      camShake = Math.min(1, camShake + 0.55);
    }
  }

  function damage(d, src, isRail) {
    const p = player;
    if (p.invuln > 0 && !isRail) return;
    p.hp -= d;
    if (!isRail) p.invuln = 1.35;
    Sfx.crash(clamp(d / 40, 0.3, 1));
    toast('-' + d + ' HP', true);
    const v = $('fx-vignette');
    v.classList.add('hurt');
    setTimeout(() => v.classList.remove('hurt'), 420);
    camShake = Math.min(1, camShake + 0.3);
    updateHP();
    if (p.hp <= 0) { p.hp = 0; updateHP(); gameOver(); }
  }

  /* ============================================================
   * HUD
   * ============================================================ */
  function updateHP() {
    const p = player;
    const fill = $('hp-fill');
    const r = p.hp / p.def.hp;
    fill.style.width = (r * 100).toFixed(1) + '%';
    fill.className = r < 0.28 ? 'low' : (r < 0.55 ? 'mid' : '');
    $('hp-num').textContent = Math.ceil(p.hp);
  }
  let hudT = 0;
  function updateHUD(dt) {
    hudT -= dt;
    const p = player;
    $('fx-shield').classList.toggle('hidden', !(p.shield > 0));
    $('fx-turbo').classList.toggle('hidden', !(p.turbo > 0));
    if (p.shield > 0) $('fx-shield-t').textContent = p.shield.toFixed(1);
    if (p.turbo > 0) $('fx-turbo-t').textContent = p.turbo.toFixed(1);

    /* 逆行预警 */
    let worst = null;
    for (const e of traffic) {
      if (!e.active || !e.wrongWay) continue;
      const d = e.s - p.s;
      if (d > 10 && d < 230 && (worst === null || d < worst)) worst = d;
    }
    const w = $('hud-warn');
    if (worst !== null) {
      w.classList.remove('hidden');
      w.textContent = t('warnWrong') + Math.round(worst) + t('m');
    } else w.classList.add('hidden');

    if (hudT > 0) return;
    hudT = 0.12;
    $('hud-dist').textContent = fmtM(p.dist);
    const bestShow = Math.max(records.global, p.dist);
    $('hud-best').textContent = fmtM(bestShow);
    $('hud-speed').textContent = Math.round(p.speed * 3.6);
    /* 速度暗角 */
    const ratio = clamp(p.speed / p.def.maxSpeed, 0, 1.3);
    $('fx-vignette').style.opacity = clamp((ratio - 0.45) * 1.1, 0, 0.85);
  }

  function toast(txt, bad) {
    const box = $('toasts');
    if (box.children.length > 3) box.removeChild(box.firstChild);
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = txt;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); }, 1100);
    setTimeout(() => { el.remove(); }, 1500);
  }

  /* ============================================================
   * 镜头
   * ============================================================ */
  const camPos = new THREE.Vector3(0, 5.5, 9);
  function updateCamera(dt, menuMode) {
    const p = player;
    if (menuMode) {
      const a = elapsed * 0.22;
      const r = 8.8;
      const cxw = World.cx(p.s) + p.l;
      camPos.x = lerp(camPos.x, cxw + Math.sin(a) * r, 1 - Math.exp(-dt * 2.5));
      camPos.y = lerp(camPos.y, 2.6 + Math.sin(a * 0.5) * 0.7, 1 - Math.exp(-dt * 2.5));
      camPos.z = lerp(camPos.z, Math.cos(a) * r, 1 - Math.exp(-dt * 2.5));
      camera.position.copy(camPos);
      camera.lookAt(cxw, 0.9, 0);
      if (Math.abs(camFov - 55) > 0.1) { camFov = 55; camera.fov = 55; camera.updateProjectionMatrix(); }
      return;
    }
    const ratio = clamp(p.speed / p.def.maxSpeed, 0, 1.35);
    const tx = (World.cx(p.s + 9) + p.l) * 0.42 + (World.cx(p.s) + p.l) * 0.58;
    const tz = 9.2 + ratio * 0.7;
    const ty = 5.3 + ratio * 0.8;
    const k = 1 - Math.exp(-dt * 5.2);
    camPos.x = lerp(camPos.x, tx, k);
    camPos.y = lerp(camPos.y, ty, k);
    camPos.z = lerp(camPos.z, tz, k);
    camShake = Math.max(0, camShake - dt * 1.8);
    const sh = camShake * camShake * 0.5;
    camera.position.set(
      camPos.x + rnd(-sh, sh), camPos.y + rnd(-sh, sh) * 0.6, camPos.z + rnd(-sh, sh) * 0.4);
    camera.lookAt(World.cx(p.s + 26) + p.l * 0.42, 1.15, -26);
    const wantFov = 60 + ratio * 15 + (p.turbo > 0 ? 6 : 0);
    if (Math.abs(wantFov - camFov) > 0.2) {
      camFov = lerp(camFov, wantFov, 0.08);
      camera.fov = camFov; camera.updateProjectionMatrix();
    }
  }

  /* ============================================================
   * 状态切换
   * ============================================================ */
  let selectedDef = null;

  function startRun() {
    const p = player;
    clearTraffic(); clearItems();
    p.hp = p.def.hp; p.speed = 0; p.l = 1.65; p.steer = 0;
    p.invuln = 0; p.shield = 0; p.turbo = 0;
    p.coins = 0; p.destroys = 0; p._mile = 0; p.beatRecord = false;
    p.dead = false; p.deadT = 0;
    p.model.group.visible = true; p.model.group.rotation.x = 0;
    p.runStart = p.s;
    spawnT.car = 0.6; spawnT.onc = 1.6; spawnT.wrong = 6; spawnT.moto = 3.5;
    spawnT.bike = 5; spawnT.ped = 2.2; spawnT.item = 1.4;
    timeScale = 1;
    $('scr-menu').classList.add('hidden');
    $('scr-over').classList.add('hidden');
    $('scr-hud').classList.remove('hidden');
    state = 'play';
    updateHP();
    toast(t('go'));
    Sfx.init(); Sfx.ui();
  }

  function gameOver() {
    const p = player;
    if (p.dead) return;
    p.dead = true;
    timeScale = 0.28;
    burst(World.cx(p.s) + p.l, 1.0, 0, 0xff5030, 16, 8, 0.9);
    burst(World.cx(p.s) + p.l, 1.2, 0, 0xffd070, 10, 6, 0.7);
    camShake = 1;
    Sfx.crash(1); Sfx.gameOverSfx();
    /* 纪录 */
    const dist = Math.floor(p.dist);
    const isRecord = dist > records.global;
    if (isRecord) records.global = dist;
    records.map[p.def.id] = Math.max(records.map[p.def.id] || 0, dist);
    try {
      localStorage.setItem('race_best', String(records.global));
      localStorage.setItem('race_best_veh', JSON.stringify(records.map));
    } catch (e) { /* noop */ }
    setTimeout(() => {
      state = 'over';
      timeScale = 1;
      $('scr-hud').classList.add('hidden');
      $('scr-over').classList.remove('hidden');
      $('over-dist').textContent = dist;
      $('over-coins').textContent = p.coins;
      $('over-destroys').textContent = p.destroys;
      $('over-best').textContent = records.global;
      $('over-newrec').classList.toggle('hidden', !isRecord);
      if (isRecord) Sfx.record();
    }, 1500);
  }

  function toMenu() {
    clearTraffic(); clearItems();
    player.dead = false;
    player.speed = 0;
    if (player.model) player.model.group.visible = true;
    $('scr-over').classList.add('hidden');
    $('scr-pause').classList.add('hidden');
    $('scr-hud').classList.add('hidden');
    $('scr-menu').classList.remove('hidden');
    refreshMenu();
    state = 'menu';
  }

  function pauseGame() {
    if (state !== 'play') return;
    state = 'pause';
    $('scr-pause').classList.remove('hidden');
    Sfx.engine(0, false, false);
  }
  function resumeGame() {
    if (state !== 'pause') return;
    state = 'play';
    $('scr-pause').classList.add('hidden');
  }

  /* ============================================================
   * 菜单 UI
   * ============================================================ */
  function buildMenuUI() {
    const grid = $('veh-grid');
    grid.innerHTML = '';
    VEHICLE_DEFS.forEach(def => {
      const card = document.createElement('div');
      card.className = 'veh-card';
      card.dataset.id = def.id;
      const best = records.map[def.id];
      card.innerHTML =
        '<div class="veh-emoji">' + def.emoji + '</div>' +
        '<div class="veh-name">' + (LANG === 'zh' ? def.zh : def.en) + '</div>' +
        '<div class="veh-sub">' + (LANG === 'zh' ? def.en : def.zh) + '</div>' +
        (best ? '<div class="veh-bestmini">🏆 ' + best + t('m') + '</div>' : '');
      card.addEventListener('click', () => selectVehicle(def.id));
      grid.appendChild(card);
    });
    const muteBtn = $('btn-mute');
    muteBtn.removeEventListener('click', muteBtn._h);
    muteBtn._h = () => {
      Sfx.init();
      Sfx.setMuted(!Sfx.isMuted());
      muteBtn.innerHTML = '♪ ' + (Sfx.isMuted() ? t('soundOff') : t('soundOn'));
      Sfx.ui();
    };
    muteBtn.addEventListener('click', muteBtn._h);
    muteBtn.innerHTML = '♪ ' + (Sfx.isMuted() ? t('soundOff') : t('soundOn'));
  }

  function selectVehicle(id) {
    const def = VEHICLE_DEFS.find(v => v.id === id);
    if (!def) return;
    selectedDef = def;
    buildPlayerModel(def);
    document.querySelectorAll('.veh-card').forEach(c =>
      c.classList.toggle('sel', c.dataset.id === id));
    $('sel-emoji').textContent = def.emoji;
    $('sel-name').textContent = LANG === 'zh' ? def.zh : def.en;
    $('sel-sub').textContent = LANG === 'zh' ? def.en : def.zh;
    $('st-speed').style.width = (def.maxSpeed / 46 * 100) + '%';
    $('st-accel').style.width = (def.accel / 13 * 100) + '%';
    $('st-hand').style.width = (def.handling / 7.6 * 100) + '%';
    $('st-hp').style.width = (def.hp / 190 * 100) + '%';
    const best = records.map[def.id];
    $('sel-best').textContent = best ? t('vehBest', { m: best + ' m' }) : t('noVehBest');
    Sfx.ui();
  }

  function refreshMenu() {
    $('menu-best').textContent = fmtM(records.global);
    document.querySelectorAll('.veh-card').forEach(c => {
      const id = c.dataset.id;
      const def = VEHICLE_DEFS.find(v => v.id === id);
      const best = records.map[id];
      const mini = c.querySelector('.veh-bestmini');
      if (best) { if (!mini) {
        const el = document.createElement('div');
        el.className = 'veh-bestmini';
        c.appendChild(el);
      } c.querySelector('.veh-bestmini').textContent = '🏆 ' + best + t('m'); }
      else if (mini) mini.remove();
    });
    if (selectedDef) {
      const best = records.map[selectedDef.id];
      $('sel-best').textContent = best ? t('vehBest', { m: best + ' m' }) : t('noVehBest');
    }
  }

  /* ============================================================
   * 输入绑定
   * ============================================================ */
  function bindInput() {
    const keyMap = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down'
    };
    window.addEventListener('keydown', e => {
      Sfx.init();
      if (keyMap[e.key] !== undefined) {
        input[keyMap[e.key]] = true;
        e.preventDefault();
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (state === 'play') pauseGame();
        else if (state === 'pause') resumeGame();
      }
      if (e.key === 'Enter') {
        if (state === 'menu') startRun();
        else if (state === 'over') startRun();
      }
    });
    window.addEventListener('keyup', e => {
      if (keyMap[e.key] !== undefined) {
        input[keyMap[e.key]] = false;
        e.preventDefault();
      }
    });

    /* 触屏按键(指针事件天然支持多点) */
    const bindPad = (id, key) => {
      const el = $(id);
      const on = ev => {
        ev.preventDefault();
        Sfx.init();
        input[key] = true;
        el.classList.add('on');
      };
      const off = ev => {
        ev.preventDefault();
        input[key] = false;
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    bindPad('pad-left-btn', 'left');
    bindPad('pad-right-btn', 'right');
    bindPad('pad-brake', 'down');
    bindPad('pad-gas', 'up');

    /* 全局手势:解锁音频 + 阻止页面滚动 */
    document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('pointerdown', () => Sfx.init(), { once: true });

    /* 按钮 */
    $('btn-start').addEventListener('click', () => { Sfx.init(); startRun(); });
    $('btn-retry').addEventListener('click', () => { Sfx.init(); startRun(); });
    $('btn-garage').addEventListener('click', toMenu);
    $('btn-pause').addEventListener('click', pauseGame);
    $('btn-resume').addEventListener('click', resumeGame);
    $('btn-quit').addEventListener('click', toMenu);

    /* 切后台自动暂停 */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state === 'play') pauseGame();
    });
    window.addEventListener('blur', () => { if (state === 'play') pauseGame(); });
  }

  /* ============================================================
   * 主循环
   * ============================================================ */
  let lastT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (dt <= 0) return;
    elapsed += dt;

    /* 性能自适应降级 */
    fpsEMA = fpsEMA * 0.96 + (1 / dt) * 0.04;
    if (fpsEMA < 38 && degraded === 0 && elapsed > 5) {
      degraded = 1; renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    } else if (fpsEMA < 30 && degraded === 1) {
      degraded = 2; renderer.setPixelRatio(1);
    }

    const sdt = dt * timeScale;
    warnCd -= dt;

    if (state === 'play') {
      updatePlayer(sdt);
      updateSpawns(sdt);
      updateSpawnsItems(sdt);
      updateTraffic(sdt);
      updateItems(sdt);
      collisions();
      updateHUD(dt);
      Sfx.engine(clamp(player.speed / player.def.maxSpeed, 0, 1.35), player.turbo > 0, true);
    } else if (state === 'over') {
      updatePlayer(sdt);
      Sfx.engine(0, false, false);
    } else if (state === 'pause') {
      Sfx.engine(0, false, false);
    } else if (state === 'menu') {
      /* 展示台:车辆怠速停在路边 */
      player.model.group.position.set(World.cx(player.s) + player.l, 0, 0);
      player.model.group.rotation.y = World.yawAt(player.s);
      player.wheelSpin -= dt * 0.5;
      player.model.wheels.forEach(w => w.rotation.x = player.wheelSpin);
      const night = World.nightFactor;
      player.spot.intensity = 0.2 + night * 1.6;
      player.model.heads.forEach(h => h.material.emissiveIntensity = 0.6 + night);
      if (player.model.barRed) {
        const on = Math.sin(elapsed * 12) > 0;
        player.model.barRed.emissiveIntensity = on ? 2.6 : 0.15;
        player.model.barBlue.emissiveIntensity = on ? 0.15 : 2.6;
      }
      Sfx.engine(0.06, false, true);
    }

    updateParticles(sdt);
    World.update(player.s, camera.position.x);
    updateCamera(dt, state === 'menu');
    renderer.render(scene, camera);
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    if (typeof THREE === 'undefined') {
      $('engine-error').classList.remove('hidden');
      return;
    }
    /* 应用 i18n */
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      const v = I18N[LANG][k];
      if (v !== undefined) el.innerHTML = v;
    });
    document.querySelectorAll('.help-txt').forEach(el => {
      if (!el.classList.contains('touch-only') &&
          window.matchMedia('(pointer:coarse)').matches) el.style.display = 'none';
    });

    try {
      renderer = new THREE.WebGLRenderer({ canvas: $('game3d'), antialias: true });
    } catch (e) {
      $('engine-error').classList.remove('hidden');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    resize();

    World.init(scene, camera);
    initTraffic();
    buildItemMeshes();
    initParticles();

    player.s = 60;
    buildPlayerModel(VEHICLE_DEFS[0]);
    selectedDef = VEHICLE_DEFS[0];
    buildMenuUI();
    selectVehicle(VEHICLE_DEFS[0].id);
    refreshMenu();
    bindInput();

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));

    state = 'menu';
    lastT = performance.now();
    requestAnimationFrame(loop);
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', Game.boot);
if (document.readyState !== 'loading') Game.boot();
