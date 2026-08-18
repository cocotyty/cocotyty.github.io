/* ============================================================
 * 三国烽火 · 大地图渲染(canvas)
 * 世界坐标 1000x820,相机可缩放平移
 * ============================================================ */
'use strict';

const SGMap = (() => {
  const D = SG_DATA;
  let cv, ctx, W, H;
  const cam = { x: 490, y: 410, zoom: 0.9 };
  let state = null;            // game state 引用
  let selCity = null;          // 选中城
  let hoverCity = null;
  let onClickCity = null;
  let lastAnim = 0;

  /* 山脉装饰点(手工摆放:阴山/太行/秦岭/大巴/武夷...) */
  const MOUNTAINS = [
    [520,140],[560,120],[600,135],[540,165],[470,120],[430,140],[380,120],[340,130],
    [660,180],[700,160],[530,420],[500,440],[470,430],[560,410],[600,430],[420,540],
    [450,530],[400,510],[360,540],[330,520],[300,560],[270,600],[240,640],
    [760,120],[800,140],[840,120],[880,150],[920,200],[880,260],[940,320],
    [160,420],[150,480],[140,560],[640,700],[700,740],[660,760],
  ];

  function init(canvas, gameState, clickCb) {
    cv = canvas; ctx = cv.getContext('2d');
    state = gameState;
    onClickCity = clickCb;
    resize();
    window.addEventListener('resize', resize);
    bindEvents();
    requestAnimationFrame(anim);
  }

  function setState(g) { state = g; }
  function select(name) { selCity = name; }

  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    W = cv.width = Math.floor(window.devicePixelRatio * r.width);
    H = cv.height = Math.floor(window.devicePixelRatio * r.height);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  }

  /* 世界 → 屏幕 */
  function toScreen(wx, wy) {
    return [(wx - cam.x) * cam.zoom + W / 2, (wy - cam.y) * cam.zoom + H / 2];
  }
  function toWorld(sx, sy) {
    return [(sx - W / 2) / cam.zoom + cam.x, (sy - H / 2) / cam.zoom + cam.y];
  }
  function centerOn(wx, wy, zoom) {
    cam.x = wx; cam.y = wy; if (zoom) cam.zoom = zoom;
  }

  /* ============ 交互 ============ */
  function bindEvents() {
    let dragging = false, moved = false, lx = 0, ly = 0;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return [(t.clientX - r.left) * (W / r.width), (t.clientY - r.top) * (H / r.height)];
    };
    cv.addEventListener('mousedown', (e) => { dragging = true; moved = false; [lx, ly] = pos(e); cv.classList.add('dragging'); });
    cv.addEventListener('mousemove', (e) => {
      const [sx, sy] = pos(e);
      if (dragging) {
        const dx = sx - lx, dy = sy - ly;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom;
        clampCam();
        lx = sx; ly = sy;
      } else {
        const c = hitCity(sx, sy);
        hoverCity = c ? c.name : null;
        cv.style.cursor = c ? 'pointer' : 'grab';
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (dragging && !moved) {
        const [sx, sy] = pos(e);
        const c = hitCity(sx, sy);
        if (c && onClickCity) onClickCity(c.name);
      }
      dragging = false; cv.classList.remove('dragging');
    });
    /* 触屏 */
    cv.addEventListener('touchstart', (e) => {
      dragging = true; moved = false; [lx, ly] = pos(e);
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const [sx, sy] = pos(e);
      cam.x -= (sx - lx) / cam.zoom; cam.y -= (sy - ly) / cam.zoom;
      clampCam(); moved = true; lx = sx; ly = sy;
    }, { passive: true });
    cv.addEventListener('touchend', () => {
      if (dragging && !moved && hoverCity && onClickCity) onClickCity(hoverCity);
      dragging = false;
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [sx, sy] = pos(e);
      const [wx0, wy0] = toWorld(sx, sy);
      cam.zoom = Math.max(0.45, Math.min(3.2, cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      const [wx1, wy1] = toWorld(sx, sy);
      cam.x += wx0 - wx1; cam.y += wy0 - wy1;
      clampCam();
    }, { passive: false });
  }

  function clampCam() {
    cam.x = Math.max(60, Math.min(940, cam.x));
    cam.y = Math.max(40, Math.min(780, cam.y));
  }

  function hitCity(sx, sy) {
    if (!state) return null;
    const R = 14 * cam.zoom + 6;
    let best = null, bd = Infinity;
    Object.values(state.cities).forEach(c => {
      const [cx, cy] = toScreen(c.x, c.y);
      const d = Math.hypot(cx - sx, cy - sy);
      if (d < R && d < bd) { bd = d; best = c; }
    });
    return best;
  }

  /* ============ 渲染 ============ */
  function draw(t) {
    if (!ctx) return;
    /* 海底色 */
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0e18'); g.addColorStop(1, '#0d1018');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    /* 大陆 */
    ctx.save();
    ctx.beginPath();
    D.MAP_OUTLINE.forEach(([x, y], i) => {
      const [sx, sy] = toScreen(x, y);
      i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = '#1c2118'; ctx.fill();
    ctx.strokeStyle = '#3d4a35'; ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
    ctx.stroke();
    ctx.clip();

    /* 内陆纹理(暗格) */
    ctx.fillStyle = '#20261b';
    for (let x = 0; x < 1000; x += 46) for (let y = 0; y < 820; y += 46) {
      if ((x + y) % 92 === 0) {
        const [sx, sy] = toScreen(x, y);
        ctx.fillRect(sx, sy, 46 * cam.zoom, 46 * cam.zoom);
      }
    }
    /* 山脉 */
    MOUNTAINS.forEach(([mx, my], i) => {
      const [sx, sy] = toScreen(mx, my);
      const s = 4.5 * cam.zoom;
      ctx.fillStyle = i % 2 ? '#2e3626' : '#34402c';
      ctx.beginPath();
      ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s, sy + s * 0.7); ctx.lineTo(sx - s, sy + s * 0.7);
      ctx.closePath(); ctx.fill();
    });
    /* 沙漠点缀(西北) */
    ctx.fillStyle = '#3a3826';
    for (let i = 0; i < 24; i++) {
      const dx = 130 + (i * 53) % 260, dy = 300 + (i * 71) % 300;
      const [sx, sy] = toScreen(dx, dy);
      ctx.fillRect(sx, sy, 2 * cam.zoom, 2 * cam.zoom);
    }

    /* 河流 */
    const river = (pts, col, w) => {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * cam.zoom);
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const [sx, sy] = toScreen(x, y);
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.stroke();
    };
    river(D.RIVER_YELLOW, '#7a6a3a', 2.4);
    river(D.RIVER_YANGTZE, '#3a5a7a', 3);

    /* 邻接路线 */
    if (state) {
      D.LINKS.forEach(([a, b]) => {
        const ca = state.cities[a], cb = state.cities[b];
        if (!ca || !cb) return;
        const [x1, y1] = toScreen(ca.x, ca.y), [x2, y2] = toScreen(cb.x, cb.y);
        const sameOwner = ca.owner && ca.owner === cb.owner;
        ctx.strokeStyle = sameOwner ? 'rgba(242,207,70,0.28)' : 'rgba(140,140,160,0.16)';
        ctx.lineWidth = sameOwner ? 1.6 : 1;
        ctx.setLineDash(sameOwner ? [] : [4, 5]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    ctx.restore();

    if (!state) return;

    /* 在途部队(行军箭头) */
    state.moves.forEach(m => {
      const a = state.cities[m.from], b = state.cities[m.to];
      if (!a || !b) return;
      const [x1, y1] = toScreen(a.x, a.y), [x2, y2] = toScreen(b.x, b.y);
      const p = 0.5 + 0.3 * Math.sin(t / 300 + m.eta);
      const mx = x1 + (x2 - x1) * p, my = y1 + (y2 - y1) * p;
      const col = state.factions[m.faction] ? state.factions[m.faction].color : '#fff';
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      /* 军旗 */
      ctx.fillStyle = col;
      ctx.fillRect(mx - 1, my - 8, 2, 10);
      ctx.beginPath(); ctx.moveTo(mx + 1, my - 8); ctx.lineTo(mx + 9, my - 5.5); ctx.lineTo(mx + 1, my - 3);
      ctx.closePath(); ctx.fill();
    });

    /* 城池 */
    Object.values(state.cities).forEach(c => {
      const [sx, sy] = toScreen(c.x, c.y);
      const z = cam.zoom;
      const owner = c.owner ? state.factions[c.owner] : null;
      const col = owner ? owner.color : '#8a8578';
      const isSel = selCity === c.name;
      const isPlayer = state.playerFaction === c.owner;
      const isHover = hoverCity === c.name;

      /* 光环 */
      if (isSel) {
        ctx.strokeStyle = '#f2cf46';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 15 * z + 5 + Math.sin(t / 200) * 2, 0, 7); ctx.stroke();
      } else if (isHover) {
        ctx.strokeStyle = '#ffffff66';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, 14 * z + 4, 0, 7); ctx.stroke();
      }
      /* 城池主体(小城堡) */
      const s = (isSel || isHover ? 8.5 : 7.5) * z;
      ctx.fillStyle = '#0d0d14';
      ctx.fillRect(sx - s - 1.5, sy - s - 1.5, s * 2 + 3, s * 2 + 3);
      ctx.fillStyle = col;
      ctx.fillRect(sx - s, sy - s, s * 2, s * 2);
      /* 城垛 */
      ctx.fillStyle = '#0d0d14';
      ctx.fillRect(sx - s, sy - s, s * 2, s * 0.42);
      ctx.fillStyle = col;
      for (let i = 0; i < 3; i++) ctx.fillRect(sx - s + (i * 2 + 0.5) * s / 3, sy - s, s / 3.5, s * 0.36);
      /* 玩家城标记:金星 */
      if (isPlayer) {
        ctx.fillStyle = '#f2cf46';
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      }
      /* 名字 */
      ctx.font = `${Math.max(9, 10 * Math.min(z, 1.6))}px 'Press Start 2P','SimSun',monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isSel ? '#ffedd0' : '#c8c2b0';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.strokeText(c.name, sx, sy + s + 13);
      ctx.fillText(c.name, sx, sy + s + 13);
      /* 兵力(选中或放大时) */
      if (isSel || z > 1.5) {
        ctx.font = `${Math.max(7, 7.5 * Math.min(z, 1.6))}px 'Press Start 2P','SimSun',monospace`;
        ctx.fillStyle = '#8fd48f';
        ctx.fillText(Math.round(c.troops / 100) / 10 + '万', sx, sy + s + 25);
      }
    });
  }

  function anim(t) { draw(t); requestAnimationFrame(anim); }
  /* 立即绘制一帧(rAF 被后台节流时的静态首帧/测试快照) */
  function drawNow() { draw(performance.now()); }

  return { init, setState, select, centerOn, toScreen, drawNow };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGMap;
