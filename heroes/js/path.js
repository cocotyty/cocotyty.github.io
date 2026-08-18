/* ============================================================
 * 征服纪元 · path.js — 冒险地图寻路(A* / Dijkstra 距离场)
 * 无 DOM 依赖
 * ============================================================ */
(function (G) {
  'use strict';
  const TERRAIN = G.TERRAIN, ROAD_COST = G.ROAD_COST;

  /* 地块是否可被通行(战争迷雾外;怪物格视为"战斗通行") */
  function tileBlocked(game, x, y) {
    const m = game.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
    return !TERRAIN[m.terrain[y * m.w + x]].pass;
  }

  /* 路径规划时的战斗代价:怪物格 +600(倾向绕行,但不封死) */
  function planCost(game, hero, x, y) {
    let c = stepCost(game, hero, x, y);
    const o = game.objAt[y * game.map.w + x];
    if (o && o.type === 'monster') c += 600;
    return c;
  }

  /* 单步消耗(已含寻路术减免) */
  function stepCost(game, hero, x, y) {
    const m = game.map;
    let c;
    if (m.road[y * m.w + x]) c = ROAD_COST;
    else {
      c = TERRAIN[m.terrain[y * m.w + x]].cost;
      if (hero && c > 100) {
        const pf = hero.skills.pathfinding || 0;
        c = 100 + (c - 100) * (1 - [0, 0.25, 0.5, 0.75][pf]);
      }
    }
    return c;
  }

  const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  /* A* 寻路。返回 {path:[{x,y}...不含起点], cost} 或 null;cost 含战斗代价 */
  function findPath(game, hero, sx, sy, tx, ty) {
    const m = game.map, W = m.w, H = m.h;
    if (sx === tx && sy === ty) return { path: [], cost: 0 };
    if (tileBlocked(game, tx, ty)) return null;
    const size = W * H;
    const dist = new Float64Array(size).fill(Infinity);
    const prev = new Int32Array(size).fill(-1);
    const open = new MinHeap();
    const si = sy * W + sx;
    dist[si] = 0;
    open.push(si, 0);
    const hEst = (x, y) => (Math.max(Math.abs(x - tx), Math.abs(y - ty))) * 66;
    let found = false;
    while (open.size) {
      const ci = open.pop();
      const cx = ci % W, cy = (ci / W) | 0;
      if (cx === tx && cy === ty) { found = true; break; }
      const d0 = dist[ci];
      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (tileBlocked(game, nx, ny)) continue;
        const ni = ny * W + nx;
        const nd = d0 + planCost(game, hero, nx, ny);
        if (nd < dist[ni]) {
          dist[ni] = nd; prev[ni] = ci;
          open.push(ni, nd + hEst(nx, ny));
        }
      }
    }
    if (!found) return null;
    const path = [];
    let cur = ty * W + tx;
    while (cur !== si && cur >= 0) {
      path.push({ x: cur % W, y: (cur / W) | 0 });
      cur = prev[cur];
    }
    path.reverse();
    return { path, cost: dist[ty * W + tx] };
  }

  /* Dijkstra 距离场(AI 用):含战斗代价 */
  function distanceField(game, hero, sx, sy) {
    const m = game.map, W = m.w, H = m.h, size = W * H;
    const dist = new Float64Array(size).fill(Infinity);
    const open = new MinHeap();
    const si = sy * W + sx;
    dist[si] = 0; open.push(si, 0);
    while (open.size) {
      const ci = open.pop();
      const d0 = dist[ci];
      const cx = ci % W, cy = (ci / W) | 0;
      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (tileBlocked(game, nx, ny)) continue;
        const ni = ny * W + nx;
        const nd = d0 + planCost(game, hero, nx, ny);
        if (nd < dist[ni]) { dist[ni] = nd; open.push(ni, nd); }
      }
    }
    return dist;
  }

  /* 二叉小顶堆 */
  class MinHeap {
    constructor() { this.a = []; this.size = 0; }
    push(v, p) {
      const a = this.a; a.push([p, v]); this.size++;
      let i = a.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1;
        if (a[par][0] <= a[i][0]) break;
        [a[par], a[i]] = [a[i], a[par]]; i = par;
      }
    }
    pop() {
      const a = this.a; const top = a[0][1];
      const last = a.pop(); this.size--;
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let s = i;
          if (l < a.length && a[l][0] < a[s][0]) s = l;
          if (r < a.length && a[r][0] < a[s][0]) s = r;
          if (s === i) break;
          [a[s], a[i]] = [a[i], a[s]]; i = s;
        }
      }
      return top;
    }
  }

  /* 战场 BFS:用于战斗中单位移动范围 */
  function battleReach(cells, cols, rows, sx, sy, speed, flying) {
    const dist = new Int16Array(cols * rows).fill(-1);
    const q = [sy * cols + sx];
    dist[sy * cols + sx] = 0;
    let head = 0;
    while (head < q.length) {
      const ci = q[head++];
      const cx = ci % cols, cy = (ci / cols) | 0;
      const d = dist[ci];
      if (d >= speed) continue;
      for (const [dx, dy] of (flying ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]])) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (cells[ni] !== 0 || dist[ni] >= 0) continue;   /* 0 = 空格 */
        dist[ni] = d + 1;
        q.push(ni);
      }
    }
    return dist;
  }

  G.findPath = findPath;
  G.distanceField = distanceField;
  G.stepCost = stepCost;
  G.planCost = planCost;
  G.tileBlocked = tileBlocked;
  G.battleReach = battleReach;
  G.MinHeap = MinHeap;
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
