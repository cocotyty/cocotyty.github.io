/* ============================================================
 * 三国烽火 · 战斗演算(纯逻辑)
 * 攻城战:回合制自动推演,双方每轮选择战术互克
 * 战术: 0普通 1猛攻 2防守 3火攻 4伏兵 5单挑
 * 玩家可实时换战术(UI),AI 按局势选择
 * ============================================================ */
'use strict';

const SGBattle = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (n) => Math.random() * n;
  const irnd = (n) => Math.floor(Math.random() * n);

  const TACTICS = [
    { id: 0, name: '常规', desc: '稳步推进,无额外风险' },
    { id: 1, name: '猛攻', desc: '伤害+45%,自身伤亡+35%' },
    { id: 2, name: '坚守', desc: '受伤-40%,士气小幅下降' },
    { id: 3, name: '火攻', desc: '智力判定,成功重创敌军,失败反损' },
    { id: 4, name: '伏兵', desc: '智力判定,成功敌士气崩溃,需兵力劣势' },
    { id: 5, name: '单挑', desc: '武力对决,胜者敌全军士气骤降' },
  ];

  /* 士气崩溃线 */
  const ROUT_MORALE = 12;

  /* ============ 创建一场战斗 ============
   * atk: {faction, troops, gens:[general], from}
   * def: {faction, troops, gens:[general], city:{...}, walls}
   * 返回 battle 状态对象(可逐步 step 推演,便于 UI 播放)
   */
  function create(g, move, city) {
    const atkGens = move.gens.map(n => g.generals[n]).filter(Boolean);
    const defGens = (city.owner
      ? Object.values(g.generals).filter(x => x.city === city.name && x.faction === city.owner && x.status === 'serve')
      : Object.values(g.generals).filter(x => x.city === city.name && x.status === 'free'));
    const atkLead = atkGens.length ? Math.max(...atkGens.map(x => x.lead)) : 40;
    const defLead = defGens.length ? Math.max(...defGens.map(x => x.lead)) : 30;

    return {
      id: Math.random(),
      turn: 0, maxTurn: 24,
      phase: 'fight',            // fight|duel|end
      city: city.name,
      atk: {
        faction: move.faction, troops: move.troops, initTroops: move.troops,
        from: move.from,
        gens: atkGens.map(x => x.name), lead: atkLead,
        morale: 70, tactic: 0,
        fireCd: 0, ambushCd: 0, duelCd: 0,
      },
      def: {
        faction: city.owner, troops: city.troops, initTroops: city.troops,
        gens: defGens.map(x => x.name), lead: defLead,
        morale: city.morale, tactic: 0,
        walls: city.wallHp, wallMax: city.walls,
        fireCd: 0, ambushCd: 0, duelCd: 0,
      },
      events: [],                // 演算事件流(UI 逐条播放)
      winner: null,
    };
  }

  function log(b, msg) { b.events.push({ turn: b.turn, msg }); }

  /* 部队有效战力系数 */
  function power(side, isDef, difficultyBonus) {
    let p = side.troops * (0.55 + side.lead / 240) * (0.6 + side.morale / 250);
    if (isDef) p *= 1 + side.walls / 320;         // 城防加成最高+31%
    if (difficultyBonus) p *= difficultyBonus;
    return p;
  }

  /* ============ 推演一轮 ============ */
  function step(g, b) {
    if (b.phase === 'end') return b;
    b.turn++;
    const { atk, def } = b;
    const aiBonus = g.aiBonus || 1;

    /* --- 单挑阶段(某方选了单挑且对面接受概率) --- */
    if (b.phase === 'duel') {
      duelRound(g, b);
      return b;
    }
    const someoneDuel = (atk.tactic === 5 && atk.duelCd <= 0 && atk.gens.length && def.gens.length)
      || (def.tactic === 5 && def.duelCd <= 0 && def.gens.length && atk.gens.length);
    if (someoneDuel) {
      const proposer = atk.tactic === 5 ? atk : def;
      const other = proposer === atk ? def : atk;
      /* 武力差距大时弱方可能拒绝;AI 层面避免送死 */
      proposer.duelCd = 6;
      startDuel(g, b, proposer === atk ? 'atk' : 'def');
      return b;
    }

    /* --- 计谋阶段(火攻/伏兵) --- */
    tryScheme(g, b, atk, def, aiBonus);
    tryScheme(g, b, def, atk, aiBonus);

    /* --- 交战伤害 --- */
    const atkP = power(atk, false, atk.faction !== g.playerFaction ? aiBonus : 1);
    const defP = power(def, true, def.faction !== g.playerFaction ? aiBonus : 1);

    let atkDmg = atkP * (0.052 + rnd(0.03));
    let defDmg = defP * (0.052 + rnd(0.03));
    /* 战术修正 */
    [atk, def].forEach(s => {
      const foe = s === atk ? def : atk;
      if (s.tactic === 1) { s._outMul = 1.45; s._inMul = 1.35; }
      else if (s.tactic === 2) { s._outMul = 0.55; s._inMul = 0.6; s.morale = clamp(s.morale - 1, 0, 100); }
      else { s._outMul = 1; s._inMul = 1; }
    });
    atkDmg *= atk._outMul * def._inMul;
    defDmg *= def._outMul * atk._inMul;

    atk.troops -= Math.round(defDmg);
    def.troops -= Math.round(atkDmg);
    /* 攻城战:城墙吸收部分攻方输出 */
    if (def.tactic === 2 || def.walls > 0) {
      const wallAbsorb = Math.min(def.walls, atkDmg * 0.12);
      def.walls = Math.max(0, def.walls - wallAbsorb * 0.3);
    }
    atk.troops = Math.max(0, atk.troops);
    def.troops = Math.max(0, def.troops);

    /* 士气变化:优势推进,劣势受挫 */
    const ratio = atkDmg / (defDmg + 1);
    if (ratio > 1.3) { atk.morale = clamp(atk.morale + 3, 0, 100); def.morale = clamp(def.morale - 3, 0, 100); }
    else if (ratio < 0.77) { atk.morale = clamp(atk.morale - 3, 0, 100); def.morale = clamp(def.morale + 3, 0, 100); }

    if (b.turn % 3 === 0) {
      log(b, `第${b.turn}轮:${sideName(b, atk)} ${atk.troops} 兵(士气${Math.round(atk.morale)}) vs ${sideName(b, def)} ${def.troops} 兵(士气${Math.round(def.morale)})`);
    }

    /* --- 胜负判定 --- */
    if (atk.troops < atk.initTroops * 0.1 || atk.morale <= ROUT_MORALE) endBattle(g, b, 'def', '攻方溃退');
    else if (def.troops < def.initTroops * 0.08 || def.morale <= ROUT_MORALE) endBattle(g, b, 'atk', '守军崩溃');
    else if (b.turn >= b.maxTurn) endBattle(g, b, def.troops > atk.troops ? 'def' : 'atk', '双方力竭,兵力多者得势');
    if (atk.fireCd > 0) atk.fireCd--; if (def.fireCd > 0) def.fireCd--;
    if (atk.ambushCd > 0) atk.ambushCd--; if (def.ambushCd > 0) def.ambushCd--;
    if (atk.duelCd > 0) atk.duelCd--; if (def.duelCd > 0) def.duelCd--;
    return b;
  }

  const sideName = (b, side) => (side === b.atk ? '攻军' : '守军');

  /* --- 计谋:火攻/伏兵 --- */
  function tryScheme(g, b, user, target, aiBonus) {
    if (user.tactic !== 3 && user.tactic !== 4) return;
    const isFire = user.tactic === 3;
    if (isFire && user.fireCd > 0) return;
    if (!isFire && user.ambushCd > 0) return;
    /* 伏兵需兵力劣势(守势方常用) */
    if (!isFire && user.troops > target.troops * 1.15) return;

    const uGens = (user === b.atk ? b.atk.gens : b.def.gens).map(n => g.generals[n]).filter(Boolean);
    const tGens = (target === b.atk ? b.atk.gens : b.def.gens).map(n => g.generals[n]).filter(Boolean);
    const uInt = uGens.length ? Math.max(...uGens.map(x => x.int)) : 40;
    const tInt = tGens.length ? Math.max(...tGens.map(x => x.int)) : 35;
    const bonus = user.faction !== g.playerFaction ? (aiBonus - 1) * 30 : 0;
    const chance = clamp(0.32 + (uInt - tInt) * 0.008 + bonus, 0.08, 0.9);

    if (isFire) user.fireCd = 5; else user.ambushCd = 6;
    const uname = uGens.length ? uGens.sort((a, b2) => b2.int - a.int)[0].name : '军师';
    if (Math.random() < chance) {
      if (isFire) {
        const dmg = target.troops * (0.1 + rnd(0.09));
        target.troops -= Math.round(dmg);
        target.morale = clamp(target.morale - 12, 0, 100);
        log(b, `🔥 ${uname}巧借风势,一把大火烧得敌军丢盔弃甲!敌军折损 ${Math.round(dmg)} 人`);
      } else {
        target.morale = clamp(target.morale - 22, 0, 100);
        const dmg = target.troops * (0.05 + rnd(0.05));
        target.troops -= Math.round(dmg);
        log(b, `⚑ ${uname}设伏奇出,敌军自相践踏,士气大崩!`);
      }
    } else {
      const dmg = user.troops * (0.03 + rnd(0.04));
      user.troops -= Math.round(dmg);
      user.morale = clamp(user.morale - 5, 0, 100);
      log(b, `${uname}计谋被识破,折损 ${Math.round(dmg)} 人,徒丧其锐`);
    }
  }

  /* --- 单挑 --- */
  function startDuel(g, b, proposerSide) {
    const aSide = proposerSide === 'atk' ? b.atk : b.def;
    const dSide = proposerSide === 'atk' ? b.def : b.atk;
    const aG = g.generals[aSide.gens[0]] || { force: 50, name: '无名将' };
    /* 守方接受:武力差>15 时 70% 拒战(避免送死),AI 已在战术层避免 */
    b.phase = 'duel';
    b.duel = { a: aSide.gens[0] || '偏将', d: dSide.gens[0] || '贼首', round: 0, log: [], done: false };
    log(b, `⚔ ${b.duel.a} 拍马出阵,直取 ${b.duel.d}!`);
  }

  function duelRound(g, b) {
    const du = b.duel;
    if (!du || du.done) { b.phase = 'fight'; return; }
    du.round++;
    const ga = g.generals[du.a] || { force: 55, name: du.a };
    const gd = g.generals[du.d] || { force: 50, name: du.d };
    const pa = ga.force + rnd(30);
    const pd = gd.force + rnd(30);
    if (Math.abs(pa - pd) < 6) {
      du.log.push(`二将刀来枪往,大战三十回合不分胜负`);
      if (du.round >= 3) {
        du.done = true; b.phase = 'fight';
        du.log.push(`两军将士齐声喝彩,各自鸣金收兵`);
        flushDuelLog(b);
      }
    } else {
      const winner = pa > pd ? ga : gd;
      const loser = pa > pd ? gd : ga;
      du.done = true; b.phase = 'fight';
      du.log.push(`${winner.name}卖个破绽,大喝一声,将${loser.name}斩于马下!`);
      /* 败方全军士气大跌,兵力小损 */
      const loserSide = winner === ga ? b.def : b.atk;
      loserSide.morale = clamp(loserSide.morale - 25, 0, 100);
      loserSide.troops -= Math.round(loserSide.troops * 0.04);
      winner.kills = (winner.kills || 0) + 1;
      if (g.generals[winner.name]) g.generals[winner.name].duelsWon++;
      if (g.generals[loser.name]) {
        /* 武将被斩(名将大概率活下来被俘) */
        const dead = loser.force < 75 ? Math.random() < 0.55 : Math.random() < 0.3;
        if (dead) {
          g.generals[loser.name].status = 'dead';
          g.generals[loser.name].faction = null;
          du.log.push(`【${loser.name}】殒命沙场,三军缟素`);
          log(b, `☠ 【${loser.name}】阵亡!`);
        } else {
          du.log.push(`【${loser.name}】狼狈败回本阵`);
        }
      }
      flushDuelLog(b);
    }
  }

  function flushDuelLog(b) { b.duel.log.forEach(m => log(b, m)); b.duel.log = []; }

  /* --- 结束:处理占领/战果 --- */
  function endBattle(g, b, winner, why) {
    b.phase = 'end'; b.winner = winner;
    log(b, `⚑ ${why},${winner === 'atk' ? '攻军' : '守军'}胜!`);

    const atk = b.atk, def = b.def;
    /* 伤亡结算回写 */
    const city = g.cities[b.city];

    if (winner === 'atk') {
      /* 城池易主 */
      const oldOwner = city.owner;
      /* 记血仇:失城之邦铭记三年 */
      if (oldOwner) {
        g.grudge[oldOwner] = g.grudge[oldOwner] || {};
        g.grudge[oldOwner][atk.faction] = g.turn;
      }
      city.owner = atk.faction;
      /* 收编守军降卒 */
      const absorbed = Math.round(def.troops * 0.2);
      city.troops = atk.troops + absorbed;
      city.morale = 45; city.training = clamp(Math.round(city.training * 0.6), 20, 100);
      city.wallHp = Math.max(10, city.wallHp * 0.5);
      city.raided = 3;
      /* 掠夺少许钱粮 */
      city.gold = Math.round(city.gold * 0.7); city.food = Math.round(city.food * 0.7);
      /* 出征武将进城 */
      atk.gens.forEach(n => {
        const gen = g.generals[n];
        if (gen && gen.status !== 'dead') { gen.city = b.city; gen.status = 'serve'; gen.loyalty = clamp(gen.loyalty + 3, 0, 100); }
      });
      /* 守将被俘/战死/逃脱 */
      def.gens.forEach(n => {
        const gen = g.generals[n];
        if (!gen || gen.status === 'dead') return;
        const flee = Math.random() < 0.45 + gen.lead * 0.002;
        if (flee && g.adj[b.city]) {
          const to = g.adj[b.city].map(x => g.cities[x]).filter(c => c.owner === oldOwner);
          if (to.length) { gen.city = to[irnd(to.length)].name; return; }
        }
        gen.status = 'captured'; gen.faction = null;
        b.prisoners = b.prisoners || [];
        b.prisoners.push(n);
      });
      SGEngine.log(g, `⚔ ${g.factions[atk.faction].name}攻陷【${b.city}】${oldOwner ? `,${g.factions[oldOwner].name}守军溃败` : '(空城)'}!`, 'battle');
    } else {
      /* 攻方败退:残兵败将撤回出发城 */
      city.troops = def.troops;
      city.morale = clamp(def.morale + 10, 0, 100);
      city.wallHp = def.walls;
      if (atk.troops > 200 && g.cities[b.atk.from || '']) {
        const from = g.cities[b.atk.from];
        if (from.owner === atk.faction) {
          from.troops += Math.round(atk.troops * 0.6);
          atk.gens.forEach(n => {
            const gen = g.generals[n];
            if (gen && gen.status !== 'dead') { gen.city = from.name; gen.status = 'serve'; gen.loyalty = clamp(gen.loyalty - 4, 0, 100); }
          });
        } else {
          atk.gens.forEach(n => {
            const gen = g.generals[n];
            if (gen && gen.status !== 'dead') { gen.status = 'free'; gen.faction = null; }
          });
        }
      } else {
        atk.gens.forEach(n => {
          const gen = g.generals[n];
          if (gen && gen.status !== 'dead') { gen.status = 'free'; gen.faction = null; }
        });
      }
      /* 攻方被俘将 */
      atk.gens.forEach(n => {
        const gen = g.generals[n];
        if (gen && gen.status === 'moving') {
          if (Math.random() < 0.3) { gen.status = 'captured'; gen.faction = null; b.prisoners = b.prisoners || []; b.prisoners.push(n); }
          else { gen.status = 'free'; gen.faction = null; }
        }
      });
      SGEngine.log(g, `⚔ ${g.factions[def.faction] ? g.factions[def.faction].name : '守军'}守住了【${b.city}】,攻军折戟城下`, 'battle');
    }
    b.done = true;
  }

  /* ============ 俘虏处理 ============ */
  function executePrisoner(g, name) {
    const gen = g.generals[name];
    if (!gen || gen.status !== 'captured') return { ok: false, msg: '非俘虏' };
    gen.status = 'dead';
    /* 处死:同势力武将忠诚下降,仇怨 */
    Object.values(g.generals).forEach(x => {
      if (x.faction === gen.formerFaction) x.loyalty = clamp(x.loyalty - 3, 0, 100);
    });
    return { ok: true, msg: `${name}被处决。天下震动!` };
  }

  function recruitPrisoner(g, cityName, byName, targetName) {
    const t = g.generals[targetName];
    const by = g.generals[byName];
    if (!t || !by || t.status !== 'captured' || t.city !== cityName) return { ok: false, msg: '非本城俘虏' };
    const ruler = Object.values(g.generals).find(x => x.faction === by.faction && x.isRuler);
    const rulerCharm = ruler ? ruler.charm : 50;
    /* 降将概率:义将被斩风险 vs 君主魅力 */
    const score = rulerCharm * 0.5 + by.charm * 0.2 + 18 - (t.lead + t.force) * 0.12;
    if (Math.random() * 100 < score) {
      t.faction = by.faction; t.status = 'serve'; t.city = cityName;
      t.loyalty = clamp(62 + irnd(12), 0, 100);
      return { ok: true, msg: `【${t.name}】长叹一声,纳头便拜!` };
    }
    return { ok: false, msg: `【${t.name}】宁死不降:「忠臣不事二主!」` };
  }

  function releasePrisoner(g, name) {
    const gen = g.generals[name];
    if (!gen || gen.status !== 'captured') return { ok: false, msg: '非俘虏' };
    gen.status = 'free';
    return { ok: true, msg: `【${gen.name}】被释放,飘然而去` };
  }

  /* ============ AI 战术选择(战斗中每轮) ============ */
  function aiTactic(g, b, side) {
    const other = side === b.atk ? b.def : b.atk;
    const isDef = side === b.def;
    const gens = (side === b.atk ? b.atk.gens : b.def.gens).map(n => g.generals[n]).filter(x => x && x.status !== 'dead');
    const oGens = (other === b.atk ? b.atk.gens : b.def.gens).map(n => g.generals[n]).filter(x => x && x.status !== 'dead');
    if (!gens.length) return 0;
    const myBest = gens.reduce((a, x) => (a.lead > x.lead ? a : x));
    const mySmart = gens.reduce((a, x) => (a.int > x.int ? a : x));
    const myStrong = gens.reduce((a, x) => (a.force > x.force ? a : x));
    const theirSmart = oGens.length ? Math.max(...oGens.map(x => x.int)) : 35;
    const theirStrong = oGens.length ? Math.max(...oGens.map(x => x.force)) : 55;
    const ratio = side.troops / (other.troops + 1);

    /* 单挑:武力明显占优(>=12)且对面无超武力将,或己方兵力劣势赌博 */
    if (side.duelCd <= 0 && oGens.length && myStrong.force >= theirStrong + 12) return 5;
    /* 火攻:智力占优 */
    if (side.fireCd <= 0 && mySmart.int >= theirSmart + 8 && Math.random() < 0.6) return 3;
    /* 伏兵:守势且兵力劣势,智力不差 */
    if (side.ambushCd <= 0 && ratio < 0.85 && mySmart.int > theirSmart - 10 && Math.random() < 0.55) return 4;
    /* 兵力碾压 → 猛攻速胜 */
    if (ratio > 1.5) return 1;
    /* 兵力劣势守城 → 坚守待援 */
    if (isDef && ratio < 0.7 && side.walls > 20) return 2;
    /* 均势微优 → 猛攻试探 */
    if (ratio > 1.15 && Math.random() < 0.4) return 1;
    return 0;
  }

  return { TACTICS, create, step, aiTactic, executePrisoner, recruitPrisoner, releasePrisoner, ROUT_MORALE };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGBattle;
