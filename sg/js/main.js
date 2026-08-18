/* ============================================================
 * 三国烽火 · 入口
 * ============================================================ */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------- 开始画面动画:烽火山河 ---------- */
  (function titleAnim() {
    const cv = $('title-canvas'), c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    const W = cv.width, H = cv.height;
    const stars = Array.from({ length: 26 }, (_, i) => ({
      x: (i * 61) % W, y: (i * 37) % (H * 0.55), ph: i * 0.7,
    }));
    const soldiers = Array.from({ length: 10 }, (_, i) => ({ x: 40 + i * 45, ph: i * 1.3 }));
    function draw(t) {
      if ($('title-screen').classList.contains('hidden')) {
        requestAnimationFrame(draw); return;
      }
      /* 夜空 */
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#141024'); g.addColorStop(1, '#241a12');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      stars.forEach(s => {
        const a = 0.3 + 0.6 * Math.abs(Math.sin(t / 900 + s.ph));
        c.fillStyle = `rgba(220,225,255,${a})`;
        c.fillRect(s.x, s.y, 2, 2);
      });
      /* 月 */
      c.fillStyle = '#f4e8c0'; c.fillRect(W - 80, 30, 22, 22);
      c.fillStyle = '#141024'; c.fillRect(W - 88, 24, 20, 20);
      /* 远山 */
      c.fillStyle = '#1c1a28';
      for (let x = 0; x < W; x += 48) {
        const h = 34 + Math.sin(x * 0.05) * 14;
        c.beginPath(); c.moveTo(x, H * 0.62); c.lineTo(x + 24, H * 0.62 - h); c.lineTo(x + 48, H * 0.62);
        c.closePath(); c.fill();
      }
      /* 长城剪影 */
      c.fillStyle = '#2a2634';
      c.fillRect(0, H * 0.6, W, 8);
      for (let x = 0; x < W; x += 16) c.fillRect(x, H * 0.6 - 6, 8, 6);
      /* 烽火台 + 火焰 */
      const towerX = W * 0.72;
      c.fillStyle = '#332e40'; c.fillRect(towerX, H * 0.5, 26, 26);
      c.fillStyle = '#221e2c';
      c.fillRect(towerX - 3, H * 0.5 - 5, 8, 6); c.fillRect(towerX + 12, H * 0.5 - 5, 8, 6); c.fillRect(towerX + 27, H * 0.5 - 5, 8, 6);
      const fl = Math.sin(t / 90) * 3;
      c.fillStyle = '#ff8a2a';
      c.fillRect(towerX + 8, H * 0.5 - 14 - fl, 10, 12 + fl);
      c.fillStyle = '#ffd05a';
      c.fillRect(towerX + 10, H * 0.5 - 10 - fl * 0.5, 6, 8);
      if (Math.random() < 0.2) {
        c.fillStyle = '#ff9a52';
        c.fillRect(towerX + 6 + Math.random() * 16, H * 0.5 - 20 - Math.random() * 10, 2, 2);
      }
      /* 地面 + 行军将士剪影 */
      c.fillStyle = '#1a140e'; c.fillRect(0, H * 0.72, W, H * 0.28);
      soldiers.forEach((s, i) => {
        s.x -= 0.24;
        if (s.x < -20) s.x = W + 20;
        const bob = Math.abs(Math.sin(t / 160 + s.ph)) * 2;
        const x = s.x, y = H * 0.82 + Math.sin(s.ph) * 6 - bob;
        c.fillStyle = '#0e0c12';
        /* 旗 */
        c.fillRect(x + 8, y - 16, 2, 10);
        c.fillStyle = i % 3 === 0 ? '#8a2420' : '#20304a';
        c.fillRect(x + 10, y - 16, 9, 5);
        /* 人 */
        c.fillStyle = '#0e0c12';
        c.fillRect(x, y - 8, 7, 8);
        c.fillRect(x + 1, y, 2, 5); c.fillRect(x + 4, y, 2, 5);
        /* 枪 */
        c.fillRect(x + 7, y - 12, 1, 12);
      });
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    window.__sgTitleDrawNow = () => draw(performance.now());
  })();

  /* ---------- 启动流程 ---------- */
  function boot() {
    try {
    SGUI.bind();
    const mapCv = $('map');
    SGMap.init(mapCv, null, (cityName) => {
      const g = SGGame.current();
      if (!g) return;
      SGMap.select(cityName);
      SGUI.openCity(g, cityName);
    });

    /* 继续:最近自动存档 */
    const lastSlot = SGSave.lastSlot();
    if (lastSlot !== null && SGSave.load(lastSlot)) {
      $('btn-continue').classList.remove('hidden');
    }

    $('btn-continue').onclick = () => {
      const g = SGSave.load(lastSlot);
      if (g) { SGSave.revive(g); SGGame.setGame(g); SGUI.startPlaying(); }
    };
    $('btn-new').onclick = () => {
      document.title = 'SG-CLICKED-NEW';
      SGUI.showNewGame((fid, diff) => {
        SGGame.startNew(fid, diff);
        SGUI.startPlaying();
      });
    };
    $('btn-load-title').onclick = () => {
      const idx = SGSave.getIndex();
      if (!idx.length) { $('btn-load-title').textContent = '📜 无存档'; return; }
      SGUI.showLoad();
    };
    } catch (e) {
      window.__sgBootError = e.message;
      throw e;
    }
  }

  /* ---------- 自驱动回归测试(?autotest=1) ----------
   * IAB 输入注入不可用时,通过 URL 参数自动跑完整流程并汇报结果
   */
  function autotest() {
    const steps = [];
    const report = (name, ok, detail) => {
      steps.push({ name, ok, detail: detail || '' });
      const el = document.getElementById('autotest-report');
      if (el) el.textContent = JSON.stringify(steps);
      window.__sgAutotest = steps;
    };
    try {
      /* 1. 新游戏 */
      SGGame.startNew('cao', 1);
      const g = SGGame.current();
      report('newgame', !!g && g.cities && Object.keys(g.cities).length === 39,
        Object.keys(g.cities).length + '城');
      SGUI.startPlaying();

      /* 2. 顶栏 */
      report('topbar', document.getElementById('tb-name').textContent === '曹操');

      /* 3. 城池面板 */
      SGUI.openCity(g, '许昌');
      report('citypanel', document.getElementById('cp-name').textContent === '许昌');

      /* 4. 内政指令 */
      const gens = SGEngine.cityGenerals(g, '许昌').filter(x => x.faction === 'cao');
      const before = g.cities['许昌'].agri;
      const r = SGEngine.cmdAgri(g, '许昌', gens[0].name);
      report('cmd-agri', r.ok && g.cities['许昌'].agri > before, r.msg);

      /* 5. 征兵(另一城,验证每城每月一令规则) */
      const chenliu = SGEngine.cityGenerals(g, '陈留').filter(x => x.faction === 'cao');
      const r2 = SGEngine.cmdConscript(g, '陈留', chenliu[0].name, 2000);
      report('cmd-conscript', r2.ok, r2.msg);

      /* 6. 出征(弘农空城,从洛阳) */
      const luoyang = g.cities['洛阳'];
      const luoGens = SGEngine.cityGenerals(g, '洛阳').filter(x => x.faction === 'cao');
      luoyang.gold += 5000; luoyang.food += 50000; luoyang.troops = 12000;
      const rm = SGEngine.cmdMarch(g, '洛阳', '弘农', 8000, [luoGens[0].name]);
      report('cmd-march', rm.ok, rm.msg);

      /* 7. 结束月:部队在途,无战斗 */
      const res1 = SGGame.endTurn();
      const done1 = res1.phase === 'battle' ? (res1.battles.forEach(b => SGGame.battleAuto(b, 'atk')), SGGame.finishTurn()) : SGGame.finishTurn();
      report('endturn-transit', done1.phase === 'done', '部队在途1月');

      /* 8. 第二月:行军到达接战 */
      const res = SGGame.endTurn();
      report('endturn-battle', res.phase === 'battle' && res.battles.length === 1,
        'phase=' + res.phase + ' battles=' + (res.battles || []).length);

      /* 8b. 战斗 UI 渲染 + 一轮玩家战术操作 */
      if (res.phase === 'battle') {
        const b0 = res.battles[0];
        report('battle-obj', !!b0, 'keys=' + Object.keys(b0 || {}).join(',') + ' atk=' + (b0 && b0.atk ? 'y' : 'n') + ' phase=' + (b0 && b0.phase));
        SGUI.__testBattleUI(SGGame.current(), b0);
        const overlayShown = !document.getElementById('battle-overlay').classList.contains('hidden');
        const tacBtns = document.querySelectorAll('#bt-tactics .tac-btn').length;
        const title = document.getElementById('bt-title').textContent;
        report('battle-ui', overlayShown && tacBtns === 6, '战术按钮' + tacBtns + ' ' + title);
        /* 玩家战术连打 4 轮(UI 链路) */
        const b = res.battles[0];
        for (let k = 0; k < 4 && b.phase !== 'end'; k++) SGUI.__testBattleStep();
        const logLen = document.getElementById('bt-log').innerHTML.length;
        report('battle-step-ui', logLen > 0, '战报' + logLen + '字');
        SGGame.battleAuto(b, 'atk');
        document.getElementById('battle-overlay').classList.add('hidden');
        report('battle-resolved', b.phase === 'end', 'winner=' + b.winner + ' 弘农 owner=' + g.cities['弘农'].owner);
      }

      /* 9. 完成月结算 */
      const done = SGGame.finishTurn();
      report('finish-turn', done.phase === 'done', 'year=' + g.year + ' month=' + g.month);

      /* 10. 自动存档 */
      const idx = SGSave.getIndex();
      report('autosave', idx.length > 0, idx.map(x => x.name).join(';'));

      /* 11. 读档还原 */
      const g2 = SGSave.load(idx[0].slot);
      report('load-save', !!g2 && g2.turn === g.turn, 'turn=' + (g2 && g2.turn));

      /* 12. 连跑 24 月 AI 全自动(无异常即过) */
      let err = null;
      for (let i = 0; i < 24 && !g.gameOver; i++) {
        try {
          const rr = SGGame.endTurn();
          if (rr.phase === 'battle') rr.battles.forEach(b => SGGame.battleAuto(b, b.atk.faction === g.playerFaction ? 'atk' : 'def'));
          SGGame.finishTurn();
        } catch (e) { err = e.message + ' @turn' + g.turn; break; }
      }
      report('ai-24months', !err, err || ('turn=' + g.turn + ' 城=' + SGEngine.factionCities(g, 'cao').length));

      /* 汇总 */
      const fails = steps.filter(s => !s.ok);
      report('summary', fails.length === 0, fails.length + ' failures');
      document.title = fails.length === 0 ? 'AUTOTEST-PASS' : 'AUTOTEST-FAIL(' + fails.length + ')';
    } catch (e) {
      report('exception', false, e.message + ' | ' + (e.stack || '').split('\n')[1]);
      document.title = 'AUTOTEST-ERROR';
    }
  }

  function showTitleLoad() {
    /* 简化:直接用 SGUI 覆盖层读档 */
    const idx = SGSave.getIndex();
    if (!idx.length) {
      $('btn-load-title').textContent = '📜 无存档';
      return;
    }
    SGUI.showLoad();
  }

  boot();
  if (new URLSearchParams(location.search).get('autotest')) {
    const el = document.createElement('div');
    el.id = 'autotest-report';
    el.style.cssText = 'position:fixed;bottom:0;left:0;z-index:9999;background:#000;color:#0f0;font:9px monospace;max-width:100%;display:none';
    document.body.appendChild(el);
    setTimeout(autotest, 600);
  }
  /* 视觉快照通道:?shot=1 时把各 canvas 导出为 dataURL 挂 DOM,供外部读取 */
  if (new URLSearchParams(location.search).get('shot')) {
    setTimeout(() => {
      try {
        /* rAF 可能被后台标签节流:先同步画一帧 */
        SGMap.drawNow();
        if (window.__sgTitleDrawNow) window.__sgTitleDrawNow();
        const box = document.createElement('div');
        box.id = 'shot-box';
        box.style.display = 'none';
        ['title-canvas', 'map'].forEach((id) => {
          const cv = document.getElementById(id);
          if (!cv || !cv.width) return;
          const img = document.createElement('img');
          img.className = 'shot-data';
          img.dataset.for = id;
          img.src = cv.toDataURL('image/png');
          box.appendChild(img);
        });
        /* 像素统计:验证画面真实内容(颜色多样性) */
        const stats = {};
        ['title-canvas', 'map'].forEach(id => {
          const cv = document.getElementById(id);
          if (!cv || !cv.width) return;
          const c2 = cv.getContext('2d');
          try {
            const d = c2.getImageData(0, 0, cv.width, Math.min(cv.height, 400)).data;
            const colors = new Set();
            let nonDark = 0, total = 0;
            for (let i = 0; i < d.length; i += 40) {
              const r = d[i], g2 = d[i+1], b = d[i+2];
              total++;
              colors.add((r>>4)+','+(g2>>4)+','+(b>>4));
              if (r + g2 + b > 90) nonDark++;
            }
            stats[id] = { distinctColors: colors.size, nonDarkPct: Math.round(nonDark/total*100), size: [cv.width, cv.height] };
          } catch (e) { stats[id] = { err: e.message }; }
        });
        box.dataset.stats = JSON.stringify(stats);
        document.body.appendChild(box);
        document.title = 'SHOT-READY';
      } catch (e) { document.title = 'SHOT-ERR:' + e.message; }
    }, 2500);
  }
})();
