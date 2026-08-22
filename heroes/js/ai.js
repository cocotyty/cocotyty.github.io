/* ============================================================
 * 征服纪元 · ai.js — 策略AI + 战场AI
 * 无 DOM 依赖
 * ============================================================ */
(function (G) {
  'use strict';
  const { CREATURES, SPELLS, ARTIFACTS, unitPower, FACTIONS } = G;

  /* ==================== 战场AI ==================== */
  /* 战斗调度:防守方是玩家且 UI 注册了防守钩子 → 交给玩家亲自指挥 */
  function runBattle(game, b, need) {
    const defHuman = (b.defHero && b.defHero.owner === 0) ||
      (need && need.kind === 'town' && need.obj && need.obj.owner === 0);
    if (defHuman && game.uiHooks && game.uiHooks.defendBattle) {
      return game.uiHooks.defendBattle(b, need);
    }
    return playBattle(game, b);
  }

  function playBattle(game, b) {
    let guard = 0, lastRound = b.round;
    while (!b.over && guard++ < 1200) {
      if (b.round !== lastRound) { lastRound = b.round; }
      /* 双方英雄每轮尝试施法 */
      for (const side of [0, 1]) {
        const h = side === 0 ? b.attHero : b.defHero;
        if (h && !b.spellCast[side] && !b.over) aiCastSpell(b, side);
      }
      if (b.over) break;
      const st = b.stacks[b.cur];
      if (!st || st.count <= 0) { G.Battle.nextTurn(b); continue; }
      aiActStack(b, st);
    }
    if (!b.over) { /* 保险:强制结束,判单位多者胜 */
      const a0 = G.Battle.alive(b, 0).reduce((n, s) => n + s.count, 0);
      const a1 = G.Battle.alive(b, 1).reduce((n, s) => n + s.count, 0);
      b.over = true; b.winner = a0 >= a1 ? 0 : 1;
      b.events.push({ t: 'end', winner: b.winner });
    }
  }

  const B = () => G.Battle;

  function estDamage(b, atk, def, ranged) {
    const ac = CREATURES[atk.c];
    const A = B().effStat(b, atk), D = B().effStat(b, def);
    const roll = atk.buffed.bless ? ac.d1 : (ac.d0 + ac.d1) / 2;
    let dmg = roll * atk.count * (1 + 0.05 * G.clamp(A.att - D.def, -15, 40));
    if (ranged) dmg *= 0.9;
    return Math.max(1, dmg);
  }
  const stackValue = (st) => unitPower(st.c) * st.count;
  const targetScore = (st) => {
    const c = CREATURES[st.c];
    let v = unitPower(st.c);
    if (c.flags.includes('shooter')) v *= 1.4;
    if (c.flags.includes('drain')) v *= 1.15;
    return v;
  };

  function aiActStack(b, st) {
    const enemies = B().alive(b, 1 - st.side);
    if (!enemies.length) { B().endAction(b); return; }
    const isShooter = CREATURES[st.c].flags.includes('shooter');
    const adjEnemy = enemies.find(e => B().adj(st.x, st.y, e.x, e.y));

    if (isShooter && !adjEnemy) {
      let best = null, bestScore = -1;
      for (const e of enemies) {
        const dmg = estDamage(b, st, e, true);
        const kills = Math.min(e.count, dmg / CREATURES[e.c].hp);
        const score = kills * targetScore(e) + Math.max(0, dmg - kills * CREATURES[e.c].hp) * 0.3;
        if (score > bestScore) { bestScore = score; best = e; }
      }
      B().doShoot(b, b.stacks.indexOf(best));
      return;
    }
    /* 近战(含被贴身的射手) */
    const d = B().reach(b, st);
    let best = null, bestScore = -1, bestAdjNow = false;
    for (const e of enemies) {
      let hasAdj = B().adj(st.x, st.y, e.x, e.y);
      if (!hasAdj) {
        for (let y = 0; y < b.ROWS && !hasAdj; y++) for (let x = 0; x < b.COLS; x++) {
          if (B().adj(x, y, e.x, e.y) && d[y * b.COLS + x] >= 0) { hasAdj = true; break; }
        }
      }
      if (!hasAdj) continue;
      const dmg = estDamage(b, st, e, false) * (isShooter ? 0.5 : 1);
      const kills = Math.min(e.count, dmg / CREATURES[e.c].hp);
      /* 预估反击伤害 */
      const retal = B().adj(st.x, st.y, e.x, e.y) ? estDamage(b, e, st, false) : estDamage(b, e, st, false) * 0.5;
      const myHp = CREATURES[st.c].hp;
      let score = kills * targetScore(e) + (dmg - kills * CREATURES[e.c].hp) * 0.25 - (retal / myHp) * unitPower(st.c) * 0.18;
      if (score > bestScore) { bestScore = score; best = e; bestAdjNow = B().adj(st.x, st.y, e.x, e.y); }
    }
    if (best) { B().doAttack(b, b.stacks.indexOf(best)); return; }
    /* 无法攻击:向最优敌人靠近 */
    let tgt = null, tv = -1;
    for (const e of enemies) { const v = targetScore(e) / (1 + Math.abs(e.x - st.x) + Math.abs(e.y - st.y)); if (v > tv) { tv = v; tgt = e; } }
    if (!tgt) { B().doDefend(b); return; }
    let bestCell = null, bd = Infinity;
    for (let y = 0; y < b.ROWS; y++) for (let x = 0; x < b.COLS; x++) {
      if (b.cells[y * b.COLS + x] !== 0 || d[y * b.COLS + x] < 0) continue;
      const dist = Math.max(Math.abs(x - tgt.x), Math.abs(y - tgt.y));
      if (dist < bd) { bd = dist; bestCell = { x, y }; }
    }
    if (bestCell && (bestCell.x !== st.x || bestCell.y !== st.y)) B().doMove(b, bestCell.x, bestCell.y);
    else B().doDefend(b);
  }

  function aiCastSpell(b, side) {
    const h = side === 0 ? b.attHero : b.defHero;
    if (!h || !h.spells || !h.spells.length) return;
    const enemies = B().alive(b, 1 - side);
    const friends = B().alive(b, side);
    if (!enemies.length || !friends.length) return;
    const mana = h.mana || 0;
    let best = null, bestScore = 0;
    const consider = (spellId, score, targetIdx) => {
      if (score > bestScore && mana >= SPELLS[spellId].mp) { bestScore = score; best = { spellId, targetIdx }; }
    };
    for (const spId of h.spells) {
      const sp = SPELLS[spId];
      if (sp.mp > mana) continue;
      if (sp.type === 'damage') {
        const base = sp.dmg[0] + sp.dmg[1] * h.pow;
        if (sp.chain) {
          const t3 = enemies.slice().sort((a, c) => c.count - a.count).slice(0, sp.chain);
          let dmg = 0;
          t3.forEach((t2, i) => dmg += base * Math.pow(0.5, i));
          consider(spId, dmgScore(dmg, t3[0]), b.stacks.indexOf(t3[0]));
        } else if (sp.aoe) {
          for (const e of enemies) {
            const hits = enemies.filter(e2 => Math.abs(e2.x - e.x) <= sp.aoe && Math.abs(e2.y - e.y) <= sp.aoe);
            let dmg = base * hits.length;
            consider(spId, dmgScore(dmg, e), b.stacks.indexOf(e));
          }
        } else {
          for (const e of enemies) consider(spId, dmgScore(base, e), b.stacks.indexOf(e));
        }
      } else if (sp.type === 'buff') {
        for (const f2 of friends) {
          let s2 = 0;
          if (sp.buff.bless) s2 = f2.count * (CREATURES[f2.c].d1 - CREATURES[f2.c].d0) * 1.2;
          else if (sp.buff.shield) s2 = f2.count * CREATURES[f2.c].hp * 0.12;
          else if (sp.buff.spd > 0) s2 = friends.length * 22;
          else s2 = 25;
          if (sp.target.endsWith('All')) { consider(spId, s2 * friends.length * 0.5, -1); break; }
          consider(spId, s2, b.stacks.indexOf(f2));
        }
      } else if (sp.type === 'debuff') {
        for (const e of enemies) {
          let s2 = sp.buff.blind ? stackValue(e) * 0.5 : e.count * 10;
          if (sp.target.endsWith('All')) { consider(spId, s2 * enemies.length * 0.5, -1); break; }
          consider(spId, s2, b.stacks.indexOf(e));
        }
      } else if (sp.type === 'heal') {
        for (const f2 of friends) {
          const c = CREATURES[f2.c];
          const missing = (f2.startCount - f2.count) * c.hp + (c.hp - f2.topHp);
          if (missing > c.hp) consider(spId, Math.min(missing, sp.dmg[0] + sp.dmg[1] * h.pow) * 0.4, b.stacks.indexOf(f2));
        }
      } else if (sp.type === 'summon') {
        consider(spId, (1 + Math.floor(h.pow / 4)) * unitPower('elemental'), -1);
      }
    }
    if (best) {
      const sp = SPELLS[best.spellId];
      if (sp.target.endsWith('All')) {
        /* 群体:选一个占位目标(引擎按目标类型全体生效) */
        const list = sp.target.startsWith('enemy') ? enemies : friends;
        if (list.length) G.Battle.castSpell(b, side, best.spellId, b.stacks.indexOf(list[0]));
      } else {
        G.Battle.castSpell(b, side, best.spellId, best.targetIdx);
      }
    }
    function dmgScore(dmg, target) {
      if (!target) return 0;
      const c = CREATURES[target.c];
      const kills = Math.min(target.count, dmg / c.hp);
      return kills * targetScore(target) + 8;
    }
  }

  /* ==================== 战略AI ==================== */
  async function playTurn(game) {
    const p = game.players[game.curPlayer];
    if (p.defeated || p.isHuman) return;
    /* 0. 市场:卖出富余资源换金币,或为紧缺资源补货 */
    aiTrade(game, p);
    /* 1. 建设 */
    for (const t of G.Game.ownTowns(game, p.id)) tryBuild(game, p, t);
    /* 2. 招募英雄(没有英雄必须立刻补;有钱多养几路大军) */
    const towns = G.Game.ownTowns(game, p.id);
    const heroes = G.Game.ownHeroes(game, p.id);
    if (towns.length && !heroes.length && p.resources.gold >= 2500) {
      G.Game.hireHero(game, towns[0], 0);
    } else if (towns.length && heroes.length < 5 && p.resources.gold > Math.max(9000, 2500 * (heroes.length + 1))) {
      G.Game.hireHero(game, towns[0], 0);
    }
    /* 3. 招募部队 */
    for (const t of towns) tryRecruit(game, p, t);
    /* 3.5 同格友军集结:副英雄把兵交给主英雄 */
    const byTile = {};
    for (const h of G.Game.ownHeroes(game, p.id)) {
      const k = h.x + ',' + h.y;
      (byTile[k] = byTile[k] || []).push(h);
    }
    for (const k of Object.keys(byTile)) {
      const group = byTile[k].sort((a, b2) => G.Game.armyPower(b2.army) - G.Game.armyPower(a.army));
      const main = group[0];
      for (const sub of group.slice(1)) {
        for (const s of sub.army) {
          if (s && s.count > 0) {
            const left = G.Game.armyAdd(main.army, s.id, s.count);
            s.count = left;
          }
        }
      }
    }
    /* 4. 英雄行动 */
    for (const h of G.Game.ownHeroes(game, p.id)) {
      let acts = 0;
      while (acts++ < 8) {
        if (h.dead || h.moveLeft < 60) break;
        const more = await heroAct(game, p, h);
        if (!more) break;
      }
      if (!h.dead) h.path = h.path && h.path.length ? h.path : null;
    }
  }

  /* ---- 市场交易 ---- */
  function aiTrade(game, p) {
    const towns = G.Game.ownTowns(game, p.id).filter(t => t.buildings.includes('marketplace'));
    if (!towns.length) return;
    const r = p.resources;
    /* 卖出富余:木材/矿石保留 25,稀有保留 6 */
    for (const res of ['wood', 'ore']) {
      const excess = r[res] - 25;
      if (excess > 5) G.Game.trade(game, p.id, res, 'gold', excess);
    }
    for (const res of ['mercury', 'sulfur', 'crystal', 'gems']) {
      const excess = r[res] - 6;
      if (excess > 2) G.Game.trade(game, p.id, res, 'gold', excess);
    }
    /* 金币充足且缺基础资源(为高级兵营)时购入 */
    if (r.gold > 6000) {
      for (const res of ['wood', 'ore']) {
        if (r[res] < 12) {
          const need = 12 - r[res];
          const goldNeed = Math.ceil(need / G.Game.marketRate(game, p.id, 'gold', res));
          if (goldNeed > 0 && r.gold - goldNeed > 4000) G.Game.trade(game, p.id, 'gold', res, goldNeed);
        }
      }
    }
  }

  /* ---- 建设决策 ---- */
  const BUILD_PRIORITY = {
    dw1: 90, dw2: 86, dw3: 82, marketplace: 78, tavern: 76, fort: 72, dw4: 70,
    townHall: 62, mage1: 58, dw5: 55, silo: 42, citadel: 52, dw6: 50,
    cityHall: 46, mage2: 34, mage3: 30, mage4: 28, mage5: 26, castleB: 38, dw7: 36, capitol: 32,
  };
  function tryBuild(game, p, town) {
    if (town.builtToday) return;
    /* 无英雄时优先攒钱雇英雄 */
    const heroless = G.Game.ownHeroes(game, p.id).length === 0;
    const goldReserve = heroless ? 2600 : 0;
    const pers = p.personality === 'aggressive' ? { dw: 8, eco: -4 } : p.personality === 'economic' ? { dw: -3, eco: 8 } : { dw: 0, eco: 0 };
    const list = G.Game.townBuildingList(town).map(def => {
      let pr = BUILD_PRIORITY[def.id];
      if (pr === undefined) pr = def.special ? 40 : 20;
      if (def.id.startsWith('dw')) pr += pers.dw;
      if (['townHall', 'cityHall', 'capitol', 'silo', 'marketplace'].includes(def.id)) pr += pers.eco;
      if (def.id.startsWith('mage') && !town.buildings.includes('mage1') && !hasMagicHero(game, town.owner)) pr -= 30;
      return { def, pr };
    }).sort((a, b2) => b2.pr - a.pr);
    for (const { def } of list) {
      if (G.Game.canBuildNow(game, town, def.id).ok && p.resources.gold - (def.cost.gold || 0) >= goldReserve) {
        G.Game.build(game, town, def.id);
        return;
      }
    }
  }
  const hasMagicHero = (game, pid) => game.heroes.some(h => h.owner === pid && !h.dead && h.cls === 'magic');

  /* ---- 招募 ---- */
  function tryRecruit(game, p, town) {
    const heroesHere = G.Game.ownHeroes(game, p.id).filter(h => h.x === town.x && h.y === town.y);
    const carrier = heroesHere.sort((a, b2) => G.Game.armyPower(b2.army) - G.Game.armyPower(a.army))[0] || null;
    const cids = Object.keys(town.pool).filter(c => town.pool[c] > 0)
      .sort((a, b2) => CREATURES[b2].tier - CREATURES[a].tier);
    for (const cid of cids) {
      const c = CREATURES[cid];
      let want = Math.min(town.pool[cid], Math.floor(Math.max(0, p.resources.gold - 1500) / Math.max(1, c.cost)));
      if (want <= 0) continue;
      /* 无 英雄在城时:驻军若已满,用更强的兵替换最弱一队 */
      if (!carrier) {
        const slots = town.garrison.filter(s => s && s.count > 0);
        if (slots.length >= 7) {
          const weakest = slots.sort((a, b2) => a.count * unitPower(a.id) - b2.count * unitPower(b2.id))[0];
          if (weakest.count * unitPower(weakest.id) < want * unitPower(cid)) {
            town.garrison[town.garrison.indexOf(weakest)] = null;
          } else continue;
        }
      }
      const got = G.Game.recruit(game, town, cid, want, carrier);
      if (got <= 0 && carrier) break;
    }
    /* 地盘大时从驻军抽兵给英雄(留 2 队守城) */
    if (carrier && G.Game.ownTowns(game, p.id).length >= 4) {
      const gar = town.garrison.map((s, i) => ({ s, i })).filter(x => x.s && x.s.count > 0)
        .sort((a, b2) => b2.s.count * unitPower(b2.s.id) - a.s.count * unitPower(a.s.id));
      for (let gi = 0; gi < gar.length - 2; gi++) {
        const st = gar[gi].s;
        const left = G.Game.armyAdd(carrier.army, st.id, st.count);
        st.count = left;
        if (left === st.count) break;
      }
      town.garrison = town.garrison.map(s => s && s.count > 0 ? s : null);
    }
  }
  /* ---- 英雄行动 ---- */
  async function heroAct(game, p, hero) {
    /* 驻防期:刚占下的城守两天 */
    if (hero.garrisonUntil && game.day <= hero.garrisonUntil && hero.anchorTown) {
      const t = game.objects.find(o => o.id === hero.anchorTown);
      if (t && t.owner === p.id && hero.x === t.x && hero.y === t.y) {
        tryRecruit(game, p, t);
        return false;
      }
    }
    const myPower = G.Game.armyPower(hero.army) * (1 + 0.06 * (hero.att + hero.def));
    const towns = G.Game.ownTowns(game, p.id);
    /* 空军队:紧急回最近的城取兵 */
    if (G.Game.armyCount(hero.army) === 0 && towns.length) {
      const home = towns.sort((a, b2) => dist2(a, hero) - dist2(b2, hero))[0];
      const path = G.findPath(game, hero, hero.x, hero.y, home.x, home.y);
      if (path && path.path.length) {
        hero.path = path.path;
        const r = await G.Game.moveAlong(game, hero, (b, h2, need) => runBattle(game, b, need));
        if (r.status === 'wait' && r.need && r.need.type === 'town') tryRecruit(game, p, r.need.obj);
        if (hero.x === home.x && hero.y === home.y) tryRecruit(game, p, home);
        return !hero.dead && G.Game.armyCount(hero.army) > 0;
      }
    }
    /* 威胁规避:附近有更强的敌方英雄 → 回城 */
    const threats = game.heroes.filter(h => !h.dead && h.owner !== p.id &&
      Math.max(Math.abs(h.x - hero.x), Math.abs(h.y - hero.y)) <= 4);
    for (const th of threats) {
      const thPower = G.Game.armyPower(th.army) * (1 + 0.06 * (th.att + th.def));
      if (thPower > myPower * 1.05 && towns.length) {
        const home = towns.sort((a, b2) => dist2(a, hero) - dist2(b2, hero))[0];
        const path = G.findPath(game, hero, hero.x, hero.y, home.x, home.y);
        if (path) {
          hero.path = path.path;
          await G.Game.moveAlong(game, hero, (b, h2, need) => runBattle(game, b, need));
          return !hero.dead;
        }
      }
    }
    /* 目标评估:先用距离场粗筛,只对最优候选跑 A* */
    const dist = G.distanceField(game, hero, hero.x, hero.y);
    const W = game.map.w;
    const reachCost = (x, y) => dist[y * W + x];
    const maxMove = Math.max(1, G.Game.heroMaxMove(hero));
    const cands = [];
    for (const o of game.objects) {
      const val = objValue(game, p, hero, o, myPower);
      if (val.v <= 0) continue;
      const c = reachCost(o.x, o.y);
      if (!isFinite(c)) continue;
      if (val.risk && myPower < val.need) continue;
      const days = 1 + c / maxMove;
      cands.push({ o, score: val.v / (0.6 + days) });
    }
    /* 敌方英雄目标 */
    for (const th of game.heroes) {
      if (th.dead || th.owner === p.id) continue;
      const c = reachCost(th.x, th.y);
      if (!isFinite(c)) continue;
      const thPower = G.Game.armyPower(th.army) * (1 + 0.06 * (th.att + th.def));
      if (myPower < thPower * 1.4) continue;
      const days = 1 + c / maxMove;
      cands.push({ heroTarget: th, score: 700 / (0.6 + days) });
    }
    cands.sort((a, b2) => b2.score - a.score);
    let best = null;
    for (const cand of cands.slice(0, 10)) {
      const tx = cand.o ? cand.o.x : cand.heroTarget.x;
      const ty = cand.o ? cand.o.y : cand.heroTarget.y;
      const steps = G.findPath(game, hero, hero.x, hero.y, tx, ty);
      if (!steps || !steps.path.length) continue;
      /* 沿途怪物战力评估:打不过就放弃该路线 */
      let danger = 0;
      for (const step of steps.path) {
        const o = game.objAt[step.y * game.map.w + step.x];
        if (o && o.type === 'monster') danger += o.n * unitPower(o.c) * 1.15;
      }
      if (danger > 0 && myPower < danger * 1.3) continue;
      best = cand; best.steps = steps;
      break;
    }
    if (G.AI._dbg) G.AI._dbg(hero, cands, best, myPower);
    if (best) {
      hero.path = best.steps.path;
      const bx = hero.x, by = hero.y;
      const r = await G.Game.moveAlong(game, hero, (b, h2, need) => runBattle(game, b, need));
      if (G.AI._dbgMove) G.AI._dbgMove(hero, best, r, bx, by);
      /* 到达己方城镇立即补充兵力 */
      if (!hero.dead) {
        const o = game.objAt[hero.y * game.map.w + hero.x];
        if (o && o.type === 'town' && o.owner === p.id) tryRecruit(game, p, o);
      }
      if (r.status === 'done' || r.status === 'wait') return hero.moveLeft >= 60 && !hero.dead;
      return false;
    }
    /* 无目标:回最近的城或向最近的中立城进发 */
    if (towns.length) {
      const home = towns.sort((a, b2) => dist2(a, hero) - dist2(b2, hero))[0];
      if (Math.max(Math.abs(home.x - hero.x), Math.abs(home.y - hero.y)) > 1) {
        const path = G.findPath(game, hero, hero.x, hero.y, home.x, home.y);
        if (path) {
          hero.path = path.path;
          await G.Game.moveAlong(game, hero, (b, h2, need) => runBattle(game, b, need));
          return false;
        }
      }
    }
    return false;
  }
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  function objValue(game, p, hero, o, myPower) {
    const pid = p.id;
    /* 前两周更谨慎,避免开局自杀式进攻 */
    const fightNeed = (armyPower) => armyPower * (game.day < 14 ? 1.6 : 1.4);
    switch (o.type) {
      case 'goldmine': {
        if (o.owner === pid) return { v: 0 };
        const need = o.guard ? fightNeed(o.guard.n * unitPower(o.guard.c), 0) : 0;
        return { v: o.owner === -1 ? 380 : 420, risk: !!o.guard, need };
      }
      case 'sawmill': case 'orepit': {
        if (o.owner === pid) return { v: 0 };
        const need = o.guard ? fightNeed(o.guard.n * unitPower(o.guard.c)) : 0;
        return { v: o.owner === -1 ? 260 : 300, risk: !!o.guard, need };
      }
      case 'alchlab': case 'sulfurdune': case 'crystallcave': case 'gempond': {
        if (o.owner === pid) return { v: 0 };
        const need = o.guard ? fightNeed(o.guard.n * unitPower(o.guard.c)) : 0;
        return { v: o.owner === -1 ? 300 : 340, risk: !!o.guard, need };
      }
      case 'pileGold': return { v: Math.min(150, o.n / 12) };
      case 'pileWood': case 'pileOre': return { v: 55 };
      case 'pileRare': return { v: 70 };
      case 'chest': return { v: 110 };
      case 'campfire': return { v: 90 };
      case 'artifact': return { v: 240 };
      case 'learnstone': return o.used ? { v: 0 } : { v: 70 };
      case 'shrine': return o.used ? { v: 0 } : { v: 45 };
      case 'windmill': return o.stock ? { v: 60 } : { v: 0 };
      case 'watchtower': return o.used ? { v: 0 } : { v: 22 };
      case 'arena': return o.used ? { v: 0 } : { v: 60 };
      case 'witchhut': return o.used ? { v: 0 } : { v: 45 };
      case 'dwelling': return (o.pool || 0) > 0 ? { v: 110 } : { v: 0 };
      case 'monster': {
        const mp = o.n * unitPower(o.c) * 1.15;
        const need = fightNeed(mp, 0);
        let v = 0;
        if (o.reward) v = o.reward.kind === 'artifact' ? 300 : 130;
        else v = 25;
        return { v, risk: true, need };
      }
      case 'town': {
        if (o.owner === pid) {
          /* 城里有兵可拿或需要补防(价值封顶,避免无限搬运) */
          let poolVal = 0;
          for (const cid of Object.keys(o.pool || {})) poolVal += unitPower(cid) * o.pool[cid];
          const garrison = G.Game.armyPower(o.garrison);
          if (G.Game.armyCount(hero.army) < 12 && (poolVal > 100 || garrison > 100)) return { v: 180 + Math.min(400, poolVal / 20) };
          if (poolVal > 250) return { v: 110 + Math.min(600, poolVal / 30) };
          return { v: 0 };
        }
        const defHero = game.heroes.find(h => !h.dead && h.x === o.x && h.y === o.y && h.owner === o.owner);
        let def = G.Game.armyPower(o.garrison) * 1.2;
        if (defHero) def += G.Game.armyPower(defHero.army) * (1 + 0.06 * (defHero.att + defHero.def));
        /* 攻城门槛:前两周更谨慎;随时间衰减到消耗战,避免双龟壳死锁 */
        let ratio = Math.max(0.72, 1.5 - Math.max(0, game.day - 100) / 260);
        if (game.day < 14) ratio *= 1.5;
        const need = def * (o.owner === -1 ? Math.max(0.68, ratio * 0.9) : ratio);
        let v = (o.owner === -1 ? 900 : 1400) + Math.min(2500, myPower / 15);
        if (myPower > need * 2) v *= 2;   /* 碾压态势:优先征服 */
        return { v, risk: def > 0, need };
      }
      default: return { v: 0 };
    }
  }

  G.AI = { playTurn, playBattle, aiActStack, aiCastSpell, tryBuild, tryRecruit };
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
