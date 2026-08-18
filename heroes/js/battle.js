/* ============================================================
 * 征服纪元 · battle.js — 战斗引擎(13×9 战场)
 * 纯逻辑无 DOM;事件流供 UI 播放,亦可快速结算
 * ============================================================ */
(function (G) {
  'use strict';
  const { CREATURES, SPELLS, battleReach, clamp } = G;
  const COLS = 13, ROWS = 9;
  let _rng = Math.random;
  const setBattleRng = (fn) => { _rng = fn; };
  const rngf = () => _rng();

  /* army: [{id, count} | null]; hero: 英雄对象或 null */
  function create(att, def, opts) {
    opts = opts || {};
    const b = {
      COLS, ROWS,
      stacks: [], cells: new Int16Array(COLS * ROWS),   /* 栈索引+1,0=空 */
      round: 0, queue: [], cur: -1,
      over: false, winner: -1,
      events: [],
      attHero: att.hero || null, defHero: def.hero || null,
      opts,
      killedHp: [0, 0],          /* 各侧击杀的敌军 HP(经验) */
      spellCast: [false, false],
    };
    const place = (army, side) => {
      const live = (army || []).filter(s => s && s.count > 0);
      const n = live.length;
      live.forEach((s, i) => {
        const row = n === 1 ? 4 : Math.round(i * (ROWS - 1) / (n - 1));
        const x = side === 0 ? 0 : COLS - 1;
        const st = mkStack(side, s.id, s.count, x, row);
        b.stacks.push(st);
        b.cells[row * COLS + x] = b.stacks.length;
      });
    };
    place(att.army, 0);
    place(def.army, 1);
    /* 战术学:前 t 支部队向前推进一格 */
    for (const [hero, side] of [[att.hero, 0], [def.hero, 1]]) {
      if (!hero) continue;
      const t = (hero.skills && hero.skills.tactics) || 0;
      let moved = 0;
      for (const st of b.stacks.filter(s => s.side === side)) {
        if (moved >= t) break;
        const nx = side === 0 ? st.x + 1 : st.x - 1;
        const from = st.y * COLS + st.x, to = st.y * COLS + nx;
        if (nx >= 0 && nx < COLS && b.cells[to] === 0) {
          b.cells[from] = 0; b.cells[to] = b.stacks.indexOf(st) + 1; st.x = nx; moved++;
        }
      }
    }
    if (opts.siegeDef) for (const st of b.stacks) if (st.side === 1) st.siegeDef = opts.siegeDef;
    newRound(b, true);
    return b;
  }

  function mkStack(side, cid, count, x, y) {
    const c = CREATURES[cid];
    return {
      side, c: cid, count, startCount: count, x, y,
      topHp: c.hp,
      buffed: {},
      retalLeft: c.flags.includes('retalAll') ? 99 : 1,
      defended: false, waited: false,
      siegeDef: 0,
    };
  }

  const alive = (b, side) => b.stacks.filter(s => s.count > 0 && (side === undefined || s.side === side));

  function effStat(b, st) {
    const c = CREATURES[st.c];
    let att = c.att, def = c.def, spd = c.spd;
    const hero = st.side === 0 ? b.attHero : b.defHero;
    if (hero) { att += hero.att; def += hero.def; }
    if (st.siegeDef) def += st.siegeDef;
    if (st.defended) def = Math.round(def * 1.3);
    const bf = st.buffed;
    if (bf.defPct) def = Math.round(def * (1 + bf.defPct / 100));
    if (bf.spd) spd = Math.max(1, spd + bf.spd);
    return { att, def, spd };
  }
  const isShooter = (st) => CREATURES[st.c].flags.includes('shooter');
  const isFlyer = (st) => CREATURES[st.c].flags.includes('flyer');
  const adj = (x1, y1, x2, y2) => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) === 1;

  function newRound(b, first) {
    for (const st of b.stacks) {
      st.retalLeft = CREATURES[st.c].flags.includes('retalAll') ? 99 : 1;
      st.defended = false; st.waited = false;
      if (st.buffed.blind) {                 /* 失明最多持续 3 回合 */
        st.blindLeft = (st.blindLeft || 3) - 1;
        if (st.blindLeft <= 0) { delete st.buffed.blind; st.blindLeft = 0; }
      }
    }
    b.spellCast = [false, false];
    if (b.round > 400) {                     /* 保险丝:超长战斗判剩余战力多者胜 */
      b.over = true;
      const p0 = alive(b, 0).reduce((n, s) => n + s.count * CREATURES[s.c].hp, 0);
      const p1 = alive(b, 1).reduce((n, s) => n + s.count * CREATURES[s.c].hp, 0);
      b.winner = p0 >= p1 ? 0 : 1;
      b.events.push({ t: 'end', winner: b.winner });
      return;
    }
    b.queue = alive(b).sort((a, c2) => {
      const sa = effStat(b, a).spd, sc = effStat(b, c2).spd;
      if (sa !== sc) return sc - sa;
      return a.side - c2.side;
    }).map(s => b.stacks.indexOf(s));
    b.round = first ? 1 : b.round + 1;
    b.events.push({ t: 'round', n: b.round });
    nextTurn(b);
  }

  function nextTurn(b) {
    if (b.over) return;
    for (;;) {
      const idx = b.queue.shift();
      if (idx === undefined) { newRound(b); return; }
      const st = b.stacks[idx];
      if (!st || st.count <= 0) continue;
      if (st.buffed.blind) { b.events.push({ t: 'skip', s: idx }); continue; }
      b.cur = idx;
      b.reachCache = null;
      return;
    }
  }

  function reach(b, st) {
    if (b.reachCache && b.reachCache.for === st) return b.reachCache.d;
    let d;
    if (isFlyer(st)) {
      d = new Int16Array(COLS * ROWS).fill(-1);
      const spd = effStat(b, st).spd;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (b.cells[y * COLS + x] === 0 && Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) <= spd) d[y * COLS + x] = 1;
      }
    } else {
      d = battleReach(b.cells, COLS, ROWS, st.x, st.y, effStat(b, st).spd, false);
    }
    b.reachCache = { for: st, d };
    return d;
  }

  /* ---------- 伤害 ---------- */
  function calcDamage(b, atkSt, defSt, opts) {
    opts = opts || {};
    const ac = CREATURES[atkSt.c];
    const A = effStat(b, atkSt), D = effStat(b, defSt);
    let roll = ac.d0 + Math.floor(rngf() * (ac.d1 - ac.d0 + 1));
    if (atkSt.buffed.bless) roll = ac.d1;
    let dmg = roll * atkSt.count;
    const diff = clamp(A.att - D.def, -15, 40);
    dmg *= 1 + 0.05 * diff;
    const hero = atkSt.side === 0 ? b.attHero : b.defHero;
    const enemyHero = atkSt.side === 0 ? b.defHero : b.attHero;
    if (hero) {
      if (opts.ranged) {
        const ar = (hero.skills && hero.skills.archery) || 0;
        dmg *= 1 + [0, 0.25, 0.5, 1.0][ar];
      } else {
        const of = (hero.skills && hero.skills.offense) || 0;
        dmg *= 1 + [0, 0.1, 0.2, 0.3][of];
      }
      if (hero.dmgPct) dmg *= 1 + hero.dmgPct / 100;
      if (opts.ranged && hero.rangedPct) dmg *= 1 + hero.rangedPct / 100;
    }
    if (enemyHero) {
      const am = (enemyHero.skills && enemyHero.skills.armorer) || 0;
      if (am) dmg *= 1 - [0, 0.1, 0.2, 0.3][am];
    }
    if (!opts.ranged && !opts.isRetal && defSt.buffed.shield) dmg *= 1 - defSt.buffed.shield / 100;
    if (opts.ranged) {
      const dist = Math.max(Math.abs(atkSt.x - defSt.x), Math.abs(atkSt.y - defSt.y));
      if (dist > 8) dmg *= 0.6;
    }
    if (!opts.ranged && !opts.isRetal && ac.flags.includes('charge') && opts.chargeDist) {
      dmg *= 1 + Math.min(0.8, opts.chargeDist * 0.08);
    }
    return Math.max(1, Math.round(dmg));
  }

  /* 将 dmg 应用到栈:返回击杀数 */
  function applyDamage(b, st, dmg) {
    const c = CREATURES[st.c];
    const idx = b.stacks.indexOf(st);
    if (st.buffed.blind) delete st.buffed.blind;
    let kills = 0;
    if (dmg >= st.topHp) {
      const rem = dmg - st.topHp;                 /* 溢出到后续单位的伤害 */
      kills = Math.min(st.count, 1 + Math.floor(rem / c.hp));
      st.count -= kills;
      if (st.count > 0) {
        const left = rem % c.hp;
        st.topHp = left === 0 ? c.hp : c.hp - left;
      } else {
        st.count = 0; st.topHp = 0;
        b.cells[st.y * COLS + st.x] = 0;
      }
    } else {
      st.topHp -= dmg;
    }
    b.killedHp[st.side === 0 ? 1 : 0] += dmg;
    b.events.push({ t: 'dmg', s: idx, dmg, kills, left: st.count });
    return kills;
  }

  /* ---------- 动作 ---------- */
  function doMove(b, x, y) {
    const st = b.stacks[b.cur];
    const d = reach(b, st);
    if (d[y * COLS + x] < 0 || b.cells[y * COLS + x] !== 0) return false;
    b.cells[st.y * COLS + st.x] = 0;
    st.x = x; st.y = y;
    b.cells[y * COLS + x] = b.cur + 1;
    b.events.push({ t: 'move', s: b.cur, x, y });
    endAction(b);
    return true;
  }

  function doAttack(b, targetIdx) {
    const st = b.stacks[b.cur];
    const tg = b.stacks[targetIdx];
    if (!st || !tg || tg.count <= 0 || tg.side === st.side) return false;
    const shooterAdjacent = isShooter(st) && adj(st.x, st.y, tg.x, tg.y);
    const ox = st.x, oy = st.y;
    if (!adj(st.x, st.y, tg.x, tg.y)) {
      const d = reach(b, st);
      let best = null, bestD = Infinity;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (!adj(x, y, tg.x, tg.y) || b.cells[y * COLS + x] !== 0 || d[y * COLS + x] < 0) continue;
        if (d[y * COLS + x] < bestD) { bestD = d[y * COLS + x]; best = { x, y }; }
      }
      if (!best) return false;
      b.cells[st.y * COLS + st.x] = 0;
      st.x = best.x; st.y = best.y;
      b.cells[best.y * COLS + best.x] = b.cur + 1;
      b.events.push({ t: 'move', s: b.cur, x: best.x, y: best.y });
    }
    b.events.push({ t: 'attack', s: b.cur, tgt: targetIdx });
    let dmg = calcDamage(b, st, tg, { chargeDist: Math.max(Math.abs(ox - tg.x), Math.abs(oy - tg.y)) });
    if (shooterAdjacent) dmg = Math.max(1, Math.round(dmg / 2));
    applyDamage(b, tg, dmg);
    /* 吸血:恢复自身(可复活至初始数量) */
    const ac = CREATURES[st.c];
    if (ac.flags.includes('drain') && st.count > 0) {
      const heal = Math.round(dmg * 0.5);
      let total = (st.count - 1) * ac.hp + st.topHp + heal;
      let nc = Math.floor(total / ac.hp) + (total % ac.hp ? 1 : 0);
      nc = clamp(nc, st.count, st.startCount);
      st.count = nc;
      st.topHp = clamp(total - (nc - 1) * ac.hp, 1, ac.hp);
      b.events.push({ t: 'drain', s: b.cur, heal });
    }
    /* 反击 */
    if (tg.count > 0 && st.count > 0 && tg.retalLeft > 0 && !ac.flags.includes('noRetal')) {
      tg.retalLeft--;
      b.events.push({ t: 'retal', s: targetIdx, tgt: b.cur });
      applyDamage(b, st, calcDamage(b, tg, st, { isRetal: true }));
    }
    endAction(b);
    return true;
  }

  function doShoot(b, targetIdx) {
    const st = b.stacks[b.cur];
    const tg = b.stacks[targetIdx];
    if (!st || !tg || tg.count <= 0 || tg.side === st.side || !isShooter(st)) return false;
    if (adj(st.x, st.y, tg.x, tg.y)) return doAttack(b, targetIdx);
    b.events.push({ t: 'shoot', s: b.cur, tgt: targetIdx });
    applyDamage(b, tg, calcDamage(b, st, tg, { ranged: true }));
    endAction(b);
    return true;
  }

  function doDefend(b) {
    b.stacks[b.cur].defended = true;
    b.events.push({ t: 'defend', s: b.cur });
    endAction(b);
    return true;
  }

  function doWait(b) {
    const st = b.stacks[b.cur];
    if (st.waited) return doDefend(b);
    st.waited = true;
    b.queue.push(b.cur);
    b.events.push({ t: 'wait', s: b.cur });
    nextTurn(b);
    return true;
  }

  /* ---------- 英雄魔法 ---------- */
  function canCast(b, side) {
    const h = side === 0 ? b.attHero : b.defHero;
    return !!h && !b.spellCast[side] && !b.over;
  }

  function castSpell(b, side, spellId, targetIdx) {
    if (!canCast(b, side)) return false;
    const h = side === 0 ? b.attHero : b.defHero;
    const sp = SPELLS[spellId];
    if (!sp || !h.spells || !h.spells.includes(spellId)) return false;
    if ((h.mana || 0) < sp.mp) return false;
    const needTarget = !sp.target.endsWith('All');
    const tg = b.stacks[targetIdx];
    if (needTarget && (!tg || tg.count <= 0)) return false;
    if (needTarget && sp.target === 'enemy' && tg.side === side) return false;
    if (needTarget && sp.target === 'own' && tg.side !== side) return false;
    if (sp.type === 'dispel' && needTarget === false) return false;

    h.mana -= sp.mp;
    b.spellCast[side] = true;
    const sorc = (h.skills && h.skills.sorcery) || 0;
    b.events.push({ t: 'spell', side, spell: spellId });
    const enemyResist = (st) => {
      const eh = st.side === 0 ? b.attHero : b.defHero;
      return (eh && eh.res) || 0;
    };
    if (sp.type === 'damage') {
      const base = sp.dmg[0] + sp.dmg[1] * h.pow * (1 + [0, 0.15, 0.3, 0.45][sorc]);
      let targets = [];
      if (sp.chain) {
        targets = alive(b).filter(s => s.side !== side).sort((a, c) => c.count - a.count).slice(0, sp.chain);
      } else if (sp.aoe) {
        targets = alive(b).filter(s => s.side !== side && Math.abs(s.x - tg.x) <= sp.aoe && Math.abs(s.y - tg.y) <= sp.aoe);
      } else {
        targets = [tg];
      }
      if (!targets.length) { h.mana += sp.mp; b.spellCast[side] = false; return false; }
      targets.forEach((t2, i) => {
        let dmg = base * (sp.chain ? Math.pow(0.5, i) : 1);
        const r = enemyResist(t2);
        if (r) dmg *= 1 - r / 100;
        applyDamage(b, t2, Math.max(1, Math.round(dmg)));
      });
    } else if (sp.type === 'heal') {
      const c = CREATURES[tg.c];
      const heal = sp.dmg[0] + sp.dmg[1] * h.pow;
      let total = (tg.count - 1) * c.hp + tg.topHp + heal;
      let nc = Math.floor(total / c.hp) + (total % c.hp ? 1 : 0);
      tg.count = clamp(nc, tg.count, tg.startCount);
      tg.topHp = clamp(total - (tg.count - 1) * c.hp, 1, c.hp);
      b.events.push({ t: 'heal', s: targetIdx });
      if (sp.id === 'cure') tg.buffed = {};
    } else if (sp.type === 'buff' || sp.type === 'debuff') {
      const apply = (t2) => { for (const k of Object.keys(sp.buff)) { t2.buffed[k] = sp.buff[k]; if (sp.buff.blind) t2.blindLeft = 3; } };
      if (sp.target.endsWith('All')) {
        alive(b).filter(s => sp.type === 'buff' ? s.side === side : s.side !== side).forEach(apply);
      } else apply(tg);
    } else if (sp.type === 'dispel') {
      tg.buffed = {};
    } else if (sp.type === 'summon') {
      const count = 1 + Math.floor(h.pow / 4);
      let placed = false;
      for (let dy = 0; dy < ROWS && !placed; dy++) {
        for (let dx = 0; dx < 4 && !placed; dx++) {
          const x = side === 0 ? 1 + dx : COLS - 2 - dx;
          const y = (4 + dy + b.stacks.length) % ROWS;
          if (b.cells[y * COLS + x] === 0) {
            const st = mkStack(side, 'elemental', count, x, y);
            st.summoned = true;
            b.stacks.push(st);
            b.cells[y * COLS + x] = b.stacks.length;
            b.queue.push(b.stacks.length - 1);
            b.events.push({ t: 'summon', s: b.stacks.length - 1, n: count });
            placed = true;
          }
        }
      }
      if (!placed) { h.mana += sp.mp; b.spellCast[side] = false; return false; }
    }
    checkOver(b);
    return true;
  }

  function endAction(b) {
    b.reachCache = null;
    checkOver(b);
    if (!b.over) nextTurn(b);
  }

  function checkOver(b) {
    if (b.over) return;
    const a0 = alive(b, 0).length, a1 = alive(b, 1).length;
    if (a0 === 0 || a1 === 0) {
      b.over = true;
      b.winner = a0 === 0 ? (a1 === 0 ? 0 : 1) : 0;  /* 同归于尽判攻方胜 */
      b.events.push({ t: 'end', winner: b.winner });
    }
  }

  /* 幸存部队(同兵种合并;召唤物消散) */
  function survivors(b) {
    const out = [[], []];
    const map = [{}, {}];
    for (const st of b.stacks) {
      if (st.count <= 0 || st.summoned) continue;
      const m = map[st.side];
      if (!m[st.c]) { m[st.c] = { id: st.c, count: 0 }; out[st.side].push(m[st.c]); }
      m[st.c].count += st.count;
    }
    out[0].sort((a, b2) => b2.count - a.count);
    out[1].sort((a, b2) => b2.count - a.count);
    return out;
  }

  G.Battle = {
    create, mkStack, effStat, reach, adj, alive, isShooter, isFlyer,
    doMove, doAttack, doShoot, doDefend, doWait,
    castSpell, canCast,
    checkOver, survivors, endAction, nextTurn, newRound,
    calcDamage, applyDamage,
    setBattleRng, rngf,
  };
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
