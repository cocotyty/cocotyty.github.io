// ============================================================
// _boot.js - 微信小游戏启动器 (打包时置于 bundle 最后)
// 屏幕合成(letterbox缩放) + 纯Canvas虚拟手柄 + 生命周期
// ============================================================
(function () {
  const B = globalThis.__WX_BOOT;
  if (!B || typeof wx === 'undefined') return;
  const screenCanvas = B.screenCanvas, sctx = B.sctx, gameCanvas = B.gameCanvas, dpr = B.dpr;
  const SW = screenCanvas.width, SH = screenCanvas.height;

  // 16:9 letterbox 缩放
  const scale = Math.min(SW / 480, SH / 270);
  const dw = 480 * scale, dh = 270 * scale;
  const ox = (SW - dw) / 2, oy = (SH - dh) / 2;

  const M = Math.min(SW, SH);
  const dp = { x: M * .17, y: SH - M * .17, r: M * .125 };                       // 方向垫
  const btns = [
    { x: SW - M * .14, y: SH - M * .16, r: M * .10, a: 'fire', label: 'FIRE',
      c0: 'rgba(200,56,58,.5)', c1: 'rgba(255,90,60,.8)' },
    { x: SW - M * .14 - M * .225, y: SH - M * .125, r: M * .08, a: 'jump', label: 'JUMP',
      c0: 'rgba(70,120,200,.45)', c1: 'rgba(90,150,255,.72)' },
    { x: SW - M * .115, y: SH - M * .16 - M * .24, r: M * .062, a: 'nade', label: 'NADE',
      c0: 'rgba(90,150,70,.44)', c1: 'rgba(120,200,90,.7)' }
  ];
  const sysBts = [
    { x: SW - M * .05, y: M * .06, r: M * .034, label: 'II', act: 'pause' },
    { x: SW - M * .05 - M * .09, y: M * .06, r: M * .034, label: 'M', act: 'mute' }
  ];

  const hits = new Map();
  let padPid = null, padZone = null;
  const setZone = function (z) {
    if (z === padZone) return;
    ['left', 'right', 'up', 'down'].forEach(function (a) { Input.set(a, a === z); });
    padZone = z;
  };
  const zoneOf = function (x, y) {
    const dx = x - dp.x, dy = y - dp.y, d = Math.hypot(dx, dy);
    if (d > dp.r * 1.3) return undefined;   // 不在垫区
    if (d < dp.r * .18) return null;        // 中心死区
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  const inCircle = function (x, y, c, k) { return Math.hypot(x - c.x, y - c.y) < c.r * (k || 1.15); };
  const menuTap = function () {
    if (game.state !== 'play' && game.state !== 'pause') { Input.set('confirm', true); Input.set('confirm', false); }
  };
  const sysTap = function (b) {
    if (b.act === 'pause') {
      if (game.state === 'play') { game.state = 'pause'; AudioSys.suspendAudio(); }
      else if (game.state === 'pause') { game.state = 'play'; AudioSys.resume(); }
    } else if (b.act === 'mute') game.toast(AudioSys.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
  };

  const onTouch = function (type, e) {
    const list = type === 'start' ? e.touches : (e.changedTouches || []);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const x = t.clientX != null ? t.clientX : t.x;
      const y = t.clientY != null ? t.clientY : t.y;
      if (x == null) continue;
      const px = x * dpr, py = y * dpr;
      if (type === 'start') {
        AudioSys.resume();
        let used = false;
        for (let j = 0; j < sysBts.length; j++) if (inCircle(px, py, sysBts[j], 1.4)) { sysTap(sysBts[j]); hits.set(t.identifier, {}); used = true; break; }
        if (used) continue;
        const z = zoneOf(px, py);
        if (z !== undefined) { padPid = t.identifier; setZone(z); hits.set(t.identifier, { pad: true }); continue; }
        for (let j = 0; j < btns.length; j++) if (inCircle(px, py, btns[j])) { hits.set(t.identifier, { btn: btns[j] }); Input.set(btns[j].a, true); used = true; break; }
        if (used) continue;
        menuTap();
        hits.set(t.identifier, {});
      } else if (type === 'move') {
        const h = hits.get(t.identifier);
        if (h && h.pad && t.identifier === padPid) setZone(zoneOf(px, py));
      }
    }
    if (type === 'end' || type === 'cancel') {
      const ends = e.changedTouches || [];
      for (let i = 0; i < ends.length; i++) {
        const h = hits.get(ends[i].identifier);
        if (!h) continue;
        if (h.pad && ends[i].identifier === padPid) { padPid = null; setZone(null); }
        if (h.btn) Input.set(h.btn.a, false);
        hits.delete(ends[i].identifier);
      }
    }
  };
  wx.onTouchStart(function (e) { onTouch('start', e); });
  wx.onTouchMove(function (e) { onTouch('move', e); });
  wx.onTouchEnd(function (e) { onTouch('end', e); });
  wx.onTouchCancel(function (e) { onTouch('cancel', e); });
  wx.onHide(function () { if (game.state === 'play') { game.state = 'pause'; AudioSys.suspendAudio(); } });

  // ---- 手柄绘制 ----
  const circle = function (c, fill, stroke) {
    sctx.beginPath(); sctx.arc(c.x, c.y, c.r, 0, 7);
    if (fill) { sctx.fillStyle = fill; sctx.fill(); }
    if (stroke) { sctx.strokeStyle = stroke; sctx.lineWidth = 2 * dpr; sctx.stroke(); }
  };
  const label = function (c, txt, size) {
    sctx.fillStyle = 'rgba(255,255,255,.95)';
    sctx.font = 'bold ' + Math.round(size) + 'px monospace';
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.fillText(txt, c.x, c.y);
    sctx.textAlign = 'left'; sctx.textBaseline = 'alphabetic';
  };
  const arrows = [
    { a: 'left', dx: -1, dy: 0, ch: '\u25C0' }, { a: 'right', dx: 1, dy: 0, ch: '\u25B6' },
    { a: 'up', dx: 0, dy: -1, ch: '\u25B2' }, { a: 'down', dx: 0, dy: 1, ch: '\u25BC' }
  ];
  const drawPad = function () {
    circle(dp, 'rgba(16,20,28,.45)', 'rgba(140,150,170,.4)');
    for (let i = 0; i < arrows.length; i++) {
      const ar = arrows[i];
      const c = { x: dp.x + ar.dx * dp.r * .55, y: dp.y + ar.dy * dp.r * .55, r: dp.r * .33 };
      circle(c, Input.down(ar.a) ? 'rgba(255,170,46,.65)' : 'rgba(60,70,90,.45)', 'rgba(140,150,170,.35)');
      label(c, ar.ch, c.r * .9);
    }
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      circle(b, Input.down(b.a) ? b.c1 : b.c0, 'rgba(140,150,170,.45)');
      label(b, b.label, b.r * (b.label.length > 4 ? .38 : .5));
    }
    for (let i = 0; i < sysBts.length; i++) {
      circle(sysBts[i], 'rgba(16,20,28,.5)', 'rgba(140,150,170,.35)');
      label(sysBts[i], sysBts[i].label, sysBts[i].r * .8);
    }
  };

  // ---- 合成循环: 游戏画面缩放上屏 + 叠加手柄 ----
  const blit = function () {
    requestAnimationFrame(blit);
    sctx.fillStyle = '#000'; sctx.fillRect(0, 0, SW, SH);
    sctx.drawImage(gameCanvas, 0, 0, 480, 270, ox, oy, dw, dh);
    drawPad();
  };
  requestAnimationFrame(blit);
})();
