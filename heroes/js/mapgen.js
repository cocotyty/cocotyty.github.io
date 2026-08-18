/* ============================================================
 * 征服纪元 · mapgen.js — 超大地图生成
 * 分区(Voronoi) + 地形噪声 + 湖泊山脉 + 道路网络 + 矿/守卫/宝物
 * 无 DOM 依赖
 * ============================================================ */
(function (G) {
  'use strict';
  const { TERRAIN, FACTIONS, FACTION_IDS, CREATURES, unitPower, RNG } = G;

  const MAP_SIZES = {
    S: { w: 44, h: 44, label: '小型 44×44', neutrals: 2 },
    M: { w: 60, h: 60, label: '中型 60×60', neutrals: 4 },
    L: { w: 76, h: 76, label: '大型 76×76', neutrals: 6 },
    XL: { w: 96, h: 96, label: '巨型 96×96', neutrals: 9 },
  };

  const TOWN_NAMES = {
    castle: ['狮心城', '白鹰堡', '圣光城', '银盔堡', '曙光城', '王冠城', '烈阳堡', '铁卫城'],
    rampart: ['翠叶城', '月泉镇', '风语堡', '鹿角城', '绿荫镇', '星木堡', '溪谷镇', '古树庭'],
    tower: ['高塔城', '秘法城', '霜峰塔', '星辉塔', '白霜城', '智慧城', '云顶塔', '奥术城'],
    inferno: ['焚天城', '熔岩堡', '灰烬城', '硫火镇', '深渊门', '赤岩堡', '焦土城', '黑焰镇'],
    necro: ['亡语镇', '黑棺城', '幽冥堡', '白骨镇', '诅咒城', '夜墓堡', '哀嚎镇', '荒坟城'],
  };

  /* ---------- 值噪声(2 倍频) ---------- */
  function makeNoise(rng, cells) {
    const lat = [];
    const N = Math.ceil(200 / cells) + 2;
    for (let i = 0; i < N * N; i++) lat.push(rng.next());
    const at = (x, y) => lat[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const gx = x / cells, gy = y / cells;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = smooth(gx - x0), fy = smooth(gy - y0);
      const v = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
        (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
      return v;
    };
  };

  /* ============================================================ */
  function genMap(opts) {
    /* opts: {size:'XL', players:6, playerFactions:{0:'castle',...}, seed} */
    const sizeDef = MAP_SIZES[opts.size] || MAP_SIZES.L;
    const W = sizeDef.w, H = sizeDef.h;
    const rng = new RNG(opts.seed);
    const nP = opts.players;
    const area = W * H;

    const terrain = new Uint8Array(W * H);
    const road = new Uint8Array(W * H);
    const objAt = new Array(W * H).fill(null);

    /* ---------- 1. 城镇布点 ---------- */
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * (nP <= 2 ? 0.40 : 0.36);
    const towns = [];
    const minDistBetween = radius * 1.15;
    for (let i = 0; i < nP; i++) {
      const ang = (i / nP) * Math.PI * 2 + rng.float(-0.3, 0.3) / Math.max(2, nP / 2);
      const r = radius * rng.float(0.82, 1.0);
      const x = Math.round(cx + Math.cos(ang) * r);
      const y = Math.round(cy + Math.sin(ang) * r * 0.92);
      const fac = (opts.playerFactions && opts.playerFactions[i]) || rng.pick(FACTION_IDS);
      towns.push({ x, y, faction: fac, owner: i, neutral: false });
    }
    let guard = 0;
    while (towns.length < nP + sizeDef.neutrals && guard++ < 4000) {
      const x = rng.int(6, W - 7), y = rng.int(6, H - 7);
      /* 尝试次数越多,间距要求越宽松,保证中立城一定放得下 */
      const relax = 1 - Math.min(0.7, guard / 6000);
      const minD2 = minDistBetween ** 2 * 0.75 * relax * relax;
      if (towns.every(t => (t.x - x) ** 2 + (t.y - y) ** 2 > minD2)) {
        towns.push({ x, y, faction: rng.pick(FACTION_IDS), owner: -1, neutral: true });
      }
    }

    /* ---------- 2. 分区 + 地形 ---------- */
    const zoneOf = new Int16Array(W * H);
    const noise = makeNoise(rng, 9), noise2 = makeNoise(rng, 4);
    const jitter = (x, y) => (noise2(x / 6, y / 6) - 0.5) * 16;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < towns.length; i++) {
        const t = towns[i];
        const d = (t.x - x) ** 2 + (t.y - y) ** 2 + (i % 2 ? jitter(x, y) : -jitter(x, y));
        if (d < bd) { bd = d; best = i; }
      }
      zoneOf[y * W + x] = best;
      const f = FACTIONS[towns[best].faction];
      const n = noise(x, y);
      terrain[y * W + x] = f.theme[Math.min(3, Math.floor(n * 4))];
    }

    /* ---------- 3. 边界山脉 ---------- */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) terrain[y * W + x] = 8;
    }

    /* ---------- 4. 湖泊与山体 ---------- */
    const blob = (bx, by, rad, val) => {
      const rr = rad * rad;
      for (let y = Math.max(0, by - rad - 1); y <= Math.min(H - 1, by + rad + 1); y++)
        for (let x = Math.max(0, bx - rad - 1); x <= Math.min(W - 1, bx + rad + 1); x++) {
          const n = 0.75 + noise(x / 2, y / 2) * 0.5;
          if ((x - bx) ** 2 + (y - by) ** 2 <= rr * n) terrain[y * W + x] = val;
        }
    };
    const farFromTowns = (x, y, d) => towns.every(t => (t.x - x) ** 2 + (t.y - y) ** 2 > d * d);
    const nLakes = Math.round(area / 1800) + rng.int(1, 3);
    for (let i = 0; i < nLakes; i++) {
      const x = rng.int(6, W - 7), y = rng.int(6, H - 7);
      if (farFromTowns(x, y, 11)) blob(x, y, rng.int(3, 7), 7);
    }
    const nRocks = Math.round(area / 260);
    for (let i = 0; i < nRocks; i++) {
      const x = rng.int(4, W - 5), y = rng.int(4, H - 5);
      if (farFromTowns(x, y, 7)) blob(x, y, rng.int(2, 4), 8);
    }

    /* ---------- 5. 城镇周边清理 ---------- */
    for (const t of towns) {
      for (let y = t.y - 3; y <= t.y + 3; y++) for (let x = t.x - 3; x <= t.x + 3; x++) {
        if (x > 1 && y > 1 && x < W - 2 && y < H - 2 && (terrain[y * W + x] === 7 || terrain[y * W + x] === 8)) {
          const f = FACTIONS[t.faction];
          terrain[y * W + x] = f.theme[0];
        }
      }
    }

    /* ---------- 6. 道路网络 ---------- */
    const passable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && TERRAIN[terrain[y * W + x]].pass;
    const buildRoad = (a, b) => {
      /* 简易 A* (4+8 向,避开水域) */
      const dist = new Float64Array(W * H).fill(Infinity);
      const prev = new Int32Array(W * H).fill(-1);
      const open = new G.MinHeap();
      const si = a.y * W + a.x;
      dist[si] = 0; open.push(si, 0);
      let found = false;
      while (open.size) {
        const ci = open.pop();
        const cxx = ci % W, cyy = (ci / W) | 0;
        if (cxx === b.x && cyy === b.y) { found = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = cxx + dx, ny = cyy + dy;
          if (!passable(nx, ny)) continue;
          const ni = ny * W + nx;
          const c = (terrain[ni] === 7 || terrain[ni] === 4 ? 170 : TERRAIN[terrain[ni]].cost) + (dx && dy ? 10 : 0);
          if (dist[ci] + c < dist[ni]) { dist[ni] = dist[ci] + c; prev[ni] = ci; open.push(ni, dist[ni] + Math.abs(nx - b.x) * 50 + Math.abs(ny - b.y) * 50); }
        }
      }
      if (!found) return false;
      let cur = b.y * W + b.x;
      while (cur !== si && cur >= 0) { road[cur] = 1; cur = prev[cur]; }
      return true;
    };
    for (let i = 0; i < towns.length; i++) {
      const sorted = towns.map((t, j) => ({ j, d: (t.x - towns[i].x) ** 2 + (t.y - towns[i].y) ** 2 })).filter(o => o.j !== i).sort((a, b) => a.d - b.d);
      for (const o of sorted.slice(0, 2)) if (o.j > i) buildRoad(towns[i], towns[o.j]);
    }

    /* ---------- 7. 连通性保障 ---------- */
    const connected = () => {
      const seen = new Uint8Array(W * H);
      const q = [towns[0].y * W + towns[0].x];
      seen[q[0]] = 1;
      let head = 0;
      while (head < q.length) {
        const ci = q[head++];
        const cxx = ci % W, cyy = (ci / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cxx + dx, ny = cyy + dy;
          if (!passable(nx, ny) || seen[ny * W + nx]) continue;
          seen[ny * W + nx] = 1; q.push(ny * W + nx);
        }
      }
      return towns.every(t => seen[t.y * W + t.x + 0]);
    };
    if (!connected()) {
      /* 强制开路:两两不连通的城镇间直线开凿 */
      for (let i = 1; i < towns.length; i++) {
        const t = towns[i];
        const steps = Math.max(Math.abs(t.x - towns[0].x), Math.abs(t.y - towns[0].y));
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(towns[0].x + (t.x - towns[0].x) * s / steps);
          const y = Math.round(towns[0].y + (t.y - towns[0].y) * s / steps);
          for (let yy = y; yy <= y + 1; yy++) for (let xx = x; xx <= x + 1; xx++) {
            if (xx > 1 && yy > 1 && xx < W - 2 && yy < H - 2 && !TERRAIN[terrain[yy * W + xx]].pass) {
              terrain[yy * W + xx] = FACTIONS[towns[i].faction].theme[0];
            }
          }
        }
      }
    }

    /* ---------- 8. 物件放置 ---------- */
    const objects = [];
    let oid = 0;
    const usedNames = {};
    const townObjs = [];
    for (const t of towns) {
      const pool = TOWN_NAMES[t.faction].slice();
      const name = pool.find(n => !usedNames[n]) || (pool[0] + '·' + rng.int(2, 99));
      usedNames[name] = 1;
      const o = { id: 't' + (oid++), type: 'town', x: t.x, y: t.y, faction: t.faction, owner: t.owner, name, buildings: ['villageHall'], garrison: new Array(7).fill(null), pool: {}, builtToday: false, spells: [], tavern: [] };
      objects.push(o); objAt[t.y * W + t.x] = o; townObjs.push(o);
    }
    const ringOf = (t, x, y) => Math.max(Math.abs(x - t.x), Math.abs(y - t.y));
    const canPlace = (x, y, minTownDist) => {
      if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) return false;
      if (!TERRAIN[terrain[y * W + x]].pass) return false;
      if (road[y * W + x]) return false;
      if (objAt[y * W + x]) return false;
      for (const t of towns) if (ringOf(t, x, y) <= minTownDist) return false;
      return true;
    };
    const placeIn = (zone, ringMin, ringMax, minTownDist, make, tries) => {
      const t = towns[zone];
      for (let i = 0; i < (tries || 160); i++) {
        const x = t.x + rng.int(-ringMax, ringMax), y = t.y + rng.int(-ringMax, ringMax);
        const r = ringOf(t, x, y);
        if (r < ringMin || r > ringMax) continue;
        if (!canPlace(x, y, minTownDist)) continue;
        const o = make(x, y);
        if (o) { objects.push(o); objAt[y * W + x] = o; return o; }
      }
      return null;
    };

    /* 守卫强度按环缩放 */
    const guardCreature = (zone, ring) => {
      const fac = towns[zone].faction;
      const f = FACTIONS[fac];
      let pool;
      if (ring <= 10) pool = [f.units[0], f.units[1], f.units[2], 'peasant', 'rogue', 'boar'];
      else if (ring <= 20) pool = [f.units[2], f.units[3], f.units[4], 'rogue', 'boar', 'ogre'];
      else pool = [f.units[4], f.units[5], f.units[6], 'ogre', 'manticore', 'cyclops'];
      return rng.pick(pool);
    };
    const makeMonster = (zone, ring, reward) => {
      let power;
      if (ring <= 10) power = rng.int(35, 170);
      else if (ring <= 18) power = rng.int(170, 700);
      else power = rng.int(700, 3000);
      return (x, y) => {
        const c = guardCreature(zone, ring);
        const n = Math.max(1, Math.round(power / unitPower(c)));
        return { id: 'o' + (oid++), type: 'monster', x, y, c, n, reward: reward || null };
      };
    };

    const rareMines = ['alchlab', 'sulfurdune', 'crystallcave', 'gempond'];
    /* 矿点守军数据(非起始区,按距离环缩放) */
    const guardData = (ring) => {
      let power;
      if (ring <= 10) power = rng.int(40, 200);
      else if (ring <= 18) power = rng.int(200, 800);
      else power = rng.int(800, 2800);
      const pool = ring <= 12
        ? ['peasant', 'rogue', 'boar', 'skeleton', 'pikeman', 'centaur', 'gremlin', 'imp']
        : ring <= 20
          ? ['rogue', 'boar', 'ogre', 'griffin', 'swordsman', 'dwarf', 'golem', 'hound', 'zombie']
          : ['ogre', 'manticore', 'cyclops', 'monk', 'dendroid', 'mage', 'demon', 'vampire'];
      const c = rng.pick(pool);
      return { c, n: Math.max(1, Math.round(power / unitPower(c))) };
    };
    for (let z = 0; z < towns.length; z++) {
      const isStart = !towns[z].neutral;
      /* 基础矿:每个分区 1 木材 + 1 矿石(起始区近且无守卫) */
      const mw = placeIn(z, isStart ? 4 : 7, isStart ? 9 : 14, 2, (x, y) => ({ id: 'o' + (oid++), type: 'sawmill', x, y, owner: -1 }));
      const mo = placeIn(z, isStart ? 4 : 7, isStart ? 9 : 14, 2, (x, y) => ({ id: 'o' + (oid++), type: 'orepit', x, y, owner: -1 }));
      if (!isStart) {
        if (mw && rng.chance(0.7)) mw.guard = guardData(12);
        if (mo && rng.chance(0.7)) mo.guard = guardData(12);
      }
      /* 稀有矿 2-4(带守卫) */
      const nRare = rng.int(2, 4);
      for (let i = 0; i < nRare; i++) {
        const mt = rng.pick(rareMines);
        const ring = rng.int(10, 26);
        const m = placeIn(z, ring - 2, ring + 4, 2, (x, y) => ({ id: 'o' + (oid++), type: mt, x, y, owner: -1 }));
        if (m) m.guard = guardData(rng.int(10, 24));
      }
      /* 金矿 */
      if (rng.chance(0.75)) {
        const gm = placeIn(z, 14, 30, 2, (x, y) => ({ id: 'o' + (oid++), type: 'goldmine', x, y, owner: -1 }));
        if (gm) gm.guard = guardData(20);
      }
      /* 资源堆 */
      const nPile = Math.round(area / towns.length / 34);
      for (let i = 0; i < nPile; i++) {
        const ring = rng.int(3, 26);
        placeIn(z, Math.max(2, ring - 2), ring + 3, 2, (x, y) => {
          const roll = rng.next();
          if (roll < 0.5) return { id: 'o' + (oid++), type: 'pileGold', x, y, n: (ring < 10 ? rng.int(4, 9) : rng.int(6, 18)) * 100 + rng.int(0, 99) };
          if (roll < 0.72) return { id: 'o' + (oid++), type: 'pileWood', x, y, n: rng.int(3, 9) };
          if (roll < 0.9) return { id: 'o' + (oid++), type: 'pileOre', x, y, n: rng.int(3, 9) };
          return { id: 'o' + (oid++), type: 'pileRare', x, y, res: rng.pick(['mercury', 'sulfur', 'crystal', 'gems']), n: rng.int(2, 6) };
        });
      }
      /* 宝箱 */
      const nChest = Math.round(area / towns.length / 110) + 1;
      for (let i = 0; i < nChest; i++) placeIn(z, 3, 26, 2, (x, y) => ({ id: 'o' + (oid++), type: 'chest', x, y }));
      /* 宝物(远处守卫) */
      const nArt = rng.int(2, 5);
      for (let i = 0; i < nArt; i++) {
        const far = rng.chance(0.75);
        const ring = far ? rng.int(14, 30) : rng.int(4, 10);
        placeIn(z, ring, ring + 3, 2, makeMonster(z, ring, { kind: 'artifact' }), 200);
      }
      /* 起始区额外近距福利 */
      if (isStart) {
        placeIn(z, 4, 8, 2, (x, y) => ({ id: 'o' + (oid++), type: 'chest', x, y }));
        placeIn(z, 3, 8, 2, (x, y) => ({ id: 'o' + (oid++), type: 'learnstone', x, y, used: false }));
        placeIn(z, 5, 10, 2, (x, y) => ({ id: 'o' + (oid++), type: 'campfire', x, y }));
      }
      /* 学习石/风车/篝火 */
      if (rng.chance(0.8)) placeIn(z, 6, 24, 2, (x, y) => ({ id: 'o' + (oid++), type: 'learnstone', x, y, used: false }));
      if (rng.chance(0.7)) placeIn(z, 8, 26, 2, (x, y) => ({ id: 'o' + (oid++), type: 'windmill', x, y, stock: null }));
      if (rng.chance(0.6)) placeIn(z, 6, 26, 2, (x, y) => ({ id: 'o' + (oid++), type: 'campfire', x, y }));
      if (rng.chance(0.5)) placeIn(z, 8, 28, 2, (x, y) => ({ id: 'o' + (oid++), type: 'shrine', x, y, spell: rng.pick(G.SPELL_IDS.filter(s => G.SPELLS[s].lvl <= rng.int(2, 4))), used: false }));
      /* 野外巢穴 */
      if (rng.chance(0.75)) {
        const c = rng.pick(['peasant', 'rogue', 'boar', 'ogre', 'manticore'].concat(FACTIONS[towns[z].faction].units.slice(0, 3)));
        placeIn(z, 8, 26, 2, (x, y) => ({ id: 'o' + (oid++), type: 'dwelling', x, y, c, pool: CREATURES[c].grow }));
      }
      /* 游荡野怪 */
      const nMon = Math.round(area / towns.length / 52);
      for (let i = 0; i < nMon; i++) {
        const ring = rng.int(7, 30);
        placeIn(z, ring, ring + 2, 3, makeMonster(z, ring, rng.chance(0.45) ? { kind: 'res' } : null), 200);
      }
    }
    /* 全图限量建筑 */
    const globalPlace = (make, count, minDist) => {
      for (let i = 0; i < count; i++) {
        for (let t = 0; t < 220; t++) {
          const z = rng.int(0, towns.length - 1);
          const ring = rng.int(8, 28);
          if (placeIn(z, ring, ring + 3, minDist, make, 40)) break;
        }
      }
    };
    globalPlace((x, y) => ({ id: 'o' + (oid++), type: 'arena', x, y, used: false }), Math.max(2, Math.round(towns.length / 2)), 4);
    globalPlace((x, y) => ({ id: 'o' + (oid++), type: 'witchhut', x, y, used: false, skill: rng.pick(G.SKILL_IDS) }), Math.max(2, Math.round(towns.length / 2)), 4);
    globalPlace((x, y) => ({ id: 'o' + (oid++), type: 'watchtower', x, y, used: false }), Math.max(3, Math.round(towns.length * 0.8)), 4);

    /* ---------- 9. 中立城镇守军 ---------- */
    for (const o of townObjs) {
      if (towns.find(t => t.x === o.x && t.y === o.y).neutral) {
        const f = FACTIONS[o.faction];
        o.garrison[0] = { id: f.units[0], count: rng.int(15, 30) };
        o.garrison[1] = { id: f.units[1], count: rng.int(6, 14) };
        o.garrison[2] = { id: f.units[2], count: rng.int(4, 10) };
        o.garrison[3] = { id: f.units[3], count: rng.int(2, 6) };
      }
    }

    return {
      map: { w: W, h: H, terrain, road },
      objects, objAt, townObjs,
      zones: { zoneOf, towns },
      rngSeed: opts.seed,
    };
  }

  G.MAP_SIZES = MAP_SIZES;
  G.genMap = genMap;
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
