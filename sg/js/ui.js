/* ============================================================
 * 三国烽火 · UI 控制器
 * 顶栏 / 城池面板 / 战斗画面 / 覆盖菜单 / 开始画面
 * ============================================================ */
'use strict';

const SGUI = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
  let pendingBattles = [];      // 待玩家演算的战斗队列
  let curBattle = null;
  let playerSide = null;
  let chosenTactic = 0;
  let logShown = false;

  /* ================= 顶栏 ================= */
  function updateTopbar(g) {
    const f = g.factions[g.playerFaction];
    const cs = SGEngine.factionCities(g, g.playerFaction);
    const gold = cs.reduce((s, c) => s + c.gold, 0);
    const food = cs.reduce((s, c) => s + c.food, 0);
    $('tb-flag').style.background = f.color;
    $('tb-name').textContent = f.name;
    $('tb-year').textContent = g.year;
    $('tb-month').textContent = g.month;
    $('tb-gold').textContent = fmt(gold);
    $('tb-food').textContent = fmt(food);
    $('tb-cities').textContent = cs.length;
    $('tb-gens').textContent = SGEngine.factionGenerals(g, g.playerFaction).length;
  }
  const fmt = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n);

  /* ================= 城池面板 ================= */
  function openCity(g, name) {
    const c = g.cities[name];
    if (!c) return;
    const mine = c.owner === g.playerFaction;
    const owner = c.owner ? g.factions[c.owner] : null;
    $('cp-flag').style.background = owner ? owner.color : '#555';
    $('cp-name').textContent = name;
    $('cp-owner').textContent = owner ? owner.name + (mine ? '(本方)' : '') : '空城';
    $('cp-owner').style.color = mine ? '#7cd63e' : '';

    const stats = [
      ['兵力', fmt(c.troops)], ['训练', Math.round(c.training)],
      ['民忠', Math.round(c.morale)], ['城防', Math.round(c.wallHp) + '/' + c.walls],
      ['金', fmt(c.gold)], ['粮', fmt(c.food)],
      ['农业', Math.round(c.agri) + '/' + c.agriMax], ['商业', Math.round(c.com) + '/' + c.comMax],
    ];
    $('cp-stats').innerHTML = '<div class="stat-grid">' + stats.map(([k, v], i) =>
      `<span class="${(k === '粮' && c.food < c.troops * 1.1) || (k === '民忠' && c.morale < 30) ? 'warn' : ''}">${k}<b>${v}</b></span>`).join('') + '</div>';

    /* 城内武将 */
    const gens = SGEngine.cityGenerals(g, name);
    $('cp-gens').innerHTML = gens.length
      ? gens.map(x => genChip(g, x)).join('')
      : '<span style="font-size:8px;color:#55524a">城中无将</span>';

    /* 指令按钮 */
    const acts = [];
    if (mine) {
      const noFood = c.food < c.troops * 1.1;
      acts.push(`<button class="act-btn" data-act="agri" ${c.acted ? 'disabled' : ''}>开垦</button>`);
      acts.push(`<button class="act-btn" data-act="com" ${c.acted ? 'disabled' : ''}>商业</button>`);
      acts.push(`<button class="act-btn" data-act="conscript" ${c.acted || noFood ? 'disabled' : ''}>征兵</button>`);
      acts.push(`<button class="act-btn" data-act="train" ${c.acted ? 'disabled' : ''}>训练</button>`);
      acts.push(`<button class="act-btn" data-act="repair" ${c.acted || c.wallHp >= c.walls ? 'disabled' : ''}>修城</button>`);
      acts.push(`<button class="act-btn" data-act="search" ${c.acted ? 'disabled' : ''}>搜索</button>`);
      const frees = SGEngine.cityFreeGenerals(g, name);
      acts.push(`<button class="act-btn" data-act="recruit" ${c.acted || !frees.length ? 'disabled' : ''}>录用${frees.length ? '(' + frees.length + ')' : ''}</button>`);
      acts.push(`<button class="act-btn war" data-act="march">出征</button>`);
      acts.push(`<button class="act-btn" data-act="transfer">输送</button>`);
      /* 俘虏处理 */
      const prisoners = Object.values(g.generals).filter(x => x.status === 'captured' && x.city === name);
      if (prisoners.length) acts.push(`<button class="act-btn" data-act="prisoner">俘虏(${prisoners.length})</button>`);
    }
    $('cp-actions').innerHTML = acts.join('') || '<span style="font-size:8px;color:#55524a">敌方城池:可出征攻取</span>';
    $('cp-actions').querySelectorAll('.act-btn').forEach(b => {
      b.onclick = () => handleAction(g, name, b.dataset.act);
    });

    /* 详情:邻接 */
    const links = (g.adj[name] || []).map(n => {
      const nc = g.cities[n];
      const own = nc.owner ? g.factions[nc.owner].name : '空城';
      const cls = nc.owner === g.playerFaction ? 'style="color:#7cd63e"' : '';
      return `<span class="gn" data-city="${n}" ${cls}>${n}<span class="dim">(${esc(own)})</span></span>`;
    }).join(' ');
    $('cp-detail').innerHTML = `<h4>四邻</h4><div>${links}</div>` +
      (mine ? `<h4>城中事务</h4><div class="dim" id="cp-msg">选择上方指令治理${name}。每月每城可执行一次内政。</div>` : '');
    $('cp-detail').querySelectorAll('.gn').forEach(el => {
      el.onclick = () => { SGMap.select(el.dataset.city); openCity(g, el.dataset.city); };
    });

    $('city-panel').classList.remove('hidden');
  }

  function genChip(g, x) {
    const st = x.isRuler ? '👑' : '';
    const loy = x.loyalty < 55 ? ` style="color:#ff9d94"` : '';
    return `<span style="display:inline-block;margin:2px 3px;font-size:8px;background:#22223a;border:1px solid var(--line);padding:3px 6px">
      ${st}<b style="color:#ffedd0">${esc(x.name)}</b>
      <span class="dim">统${x.lead} 武${x.force} 智${x.int}</span>
      <span${loy}>忠${Math.round(x.loyalty)}</span></span>`;
  }

  /* ================= 指令处理 ================= */
  function handleAction(g, name, act) {
    const c = g.cities[name];
    const gens = SGEngine.cityGenerals(g, name).filter(x => x.faction === g.playerFaction);
    if (!gens.length && ['agri', 'com', 'conscript', 'train', 'repair', 'search'].includes(act)) {
      cpMsg('城中无可用武将');
      return;
    }
    const best = {
      agri: byPol, com: byPol, conscript: byChar, train: byLead,
      repair: byPol, search: byCharm, recruit: byCharm,
    }[act] || byPol;

    if (act === 'agri' || act === 'com' || act === 'train' || act === 'repair') {
      const gen = pickGeneral(gens, best, (x) => `${act === 'agri' ? '开垦屯田' : act === 'com' ? '兴商利市' : act === 'train' ? '操练军马' : '修缮城郭'}选谁主持?`, () => {
        const fn = { agri: 'cmdAgri', com: 'cmdCommerce', train: 'cmdTrain', repair: 'cmdRepair' }[act];
        const r = SGEngine[fn](g, name, curPick.name);
        cpMsg(r.msg);
        openCity(g, name); updateTopbar(g);
      });
    } else if (act === 'conscript') {
      showConscript(g, name);
    } else if (act === 'search') {
      const gen = pickGeneral(gens, best, '派谁寻访在野贤才?', () => {
        const r = SGEngine.cmdSearch(g, name, curPick.name);
        cpMsg(r.msg);
        if (r.found) { SGEngine.log(g, `(${name}) ${r.msg}`, 'good'); }
        openCity(g, name); updateTopbar(g);
      });
    } else if (act === 'recruit') {
      showRecruit(g, name);
    } else if (act === 'march') {
      showMarch(g, name);
    } else if (act === 'transfer') {
      showTransfer(g, name);
    } else if (act === 'prisoner') {
      showPrisoners(g, name);
    }
  }

  let curPick = null;
  /* 武将选择器:单人策略 auto=直接最优,复杂场景弹选择 */
  function pickGeneral(gens, scoreFn, title, cb) {
    if (gens.length === 1) { curPick = gens[0]; cb(); return; }
    const sorted = [...gens].sort((a, b) => scoreFn(b) - scoreFn(a));
    cpMsg(title + '<br>' + sorted.slice(0, 6).map(x =>
      `<span class="gn" data-g="${esc(x.name)}" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#ffedd0;border-bottom:1px solid var(--line2)">${esc(x.name)}(${scoreFn(x)})</span>`).join(''));
    $('cp-detail').querySelectorAll('.gn[data-g]').forEach(el => {
      el.onclick = () => {
        curPick = g_lookup(el.dataset.g);
        cb();
      };
    });
  }
  const g_lookup = (n) => SGGame.current().generals[n];
  const byPol = (x) => x.pol, byLead = (x) => x.lead, byCharm = (x) => x.charm;

  function cpMsg(html) {
    const el = $('cp-msg');
    if (el) { el.innerHTML = html; el.classList.remove('dim'); }
  }

  /* 征兵 */
  function showConscript(g, name) {
    const c = g.cities[name];
    const gens = SGEngine.cityGenerals(g, name).filter(x => x.faction === g.playerFaction);
    const gen = gens.sort((a, b) => (b.charm + b.lead) - (a.charm + a.lead))[0];
    const maxAfford = Math.min(Math.floor(c.gold * 100), Math.floor(c.food / 1.3), Math.floor(c.pop * 400));
    if (maxAfford < 300) { cpMsg('钱粮或兵源不足,无法征兵'); return; }
    const step = Math.max(500, Math.floor(maxAfford / 10 / 500) * 500);
    cpMsg(`主将:${esc(gen.name)}(魅力${gen.charm})<br>
      可征上限 <b style="color:var(--gold)">${maxAfford}</b> 人<br>
      <span class="gn" data-n="0.25">征1/4</span> <span class="gn" data-n="0.5">征半数</span>
      <span class="gn" data-n="1">全力征募</span>`);
    $('cp-detail').querySelectorAll('.gn[data-n]').forEach(el => {
      el.onclick = () => {
        const count = Math.min(Math.floor(maxAfford * parseFloat(el.dataset.n)), 30000);
        const r = SGEngine.cmdConscript(g, name, gen.name, count);
        cpMsg(r.msg);
        openCity(g, name); updateTopbar(g);
      };
    });
  }

  /* 录用在野 */
  function showRecruit(g, name) {
    const frees = SGEngine.cityFreeGenerals(g, name);
    const gens = SGEngine.cityGenerals(g, name).filter(x => x.faction === g.playerFaction);
    const by = gens.sort((a, b) => (b.pol + b.charm) - (a.pol + a.charm))[0];
    cpMsg('在野之士:<br>' + frees.map(x =>
      `<span class="gn" data-f="${esc(x.name)}" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#ffedd0">${esc(x.name)}(智${x.int} 政${x.pol} 魅${x.charm})</span>`).join('') +
      `<br>派 ${esc(by.name)} 前去劝说`);
    $('cp-detail').querySelectorAll('.gn[data-f]').forEach(el => {
      el.onclick = () => {
        const r = SGEngine.cmdRecruit(g, name, by.name, el.dataset.f);
        cpMsg(r.msg);
        openCity(g, name); updateTopbar(g);
      };
    });
  }

  /* 俘虏处理 */
  function showPrisoners(g, name) {
    const ps = Object.values(g.generals).filter(x => x.status === 'captured' && x.city === name);
    const ruler = SGEngine.factionGenerals(g, g.playerFaction).find(x => x.isRuler);
    cpMsg('阶下之囚:<br>' + ps.map(x =>
      `<div class="gen-row"><span class="gn">${esc(x.name)}</span>
       <span class="gs">统${x.lead} 武${x.force} 智${x.int}</span>
       <button class="act-btn" data-p="${esc(x.name)}" data-m="recruit">劝降</button>
       <button class="act-btn" data-p="${esc(x.name)}" data-m="release">释放</button>
       <button class="act-btn war" data-p="${esc(x.name)}" data-m="kill">斩</button></div>`).join(''));
    $('cp-detail').querySelectorAll('[data-p]').forEach(b => {
      b.onclick = () => {
        const p = b.dataset.p, m = b.dataset.m;
        let r;
        if (m === 'recruit') r = SGBattle.recruitPrisoner(g, name, ruler ? ruler.name : '', p);
        else if (m === 'release') r = SGBattle.releasePrisoner(g, p);
        else r = SGBattle.executePrisoner(g, p);
        cpMsg(r.msg);
        openCity(g, name); updateTopbar(g);
      };
    });
  }

  /* 出征 */
  function showMarch(g, name) {
    const c = g.cities[name];
    const targets = (g.adj[name] || []).map(n => g.cities[n]).filter(t => t.owner !== g.playerFaction);
    if (!targets.length) { cpMsg('无敌对邻城可攻'); return; }
    const gens = SGEngine.cityGenerals(g, name).filter(x => x.faction === g.playerFaction && (!x.isRuler || true));
    cpMsg(`进攻目标:<br>` + targets.map(t =>
      `<span class="gn" data-t="${t.name}" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#ff9d94">${t.name}(${t.owner ? g.factions[t.owner].name : '空城'}·${fmt(t.troops)}兵)</span>`).join(''));
    $('cp-detail').querySelectorAll('.gn[data-t]').forEach(el => {
      el.onclick = () => showMarchSquad(g, name, el.dataset.t);
    });
  }

  function showMarchSquad(g, name, target) {
    const c = g.cities[name];
    const gens = SGEngine.cityGenerals(g, name).filter(x => x.faction === g.playerFaction);
    cpMsg(`选将出征 <b style="color:#ff9d94">${target}</b> (最多3将,点击选择/取消):<br>` +
      gens.map(x => `<span class="gn sq" data-s="${esc(x.name)}" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#8a8578">☐${esc(x.name)}(统${x.lead})</span>`).join('') +
      `<br><span class="gn" data-go="1" style="display:inline-block;margin-top:8px;cursor:pointer;color:var(--gold);border:1px solid var(--line2);padding:5px 10px">发兵 →</span>`);
    const picked = new Set();
    $('cp-detail').querySelectorAll('.sq').forEach(el => {
      el.onclick = () => {
        const n = el.dataset.s;
        if (picked.has(n)) { picked.delete(n); el.style.color = '#8a8578'; el.textContent = '☐' + n; }
        else if (picked.size < 3) { picked.add(n); el.style.color = '#ffedd0'; el.textContent = '☑' + n; }
      };
    });
    $('cp-detail').querySelector('[data-go]').onclick = () => {
      const squad = [...picked];
      if (!squad.length) { cpMsg('至少选一员武将'); return; }
      showMarchTroops(g, name, target, squad);
    };
  }

  function showMarchTroops(g, name, target, squad) {
    const c = g.cities[name];
    const capacity = squad.reduce((s, n) => s + 500 + g.generals[n].lead * 130, 0);
    const max = Math.min(c.troops, capacity);
    if (max < 500) { cpMsg('兵力不足 500'); return; }
    cpMsg(`发兵多少? 上限 <b style="color:var(--gold)">${max}</b>(留城 ${c.troops - max}):<br>` +
      [0.4, 0.6, 0.8, 1].map(r =>
        `<span class="gn" data-r="${r}" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#ffedd0">${Math.floor(max * r)}</span>`).join(''));
    $('cp-detail').querySelectorAll('.gn[data-r]').forEach(el => {
      el.onclick = () => {
        const troops = Math.max(500, Math.floor(max * parseFloat(el.dataset.r)));
        const r = SGEngine.cmdMarch(g, name, target, troops, squad);
        cpMsg(r.msg);
        if (r.ok) SGEngine.log(g, `(${name}) ${r.msg}`, 'march');
        openCity(g, name); updateTopbar(g); refreshAll(g);
      };
    });
  }

  /* 输送 */
  function showTransfer(g, name) {
    const c = g.cities[name];
    const targets = (g.adj[name] || []).map(n => g.cities[n]).filter(t => t.owner === g.playerFaction);
    if (!targets.length) { cpMsg('无本方邻城可输送'); return; }
    cpMsg('输送目标:<br>' + targets.map(t =>
      `<span class="gn" data-t="${t.name}" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#7cd63e">${t.name}(${fmt(t.troops)}兵)</span>`).join(''));
    $('cp-detail').querySelectorAll('.gn[data-t]').forEach(el => {
      el.onclick = () => {
        const t = el.dataset.t;
        const max = c.troops;
        cpMsg(`向 ${t} 输送兵力与辎重:<br>` + [0, 0.5, 0.8, 1].map(r =>
          r === 0
            ? `<span class="gn" data-r="0" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#8fd4e8">仅运粮草</span>`
            : `<span class="gn" data-r="${r}" style="display:inline-block;margin:3px 4px;cursor:pointer;color:#ffedd0">兵${Math.floor(max * r)}+辎重</span>`).join(''));
        $('cp-detail').querySelectorAll('.gn[data-r]').forEach(e2 => {
          e2.onclick = () => {
            const troops = Math.floor(max * parseFloat(e2.dataset.r));
            SGEngine.cmdTransfer(g, name, t, troops, []);
            cpMsg(`已向 ${t} 输送 ${troops} 兵及随军辎重`);
            openCity(g, name); updateTopbar(g); refreshAll(g);
          };
        });
      };
    });
  }

  /* ================= 结束回合 → 战斗流程 ================= */
  function endTurn() {
    const g = SGGame.current();
    if (!g || g.gameOver) return;
    $('btn-endturn').disabled = true;
    const result = SGGame.endTurn();
    if (result.phase === 'battle') {
      pendingBattles = result.battles.slice();
      nextBattle();
    } else {
      finishTurnUI(result);
    }
  }

  function nextBattle() {
    if (!pendingBattles.length) {
      finishTurnUI(SGGame.finishTurn());
      return;
    }
    curBattle = pendingBattles.shift();
    showBattleOverlay(SGGame.current(), curBattle);
  }

  function finishTurnUI(result) {
    const g = SGGame.current();
    updateTopbar(g);
    refreshAll(g);
    $('btn-endturn').disabled = false;
    showAutosaveTip();
    if (result.gameOver) { setTimeout(() => showGameOver(g, result.gameOver), 600); return; }
    /* 检查本城被攻等提示 */
    if (g.battles.length) {
      const mine = g.battles.filter(b => b.atk.faction === g.playerFaction || b.def.faction === g.playerFaction);
      if (mine.length) openLog(true);
    }
  }

  function showAutosaveTip() {
    const el = $('autosave-tip');
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1600);
  }

  /* ================= 战斗画面 ================= */
  function showBattleOverlay(g, b) {
    curBattle = b;
    playerSide = b.atk.faction === g.playerFaction ? 'atk' : 'def';
    chosenTactic = 0;
    $('battle-overlay').classList.remove('hidden');
    const atkF = g.factions[b.atk.faction], defF = g.factions[b.def.faction];
    $('bt-title').textContent = `⚔ ${atkF ? atkF.name : '?'}军 攻 ${b.city}${defF ? ' · ' + defF.name : ''}`;
    $('bt-atk-fac').innerHTML = `<span style="color:${atkF ? atkF.color : '#fff'}">${atkF ? atkF.name : '乱军'}</span> 攻方`;
    $('bt-def-fac').innerHTML = `<span style="color:${defF ? defF.color : '#aaa'}">${defF ? defF.name : '空城守军'}</span> 守方`;
    $('bt-log').innerHTML = '';
    renderBattle(g, b);
    /* 战术按钮 */
    const mine = playerSide === 'atk' ? b.atk : b.def;
    $('bt-tactics').innerHTML = SGBattle.TACTICS.map(t => {
      let dis = '';
      if (t.id === 3 && mine.fireCd > 0) dis = 'disabled';
      if (t.id === 4 && (mine.ambushCd > 0 || mine.troops > (playerSide === 'atk' ? b.def : b.atk).troops * 1.15)) dis = 'disabled';
      if (t.id === 5 && (mine.duelCd > 0 || !mine.gens.length)) dis = 'disabled';
      return `<button class="tac-btn ${t.id === 0 ? 'active' : ''}" data-t="${t.id}" ${dis}
        title="${esc(t.desc)}">${t.name}</button>`;
    }).join('');
    $('bt-tactics').querySelectorAll('.tac-btn').forEach(el => {
      el.onclick = () => {
        chosenTactic = parseInt(el.dataset.t);
        $('bt-tactics').querySelectorAll('.tac-btn').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
      };
    });
    $('bt-next').textContent = b.turn === 0 ? '开战 ▶' : '下一轮 ▶';
    $('bt-next').onclick = () => battleStepUI();
    $('bt-auto').onclick = () => {
      SGGame.battleAuto(b, playerSide);
      renderBattle(g, b);
      appendBattleLog(b);
      setTimeout(closeBattle, 900);
    };
  }

  function battleStepUI() {
    const b = curBattle, g = SGGame.current();
    SGGame.battleStep(b, chosenTactic, playerSide);
    renderBattle(g, b);
    appendBattleLog(b);
    if (b.phase === 'end') {
      $('bt-next').textContent = '战后 ▶';
      $('bt-next').onclick = () => closeBattle();
      /* 战后刷新战术禁用态 */
    } else {
      /* 刷新战术按钮冷却 */
      const mine = playerSide === 'atk' ? b.atk : b.def;
      $('bt-tactics').querySelectorAll('.tac-btn').forEach(el => {
        const id = parseInt(el.dataset.t);
        if (id === 3) el.disabled = mine.fireCd > 0;
        if (id === 4) el.disabled = mine.ambushCd > 0;
        if (id === 5) el.disabled = mine.duelCd > 0;
      });
    }
  }

  function appendBattleLog(b) {
    const el = $('bt-log');
    const last = b._logged || 0;
    b.events.slice(last).forEach(e => {
      const cls = e.msg.includes('攻陷') || e.msg.includes('胜') ? 'win' : e.msg.includes('🔥') ? 'fire' : (e.msg.includes('⚑') || e.msg.includes('⚔') ? 'hl' : '');
      el.innerHTML += `<div class="${cls}">[第${e.turn}轮] ${esc(e.msg)}</div>`;
    });
    b._logged = b.events.length;
    el.scrollTop = el.scrollHeight;
  }

  function renderBattle(g, b) {
    const pct = (t, init) => Math.max(2, Math.round(t / Math.max(init, 1) * 100));
    $('bt-atk-fill').style.width = pct(b.atk.troops, b.atk.initTroops) + '%';
    $('bt-def-fill').style.width = pct(b.def.troops, Math.max(b.def.initTroops, 1)) + '%';
    $('bt-atk-num').textContent = fmt(b.atk.troops) + ' / ' + fmt(b.atk.initTroops);
    $('bt-def-num').textContent = fmt(b.def.troops) + ' / ' + fmt(b.def.initTroops);
    $('bt-atk-mor').textContent = `士气 ${Math.round(b.atk.morale)} · ${SGBattle.TACTICS[b.atk.tactic].name}`;
    $('bt-def-mor').textContent = `士气 ${Math.round(b.def.morale)} · ${SGBattle.TACTICS[b.def.tactic].name}`;
    $('bt-atk-gens').innerHTML = b.atk.gens.map(n => {
      const x = g.generals[n];
      return x && x.status !== 'dead' ? esc(n) : `<s style="color:#555">${esc(n)}</s>`;
    }).join(' ') || '无名之师';
    $('bt-def-gens').innerHTML = b.def.gens.map(n => {
      const x = g.generals[n];
      return x && x.status !== 'dead' ? esc(n) : `<s style="color:#555">${esc(n)}</s>`;
    }).join(' ') || '守城官军';
    drawBattleScene(g, b);
  }

  /* 战场像素动画:两军对垒小方阵 */
  let btCtx = null;
  function drawBattleScene(g, b) {
    const cv = $('bt-canvas');
    if (!btCtx) btCtx = cv.getContext('2d');
    const c = btCtx, W = cv.width, H = cv.height;
    c.fillStyle = '#0a0c12'; c.fillRect(0, 0, W, H);
    /* 城墙(右侧) */
    if (playerSide === 'atk') {
      c.fillStyle = '#3a3a4a'; c.fillRect(W - 26, 20, 16, H - 40);
      c.fillStyle = '#4a4a5c';
      for (let i = 0; i < 6; i++) c.fillRect(W - 28, 24 + i * 14, 6, 6);
    } else {
      c.fillStyle = '#3a3a4a'; c.fillRect(10, 20, 16, H - 40);
      c.fillStyle = '#4a4a5c';
      for (let i = 0; i < 6; i++) c.fillRect(20, 24 + i * 14, 6, 6);
    }
    const t = performance.now();
    /* 两军士兵点阵 */
    const drawSide = (side, dir, col) => {
      const n = Math.max(1, Math.min(40, Math.round(side.troops / Math.max(side.initTroops, 1) * 40)));
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 8), colI = i % 8;
        const x = W / 2 + dir * (46 + colI * 7) + Math.sin(t / 180 + i) * 1.5;
        const y = 22 + row * 12 + Math.abs(Math.sin(t / 140 + i * 2)) * 2;
        c.fillStyle = col;
        c.fillRect(x, y, 4, 5);
        c.fillStyle = '#0a0c12';
        c.fillRect(x + 1, y + 1, 1, 1);
      }
    };
    drawSide(b.atk, playerSide === 'atk' ? -1 : 1, '#e05a4a');
    drawSide(b.def, playerSide === 'atk' ? 1 : -1, '#4a7ee0');
    /* 火攻特效 */
    const lastEv = b.events[b.events.length - 1];
    if (lastEv && lastEv.msg.includes('🔥') && b._logged === b.events.length) {
      for (let i = 0; i < 12; i++) {
        c.fillStyle = ['#ff9a52', '#ffd05a', '#ff5a2a'][i % 3];
        c.fillRect(W / 2 - 40 + (i * 37) % 80, 30 + (i * 23) % 60, 3, 4);
      }
    }
  }

  function closeBattle() {
    $('battle-overlay').classList.add('hidden');
    const g = SGGame.current();
    if (g.gameOver) { showGameOver(g, g.gameOver); return; }
    updateTopbar(g);
    refreshAll(g);
    nextBattle();
  }

  /* ================= 覆盖菜单 ================= */
  function showOverlay(title, bodyHtml, btns) {
    $('ov-title').textContent = title;
    $('ov-body').innerHTML = bodyHtml;
    const bb = $('ov-btns');
    bb.innerHTML = '';
    (btns || []).forEach(([label, fn, cls]) => {
      const b = document.createElement('button');
      b.className = 'tbtn ' + (cls || '');
      b.textContent = label;
      b.onclick = fn;
      bb.appendChild(b);
    });
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  /* ---- 主菜单 ---- */
  function showMenu() {
    const g = SGGame.current();
    showOverlay('☰ 三国烽火', `
      <div style="text-align:center;color:var(--dim);font-size:8px;line-height:2.4">
      ${g ? `${g.factions[g.playerFaction].name} · ${g.year}年${g.month}月 · ${SGEngine.factionCities(g, g.playerFaction).length} 城<br>` : ''}
      </div>`,
      [
        ['▶ 返回战场', () => hideOverlay()],
        ['💾 存档管理', showSaves, ''],
        ['📜 读取存档', showLoad, ''],
        ['📊 天下情报', showIntel, ''],
        ['❓ 玩法说明', showHelp, ''],
        ['🏠 回到首页', () => { location.href = '../index.html'; }, 'danger'],
      ]);
  }

  /* ---- 存档管理 ---- */
  function saveSlotsHtml(idx, clickable) {
    let html = '';
    for (let i = 0; i < SGSave.SLOTS; i++) {
      const meta = idx.find(x => x.slot === i);
      html += `<div class="slot-row" data-slot="${i}">
        <span style="color:var(--gold);font-size:10px">${i + 1}</span>
        ${meta ? `<span class="sl-name">${esc(meta.name)}<br><span class="sl-meta">${meta.cities}城 · ${new Date(meta.date).toLocaleString()}</span></span>`
               : `<span class="sl-name sl-empty">— 空槽 —</span>`}
      </div>`;
    }
    return html;
  }

  function showSaves() {
    const idx = SGSave.getIndex();
    showOverlay('💾 存档管理', saveSlotsHtml(idx) +
      '<div style="text-align:center;color:var(--dim);font-size:8px;margin-top:8px">点击槽位保存当前进度 · 每月结束自动续存</div>',
      [['返回', showMenu]]);
    $('ov-body').querySelectorAll('.slot-row').forEach(row => {
      row.style.cursor = 'pointer';
      row.onclick = () => {
        const slot = parseInt(row.dataset.slot);
        const r = SGSave.save(slot, SGGame.current(), true);
        showSaves();
      };
    });
  }

  function showLoad() {
    const idx = SGSave.getIndex();
    const has = idx.length > 0;
    showOverlay('📜 读取存档', saveSlotsHtml(idx) || '', [['返回', showMenu]]);
    $('ov-body').querySelectorAll('.slot-row').forEach(row => {
      const meta = idx.find(x => x.slot === parseInt(row.dataset.slot));
      if (!meta) return;
      row.style.cursor = 'pointer';
      row.onmouseenter = () => row.style.borderColor = 'var(--gold)';
      row.onmouseleave = () => row.style.borderColor = '';
      row.onclick = () => {
        const g = SGSave.load(parseInt(row.dataset.slot));
        if (g) {
          SGSave.revive(g);
          SGGame.setGame(g);
          hideOverlay();
          startPlaying();
        }
      };
    });
  }

  /* ---- 情报 ---- */
  function showIntel() {
    const g = SGGame.current();
    if (!g) return;
    const powers = Object.values(g.factions)
      .filter(f => f.alive)
      .map(f => ({ f, ...SGEngine.factionPower(g, f.id) }))
      .filter(x => x.cities > 0)
      .sort((a, b) => b.score - a.score);
    const maxScore = powers[0] ? powers[0].score : 1;
    const rows = powers.map((x, i) => `
      <div class="intel-row">
        <span style="color:var(--dim);width:16px">${i + 1}</span>
        <span class="in-flag" style="background:${x.f.color}"></span>
        <span class="in-name">${esc(x.f.name)}${x.f.id === g.playerFaction ? ' ★' : ''}</span>
        <span class="in-data">城${x.cities} · 兵${fmt(x.troops)} · 将${x.gen}</span>
        <span class="intel-bar"><div style="width:${Math.round(x.score / maxScore * 100)}%;background:${x.f.color}"></div></span>
      </div>`).join('');
    const defeated = g.defeated.length
      ? `<div style="margin-top:10px;color:#665;font-size:8px">已亡: ${g.defeated.map(d => esc(d.name)).join(' · ')}</div>` : '';
    showOverlay('📊 天下大势', rows + defeated, [['返回', showMenu]]);
  }

  /* ---- 武将列表 ---- */
  function showGenerals() {
    const g = SGGame.current();
    if (!g) return;
    const mine = SGEngine.factionGenerals(g, g.playerFaction)
      .sort((a, b) => (b.lead + b.force + b.int) - (a.lead + a.force + a.int));
    const rows = mine.map(x => `
      <div class="gen-row">
        <span class="gn">${x.isRuler ? '👑' : ''} ${esc(x.name)}</span>
        <span class="gs">统${x.lead} 武${x.force} 智${x.int} 政${x.pol}</span>
        <span class="gs dim">@${esc(x.city)}</span>
        <span class="gl" style="color:${x.loyalty < 55 ? '#ff9d94' : '#8fd48f'}">忠${Math.round(x.loyalty)}</span>
      </div>`).join('');
    showOverlay(`🎖 麾下武将 (${mine.length})`, rows, [['返回', () => hideOverlay()]]);
  }

  /* ---- 月报 ---- */
  function openLog(force) {
    const g = SGGame.current();
    if (!g) return;
    logShown = true;
    const recent = g.log.slice(-60).reverse();
    const color = { battle: '#ffb39a', good: '#a8e0a0', bad: '#ff9d94', faction: '#f2cf46', march: '#8fd4e8', warn: '#e0c98f' };
    const rows = recent.map(l =>
      `<div style="color:${color[l.type] || '#b8b2a0'}">[${l.turn + 1}月] ${esc(l.msg)}</div>`).join('');
    showOverlay('📜 军情月报', `<div style="font-size:8px;line-height:2.2">${rows || '暂无大事'}</div>`,
      [['返回', () => hideOverlay()]]);
  }

  /* ---- 帮助 ---- */
  function showHelp() {
    showOverlay('❓ 玩法说明', `
      <div style="font-size:9px;line-height:2.3;color:var(--text)">
      🎯 <b style="color:var(--gold)">目标</b>:占领全部 40 城,一统天下。<br>
      🏯 <b style="color:var(--gold)">内政</b>:点击己方城池,每城每月一道政令——开垦(增产粮)、商业(增收金)、征兵、训练、修城、搜索、录用在野贤才。<br>
      ⚔️ <b style="color:var(--gold)">出征</b>:从己方城发兵攻打相邻敌城,行军一月到达接战。多路合兵可围攻同一目标。<br>
      🔥 <b style="color:var(--gold)">战术</b>:战斗中可换战术——猛攻/坚守/火攻(需智将)/伏兵(需劣势)/单挑(需猛将)。智力与武力的对决!<br>
      🌾 <b style="color:var(--gold)">经济</b>:每年七月秋收;兵马每月食粮,断粮则逃兵四起。输送指令可调兵运粮。<br>
      💌 <b style="color:var(--gold)">忠诚</b>: loyalty 低的武将会叛逃,多赏赐金帛。<br>
      💾 <b style="color:var(--gold)">存档</b>:每月结束自动保存,菜单里可手动存 6 槽。
      </div>`, [['返回', showMenu]]);
  }

  /* ---- 新游戏:选势力 ---- */
  function showNewGame(cb) {
    let selFaction = 'cao', selDiff = 1;
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    const facRows = SG_DATA.FACTIONS.map(f => {
      const diffMap = { cao: 2, yuan: 2, sun: 2, liu: 5, biao: 2, zhang: 2, ma: 3, lu: 3, shu: 4, lyu: 4, gong: 3 };
      return `<div class="fac-card ${f.id === selFaction ? 'sel' : ''}" data-f="${f.id}">
        <span class="fc-flag" style="background:${f.color}"></span>
        <span class="fc-name">${esc(f.name)}</span>
        <span class="fc-desc">${esc(f.desc)}</span>
        <span class="fc-power">${stars(diffMap[f.id] || 3)}</span>
      </div>`;
    }).join('');
    const diffRow = ['简单', '普通', '困难'].map((d, i) =>
      `<button class="tbtn diff-btn ${i === 1 ? 'active' : ''}" data-d="${i}">${d}</button>`).join('');
    showOverlay('⚔ 群雄逐鹿 · 选君主', facRows +
      `<div class="diff-row">${diffRow}</div>`, [
      ['开 启 乱 世', () => {
        cb(selFaction, selDiff);
        hideOverlay();
      }, 'primary'],
      ['返回', () => hideOverlay()],
    ]);
    const body = $('ov-body');
    body.querySelectorAll('.fac-card').forEach(el => {
      el.onclick = () => {
        selFaction = el.dataset.f;
        body.querySelectorAll('.fac-card').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
      };
    });
    body.querySelectorAll('.diff-btn').forEach(el => {
      el.onclick = () => {
        selDiff = parseInt(el.dataset.d);
        body.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
      };
    });
  }

  /* ---- 终局 ---- */
  function showGameOver(g, over) {
    const win = over.win;
    showOverlay(win ? '👑 天下一统' : '💀 出师未捷', `
      <div style="text-align:center;font-size:11px;line-height:2.6;padding:20px 0;color:${win ? 'var(--gold)' : 'var(--blood)'}">
      ${win ? `${esc(g.factions[g.playerFaction].name)}扫平群雄!<br>天下归一,乱世终焉。<br>
        <span style="font-size:8px;color:var(--dim)">${g.year}年${g.month}月 · 历时${g.turn}月</span>`
            : `${esc(g.factions[g.playerFaction].name)}势力覆灭。<br>青山依旧在,几度夕阳红。`}
      </div>`,
      [['重新开始', () => { hideOverlay(); showTitleNew(); }, 'primary']]);
  }
  function showTitleNew() {
    $('title-screen').classList.remove('hidden');
    $('topbar').classList.add('hidden');
  }

  /* ================= 刷新 ================= */
  function refreshAll(g) {
    updateTopbar(g);
    SGMap.setState(g);
    if (selCityOpen() ) openCity(g, currentOpenCity());
  }
  let _openCity = null;
  const selCityOpen = () => !_openCity.classList.contains('hidden');
  const currentOpenCity = () => $('cp-name').textContent;

  /* ================= 导出 ================= */
  function startPlaying() {
    const g = SGGame.current();
    $('title-screen').classList.add('hidden');
    $('topbar').classList.remove('hidden');
    updateTopbar(g);
    SGMap.setState(g);
    SGMap.centerOn(500, 410, 0.95);
    /* 聚焦玩家首城 */
    const c = SGEngine.factionCities(g, g.playerFaction)[0];
    if (c) SGMap.centerOn(c.x, c.y, 1.25);
  }

  function bind() {
    _openCity = $('city-panel');
    $('cp-close').onclick = () => _openCity.classList.add('hidden');
    $('btn-endturn').onclick = endTurn;
    $('btn-menu').onclick = showMenu;
    $('btn-intel').onclick = showIntel;
    $('btn-gens').onclick = showGenerals;
    $('btn-log').onclick = () => openLog();
    $('overlay').addEventListener('click', (e) => {
      if (e.target === $('overlay') && !SGGame.current()?.gameOver) hideOverlay();
    });
  }

  return { bind, startPlaying, openCity, refreshAll, updateTopbar, showNewGame, showMenu, showLoad, showHelp, showIntel, __testBattleUI: showBattleOverlay, __testBattleStep: battleStepUI };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGUI;
