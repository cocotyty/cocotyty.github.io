/* ============================================================
 * 三国烽火 · AI 势力决策(纯逻辑)
 * 分两层:
 *   战略层(每月): 内政发展 / 兵力调度 / 出征决策 / 人才
 *   战术层(战斗中): SGBattle.aiTactic 已实现,此处补充阵前决策
 * 设计目标:像人一样打——后方搞建设运兵,前线看机会出手,
 *          兵力不足时死守,优势时多路并进。
 * ============================================================ */
'use strict';

const SGAI = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const irnd = (n) => Math.floor(Math.random() * n);

  /* ============ 主入口:某 AI 势力执行一整月 ============ */
  function runFaction(g, fid) {
    const f = g.factions[fid];
    if (!f || !f.alive) return;
    const cities = SGEngine.factionCities(g, fid);
    if (!cities.length) return;
    const gens = SGEngine.factionGenerals(g, fid);
    const ruler = gens.find(x => x.isRuler);
    const aggr = f.ai === 'aggressive' ? 1 : f.ai === 'defensive' ? 0 : 0.5;

    /* ---- 城池分类:前线(有敌邻)/后方 ---- */
    const frontline = [], rear = [];
    cities.forEach(c => {
      const enemies = (g.adj[c.name] || [])
        .map(n => g.cities[n])
        .filter(x => x.owner !== fid);
      if (enemies.length) frontline.push({ c, enemies });
      else rear.push(c);
    });

    /* ---- 威胁评估:每座前线城的敌压 ---- */
    const threats = {};
    frontline.forEach(({ c, enemies }) => {
      let t = 0;
      enemies.forEach(e => {
        if (!e.owner) { t += e.troops * 0.15; return; }
        const relation = e.owner === fid ? 0 : 1;
        /* 好战势力与强邻威胁加权 */
        t += e.troops * relation * (g.factions[e.owner].ai === 'aggressive' ? 1.15 : 0.85);
      });
      threats[c.name] = t;
    });

    /* ---- 后方城:内政为主,向前线输血 ---- */
    rear.forEach(c => {
      const cg = gens.filter(x => x.city === c.name && x.status === 'serve');
      if (!cg.length) return;
      const best = cg.reduce((a, b2) => (a.pol > b2.pol ? a : b2));

      /* 后方留基本守兵,兵/粮/金持续输往前线最缺处 */
      if (frontline.length) {
        const target = pickReinforceTarget(g, fid, frontline, threats);
        if (target && g.cities[target].owner === fid && isAdj(g, c.name, target)) {
          if (c.troops > 5000) {
            const send = Math.floor(c.troops * 0.6);
            const movers = cg.filter(x => !x.isRuler).slice(0, 2);
            SGEngine.cmdTransfer(g, c.name, target, send, movers.map(x => x.name));
          } else if (c.food > 6000 || c.gold > 400) {
            /* 纯辎重队:输粮输金 */
            SGEngine.cmdTransfer(g, c.name, target, 0, []);
          }
        }
      }

      /* 内政决策:粮少垦田,钱少通商,都行就训练/搜索 */
      if (c.acted) return;
      const totalFood = sumFood(g, fid);
      if (c.agri < c.agriMax * 0.9 && (totalFood < cities.length * 8000 || Math.random() < 0.5))
        SGEngine.cmdAgri(g, c.name, best.name);
      else if (c.com < c.comMax * 0.9) SGEngine.cmdCommerce(g, c.name, best.name);
      else if (cg.length > 2) SGEngine.cmdSearch(g, c.name, best.name);
      else SGEngine.cmdTrain(g, c.name, cg[0].name);
    });

    /* ---- 前线城:防务+进攻 ---- */
    /* 先处理录用(招在野)与俘虏招降——增员优先 */
    frontline.forEach(({ c }) => {
      const cg = gens.filter(x => x.city === c.name && x.status === 'serve');
      if (!cg.length) return;
      const recruiter = cg.reduce((a, b2) => (a.pol + a.charm > b2.pol + b2.charm ? a : b2));
      /* 在野武将:魅力政治最高者尝试录用 */
      const frees = SGEngine.cityFreeGenerals(g, c.name);
      if (frees.length && !c.acted) {
        const t = frees.reduce((a, b2) => (a.charm + a.int > b2.charm + b2.int ? a : b2));
        SGEngine.cmdRecruit(g, c.name, recruiter.name, t.name);
      }
      /* 俘虏招降 */
      const prisoners = Object.values(g.generals)
        .filter(x => x.status === 'captured' && x.city === c.name);
      prisoners.forEach(p => {
        if (ruler && (p.lead + p.force) > 140 && Math.random() < 0.7)
          SGBattle.recruitPrisoner(g, c.name, ruler.name, p.name);
        else if (Math.random() < 0.3)
          SGBattle.recruitPrisoner(g, c.name, recruiter.name, p.name);
        else SGBattle.releasePrisoner(g, p.name);
      });
      /* 忠诚危机武将赏赐 */
      cg.filter(x => !x.isRuler && x.loyalty < 60 && c.gold > 200 && (x.lead + x.force + x.int) > 180)
        .forEach(x => { if (Math.random() < 0.7) SGEngine.cmdReward(g, c.name, x.name); });
    });

    /* ---- 出征决策(两阶段:先按目标聚合可发兵力,再决定合击) ---- */
    /* 战线压力:接壤的不同敌对势力数(多线作战须谨慎) */
    const adjFoes = {};
    cities.forEach(c => (g.adj[c.name] || []).forEach(n => {
      const o = g.cities[n].owner;
      if (o && o !== fid) adjFoes[o] = (adjFoes[o] || 0) + g.cities[n].troops;
    }));
    const multiFront = Object.keys(adjFoes).length;
    const multiFrontPenalty = multiFront >= 3 ? 0.45 : multiFront === 2 ? 0.18 : 0;

    /* 阶段0:前线城防务内政(征兵/训练/修城/搜索) */
    frontline.forEach(({ c }) => {
      const cg = gens.filter(x => x.city === c.name && x.status === 'serve');
      if (!cg.length || c.acted) return;
      const defenseNeed = threats[c.name] / (c.troops + 1);
      if (defenseNeed > 1.2 && c.food > c.troops * 2.2 && c.gold > 100) {
        const afford = Math.min(c.gold * 90, (c.food - c.troops * 1.2) / 1.3);
        const count = Math.min(6000, Math.floor(afford));
        if (count > 500) {
          const trainer = cg.reduce((a, b2) => (a.lead > b2.lead ? a : b2));
          SGEngine.cmdConscript(g, c.name, trainer.name, count);
        }
      } else if (c.training < 45) {
        const trainer = cg.reduce((a, b2) => (a.lead > b2.lead ? a : b2));
        SGEngine.cmdTrain(g, c.name, trainer.name);
      } else if (c.wallHp < c.walls * 0.5 && defenseNeed > 0.5) {
        const repairer = cg.reduce((a, b2) => (a.pol > b2.pol ? a : b2));
        SGEngine.cmdRepair(g, c.name, repairer.name);
      } else if (cg.length > 3 && Math.random() < 0.3) {
        const searcher = cg.reduce((a, b2) => (a.charm > b2.charm ? a : b2));
        SGEngine.cmdSearch(g, c.name, searcher.name);
      } else if (c.troops < 16000 && c.food > c.troops * 2.5 && c.gold > 150 && Math.random() < 0.85) {
        const afford = Math.min(c.gold * 90, (c.food - c.troops * 2) / 1.3, 8000);
        if (afford > 800) {
          const trainer = cg.reduce((a, b2) => (a.charm > b2.charm ? a : b2));
          SGEngine.cmdConscript(g, c.name, trainer.name, Math.floor(afford));
        }
      }
    });

    /* 阶段1:每座前线城列出候选目标与可发兵力 */
    const plans = [];   // {from, target, send, squad, myPower}
    frontline.forEach(({ c, enemies }) => {
      const cg = gens.filter(x => x.city === c.name && x.status === 'serve');
      if (!cg.length) return;
      const threat = threats[c.name];
      const reserve = threat > 0 ? Math.min(c.troops * 0.45, 6000) : 800;
      const available = c.troops - reserve;
      if (available < 3500) return;
      /* 出击后仍须扛得住本地威胁,否则按兵不动 */
      if (threat > 0 && threat * 1.1 > c.troops - Math.min(available, c.troops * 0.5)) return;
      if (threat > c.troops * 1.5) return;    // 自身难保不出击

      const target = pickTarget(g, fid, c, enemies);
      if (!target) return;
      const gensReady = cg.filter(x => !x.isRuler || cg.length === 1);
      const squad = gensReady.sort((a, b2) => (b2.lead + b2.force * 0.5) - (a.lead + a.force * 0.5)).slice(0, 3);
      if (!squad.length) return;
      const capacity = squad.reduce((s, x) => s + 500 + x.lead * 130, 0);
      const send = Math.min(available, capacity);
      const myPower = send * (0.7 + squad[0].lead / 200) * (0.85 + c.training / 400);
      plans.push({ from: c, target, send, squad, myPower });
    });

    /* 阶段2:按目标聚合,达标即多路齐发 */
    const byTarget = {};
    plans.forEach(p => { (byTarget[p.target.name] = byTarget[p.target.name] || []).push(p); });
    Object.values(byTarget).forEach(group => {
      const target = group[0].target;
      const totalPower = group.reduce((s, p) => s + p.myPower, 0);
      /* 预估战力:与 SGBattle.power 公式对齐 */
      const defGens = (target.owner
        ? Object.values(g.generals).filter(x => x.city === target.name && x.faction === target.owner && x.status === 'serve')
        : Object.values(g.generals).filter(x => x.city === target.name && x.status === 'free'));
      const defLead = defGens.length ? Math.max(...defGens.map(x => x.lead)) : 35;
      let defense = target.troops * (0.55 + defLead / 240) * (0.6 + target.morale / 250) * (1 + target.wallHp / 320);
      (g.adj[target.name] || []).forEach(n => {
        const nb = g.cities[n];
        if (nb.owner === target.owner) defense += nb.troops * 0.2;
      });
      /* 动态出征阈值:强弱悬殊更凶,弱守军果断捡漏 */
      const aggr0 = f.ai === 'aggressive' ? 1 : f.ai === 'defensive' ? 0 : 0.5;
      let needRatio = f.expand - aggr0 * 0.15;
      const myScore = SGEngine.factionPower(g, fid).score;
      const foeScore = target.owner ? SGEngine.factionPower(g, target.owner).score : 0;
      if (myScore > foeScore * 1.6) needRatio -= 0.28;
      else if (myScore > foeScore * 1.25) needRatio -= 0.12;
      if (target.troops < 3500) needRatio = Math.min(needRatio, 0.85);
      /* 开局6个月冷静期:先发育吃空城,再互相开战 */
      if (g.turn < 6) needRatio += 0.2;
      /* 多线作战惩罚:接壤敌对势力越多越保守;但各个击破——打最弱一线不受全额惩罚 */
      if (multiFrontPenalty > 0) {
        let weakestScore = Infinity, weakestFoe = null;
        Object.keys(adjFoes).forEach(id => {
          const s = SGEngine.factionPower(g, id).score;
          if (s < weakestScore) { weakestScore = s; weakestFoe = id; }
        });
        if (target.owner === weakestFoe) needRatio -= multiFrontPenalty * 0.65;
      }
      needRatio += multiFrontPenalty;
      /* 长江天险:渡江仰攻需备足船粮 */
      if (crossesRiver(group[0].from.name, target.name)) needRatio += 0.35;
      /* 血仇反击:卧薪尝胆,三年内必报——多线困境下的破局之道 */
      const grudgeTurn = (g.grudge[fid] || {})[target.owner];
      if (grudgeTurn !== undefined && g.turn - grudgeTurn < 36) needRatio -= 0.45;
      /* 守成之主:地广而骄,满足于既得版图 */
      if (f.ai === 'defensive' && cities.length >= 10) needRatio += 0.6;
      else if (f.ai === 'defensive' && cities.length >= 7) needRatio += 0.25;
      /* 残局决战:天下只剩≤3家时,胜负手在此一举 */
      const aliveFactions = Object.values(g.factions).filter(fx => fx.alive && SGEngine.factionCities(g, fx.id).length).length;
      if (aliveFactions <= 3) needRatio -= 0.3;
      needRatio = Math.max(0.9, needRatio);

      if (totalPower > defense * needRatio) {
        group.forEach(p => {
          SGEngine.cmdMarch(g, p.from.name, target.name, p.send, p.squad.map(x => x.name));
        });
      }
    });

    /* ---- 空城捡漏:邻接空城且兵力富余,低成本扩张 ---- */
    frontline.forEach(({ c }) => {
      const cg = gens.filter(x => x.city === c.name && x.status === 'serve');
      const empty = (g.adj[c.name] || []).map(n => g.cities[n]).filter(x => !x.owner);
      if (!empty.length || !cg.length) return;
      const available = c.troops - Math.max(threats[c.name] * 0.8, 2000);
      if (available > 3500) {
        const squad = cg.sort((a, b2) => b2.lead - a.lead).slice(0, 2);
        SGEngine.cmdMarch(g, c.name, empty[0].name, Math.floor(available * 0.7), squad.map(x => x.name));
      }
    });
  }

  const isAdj = (g, a, b) => (g.adj[a] || []).includes(b);

  /* 江北/江南(长江天险):渡江作战有额外开销 */
  const SOUTH = new Set(['建业', '吴', '会稽', '柴桑']);
  const crossesRiver = (a, b) => SOUTH.has(a) !== SOUTH.has(b);

  /* ---- 选择增援目标:威胁最大的前线城 ---- */
  function pickReinforceTarget(g, fid, frontline, threats) {
    let best = null, bestScore = -1;
    frontline.forEach(({ c }) => {
      const score = threats[c.name] / (c.troops + 3000);
      if (score > bestScore && g.cities[c.name].owner === fid) { bestScore = score; best = c.name; }
    });
    return best;
  }

  /* ---- 选择进攻目标 ---- */
  function pickTarget(g, fid, fromCity, enemies) {
    let best = null, bestScore = 0;
    /* 接壤势力中的最强者:不打(远交近攻,先弱后强) */
    const adjFoes = {};
    SGEngine.factionCities(g, fid).forEach(c =>
      (g.adj[c.name] || []).forEach(n => {
        const o = g.cities[n].owner;
        if (o && o !== fid) adjFoes[o] = (adjFoes[o] || 0) + g.cities[n].troops;
      }));
    let strongestFoe = null, strongestVal = 0;
    Object.entries(adjFoes).forEach(([id, v]) => {
      if (v > strongestVal && SGEngine.factionCities(g, id).length > 2) { strongestVal = v; strongestFoe = id; }
    });
    enemies.forEach(e => {
      /* 空城不在此处理(单独捡漏逻辑) */
      if (!e.owner) return;
      let score = 0;
      /* 目标价值:富庶度 + 人口 + 城防低 */
      score += (e.agri + e.com) * 0.08 + e.pop * 1.2 - e.wallHp * 0.5;
      /* 弱防守优先 */
      score += Math.max(0, (9000 - e.troops) * 0.05);
      /* 完成包围/威胁我多城的敌城优先 */
      const myAdj = (g.adj[e.name] || []).filter(n => g.cities[n].owner === fid).length;
      score += myAdj * 12;
      /* 敌势力总兵力弱(软柿子) */
      const foePower = SGEngine.factionPower(g, e.owner);
      score += Math.max(0, (24 - foePower.cities) * 4);
      /* 远交近攻:避开接壤最强敌,锤它弱邻 */
      if (e.owner === strongestFoe) score -= 70;
      /* 随机扰动避免机械 */
      score += irnd(15);
      if (score > bestScore) { bestScore = score; best = e; }
    });
    return best;
  }

  function sumFood(g, fid) {
    return SGEngine.factionCities(g, fid).reduce((s, c) => s + c.food, 0);
  }

  /* ============ 行军到达后的接战(在引擎 tick 中调用) ============ */
  function resolveArrivals(g) {
    const arrivals = g.moves.filter(m => m.eta <= g.turn);
    const consumed = new Set();
    arrivals.forEach(m => {
      if (consumed.has(m.id)) return;
      consumed.add(m.id);
      const city = g.cities[m.to];

      /* 同一目标同月的我方其它部队:合流 */
      const allies = g.moves.filter(x => x !== m && x.to === m.to && x.faction === m.faction && x.eta <= g.turn && !consumed.has(x.id));
      allies.forEach(a => { consumed.add(a.id); m.troops += a.troops; m.gens = m.gens.concat(a.gens); });

      if (city.owner === m.faction) {
        /* 目标已易主为我方(友军刚攻下):进城 */
        city.troops += m.troops;
        m.gens.forEach(n => { const gen = g.generals[n]; if (gen) { gen.city = m.to; gen.status = 'serve'; } });
        return;
      }

      /* 创建战斗 */
      const b = SGBattle.create(g, m, city);
      g.battles.push(b);

      /* 玩家参与的战斗由 UI 推演;纯 AI 战斗自动跑完 */
      if (m.faction !== g.playerFaction && city.owner !== g.playerFaction) {
        autoResolve(g, b);
      }
      /* 玩家战斗:battle 保持 phase=fight,由 UI 或下文 simulatePlayerBattle 跑 */
    });
    g.moves = g.moves.filter(m => !consumed.has(m.id));
  }

  /* 纯 AI 战斗自动推演(双方都用 aiTactic) */
  function autoResolve(g, b) {
    let guard = 0;
    while (b.phase !== 'end' && guard++ < 200) {
      b.atk.tactic = SGBattle.aiTactic(g, b, b.atk);
      b.def.tactic = SGBattle.aiTactic(g, b, b.def);
      SGBattle.step(g, b);
    }
    if (b.phase !== 'end') {
      /* 兜底:兵力多者胜 */
      SGBattle.step(g, b);
      b.phase = 'end'; b.winner = b.atk.troops > b.def.troops ? 'atk' : 'def';
    }
  }

  /* 玩家战斗的快速推演(玩家用 aiTactic 代打,用于自动/跳过) */
  function autoPlayerBattle(g, b, playerSide) {
    let guard = 0;
    while (b.phase !== 'end' && guard++ < 200) {
      b.atk.tactic = playerSide === 'atk' ? SGBattle.aiTactic(g, b, b.atk) : SGBattle.aiTactic(g, b, b.atk);
      b.def.tactic = SGBattle.aiTactic(g, b, b.def);
      SGBattle.step(g, b);
    }
  }

  return { runFaction, resolveArrivals, autoResolve, autoPlayerBattle, pickTarget };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGAI;
