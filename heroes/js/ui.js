/* ============================================================
 * 征服纪元 · ui.js — 全部界面逻辑(浏览器)
 * ============================================================ */
(function (G) {
  'use strict';
  const { TERRAIN, CREATURES, FACTIONS, SPELLS, ARTIFACTS, SKILLS, RES_LIST, RES_CN, RES_EMOJI, MINE_DEFS, costText } = G;
  const Game = () => G.Game;

  const TILE = 44;
  let game = null;
  let cam = { x: 0, y: 0, zoom: 1 };
  let sel = null;                 /* 选中的英雄 */
  let preview = null;             /* {tx,ty,path} */
  let hover = null;
  let busy = false;               /* 动画/结算中,禁止输入 */
  let drag = null;
  let raf = 0;
  let floats = [];                /* 地图浮动文字 */
  const $ = (id) => document.getElementById(id);
  const el = {};

  /* ================= 初始化 ================= */
  function init() {
    el.map = $('map');
    el.ctx = el.map.getContext('2d');
    el.minimap = $('minimap');
    el.mctx = el.minimap.getContext('2d');
    el.tip = $('tile-tip');
    el.banner = $('turn-banner');
    el.sidebar = $('sidebar');
    window.addEventListener('resize', resize);
    resize();
    bindInput();
    loop();
  }
  function resize() {
    if (!el.map) return;
    const wrap = el.map.parentElement;
    el.map.width = wrap.clientWidth;
    el.map.height = wrap.clientHeight;
    el.mmW = 180; el.mmH = Math.round(180 * game ? (game.map.h / game.map.w) : 1);
    if (game) { el.minimap.width = 180; el.minimap.height = Math.round(180 * game.map.h / game.map.w); }
  }

  function start(g, fresh) {
    game = g;
    sel = G.Game.ownHeroes(game, 0)[0] || null;
    if (sel) centerOn(sel.x, sel.y);
    else { const t = G.Game.ownTowns(game, 0)[0]; if (t) centerOn(t.x, t.y); }
    resize();
    if (fresh) G.Game.beginTurn(game);   /* 新游戏发第一回合收入;读档不重复发 */
    refresh();
    toast(`第 ${game.day} 天 · ${game.players[0].name},扩张你的帝国吧!`);
  }

  function centerOn(tx, ty) {
    cam.x = tx * TILE - el.map.width / 2;
    cam.y = ty * TILE - el.map.height / 2;
  }

  /* ================= 主渲染循环 ================= */
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!game || $('game').classList.contains('hidden')) return;
    drawMap();
    drawMinimap();
    stepFloats();
  }

  function drawMap() {
    const c = el.ctx, W = el.map.width, H = el.map.height;
    const m = game.map;
    c.fillStyle = '#07070c';
    c.fillRect(0, 0, W, H);
    cam.x = G.clamp(cam.x, -200, m.w * TILE - W + 200);
    cam.y = G.clamp(cam.y, -200, m.h * TILE - H + 200);
    const x0 = Math.max(0, Math.floor(cam.x / TILE)), y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(m.w - 1, Math.ceil((cam.x + W) / TILE)), y1 = Math.min(m.h - 1, Math.ceil((cam.y + H) / TILE));
    const fog = game.fog[0];
    const font = `${Math.round(TILE * 0.62)}px serif`;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * m.w + x;
        const sx = x * TILE - cam.x, sy = y * TILE - cam.y;
        /* 地形 */
        const t = TERRAIN[m.terrain[i]];
        const v = (x * 7 + y * 13 + ((x * y) % 5)) % 3;
        c.fillStyle = t.colors[v];
        c.fillRect(sx, sy, TILE, TILE);
        if (m.road[i]) {
          c.fillStyle = 'rgba(120,95,60,0.85)';
          c.fillRect(sx + 4, sy + TILE / 2 - 6, TILE - 8, 12);
          c.fillStyle = 'rgba(160,130,85,0.6)';
          c.fillRect(sx + 4, sy + TILE / 2 - 3, TILE - 8, 6);
        }
        /* 装饰 */
        const hash = (x * 31 + y * 17) % 97;
        if (t.decor.length && hash < 7 && !m.road[i]) {
          c.font = `${Math.round(TILE * 0.42)}px serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.globalAlpha = 0.55;
          c.fillText(t.decor[hash % t.decor.length], sx + TILE * 0.5, sy + TILE * 0.55);
          c.globalAlpha = 1;
        }
        /* 物件 */
        const o = game.objAt[i];
        if (o && fog[i]) drawObject(c, o, sx, sy);
      }
    }
    /* 战争迷雾 */
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!fog[y * m.w + x]) {
        c.fillStyle = 'rgba(4,5,10,0.88)';
        c.fillRect(x * TILE - cam.x, y * TILE - cam.y, TILE + 1, TILE + 1);
      }
    }
    /* 路径预览 */
    if (preview && preview.path && preview.path.length) {
      c.fillStyle = 'rgba(255,215,80,0.9)';
      const cross = (px, py) => { c.fillRect(px - 3, py - 1, 6, 2); c.fillRect(px - 1, py - 3, 2, 6); };
      for (let i = 0; i < preview.path.length; i++) {
        const p = preview.path[i];
        cross(p.x * TILE - cam.x + TILE / 2, p.y * TILE - cam.y + TILE / 2);
      }
      const last = preview.path[preview.path.length - 1];
      c.font = '20px serif';
      c.fillText('🚩', last.x * TILE - cam.x + TILE / 2 - 10, last.y * TILE - cam.y + 12);
    }
    /* 英雄 */
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const h of game.heroes) {
      if (h.dead) continue;
      if (!fog[h.y * m.w + h.x]) continue;
      const sx = h.x * TILE - cam.x, sy = h.y * TILE - cam.y;
      const col = game.players[h.owner].hex;
      c.beginPath();
      c.arc(sx + TILE / 2, sy + TILE / 2, TILE * 0.42, 0, Math.PI * 2);
      c.fillStyle = 'rgba(10,10,16,0.75)';
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = col;
      c.stroke();
      c.font = `${Math.round(TILE * 0.5)}px serif`;
      c.fillText(h.emoji, sx + TILE / 2, sy + TILE / 2 + 2);
      if (sel === h) {
        c.beginPath();
        c.arc(sx + TILE / 2, sy + TILE / 2, TILE * 0.5 + Math.sin(performance.now() / 240) * 3, 0, Math.PI * 2);
        c.strokeStyle = '#ffe98a';
        c.lineWidth = 2;
        c.stroke();
      }
    }
    /* 悬停高亮 */
    if (hover) {
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 2;
      c.strokeRect(hover.x * TILE - cam.x + 1, hover.y * TILE - cam.y + 1, TILE - 2, TILE - 2);
    }
    /* 浮动文字 */
    c.font = 'bold 16px sans-serif';
    for (const f of floats) {
      c.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      c.fillStyle = f.color || '#ffd75e';
      c.fillText(f.text, f.x * TILE - cam.x + TILE / 2, f.y * TILE - cam.y - f.t * 24);
      c.globalAlpha = 1;
    }
  }

  function drawObject(c, o, sx, sy) {
    const cx = sx + TILE / 2, cy = sy + TILE / 2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const ownerRing = (col) => {
      c.beginPath(); c.arc(cx, cy + 4, TILE * 0.46, 0, Math.PI * 2);
      c.strokeStyle = col; c.lineWidth = 2.5; c.stroke();
    };
    switch (o.type) {
      case 'town': {
        const f = FACTIONS[o.faction];
        c.font = `${Math.round(TILE * 0.72)}px serif`;
        c.fillText(f.emoji, cx, cy);
        ownerRing(o.owner >= 0 ? game.players[o.owner].hex : '#9aa');
        c.font = 'bold 11px sans-serif';
        c.fillStyle = o.owner >= 0 ? game.players[o.owner].hex : '#cbb';
        c.fillText(o.name, cx, sy + TILE - 4);
        break;
      }
      case 'goldmine': case 'sawmill': case 'orepit': case 'alchlab': case 'sulfurdune': case 'crystallcave': case 'gempond': {
        const d = MINE_DEFS[o.type];
        c.font = `${Math.round(TILE * 0.6)}px serif`;
        c.fillText(d.emoji, cx, cy);
        ownerRing(o.owner >= 0 ? game.players[o.owner].hex : 'rgba(160,160,170,0.8)');
        if (o.guard) { c.font = '16px serif'; c.fillText('⚔️', sx + TILE - 10, sy + 10); }
        break;
      }
      case 'monster': {
        const cr = CREATURES[o.c];
        c.font = `${Math.round(TILE * 0.62)}px serif`;
        c.fillText(cr.emoji, cx, cy);
        c.font = 'bold 12px sans-serif';
        c.fillStyle = '#ff9a8a';
        c.fillText(fmtCount(o.n), cx, sy + TILE - 4);
        break;
      }
      case 'pileGold': case 'pileWood': case 'pileOre': case 'pileRare': {
        const e = o.type === 'pileGold' ? '🪙' : o.type === 'pileWood' ? '🪵' : o.type === 'pileOre' ? '⛰️' : RES_EMOJI[o.res];
        c.font = `${Math.round(TILE * 0.5)}px serif`;
        c.fillText(e, cx, cy);
        break;
      }
      case 'chest': c.font = `${Math.round(TILE * 0.55)}px serif`; c.fillText('🧰', cx, cy); break;
      case 'artifact': c.font = `${Math.round(TILE * 0.55)}px serif`; c.fillText('🏺', cx, cy); break;
      case 'campfire': c.font = `${Math.round(TILE * 0.5)}px serif`; c.fillText('🔥', cx, cy); break;
      case 'learnstone': c.font = `${Math.round(TILE * 0.55)}px serif`; c.fillText(o.used ? '🪦' : '🗿', cx, cy); break;
      case 'shrine': c.font = `${Math.round(TILE * 0.5)}px serif`; c.fillText(o.used ? '💧' : '⛩️', cx, cy); break;
      case 'windmill': c.font = `${Math.round(TILE * 0.6)}px serif`; c.fillText('🌾', cx, cy); break;
      case 'dwelling': c.font = `${Math.round(TILE * 0.55)}px serif`; c.fillText('🏕️', cx, cy); break;
      case 'arena': c.font = `${Math.round(TILE * 0.55)}px serif`; c.fillText(o.used ? '🥊' : '🏟️', cx, cy); break;
      case 'witchhut': c.font = `${Math.round(TILE * 0.55)}px serif`; c.fillText(o.used ? '🕸️' : '🏚️', cx, cy); break;
      case 'watchtower': c.font = `${Math.round(TILE * 0.55)}px serif`; c.fillText('🗼', cx, cy); break;
    }
  }
  const fmtCount = (n) => n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : '' + n;

  function drawMinimap() {
    const c = el.mctx, m = game.map;
    const w = el.minimap.width, h = el.minimap.height;
    if (el._mmDay === game.day && el._mmRaf === Math.floor(performance.now() / 500)) return;
    el._mmDay = game.day; el._mmRaf = Math.floor(performance.now() / 500);
    const px = w / m.w, py = h / m.h;
    const fog = game.fog[0];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      c.fillStyle = fog[i] ? TERRAIN[m.terrain[i]].colors[0] : '#0a0b12';
      c.fillRect(x * px, y * py, px + 1, py + 1);
    }
    for (const o of game.objects) {
      if (!fog[o.y * m.w + o.x]) continue;
      if (o.type === 'town') {
        c.fillStyle = o.owner >= 0 ? game.players[o.owner].hex : '#ddd';
        c.fillRect(o.x * px - 1, o.y * py - 1, px + 3, py + 3);
      } else if (MINE_DEFS[o.type] && o.owner >= 0) {
        c.fillStyle = game.players[o.owner].hex;
        c.fillRect(o.x * px, o.y * py, px + 1, py + 1);
      }
    }
    for (const hh of game.heroes) {
      if (!fog[hh.y * m.w + hh.x]) continue;
      c.fillStyle = game.players[hh.owner].hex;
      c.beginPath();
      c.arc(hh.x * px + 1, hh.y * py + 1, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#fff';
    c.lineWidth = 1;
    c.strokeRect(cam.x / TILE * px, cam.y / TILE * py, el.map.width / TILE * px, el.map.height / TILE * py);
  }

  /* ================= 输入 ================= */
  function bindInput() {
    const cv = el.map;
    cv.addEventListener('mousedown', (e) => {
      drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    });
    window.addEventListener('mousemove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
        if (drag.moved) { cam.x = drag.cx - dx; cam.y = drag.cy - dy; }
      }
      const r = cv.getBoundingClientRect();
      hover = { x: Math.floor((e.clientX - r.left + cam.x) / TILE), y: Math.floor((e.clientY - r.top + cam.y) / TILE) };
      updateTip(e.clientX, e.clientY);
      updatePreview();
    });
    window.addEventListener('mouseup', () => { drag = null; });
    cv.addEventListener('click', (e) => {
      if (drag && drag.moved) return;
      const r = cv.getBoundingClientRect();
      const tx = Math.floor((e.clientX - r.left + cam.x) / TILE);
      const ty = Math.floor((e.clientY - r.top + cam.y) / TILE);
      onMapClick(tx, ty);
    });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const tx = Math.floor((e.clientX - r.left + cam.x) / TILE);
      const ty = Math.floor((e.clientY - r.top + cam.y) / TILE);
      const o = game.objAt[ty * game.map.w + tx];
      if (o) showInfoPopup(o, e.clientX, e.clientY);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 0.9 : 1.1;
      const nz = G.clamp((cam.zoom || 1) * k, 0.6, 1.6);
      cam.zoom = nz;
      const f = k;
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      cam.x = mx - (mx - cam.x) * f;
      cam.y = my - (my - cam.y) * f;
    }, { passive: false });
    el.minimap.addEventListener('click', (e) => {
      const r = el.minimap.getBoundingClientRect();
      const tx = (e.clientX - r.left) / r.width * game.map.w;
      const ty = (e.clientY - r.top) / r.height * game.map.h;
      centerOn(tx, ty);
    });
    window.addEventListener('keydown', (e) => {
      if (!game || $('game').classList.contains('hidden')) return;
      const k = e.key;
      const pan = 140;
      if (k === 'ArrowLeft' || k === 'a') cam.x -= pan;
      else if (k === 'ArrowRight' || k === 'd') cam.x += pan;
      else if (k === 'ArrowUp' || k === 'w') cam.y -= pan;
      else if (k === 'ArrowDown' || k === 's') cam.y += pan;
      else if (k === ' ') { e.preventDefault(); nextHero(); }
      else if (k === 'Enter') { if (!busy) endTurnClick(); }
      else if (k === 'Escape') closeTopModal();
    });
    /* 触屏 */
    let touch = null;
    cv.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touch = { x: t.clientX, y: t.clientY, cx: cam.x, cy: cam.y, moved: false, t0: performance.now() };
      }
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (touch && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) touch.moved = true;
        if (touch.moved) { cam.x = touch.cx - dx; cam.y = touch.cy - dy; }
      }
    }, { passive: true });
    cv.addEventListener('touchend', (e) => {
      if (touch && !touch.moved) {
        const r = cv.getBoundingClientRect();
        const t = e.changedTouches[0];
        onMapClick(Math.floor((t.clientX - r.left + cam.x) / TILE), Math.floor((t.clientY - r.top + cam.y) / TILE));
      }
      touch = null;
    }, { passive: true });
  }

  function onMapClick(tx, ty) {
    if (busy || game.ended || game.curPlayer !== 0) return;
    const m = game.map;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return;
    const o = game.objAt[ty * m.w + tx];
    /* 选中己方英雄 */
    const h = game.heroes.find(hh => !hh.dead && hh.x === tx && hh.y === ty && hh.owner === 0);
    if (h) { sel = h; preview = null; refreshSidebar(); return; }
    if (!sel || sel.dead) {
      if (o && o.type === 'town' && o.owner === 0) openTown(o);
      return;
    }
    /* 已有预览且点击相同目标 → 执行 */
    if (preview && preview.tx === tx && preview.ty === ty && preview.path && preview.path.length) {
      executePath();
      return;
    }
    /* 生成新预览 */
    const p = G.findPath(game, sel, sel.x, sel.y, tx, ty);
    if (p && p.path.length) {
      preview = { tx, ty, path: p.path };
      updateTip();
    } else {
      preview = null;
      toast('无法到达该位置');
    }
  }

  function updatePreview() {
    if (!sel || !hover) return;
    if (preview && preview.tx === hover.x && preview.ty === hover.y) return;
    const p = G.findPath(game, sel, sel.x, sel.y, hover.x, hover.y);
    if (p && p.path.length && p.path.length < 60) preview = { tx: hover.x, ty: hover.y, path: p.path };
    else if (preview && preview.tx !== hover.x) preview = null;
  }

  function updateTip(mx, my) {
    if (!hover || !game) { el.tip.style.display = 'none'; return; }
    const i = hover.y * game.map.w + hover.x;
    if (!game.fog[0][i]) { el.tip.style.display = 'none'; return; }
    const o = game.objAt[i];
    let html = `<b>${TERRAIN[game.map.terrain[i]].name}</b>`;
    if (o) {
      if (o.type === 'town') html += ` · ${o.name}(${FACTIONS[o.faction].name}${o.owner >= 0 ? '/' + game.players[o.owner].name : '/中立'})`;
      else if (MINE_DEFS[o.type]) html += ` · ${MINE_DEFS[o.type].name}${o.owner >= 0 ? '(' + game.players[o.owner].name + ')' : ''}${o.guard ? ' ⚔️守卫' : ''}`;
      else if (o.type === 'monster') {
        const cr = CREATURES[o.c];
        html += ` · ${cr.name} ×${o.n}<br><span style="color:#9aa">攻${cr.att} 防${cr.def} 伤${cr.d0}-${cr.d1} 血${cr.hp} 速${cr.spd}</span>`;
      }
      else if (o.type === 'dwelling') html += ` · 野外巢穴:${CREATURES[o.c].name} ×${o.pool}`;
      else if (o.type === 'pileGold') html += ` · 金币堆`;
      else if (o.type === 'windmill') html += ` · 风车磨坊`;
    }
    if (sel && preview && preview.tx === hover.x && preview.ty === hover.y) {
      let cost = 0;
      for (const s of preview.path) cost += G.stepCost(game, sel, s.x, s.y);
      html += `<br><span style="color:#ffd75e">路程 ${preview.path.length} 格 · ${Math.round(cost)} 移动力${cost > sel.moveLeft ? '(需 ' + Math.ceil((cost - sel.moveLeft) / G.Game.heroMaxMove(sel)) + ' 天)' : ''}</span>`;
    }
    el.tip.innerHTML = html;
    el.tip.style.display = 'block';
    el.tip.style.left = G.clamp((mx || 200) - 120, 4, window.innerWidth - 250) + 'px';
  }

  function showInfoPopup(o, x, y) {
    let html = '';
    if (o.type === 'town') {
      html = `<h3>${FACTIONS[o.faction].emoji} ${o.name}</h3><p>${FACTIONS[o.faction].cn}</p><p>拥有者:${o.owner >= 0 ? game.players[o.owner].name : '中立'}</p><p>建筑 ${o.buildings.length} 座</p>`;
    } else if (o.type === 'monster') {
      const cr = CREATURES[o.c];
      html = `<h3>${cr.emoji} ${cr.name} ×${o.n}</h3><p>攻${cr.att} 防${cr.def} 伤${cr.d0}-${cr.d1} 血${cr.hp} 速${cr.spd}</p>${cr.sp ? `<p>特性:${cr.sp}</p>` : ''}`;
    } else if (MINE_DEFS[o.type]) {
      const d = MINE_DEFS[o.type];
      html = `<h3>${d.emoji} ${d.name}</h3><p>每日产出 ${d.res === 'gold' ? d.n + ' 金币' : d.n + ' ' + RES_CN[d.res]}</p>${o.guard ? '<p style="color:#f88">有守军驻守</p>' : ''}`;
    } else if (o.type === 'dwelling') {
      const cr = CREATURES[o.c];
      html = `<h3>🏕️ ${cr.name}巢穴</h3><p>可招募 ${o.pool} 只 · 单价 ${cr.cost} 金</p>`;
    }
    if (html) modal(html + `<div class="modal-btns"><button class="btn" onclick="HOMM.UI.closeModal()">关闭</button></div>`, { x, y, small: true });
  }

  /* ================= 人类移动执行 ================= */
  async function executePath() {
    if (!sel || busy) return;
    const hero = sel;
    busy = true;
    if (preview && preview.path) hero.path = preview.path;
    preview = null;
    try {
      while (hero.path && hero.path.length && !hero.dead) {
        const step = hero.path[0];
        const cost = G.stepCost(game, hero, step.x, step.y);
        if (cost > hero.moveLeft) break;
        hero.path.shift();
        hero.moveLeft -= cost;
        hero.x = step.x; hero.y = step.y;
        Game().revealAt(game, 0, step.x, step.y, Game().heroSight(hero));
        await animateHero(hero, step);
        const o = game.objAt[step.y * game.map.w + step.x];
        if (!o) continue;
        const need = Game().interact(game, hero, o);
        if (!need) { refreshTop(); continue; }
        if (need.type === 'battle') {
          const b = Game().createBattleNeed(game, hero, need);
          await playBattle(b, 0);
          const r = Game().finishBattleNeed(game, hero, need, b);
          addFloat(hero.x, hero.y, r === 'win' ? '胜利!' : '战败…', r === 'win' ? '#7ce67c' : '#ff6b5e');
          if (game.ended) { showGameOver(); return; }
          if (r === 'lost') { heroLost(hero); return; }
          if (r === 'stop') return;
        } else if (need.type === 'town') {
          openTown(need.obj);
          return;
        } else if (need.type === 'townCaptured') {
          toast(`🎉 攻占 ${need.obj.name}!`);
          openTown(need.obj);
          return;
        } else {
          await handleNeed(need);
        }
      }
      hero.path = hero.path && hero.path.length ? hero.path : null;
    } finally {
      busy = false;
      refresh();
    }
  }

  function animateHero(hero, step) {
    return new Promise((res) => {
      const t0 = performance.now();
      const fx = (step.x - 0), fy = step.y;
      const tick = () => {
        const dt = (performance.now() - t0) / 110;
        if (dt >= 1 || !game) { res(); return; }
        /* 简化:直接跟随逻辑位置 */
        rafQ(tick);
      };
      tick();
      void fx; void fy;
    });
  }
  const rafQ = (fn) => requestAnimationFrame(fn);

  function heroLost(hero) {
    if (sel === hero) {
      const next = Game().ownHeroes(game, 0)[0];
      sel = next || null;
      if (next) centerOn(next.x, next.y);
    }
    toast(`${hero.name} 阵亡了…`);
  }

  async function handleNeed(need) {
    const hero = sel;
    return new Promise((res) => {
      if (need.type === 'chest') {
        const gold = 0; /* 金额在 resolveNeed 里掷 */
        modal(`<h3>🧰 宝箱</h3><p>你要拿取什么?</p>
          <div class="modal-btns">
            <button class="btn gold" id="nb-gold">🪙 金币</button>
            <button class="btn" id="nb-exp">✨ 经验</button>
          </div>`);
        $('nb-gold').onclick = () => { Game().resolveNeed(game, hero, need, 'gold'); closeModal(); refreshTop(); res(); };
        $('nb-exp').onclick = () => { Game().resolveNeed(game, hero, need, 'exp'); closeModal(); refreshTop(); res(); };
      } else if (need.type === 'arena') {
        modal(`<h3>🏟️ 竞技场</h3><p>在竞技场训练,选择强化方向:</p>
          <div class="modal-btns">
            <button class="btn" id="nb-att">⚔️ 攻击 +1</button>
            <button class="btn" id="nb-def">🛡️ 防御 +1</button>
          </div>`);
        $('nb-att').onclick = () => { Game().resolveNeed(game, hero, need, 'att'); closeModal(); refreshSidebar(); res(); };
        $('nb-def').onclick = () => { Game().resolveNeed(game, hero, need, 'def'); closeModal(); refreshSidebar(); res(); };
      } else if (need.type === 'witch') {
        const sk = SKILLS[need.obj.skill];
        modal(`<h3>🏚️ 女巫小屋</h3><p>女巫愿意传授 <b>${sk.emoji} ${sk.name}</b>${hero.skills[need.obj.skill] ? `(当前 ${['', '基础', '高级', '专家'][hero.skills[need.obj.skill]]})` : ''}。</p>
          <div class="modal-btns">
            <button class="btn" id="nb-learn">🙏 学习</button>
            <button class="btn" id="nb-skip">离开</button>
          </div>`);
        $('nb-learn').onclick = () => { Game().resolveNeed(game, hero, need, 'learn'); closeModal(); refreshSidebar(); res(); };
        $('nb-skip').onclick = () => { need.obj.used = false; closeModal(); res(); };
      } else if (need.type === 'dwelling') {
        openDwelling(need.obj, res);
      } else res();
      void gold;
    });
  }

  /* ================= 城镇界面 ================= */
  function openTown(t) {
    const f = FACTIONS[t.faction];
    let html = `<div class="town-head" style="border-color:${t.owner >= 0 ? game.players[t.owner].hex : '#888'}">
      <span class="town-emoji">${f.emoji}</span>
      <div><h3>${t.name}</h3><div class="dim">${f.cn}${t.owner >= 0 ? ' · ' + game.players[t.owner].name : ' · 中立'}</div></div>
      <button class="btn close-x" id="town-close">✕</button>
    </div>`;
    html += `<div class="town-body">`;
    /* 建造区 */
    html += `<div class="town-sec"><h4>🏗️ 城建大厅 <span class="dim">${t.builtToday ? '(今日已建造)' : ''}</span></h4><div class="bld-grid" id="bld-grid"></div></div>`;
    /* 招募区 */
    html += `<div class="town-sec"><h4>⚔️ 兵营招募</h4><div id="recruit-list"></div></div>`;
    /* 酒馆 */
    html += `<div class="town-sec"><h4>🍺 酒馆 <span class="dim">雇佣英雄 2500 金</span></h4><div class="tavern-row" id="tavern-row"></div></div>`;
    /* 魔法行会 */
    const gl = Game().guildLevel(t);
    html += `<div class="town-sec"><h4>📖 魔法行会(${gl} 层)</h4><div class="guild-row" id="guild-row"></div></div>`;
    /* 市场 */
    html += `<div class="town-sec"><h4>⚖️ 市场</h4><div class="market-row" id="market-row"></div></div>`;
    /* 驻军与英雄 */
    const visitor = game.heroes.find(h => !h.dead && h.x === t.x && h.y === t.y && h.owner === t.owner);
    html += `<div class="town-sec"><h4>🛡️ 驻军${visitor ? ' 与 驻城英雄' : ''}</h4>
      <div class="army-row"><div class="army-block" id="gar-block"></div>${visitor ? '<div class="army-block" id="vis-block"></div>' : ''}</div>
      <div class="modal-btns">
        <button class="btn" id="gar-all" ${visitor ? '' : 'disabled'}>⬅ 全部给英雄</button>
        <button class="btn" id="gar-none" ${visitor ? '' : 'disabled'}>全部给驻军 ➡</button>
      </div></div>`;
    html += `</div>`;
    modal(html, { wide: true });
    $('town-close').onclick = () => closeModal();
    /* 建筑列表 */
    const grid = $('bld-grid');
    for (const def of Game().townBuildingList(t)) {
      const built = t.buildings.includes(def.id);
      const chk = built ? { ok: false, why: '已建成' } : Game().canBuildNow(game, t, def.id);
      const div = document.createElement('div');
      div.className = 'bld' + (built ? ' built' : chk.ok ? ' can' : ' lock');
      div.innerHTML = `<div class="bld-emoji">${def.emoji}</div><div class="bld-name">${def.name}</div>
        <div class="bld-cost">${built ? '✓ 已建成' : costText(def.cost)}</div>
        <div class="bld-desc">${def.desc || ''}${!built && !chk.ok && chk.why !== '资源不足' ? `<br><span class="dim">${chk.why}</span>` : ''}</div>`;
      if (!built && chk.ok) {
        div.onclick = () => {
          const r = Game().build(game, t, def.id);
          if (r.ok) { toast(`🏗️ ${t.name} 建成 ${def.name}`); openTown(t); refreshTop(); }
        };
      } else if (!built && chk.why === '资源不足') {
        div.title = '资源不足';
      }
      grid.appendChild(div);
    }
    /* 招募 */
    const rl = $('recruit-list');
    for (let tier = 1; tier <= 7; tier++) {
      if (!t.buildings.includes('dw' + tier)) continue;
      const cid = f.units[tier - 1];
      const c = CREATURES[cid];
      const avail = t.pool[cid] || 0;
      const div = document.createElement('div');
      div.className = 'recruit-item';
      div.innerHTML = `
        <div class="ci-emoji">${c.emoji}</div>
        <div class="ci-info"><b>${c.name}</b><span class="dim">攻${c.att} 防${c.def} 伤${c.d0}-${c.d1} 血${c.hp} 速${c.spd}${c.flags.includes('shooter') ? ' 🏹' : ''}${c.flags.includes('flyer') ? ' 🪽' : ''}</span></div>
        <div class="ci-avail">库存 <b>${avail}</b><br><span class="dim">${c.cost}金/只</span></div>
        <div class="ci-buy"><input type="number" min="0" max="${avail}" value="0" id="rc-${cid}"><button class="btn" data-cid="${cid}">招募</button></div>`;
      div.querySelector('button').onclick = (e) => {
        const cid2 = e.target.dataset.cid;
        const n = parseInt($('rc-' + cid2).value, 10) || 0;
        if (n > 0) {
          const got = Game().recruit(game, t, cid2, n, visitor || null);
          toast(got > 0 ? `招募了 ${got} 只 ${CREATURES[cid2].name}` : '金币或库存不足');
          openTown(t); refreshTop(); refreshSidebar();
        }
      };
      rl.appendChild(div);
    }
    if (!rl.children.length) rl.innerHTML = '<span class="dim">尚未建造任何兵营</span>';
    /* 酒馆 */
    const tr = $('tavern-row');
    if (t.buildings.includes('tavern')) {
      t.tavern.forEach((offer, i) => {
        const div = document.createElement('div');
        div.className = 'tavern-offer';
        div.innerHTML = `<span class="to-emoji">${offer.cls === 'might' ? '🤺' : '🧙'}</span><div><b>${offer.cls === 'might' ? '战士' : '法师'}</b><span class="dim">(${FACTIONS[offer.faction].name})</span></div>`;
        div.onclick = () => {
          const r = Game().hireHero(game, t, i);
          if (r.ok) { toast(`🍺 雇佣了英雄 ${r.hero.name}`); openTown(t); refreshTop(); refreshSidebar(); }
          else toast(r.why);
        };
        tr.appendChild(div);
      });
    } else tr.innerHTML = '<span class="dim">需要先建造酒馆</span>';
    /* 行会 */
    const gr = $('guild-row');
    for (let l = 1; l <= 5; l++) {
      const sps = (t.spells[l] || []).map(sid => {
        const sp = SPELLS[sid];
        const known = visitor && visitor.spells.includes(sid);
        return `<span class="spell-chip${l > gl ? ' locked' : ''}${known ? ' known' : ''}">${sp.emoji} ${sp.name}<i>${known ? '已学' : sp.mp + 'mp'}</i></span>`;
      }).join('');
      if (sps) gr.innerHTML += `<div class="guild-lv">第${l}层 ${l > gl ? '🔒' : ''}:${sps}</div>`;
    }
    if (!gr.innerHTML) gr.innerHTML = '<span class="dim">尚未建造魔法行会</span>';
    /* 市场 */
    const mr = $('market-row');
    const mkOpt = (sel2) => RES_LIST.map(r => `<option value="${r}" ${r === sel2 ? 'selected' : ''}>${RES_EMOJI[r]}${RES_CN[r]}</option>`).join('');
    mr.innerHTML = `
      <select id="mk-from">${mkOpt('wood')}</select> ×<input type="number" id="mk-amt" value="10" min="1" style="width:56px">
      ➜ <select id="mk-to">${mkOpt('gold')}</select>
      <button class="btn" id="mk-go">交易</button>
      <div class="dim" id="mk-rate"></div>`;
    const updRate = () => {
      const f2 = $('mk-from').value, t2 = $('mk-to').value;
      const r = Game().marketRate(game, 0, f2, t2);
      $('mk-rate').textContent = `汇率:1 ${RES_CN[f2]} = ${r < 1 ? r.toFixed(3) : r.toFixed(2)} ${RES_CN[t2]}`;
    };
    $('mk-from').onchange = updRate; $('mk-to').onchange = updRate; updRate();
    $('mk-go').onclick = () => {
      const f2 = $('mk-from').value, t2 = $('mk-to').value, n = parseInt($('mk-amt').value, 10) || 0;
      const got = Game().trade(game, 0, f2, t2, n);
      toast(got > 0 ? `交易成功:获得 ${got} ${RES_CN[t2]}` : '交易失败');
      refreshTop(); updRate();
    };
    if (!t.buildings.includes('marketplace')) { mr.innerHTML = '<span class="dim">需要先建造市场</span>'; }
    /* 驻军/英雄部队 */
    renderArmyBlock($('gar-block'), t.garrison, visitor ? { target: visitor.army, onChange: () => openTown(t) } : null);
    if (visitor) renderArmyBlock($('vis-block'), visitor.army, { target: t.garrison, onChange: () => openTown(t) });
    $('gar-all').onclick = () => {
      if (!visitor) return;
      for (let i = 0; i < 7; i++) {
        const s = t.garrison[i];
        if (s && s.count > 0) {
          const left = Game().armyAdd(visitor.army, s.id, s.count);
          s.count = left;
          if (left === 0) t.garrison[i] = null;
        }
      }
      openTown(t);
    };
    $('gar-none').onclick = () => {
      if (!visitor) return;
      for (let i = 0; i < 7; i++) {
        const s = visitor.army[i];
        if (s && s.count > 0) {
          const left = Game().armyAdd(t.garrison, s.id, s.count);
          s.count = left;
          if (left === 0) visitor.army[i] = null;
        }
      }
      openTown(t);
    };
  }

  function renderArmyBlock(container, army, transfer) {
    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const s = army[i];
      const div = document.createElement('div');
      div.className = 'slot' + (s && s.count > 0 ? ' full' : '');
      if (s && s.count > 0) {
        const c = CREATURES[s.id];
        div.innerHTML = `<span class="sl-emoji">${c.emoji}</span><span class="sl-count">${fmtCount(s.count)}</span>`;
        div.title = `${c.name} ×${s.count}\n攻${c.att} 防${c.def} 伤${c.d0}-${c.d1} 血${c.hp} 速${c.spd}`;
        if (transfer) {
          div.onclick = () => {
            const left = Game().armyAdd(transfer.target, s.id, s.count);
            s.count = left;
            if (left === 0) army[i] = null;
            refreshSidebar();
            transfer.onChange ? transfer.onChange() : closeModal();
          };
        }
      }
      container.appendChild(div);
    }
  }

  function openDwelling(o, done) {
    const c = CREATURES[o.c];
    const hero = sel;
    modal(`<h3>🏕️ ${c.name}巢穴</h3>
      <p>${c.emoji} ${c.name} ×库存 <b id="dw-pool">${o.pool}</b> · ${c.cost} 金/只</p>
      <p class="dim">攻${c.att} 防${c.def} 伤${c.d0}-${c.d1} 血${c.hp} 速${c.spd}</p>
      <div class="modal-btns">
        <input type="number" id="dw-n" min="0" max="${o.pool}" value="${Math.min(o.pool, Math.floor(game.players[0].resources.gold / Math.max(1, c.cost)))}" style="width:80px">
        <button class="btn gold" id="dw-buy">招募</button>
        <button class="btn" id="dw-exit">离开</button>
      </div>`);
    $('dw-buy').onclick = () => {
      const n = parseInt($('dw-n').value, 10) || 0;
      const r = Game().resolveNeed(game, hero, { type: 'dwelling', obj: o }, { count: n });
      toast(r.ok ? `招募了 ${n} 只 ${c.name}` : '金币或军队已满');
      closeModal(); refreshTop(); refreshSidebar();
      if (done) done();
    };
    $('dw-exit').onclick = () => { closeModal(); if (done) done(); };
  }

  /* ================= 英雄界面 ================= */
  function openHero(h) {
    const nextExp = Game().expForLevel(h.level + 1) - h.exp;
    let html = `<div class="hero-head">
      <span class="hero-emoji">${h.emoji}</span>
      <div><h3>${h.name} <small>Lv.${h.level}</small></h3>
      <div class="dim">${h.cls === 'might' ? '战士' : '法师'} · ${FACTIONS[h.faction].name}</div></div>
      <button class="btn close-x" id="hero-close">✕</button>
    </div>`;
    html += `<div class="hero-body">
      <div class="hero-stats">
        <span>⚔️ 攻击 <b>${h.att}</b></span><span>🛡️ 防御 <b>${h.def}</b></span>
        <span>✨ 法力 <b>${h.pow}</b></span><span>📘 知识 <b>${h.know}</b></span>
        <span>💧 魔法 ${h.mana}/${Game().heroMaxMana(h)}</span>
        <span>👣 移动 ${h.moveLeft}/${Game().heroMaxMove(h)}</span>
        <span>🎓 经验 ${G.fmt(h.exp)}(还需 ${G.fmt(Math.max(0, nextExp))})</span>
      </div>
      <div class="town-sec"><h4>🪖 军队(战力 ${G.fmt(Game().armyPower(h.army))})</h4><div class="army-edit" id="hero-army"></div>
        <div class="dim" id="army-hint">点击兵堆后可:拆分 / 解散</div></div>
      <div class="town-sec"><h4>🏅 技能</h4><div class="skill-grid" id="skill-grid"></div></div>
      <div class="town-sec"><h4>🏺 宝物(${h.artifacts.length})</h4><div class="art-grid" id="art-grid"></div></div>
      <div class="town-sec"><h4>📖 法术书</h4><div class="guild-row" id="hero-spells"></div></div>
    </div>`;
    modal(html, { wide: true });
    $('hero-close').onclick = () => closeModal();
    /* 军队编辑 */
    const armyEl = $('hero-army');
    let pick = -1;
    const render = () => {
      armyEl.innerHTML = '';
      for (let i = 0; i < 7; i++) {
        const s = h.army[i];
        const div = document.createElement('div');
        div.className = 'slot big' + (s && s.count > 0 ? ' full' : '') + (pick === i ? ' pick' : '');
        if (s && s.count > 0) {
          const c = CREATURES[s.id];
          div.innerHTML = `<span class="sl-emoji">${c.emoji}</span><span class="sl-count">${fmtCount(s.count)}</span>`;
          div.title = `${c.name} ×${s.count}`;
        }
        div.onclick = () => {
          if (pick === -1) {
            if (s && s.count > 0) { pick = i; render(); }
          } else if (pick === i) { pick = -1; render(); }
          else {
            const from = h.army[pick];
            if (!from) { pick = -1; render(); return; }
            if (!s || s.count <= 0) { h.army[i] = from; h.army[pick] = null; }
            else if (s.id === from.id) { s.count += from.count; h.army[pick] = null; }
            else { h.army[pick] = s; h.army[i] = from; }
            pick = -1;
            render();
          }
        };
        armyEl.appendChild(div);
      }
      /* 拆分/解散按钮 */
      if (pick >= 0) {
        const bar = document.createElement('div');
        bar.className = 'modal-btns';
        bar.style.marginTop = '6px';
        const emptyIdx = h.army.findIndex((s2, i2) => (!s2 || s2.count <= 0) && i2 !== pick);
        const b1 = document.createElement('button');
        b1.className = 'btn';
        b1.textContent = '拆分一半';
        b1.disabled = emptyIdx < 0;
        b1.onclick = () => {
          const src = h.army[pick];
          const half = Math.floor(src.count / 2);
          if (half > 0) { src.count -= half; h.army[emptyIdx] = { id: src.id, count: half }; }
          pick = -1; render();
        };
        const b2 = document.createElement('button');
        b2.className = 'btn danger';
        b2.textContent = '解散';
        b2.onclick = () => {
          if (confirm('确定解散这支部队?')) { h.army[pick] = null; pick = -1; render(); refreshSidebar(); }
        };
        bar.appendChild(b1); bar.appendChild(b2);
        armyEl.appendChild(bar);
      }
    };
    render();
    /* 技能 */
    const sg = $('skill-grid');
    for (const sid of G.SKILL_IDS) {
      const lv = h.skills[sid] || 0;
      const sk = SKILLS[sid];
      const div = document.createElement('div');
      div.className = 'skill' + (lv ? ' has' : '');
      div.innerHTML = `<span>${sk.emoji}</span><div><b>${sk.name}</b><i>${lv ? ['基础', '高级', '专家'][lv - 1] : '未学'}</i></div>`;
      div.title = lv ? sk.desc(lv) : '未学习';
      sg.appendChild(div);
    }
    /* 宝物 */
    const ag = $('art-grid');
    if (!h.artifacts.length) ag.innerHTML = '<span class="dim">尚无宝物</span>';
    for (const aid of h.artifacts) {
      const a = ARTIFACTS[aid];
      const div = document.createElement('div');
      div.className = 'art';
      div.innerHTML = `<span>${a.emoji}</span><i>${a.name}</i>`;
      div.title = a.desc || a.cls;
      ag.appendChild(div);
    }
    /* 法术 */
    $('hero-spells').innerHTML = h.spells.map(sid => {
      const sp = SPELLS[sid];
      return `<span class="spell-chip known">${sp.emoji} ${sp.name}<i>${sp.mp}mp</i></span>`;
    }).join('') || '<span class="dim">尚无法术(在魔法行会学习)</span>';
  }

  /* ================= 升级弹窗 ================= */
  async function processLevelUps() {
    while (game.pendingLevels.length) {
      const pend = game.pendingLevels[0];
      const hero = game.heroes.find(h => h.id === pend.hero);
      if (!hero) { game.pendingLevels.shift(); continue; }
      await new Promise((res) => {
        modal(`<h3>🎉 ${hero.name} 升到了 Lv.${hero.level}!</h3><p>选择一项新技能:</p>
          <div class="modal-btns col">
            ${pend.options.map((sid, i) => `<button class="btn lv-opt" data-i="${i}">${SKILLS[sid].emoji} ${SKILLS[sid].name} ${hero.skills[sid] ? '→ ' + ['基础', '高级', '专家'][hero.skills[sid]] : ''}</button>`).join('')}
          </div><p class="dim">${pend.options.map(sid => SKILLS[sid].name + ':' + SKILLS[sid].desc(hero.skills[sid] ? Math.min(3, hero.skills[sid] + 1) : 1)).join('<br>')}</p>`);
        document.querySelectorAll('.lv-opt').forEach(btn => {
          btn.onclick = () => {
            Game().applyLevelChoice(game, pend.hero, pend.options[parseInt(btn.dataset.i, 10)]);
            game.pendingLevels.shift();
            closeModal();
            refreshSidebar();
            res();
          };
        });
      });
    }
  }

  /* ================= 战斗界面 ================= */
  const B = () => G.Battle;
  let bv = null;   /* 战斗视图状态 */

  function playBattle(b, humanSide) {
    return new Promise((resolve) => {
      const scr = $('battle');
      scr.classList.remove('hidden');
      const cv = $('battle-canvas');
      const cell = Math.floor(Math.min((window.innerWidth - 40) / b.COLS, (window.innerHeight - 190) / b.ROWS));
      cv.width = b.COLS * cell; cv.height = b.ROWS * cell;
      bv = { b, cell, humanSide, resolve, speed: 1, over: false, casting: null, eventIdx: b.events.length, floats: [] };
      $('battle-log').innerHTML = '';
      updBattleBar();
      battleLoop();
    });
  }

  function updBattleBar() {
    const { b } = bv;
    const h0 = b.attHero, h1 = b.defHero;
    $('b0-info').innerHTML = h0 ? `${h0.emoji} ${h0.name} <span class="dim">💧${h0.mana}</span>` : '野怪军团';
    $('b1-info').innerHTML = h1 ? `${h1.emoji} ${h1.name} <span class="dim">💧${h1.mana}</span>` : (b.opts.siegeDef ? `守军 <span class="dim">城防+${b.opts.siegeDef}</span>` : '守军');
    const mine = b.stacks[b.cur];
    $('battle-turn').textContent = b.over ? '' : mine ? `${CREATURES[mine.c].emoji} ${CREATURES[mine.c].name} 行动` : '';
  }

  function battleLoop() {
    if (!bv) return;
    drawBattle();
    if (bv.b.over) {
      if (!bv.over) {
        bv.over = true;
        const winner = bv.b.winner;
        blog(`战斗结束,${winner === 0 ? '进攻方' : '防守方'}获胜!经验 +${Math.round(bv.b.killedHp[winner === 0 ? 0 : 1])}`);
        setTimeout(() => {
          $('battle').classList.add('hidden');
          const r = bv.resolve;
          bv = null;
          r();
        }, 1000);
      }
      return;
    }
    const st = bv.b.stacks[bv.b.cur];
    if (!st || st.count <= 0) { B().nextTurn(bv.b); return; }
    if (st.side === bv.humanSide) return;   /* 等人类输入 */
    /* AI 行动 */
    if (bv._wait) { clearTimeout(bv._wait); bv._wait = null; }
    bv._wait = setTimeout(async () => {
      if (!bv) return;
      const b2 = bv.b;
      for (const side of [0, 1]) {
        if (side === bv.humanSide) continue;
        const h = side === 0 ? b2.attHero : b2.defHero;
        if (h && !b2.spellCast[side] && !b2.over) G.AI.aiCastSpell(b2, side);
      }
      if (!b2.over) G.AI.aiActStack(b2, b2.stacks[b2.cur]);
      animateNewEvents();
      updBattleBar();
      battleLoop();
    }, [420, 200, 0][bv.speed]);
  }

  function drawBattle() {
    const { b, cell } = bv;
    const cv = $('battle-canvas'), c = cv.getContext('2d');
    /* 背景 */
    const g = c.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, '#22222e'); g.addColorStop(1, '#15151d');
    c.fillStyle = g;
    c.fillRect(0, 0, cv.width, cv.height);
    /* 格子 */
    for (let y = 0; y < b.ROWS; y++) for (let x = 0; x < b.COLS; x++) {
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.strokeRect(x * cell, y * cell, cell, cell);
    }
    const st = b.stacks[b.cur];
    const humanTurn = st && st.side === bv.humanSide && !b.over;
    /* 可达范围 */
    if (humanTurn && !B().isShooter(st)) {
      const d = B().reach(b, st);
      for (let y = 0; y < b.ROWS; y++) for (let x = 0; x < b.COLS; x++) {
        if (d[y * b.COLS + x] >= 0 && b.cells[y * b.COLS + x] === 0) {
          c.fillStyle = 'rgba(120,180,255,0.15)';
          c.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        }
      }
    }
    /* 单位 */
    c.textAlign = 'center'; c.textBaseline = 'middle';
    b.stacks.forEach((s, i) => {
      if (s.count <= 0) return;
      const cx = s.x * cell + cell / 2, cy = s.y * cell + cell / 2;
      const col = s.side === 0 ? '#4a7df0' : '#e05050';
      c.beginPath();
      c.ellipse(cx, cy + cell * 0.28, cell * 0.38, cell * 0.16, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.fill();
      c.font = `${Math.round(cell * 0.62)}px serif`;
      c.fillText(CREATURES[s.c].emoji, cx, cy - 2);
      /* 底座 */
      c.strokeStyle = col;
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(cx, cy + cell * 0.28, cell * 0.36, cell * 0.14, 0, 0, Math.PI * 2);
      c.stroke();
      /* 数量与血条 */
      c.font = 'bold 13px sans-serif';
      c.fillStyle = '#fff';
      c.strokeStyle = '#000';
      c.lineWidth = 3;
      c.strokeText(fmtCount(s.count), cx + cell * 0.3, cy - cell * 0.32);
      c.fillText(fmtCount(s.count), cx + cell * 0.3, cy - cell * 0.32);
      const hpFrac = ((s.count - 1) * CREATURES[s.c].hp + s.topHp) / (s.startCount * CREATURES[s.c].hp);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(cx - cell * 0.3, cy + cell * 0.36, cell * 0.6, 4);
      c.fillStyle = hpFrac > 0.5 ? '#5ec95e' : hpFrac > 0.25 ? '#e0c050' : '#e05050';
      c.fillRect(cx - cell * 0.3, cy + cell * 0.36, cell * 0.6 * Math.max(0, hpFrac), 4);
      /* 状态图标 */
      let ic = '';
      if (s.buffed.blind) ic += '🙈';
      if (s.buffed.bless) ic += '🌟';
      if (s.buffed.shield) ic += '🛡️';
      if (s.defended) ic += '💂';
      if (ic) { c.font = '12px serif'; c.fillText(ic, cx - cell * 0.3, cy - cell * 0.34); }
      /* 当前行动 */
      if (i === b.cur && !b.over) {
        c.strokeStyle = '#ffe98a';
        c.lineWidth = 3;
        c.strokeRect(s.x * cell + 2, s.y * cell + 2, cell - 4, cell - 4);
      }
    });
    /* 浮动伤害 */
    c.font = 'bold 17px sans-serif';
    for (const f of bv.floats) {
      c.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x * cell + cell / 2, f.y * cell + cell * 0.3 - f.t * 30);
      c.globalAlpha = 1;
    }
    /* 施法目标提示 */
    if (bv.casting) {
      c.font = '16px sans-serif';
      c.fillStyle = '#ffe98a';
      c.fillText(`选择 ${SPELLS[bv.casting].name} 的目标(Esc 取消)`, cv.width / 2, 20);
    }
  }

  function animateNewEvents() {
    const b = bv.b;
    const news = b.events.slice(bv.eventIdx);
    bv.eventIdx = b.events.length;
    for (const e of news) {
      if (e.t === 'dmg') {
        const s = b.stacks[e.s];
        if (s) bv.floats.push({ x: s.x, y: s.y, text: '-' + e.dmg, color: '#ff7a6b', t: 0 });
        if (e.kills > 0) blog(`💀 击杀 ×${e.kills}`);
      } else if (e.t === 'attack') blog(`⚔️ ${stackName(b, e.s)} 攻击 ${stackName(b, e.tgt)}`);
      else if (e.t === 'shoot') blog(`🏹 ${stackName(b, e.s)} 射击 ${stackName(b, e.tgt)}`);
      else if (e.t === 'retal') blog(`↩️ ${stackName(b, e.s)} 反击`);
      else if (e.t === 'spell') blog(`✨ ${SPELLS[e.spell].name}!`);
      else if (e.t === 'summon') blog(`🪬 召唤了元素!`);
      else if (e.t === 'round') blog(`— 第 ${e.n} 轮 —`);
    }
  }
  const stackName = (b, i) => { const s = b.stacks[i]; return s ? `${CREATURES[s.c].emoji}${CREATURES[s.c].name}` : '?'; };

  function blog(msg) {
    const el2 = $('battle-log');
    const div = document.createElement('div');
    div.textContent = msg;
    el2.prepend(div);
    while (el2.children.length > 30) el2.lastChild.remove();
  }

  function bindBattleInput() {
    const cv = $('battle-canvas');
    cv.addEventListener('click', (e) => {
      if (!bv || bv.b.over) return;
      const b = bv.b;
      const st = b.stacks[b.cur];
      if (!st || st.side !== bv.humanSide) return;
      const r = cv.getBoundingClientRect();
      const cell = bv.cell;
      const x = Math.floor((e.clientX - r.left) / cell);
      const y = Math.floor((e.clientY - r.top) / cell);
      if (x < 0 || y < 0 || x >= b.COLS || y >= b.ROWS) return;
      const idx = b.cells[y * b.COLS + x];
      const target = idx > 0 ? b.stacks[idx - 1] : null;
      /* 施法模式 */
      if (bv.casting) {
        if (target && target.count > 0) {
          const ok = B().castSpell(b, bv.humanSide, bv.casting, idx - 1);
          if (!ok) toast('无法对该目标施放');
          bv.casting = null;
          animateNewEvents();
          updBattleBar();
          battleLoop();
        }
        return;
      }
      if (target && target.side !== st.side && target.count > 0) {
        if (B().isShooter(st) && !B().adj(st.x, st.y, target.x, target.y)) {
          B().doShoot(b, idx - 1);
        } else if (!B().doAttack(b, idx - 1)) {
          /* 够不着:向目标靠近 */
          const d = B().reach(b, st);
          let bestCell = null, bd = Infinity;
          for (let y = 0; y < b.ROWS; y++) for (let x = 0; x < b.COLS; x++) {
            if (b.cells[y * b.COLS + x] !== 0 || d[y * b.COLS + x] < 0) continue;
            const dist = Math.max(Math.abs(x - target.x), Math.abs(y - target.y));
            if (dist < bd) { bd = dist; bestCell = { x, y }; }
          }
          if (bestCell && B().doMove(b, bestCell.x, bestCell.y)) {
            /* 已向目标移动 */
          } else toast('无法接近目标');
        }
        animateNewEvents();
        updBattleBar();
        battleLoop();
      } else if (!target) {
        if (B().doMove(b, x, y)) {
          animateNewEvents();
          updBattleBar();
          battleLoop();
        } else if (B().isShooter(st)) {
          toast('射手可直接点击敌方远程攻击');
        } else toast('无法移动到该位置');
      }
    });
    $('battle-defend').onclick = () => {
      if (!bv || bv.b.over) return;
      const st = bv.b.stacks[bv.b.cur];
      if (!st || st.side !== bv.humanSide) return;
      B().doDefend(bv.b);
      animateNewEvents(); updBattleBar(); battleLoop();
    };
    $('battle-wait').onclick = () => {
      if (!bv || bv.b.over) return;
      const st = bv.b.stacks[bv.b.cur];
      if (!st || st.side !== bv.humanSide) return;
      B().doWait(bv.b);
      animateNewEvents(); updBattleBar(); battleLoop();
    };
    $('battle-spells').onclick = () => {
      if (!bv || bv.b.over) return;
      const b = bv.b;
      const h = bv.humanSide === 0 ? b.attHero : b.defHero;
      if (!h) return;
      if (b.spellCast[bv.humanSide]) { toast('本轮已施放过魔法'); return; }
      const castable = h.spells.filter(sid => SPELLS[sid].mp <= h.mana);
      if (!castable.length) { toast('没有可施放的法术'); return; }
      modal(`<h3>📖 法术书(💧${h.mana})</h3><div class="spell-book">${castable.map(sid => {
        const sp = SPELLS[sid];
        return `<button class="btn spell-opt" data-id="${sid}">${sp.emoji} ${sp.name}<i>${sp.mp}mp · ${sp.desc}</i></button>`;
      }).join('')}</div>`);
      document.querySelectorAll('.spell-opt').forEach(btn => {
        btn.onclick = () => {
          const sid = btn.dataset.id;
          const sp = SPELLS[sid];
          closeModal();
          if (sp.target.endsWith('All')) {
            const ok = B().castSpell(b, bv.humanSide, sid, -1);
            if (!ok) toast('施放失败');
            bv.casting = null;
            animateNewEvents(); updBattleBar(); battleLoop();
          } else {
            bv.casting = sid;
            toast(`选择 ${sp.name} 的目标`);
          }
        };
      });
    };
    $('battle-auto').onclick = () => {
      if (!bv || bv.b.over) return;
      G.AI.playBattle(game, bv.b);
      animateNewEvents();
      updBattleBar();
      battleLoop();
    };
    $('battle-speed').onclick = () => {
      if (!bv) return;
      bv.speed = (bv.speed + 1) % 3;
      $('battle-speed').textContent = ['🐢 慢速', '▶ 正常', '⏩ 快速'][bv.speed];
    };
  }

  /* ================= 回合流转 ================= */
  function endTurnClick() {
    if (busy) return;
    if (game.ended) { showGameOver(); return; }
    if (game.curPlayer !== 0) return;
    endTurnFlow();
  }

  async function endTurnFlow() {
    busy = true;
    try {
      await processLevelUps();
      Game().endTurn(game);
      /* AI 依次行动 */
      while (!game.ended && game.curPlayer !== 0) {
        const p = game.players[game.curPlayer];
        await showBanner(`${p.name}的回合`, p.hex, 550);
        G.AI.playTurn(game);
        await sleep(160);
        Game().endTurn(game);
      }
      if (game.ended) { showGameOver(); return; }
      await showBanner(`第 ${game.day} 天`, '#ffd75e', 600);
      Game().saveGame(game, 'auto');   /* 新一天开始时自动存档 */
      /* 新一天提示 */
      if ((game.day - 1) % 7 === 0 && game.day > 1) toast(`📅 新的一周!兵营增产`);
      const heroes = Game().ownHeroes(game, 0);
      if (!heroes.length) {
        const t = Game().ownTowns(game, 0)[0];
        if (t) toast('你没有英雄了!打开城镇雇佣一个(2500金)');
      } else if (!sel || sel.dead || sel.owner !== 0) {
        sel = heroes[0];
        centerOn(sel.x, sel.y);
      }
      refresh();
      await processLevelUps();
    } finally {
      busy = false;
      refresh();
    }
  }

  function nextHero() {
    if (!game || game.curPlayer !== 0) return;
    const heroes = Game().ownHeroes(game, 0);
    if (!heroes.length) return;
    const i = heroes.indexOf(sel);
    sel = heroes[(i + 1) % heroes.length];
    preview = null;
    centerOn(sel.x, sel.y);
    refreshSidebar();
  }

  function showGameOver() {
    const won = game.winner === 0;
    const days = game.day;
    modal(`<div style="text-align:center;padding:20px">
      <div style="font-size:64px">${won ? '👑' : '💀'}</div>
      <h2>${won ? '胜利!帝国一统大陆!' : '战败…帝国陷落了'}</h2>
      <p class="dim">历时 ${days} 天 · ${Math.ceil(days / 7)} 周 · 战斗 ${game.stats.battles} 场 · 攻城 ${game.stats.captures} 次</p>
      <div class="modal-btns">
        <button class="btn gold" id="go-again">⚔️ 再来一局</button>
        <button class="btn" id="go-home">🏠 返回主页</button>
      </div></div>`);
    $('go-again').onclick = () => { closeModal(); $('game').classList.add('hidden'); $('screen-menu').classList.remove('hidden'); };
    $('go-home').onclick = () => { closeModal(); window.location.href = '../index.html'; };
  }

  /* ================= UI 刷新 ================= */
  function refresh() {
    refreshTop();
    refreshSidebar();
  }
  function refreshTop() {
    const p = game.players[0];
    $('res-bar').innerHTML = RES_LIST.map(r =>
      `<span class="res">${RES_EMOJI[r]} ${G.fmt(p.resources[r] || 0)}</span>`).join('');
    const week = Math.floor((game.day - 1) / 7) + 1, dow = ((game.day - 1) % 7) + 1;
    $('date-bar').innerHTML = `📅 第${week}周 星期${'一二三四五六日'[dow - 1]}`;
    const alive = game.players.filter(pp => !pp.defeated).length;
    $('turn-bar').innerHTML = `${game.players[game.curPlayer].name} · 存活 ${alive}/${game.players.length}`;
  }
  function refreshSidebar() {
    const sb = el.sidebar;
    let html = '';
    const towns = Game().ownTowns(game, 0);
    html += `<div class="side-towns"><h4>🏰 我的城镇(${towns.length})</h4>`;
    for (const t of towns) {
      html += `<div class="side-town" data-id="${t.id}">${FACTIONS[t.faction].emoji} ${t.name} <i>${t.builtToday ? '' : '可建造'}</i></div>`;
    }
    html += `</div>`;
    const heroes = Game().ownHeroes(game, 0);
    html += `<div class="side-heroes"><h4>🤺 我的英雄(${heroes.length})</h4>`;
    for (const h of heroes) {
      const mpFrac = h.moveLeft / Game().heroMaxMove(h);
      html += `<div class="side-hero${sel === h ? ' sel' : ''}" data-id="${h.id}">
        <span class="sh-emoji">${h.emoji}</span>
        <div class="sh-info"><b>${h.name}</b> Lv.${h.level}
          <div class="mp-bar"><i style="width:${Math.round(mpFrac * 100)}%"></i></div>
        </div>
        <span class="sh-army">${h.army.filter(s => s && s.count > 0).map(s => CREATURES[s.id].emoji).join('')}</span>
      </div>`;
    }
    if (!heroes.length) html += '<div class="dim" style="padding:6px">无英雄(在城镇酒馆雇佣)</div>';
    html += `</div>`;
    if (sel && !sel.dead) {
      html += `<div class="side-detail">
        <div class="sd-title">${sel.emoji} ${sel.name} Lv.${sel.level}</div>
        <div class="sd-stats">⚔️${sel.att} 🛡️${sel.def} ✨${sel.pow} 📘${sel.know} 💧${sel.mana}</div>
        <div class="sd-army">${sel.army.filter(s => s && s.count > 0).map(s =>
        `<span class="chip">${CREATURES[s.id].emoji}${fmtCount(s.count)}</span>`).join('') || '<span class="dim">空军队</span>'}</div>
        <div class="modal-btns">
          <button class="btn" id="sd-open">英雄详情</button>
        </div>
      </div>`;
    }
    sb.innerHTML = html;
    sb.querySelectorAll('.side-hero').forEach(d => {
      d.onclick = () => {
        sel = game.heroes.find(h => h.id === d.dataset.id);
        preview = null;
        centerOn(sel.x, sel.y);
        refreshSidebar();
      };
    });
    sb.querySelectorAll('.side-town').forEach(d => {
      d.onclick = () => {
        const t = game.objects.find(o => o.id === d.dataset.id);
        if (t) { if (sel && sel.x === t.x && sel.y === t.y) openTown(t); else { centerOn(t.x, t.y); toast('英雄到达城镇后点击地图上的城镇进入'); } }
      };
    });
    const ob = $('sd-open');
    if (ob) ob.onclick = () => openHero(sel);
  }

  /* ================= 弹窗 / 提示 ================= */
  function modal(html, opts) {
    opts = opts || {};
    const root = $('modal-root');
    root.innerHTML = `<div class="modal-back"><div class="modal${opts.wide ? ' wide' : ''}${opts.small ? ' small' : ''}">${html}</div></div>`;
    root.classList.remove('hidden');
  }
  function closeModal() {
    $('modal-root').classList.add('hidden');
    $('modal-root').innerHTML = '';
  }
  function closeTopModal() {
    if (!$('modal-root').classList.contains('hidden')) { closeModal(); return; }
    if (bv && bv.casting) bv.casting = null;
  }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; }, 2400);
    setTimeout(() => t.remove(), 2900);
  }
  function addFloat(x, y, text, color) {
    floats.push({ x, y, text, color, t: 0 });
  }
  function stepFloats() {
    for (const f of floats) f.t += 0.016;
    floats = floats.filter(f => f.t < 1.6);
    if (bv) {
      for (const f of bv.floats) f.t += 0.016;
      if (bv) bv.floats = bv.floats.filter(f => f.t < 1.4);
    }
  }
  function showBanner(text, color, ms) {
    return new Promise((res) => {
      el.banner.textContent = text;
      el.banner.style.borderColor = color || '#fff';
      el.banner.classList.add('show');
      setTimeout(() => { el.banner.classList.remove('show'); res(); }, ms || 500);
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* 菜单弹窗(游戏中) */
  function openMenuModal() {
    modal(`<h3>☰ 菜单</h3>
      <div class="modal-btns col">
        <button class="btn" id="mn-save">💾 保存进度</button>
        <button class="btn" id="mn-load">📂 读取进度</button>
        <button class="btn" id="mn-help">❓ 游戏说明</button>
        <button class="btn danger" id="mn-quit">🏠 返回主页</button>
      </div>`);
    $('mn-save').onclick = () => {
      const ok = Game().saveGame(game, 'auto');
      toast(ok ? '已保存' : '保存失败');
      closeModal();
    };
    $('mn-load').onclick = async () => {
      const g = Game().loadGame('auto');
      if (!g) { toast('没有存档'); return; }
      closeModal();
      game = g;
      sel = Game().ownHeroes(game, 0)[0] || null;
      if (sel) centerOn(sel.x, sel.y);
      refresh();
      toast('读取成功');
    };
    $('mn-help').onclick = () => {
      modal(`<h3>❓ 游戏说明</h3><div style="font-size:13px;line-height:1.9">
      <p><b>目标:</b>占领所有敌方城镇,消灭所有敌方英雄。</p>
      <p><b>操作:</b>点击英雄选中 → 点击目标地点显示路径 → 再点一次确认移动。右键查看物件信息。WASD/方向键平移,空格切换英雄,回车结束回合。</p>
      <p><b>经济:</b>金矿/锯木场等提供每日收入;城镇大厅升级大幅提升收入;市场可交换资源。</p>
      <p><b>军事:</b>城镇兵营每周增产;英雄在城镇中可招募部队;野怪守卫宝物,打得过就打。</p>
      <p><b>英雄:</b>战斗获得经验升级,升级选技能;宝物永久增益;魔法行会学法术,战斗中施放。</p></div>
      <div class="modal-btns"><button class="btn" onclick="HOMM.UI.closeModal()">知道了</button></div>`);
    };
    $('mn-quit').onclick = () => {
      if (confirm('返回主页?(进度已自动保存)')) window.location.href = '../index.html';
    };
  }

  /* 导出 */
  G.UI = {
    init, start, refresh, toast, modal, closeModal, openTown, openHero, openDwelling,
    endTurnClick, nextHero, openMenuModal, playBattle, bindBattleInput,
    get game() { return game; }, set game(g) { game = g; },
    get sel() { return sel; }, set sel(h) { sel = h; },
    get cam() { return cam; }, set cam(c) { cam = c; },
    get bv() { return bv; },
    get busy() { return busy; },
    get preview() { return preview; },
  };
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
