/* ============================================================
 * 三国烽火 · 核心引擎(纯逻辑,无 DOM,可在 Node 中模拟测试)
 * 回合制:1 回合 = 1 月。每月:玩家/AI 下指令 → 行军到达 →
 * 战斗演算 → 月末结算(收入/粮耗/忠诚/事件) → 自动存档
 * ============================================================ */
'use strict';

const SGEngine = (() => {
  const D = SG_DATA;
  const rnd = (n) => Math.random() * n;
  const irnd = (n) => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[irnd(arr.length)];

  /* ================= 新游戏 ================= */
  function newGame(playerFaction, difficulty) {
    const g = {
      version: 1,
      turn: 0,               // 自 gameStart 起的月数
      year: D.SCENARIO.year, month: 1,
      playerFaction,         // 势力 id
      difficulty,            // 0简单 1普通 2困难
      cities: {}, generals: {}, factions: {},
      battles: [],           // 本月发生的战斗记录(供 UI 播放)
      log: [],               // 全局事件日志
      grudge: {},            // 血仇记忆 grudge[受害势力][加害势力] = turn
      moves: [],             // 在途部队 [{from,to,faction,troops,generals[],eta}]
      defeated: [],          // 已灭亡势力
      gameOver: null,        // {win:bool, faction}
      aiBonus: difficulty === 2 ? 1.25 : difficulty === 0 ? 0.85 : 1.0,
    };

    /* 城池初始化 */
    D.CITY_DEFS.forEach(([name, x, y, owner, pop, agri, com, walls], i) => {
      g.cities[name] = {
        id: i, name, x, y, pop,
        agriMax: agri, agri: Math.floor(agri * 0.45),   // 已开发农业
        comMax: com,  com:  Math.floor(com * 0.45),      // 已开发商业
        walls, wallHp: walls,       // 城防现值
        owner: owner || null,
        troops: 0, training: 50, morale: 70,
        gold: 0, food: 0,
        acted: false,               // 本月内政指令已用
        raided: 0,                  // 战火减产 debuff 月数
      };
    });

    /* 邻接表 */
    g.adj = {};
    Object.keys(g.cities).forEach(n => g.adj[n] = []);
    D.LINKS.forEach(([a, b]) => {
      if (g.adj[a] && g.adj[b]) { g.adj[a].push(b); g.adj[b].push(a); }
    });

    /* 武将初始化 */
    D.GEN_DEFS.forEach(([name, lead, force, int, pol, charm, city, faction, loyalty], i) => {
      g.generals[name] = {
        id: i, name, lead, force, int, pol, charm,
        faction: faction || null, city,
        loyalty: loyalty < 0 ? 100 : loyalty,
        isRuler: loyalty < 0,
        troops: 0,                 // 部队兵力(出征时)
        status: faction ? 'serve' : 'free',   // serve|free|captured|moving
        exp: 0, kills: 0, duelsWon: 0,
      };
    });

    /* 势力初始化 */
    D.FACTIONS.forEach(f => {
      g.factions[f.id] = {
        ...f, cities: [], gold: 0, food: 0,
        alive: true,
      };
    });

    /* 分配城池给势力,设置初始钱粮兵 */
    Object.values(g.cities).forEach(c => {
      if (!c.owner) { // 空城
        c.troops = 2000 + irnd(2000);
        c.gold = 200; c.food = 2000;
        return;
      }
      const f = g.factions[c.owner];
      f.cities.push(c.name);
      const tier = c.pop / 46;     // 大城多兵
      c.troops = Math.floor((3000 + tier * 12000) * (0.9 + rnd(0.2)));
      c.gold = Math.floor(150 + tier * 500);
      c.food = Math.round(c.troops * 7);      // 约7个月军粮,七月即有秋收
      /* 剧本加成:曹操挟天子(许都本部重兵,长安洛阳留守)、张鲁汉中天险 */
      if (c.owner === 'cao') {
        c.gold = Math.round(c.gold * 1.5); c.food = Math.round(c.food * 2.0);
        if (c.name === '长安' || c.name === '洛阳') c.troops = Math.round(c.troops * 0.55);
        else c.troops = Math.round(c.troops * 2.15);
      }
      if (c.owner === 'lu') c.troops = Math.round(c.troops * 1.6);     // 汉中天险
      if (c.owner === 'zhang' && c.name === '成都') c.troops = Math.round(c.troops * 1.3);
    });

    /* 势力国库 = 城池之和(简化:钱粮存在城里,势力面板汇总) */
    log(g, `【${D.SCENARIO.year}年】${D.SCENARIO.desc}`);
    return g;
  }

  function log(g, msg, type) {
    g.log.push({ turn: g.turn, msg, type: type || 'info' });
    if (g.log.length > 400) g.log.splice(0, g.log.length - 400);
  }

  /* ================= 查询辅助 ================= */
  const factionCities = (g, fid) => Object.values(g.cities).filter(c => c.owner === fid);
  const cityGenerals = (g, cityName) => Object.values(g.generals)
    .filter(x => x.city === cityName && x.status !== 'moving' && x.status !== 'captured');
  const cityFreeGenerals = (g, cityName) => Object.values(g.generals)
    .filter(x => x.city === cityName && x.status === 'free');
  const factionGenerals = (g, fid) => Object.values(g.generals)
    .filter(x => x.faction === fid && x.status !== 'captured');

  function factionPower(g, fid) {
    let troops = 0, gen = 0, cities = 0, agri = 0, com = 0;
    Object.values(g.cities).forEach(c => {
      if (c.owner === fid) { troops += c.troops; cities++; agri += c.agri; com += c.com; }
    });
    gen = factionGenerals(g, fid).length;
    return { troops, gen, cities, agri, com, score: cities * 100 + gen * 40 + troops / 400 };
  }

  const isAdjacent = (g, a, b) => (g.adj[a] || []).includes(b);

  /* ================= 玩家/AI 通用指令 =================
   * 每条指令返回 {ok, msg};由 UI 或 AI 层调用
   */

  /* 内政:开发农业 */
  function cmdAgri(g, cityName, genName) {
    const c = g.cities[cityName], gen = g.generals[genName];
    if (!c || !gen || gen.city !== cityName) return { ok: false, msg: '武将不在城中' };
    if (c.acted) return { ok: false, msg: '本月该城已执行过内政' };
    const gain = Math.max(1, Math.round((3 + gen.pol * 0.09) * (c.raided > 0 ? 0.6 : 1)));
    const before = c.agri;
    c.agri = clamp(c.agri + gain, 0, c.agriMax);
    c.acted = true;
    addExp(gen, 4);
    return { ok: true, msg: `${cityName}开垦屯田,农业 ${before}→${c.agri}` };
  }

  /* 内政:发展商业 */
  function cmdCommerce(g, cityName, genName) {
    const c = g.cities[cityName], gen = g.generals[genName];
    if (!c || !gen || gen.city !== cityName) return { ok: false, msg: '武将不在城中' };
    if (c.acted) return { ok: false, msg: '本月该城已执行过内政' };
    const gain = Math.max(1, Math.round((3 + gen.pol * 0.09) * (c.raided > 0 ? 0.6 : 1)));
    const before = c.com;
    c.com = clamp(c.com + gain, 0, c.comMax);
    c.acted = true;
    addExp(gen, 4);
    return { ok: true, msg: `${cityName}兴商利市,商业 ${before}→${c.com}` };
  }

  /* 内政:征兵 */
  function cmdConscript(g, cityName, genName, count) {
    const c = g.cities[cityName], gen = g.generals[genName];
    if (!c || !gen || gen.city !== cityName) return { ok: false, msg: '武将不在城中' };
    if (c.acted) return { ok: false, msg: '本月该城已执行过内政' };
    const costGold = Math.round(count / 100);          // 100 人 1 金
    const costFood = Math.round(count * 1.2);          // 1 人 1.2 粮
    if (c.gold < costGold) return { ok: false, msg: '金不足' };
    if (c.food < costFood) return { ok: false, msg: '粮不足' };
    /* 人口池限制:1 万人口供 400 兵源 */
    const capped = Math.min(count, Math.floor(c.pop * 400));
    if (capped < 300) return { ok: false, msg: '城内兵源枯竭(人口不足)' };
    const leadBonus = 1 + gen.charm * 0.004 + gen.lead * 0.002;
    const actual = Math.round(capped * clamp(leadBonus, 1, 1.5));
    c.gold -= costGold; c.food -= costFood;
    c.troops += actual;
    c.pop = Math.max(4, c.pop - actual / 400);
    c.morale = clamp(c.morale - 2, 0, 100);
    /* 随营操练:征兵附带基础训练 */
    c.training = clamp(c.training + 3, 0, 100);
    c.acted = true;
    addExp(gen, 5);
    return { ok: true, msg: `${cityName}征募新兵 ${actual} 人(士气-2)` };
  }

  /* 内政:训练 */
  function cmdTrain(g, cityName, genName) {
    const c = g.cities[cityName], gen = g.generals[genName];
    if (!c || !gen || gen.city !== cityName) return { ok: false, msg: '武将不在城中' };
    if (c.acted) return { ok: false, msg: '本月该城已执行过内政' };
    const gain = Math.max(2, Math.round(2 + gen.lead * 0.09));
    c.training = clamp(c.training + gain, 0, 100);
    c.morale = clamp(c.morale + 3, 0, 100);
    c.acted = true;
    addExp(gen, 4);
    return { ok: true, msg: `${cityName}操练军马,训练+${gain} 士气+3` };
  }

  /* 内政:修城墙 */
  function cmdRepair(g, cityName, genName) {
    const c = g.cities[cityName], gen = g.generals[genName];
    if (!c || !gen || gen.city !== cityName) return { ok: false, msg: '武将不在城中' };
    if (c.acted) return { ok: false, msg: '本月该城已执行过内政' };
    if (c.wallHp >= c.walls) return { ok: false, msg: '城防已满' };
    const gain = Math.max(2, Math.round(2 + gen.pol * 0.1));
    c.wallHp = clamp(c.wallHp + gain, 0, c.walls);
    c.acted = true;
    addExp(gen, 3);
    return { ok: true, msg: `${cityName}修缮城郭,城防 ${c.wallHp}` };
  }

  /* 内政:搜索(钱粮/在野武将) */
  function cmdSearch(g, cityName, genName) {
    const c = g.cities[cityName], gen = g.generals[genName];
    if (!c || !gen || gen.city !== cityName) return { ok: false, msg: '武将不在城中' };
    if (c.acted) return { ok: false, msg: '本月该城已执行过内政' };
    c.acted = true;
    addExp(gen, 3);
    const free = cityFreeGenerals(g, cityName);
    const chance = 0.35 + gen.charm * 0.004;
    if (free.length && Math.random() < chance) {
      const found = pick(free);
      return { ok: true, msg: `${cityName}访贤问杰,寻得在野之士【${found.name}】!`, found: found.name };
    }
    const gold = Math.round(rnd(80) + gen.int * 0.5);
    const food = Math.round(rnd(600) + gen.int * 4);
    c.gold += gold; c.food += food;
    return { ok: true, msg: `${cityName}清查府库,得金${gold} 粮${food}` };
  }

  /* 内政:录用在野/俘虏 */
  function cmdRecruit(g, cityName, genName, targetName) {
    const c = g.cities[cityName], gen = g.generals[genName], t = g.generals[targetName];
    if (!c || !gen || !t) return { ok: false, msg: '目标不存在' };
    if (gen.city !== cityName) return { ok: false, msg: '武将不在城中' };
    if (t.city !== cityName) return { ok: false, msg: '目标不在该城' };
    if (t.status !== 'free') return { ok: false, msg: '对方并非在野' };
    if (c.acted) return { ok: false, msg: '本月该城已执行过内政' };
    c.acted = true;
    const ruler = Object.values(g.generals).find(x => x.faction === gen.faction && x.isRuler);
    const rulerCharm = ruler ? ruler.charm : 50;
    /* 录用成功率:政治+魅力对比,名士(高魅力)难招 */
    const score = gen.pol * 0.5 + gen.charm * 0.4 + rulerCharm * 0.3 + 15 - t.charm * 0.5;
    if (Math.random() * 100 < score) {
      t.faction = gen.faction; t.status = 'serve';
      t.loyalty = clamp(80 + irnd(15), 0, 100);
      addExp(gen, 6);
      return { ok: true, msg: `【${t.name}】感其诚意,归顺麾下!` , recruited: t.name};
    }
    return { ok: false, msg: `【${t.name}】婉言谢绝了邀请` };
  }

  /* 赏赐笼络忠诚 */
  function cmdReward(g, cityName, genName) {
    const c = g.cities[cityName], gen = g.generals[genName];
    if (!c || !gen) return { ok: false, msg: '目标不存在' };
    if (gen.city !== cityName || gen.faction !== c.owner) return { ok: false, msg: '武将不在本城' };
    if (c.gold < 50) return { ok: false, msg: '金不足(需50)' };
    c.gold -= 50;
    gen.loyalty = clamp(gen.loyalty + 8 + irnd(5), 0, 100);
    return { ok: true, msg: `赏赐金50,${gen.name}忠诚+${8}` };
  }

  /* 军事:出征(部队行军 1 月后抵达,下月初接战) */
  function cmdMarch(g, fromName, toName, troops, genNames) {
    const from = g.cities[fromName], to = g.cities[toName];
    if (!from || !to) return { ok: false, msg: '城池不存在' };
    if (!from.owner) return { ok: false, msg: '城池无主' };
    if (!isAdjacent(g, fromName, toName)) return { ok: false, msg: '不与目标城相邻' };
    if (to.owner === from.owner) return { ok: false, msg: '目标为本方城池(请用输送)' };
    const gens = genNames.map(n => g.generals[n]).filter(Boolean);
    if (!gens.length) return { ok: false, msg: '请选择出征武将' };
    const gen = gens[0];
    if (gen.city !== fromName) return { ok: false, msg: '武将不在出发城' };
    if (from.troops < troops || troops < 500) return { ok: false, msg: '兵力不足(至少500)' };
    if (gens.length > 5) return { ok: false, msg: '最多5将出征' };
    const capacity = gens.reduce((s, x) => s + 500 + x.lead * 130, 0);
    if (troops > capacity) return { ok: false, msg: `超出统率上限 ${capacity} 人` };
    /* 留守检查:攻城需留兵 */
    if (from.troops - troops < 800 && to.owner !== null) {
      // 允许,但 AI 层会自行避免
    }
    from.troops -= troops;
    gens.forEach(x => { x.status = 'moving'; x.troops = 0; });
    g.moves.push({
      from: fromName, to: toName, faction: from.owner,
      troops, gens: genNames, eta: g.turn + 1, id: g.moves.length + Math.random(),
    });
    return { ok: true, msg: `${fromName}出兵 ${troops} 人攻${toName},主将【${gen.name}】` };
  }

  /* 军事:输送(本方相邻城移兵移将,粮草按比例随行) */
  function cmdTransfer(g, fromName, toName, troops, genNames) {
    const from = g.cities[fromName], to = g.cities[toName];
    if (!from || !to || from.owner !== to.owner) return { ok: false, msg: '目标非本方城池' };
    if (!isAdjacent(g, fromName, toName)) return { ok: false, msg: '不与目标城相邻' };
    if (from.troops < troops) return { ok: false, msg: '兵力不足' };
    if (troops === 0 && from.food < 500 && from.gold < 200) return { ok: false, msg: '无可输物资' };
    /* 粮草辎重随军:按运兵占比带走八成存量 */
    const ratio = troops / (from.troops + 1);
    const foodSend = troops === 0 ? Math.round(from.food * 0.5) : Math.round(from.food * 0.8 * ratio);
    const goldSend = troops === 0 ? Math.round(from.gold * 0.5) : Math.round(from.gold * 0.8 * ratio);
    from.troops -= troops; to.troops += troops;
    from.food -= foodSend; to.food += foodSend;
    from.gold -= goldSend; to.gold += goldSend;
    /* 平均两城训练/士气 */
    to.training = Math.round((to.training + from.training) / 2);
    const gens = genNames.map(n => g.generals[n]).filter(Boolean);
    gens.forEach(x => { x.city = toName; });
    return { ok: true, msg: `${fromName}调兵 ${troops} 人${foodSend ? `,粮${foodSend}` : ''}${gens.length ? `及${gens.map(x=>x.name).join('、')}` : ''}至${toName}` };
  }

  function addExp(gen, n) { gen.exp += n; }

  /* ================= 月末结算 ================= */
  function settleMonth(g) {
    /* 均输平准:势力内粮草金锭统筹调度(中央输粮,按驻军比例分发) */
    const byFaction = {};
    Object.values(g.cities).forEach(c => { if (c.owner) (byFaction[c.owner] = byFaction[c.owner] || []).push(c); });
    Object.entries(byFaction).forEach(([fid, list]) => {
      if (list.length < 2) return;
      const foodTotal = list.reduce((s, c) => s + c.food, 0);
      const troopsTotal = list.reduce((s, c) => s + c.troops, 0);
      if (troopsTotal > 0) {
        let distributed = 0;
        list.forEach((c, i) => {
          const share = i === list.length - 1
            ? Math.round(foodTotal) - distributed
            : Math.round(foodTotal * (c.troops / troopsTotal));
          c.food = Math.max(0, share);
          distributed += c.food;
        });
      }
      const goldTotal = list.reduce((s, c) => s + c.gold, 0);
      list.forEach((c, i) => {
        c.gold = i === list.length - 1
          ? Math.round(goldTotal) - Math.round(goldTotal / list.length) * (list.length - 1)
          : Math.round(goldTotal / list.length);
      });
    });

    Object.values(g.cities).forEach(c => {
      /* 收入:金=商业*0.9/月;粮=七月秋收 农业*500/年 */
      const raidedMul = c.raided > 0 ? 0.5 : 1;
      if (c.owner) {
        c.gold += Math.round(c.com * 0.9 * raidedMul);
        if (g.month === 7) c.food += Math.round(c.agri * 760 * raidedMul);
        /* 军粮消耗 */
        const eat = Math.round(c.troops * 0.55);
        c.food -= eat;
        if (c.food < 0) {
          /* 断粮:逃兵+士气降 */
          const desert = Math.min(c.troops, Math.round(-c.food / 1.5));
          c.troops -= desert;
          c.morale = clamp(c.morale - 12, 5, 100);
          c.food = 0;
        }
        /* 人口恢复:和平城市生聚+流民来附(战乱流失),是兵源之本 */
        if (c.raided <= 0) c.pop = Math.min(100, c.pop * (c.owner ? 1.015 : 1.004));
      }
      /* 城防缓慢自愈 */
      if (c.wallHp < c.walls) c.wallHp = Math.min(c.walls, c.wallHp + 1);
      if (c.raided > 0) c.raided--;
      /* 民忠回归 */
      c.morale = clamp(c.morale + 1, 0, 100);
      /* 训练衰减 */
      c.training = clamp(c.training - 1, 0, 100);
      /* 重置行动 */
      c.acted = false;
    });

    /* 武将忠诚度漂移:与君主魅力、势力大小相关 */
    Object.values(g.factions).forEach(f => {
      if (!f.alive) return;
      const ruler = Object.values(g.generals).find(x => x.faction === f.id && x.isRuler);
      if (!ruler) return;
      const n = factionCities(g, f.id).length;
      factionGenerals(g, f.id).forEach(gen => {
        if (gen.isRuler) return;
        const drift = (ruler.charm - 70) * 0.15 + (n - 5) * 0.05;
        gen.loyalty = clamp(gen.loyalty + drift + (rnd(3) - 1.5), 0, 100);
        /* 忠诚过低且非玩家势力 → 小概率叛逃至相邻强势力或在野 */
        if (gen.loyalty < 25 && Math.random() < 0.06) {
          const c = g.cities[gen.city];
          if (c && c.owner === f.id) {
            defect(g, gen);
          }
        }
      });
    });

    /* 年月推进 */
    g.turn++;
    g.month++;
    if (g.month > 12) { g.month = 1; g.year++; }
  }

  function defect(g, gen) {
    /* 找本城相邻的敌城,投靠最强者;无处可去则在野 */
    const adj = g.adj[gen.city] || [];
    const enemies = adj.map(n => g.cities[n]).filter(c => c.owner && c.owner !== gen.faction);
    if (enemies.length) {
      enemies.sort((a, b) => b.troops - a.troops);
      const to = enemies[0];
      gen.faction = to.owner;
      log(g, `【${gen.name}】不满苛待,叛投${g.factions[to.owner].name}!`, 'bad');
    } else {
      gen.faction = null; gen.status = 'free';
      log(g, `【${gen.name}】挂印封金,弃官隐居`, 'warn');
    }
  }

  /* ================= 灭亡检查 ================= */
  function checkElimination(g) {
    Object.values(g.factions).forEach(f => {
      if (!f.alive) return;
      if (factionCities(g, f.id).length === 0) {
        f.alive = false;
        g.defeated.push({ id: f.id, name: f.name, turn: g.turn });
        factionGenerals(g, f.id).forEach(gen => {
          if (gen.status === 'moving') gen.status = 'free';
          gen.faction = null; gen.status = gen.status === 'serve' ? 'free' : gen.status;
        });
        log(g, `⚑ ${f.name}势力覆灭,宗庙倾颓!`, 'faction');
        if (f.id === g.playerFaction) {
          g.gameOver = { win: false, reason: '势力灭亡' };
        }
      }
    });
    /* 统一检查 */
    const alive = Object.values(g.factions).filter(f => f.alive && factionCities(g, f.id).length > 0);
    if (alive.length === 1 && !g.gameOver) {
      g.gameOver = { win: alive[0].id === g.playerFaction, faction: alive[0].id, reason: '天下一统' };
      log(g, `☰ ${alive[0].name}扫平群雄,天下归一!`, 'faction');
    }
  }

  return {
    newGame, log, settleMonth, checkElimination, defect,
    factionCities, cityGenerals, cityFreeGenerals, factionGenerals, factionPower, isAdjacent,
    cmdAgri, cmdCommerce, cmdConscript, cmdTrain, cmdRepair, cmdSearch, cmdRecruit, cmdReward,
    cmdMarch, cmdTransfer,
  };
})();

/* Node 测试支持 */
if (typeof module !== 'undefined' && module.exports) module.exports = SGEngine;
