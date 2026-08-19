/* ============================================================
 * 三国烽火 · 主控制器
 * 回合流程(玩家点"结束月"):
 *   ① AI 势力行动 → ② 在途部队到达接战 → ③ 玩家战斗交 UI
 *   ④ 月末结算 → ⑤ 灭亡/统一检查 → ⑥ 自动存档
 * ============================================================ */
'use strict';

const SGGame = (() => {

  /* 当前对局(运行时单例) */
  let g = null;

  function current() { return g; }
  function setGame(game) { g = game; }

  function startNew(factionId, difficulty) {
    g = SGEngine.newGame(factionId, difficulty);
    SGSave.save(0, g, true);        // 新开局写入槽0并记录为最近存档(避免自动保存误覆旧槽)
    return g;
  }

  /* ---------- 结束月(分两段:可能需要玩家打战斗) ---------- */
  function endTurn() {
    if (!g || g.gameOver) return { phase: 'none' };
    g.battles = [];

    /* ① AI 行动(玩家势力跳过;灭亡势力跳过) */
    Object.values(g.factions).forEach(f => {
      if (f.id === g.playerFaction || !f.alive) return;
      if (SGEngine.factionCities(g, f.id).length === 0) return;
      try { SGAI.runFaction(g, f.id); }
      catch (e) { /* AI 单势力异常不致命 */ if (typeof console !== 'undefined') console.warn('AI error', f.id, e); }
    });

    /* ② 部队到达 → 接战 */
    SGAI.resolveArrivals(g);

    /* ③ 涉及玩家的战斗 → 交 UI */
    const playerBattles = g.battles.filter(b =>
      b.phase !== 'end' && (b.atk.faction === g.playerFaction || b.def.faction === g.playerFaction));
    if (playerBattles.length) {
      return { phase: 'battle', battles: playerBattles };
    }
    return finishTurn();
  }

  /* 玩家战斗全部解决后调用 */
  function finishTurn() {
    /* ④ 月末结算 */
    SGEngine.settleMonth(g);

    /* ⑤ 灭亡/统一检查 */
    SGEngine.checkElimination(g);

    /* ⑥ 自动保存(最后使用的槽) */
    const last = SGSave.lastSlot();
    const slot = (last === null || last === undefined) ? 0 : last;
    SGSave.save(slot, g, true);

    /* 事件:随机小事件增味 */
    if (Math.random() < 0.12) randomEvent(g);

    return { phase: 'done', gameOver: g.gameOver };
  }

  /* ---------- 随机事件(轻量风味) ---------- */
  function randomEvent(game) {
    const cities = SGEngine.factionCities(game, game.playerFaction);
    if (!cities.length) return;
    const c = cities[Math.floor(Math.random() * cities.length)];
    const roll = Math.random();
    if (roll < 0.3) {
      c.food += 2000;
      SGEngine.log(game, `🌾 ${c.name}岁稔年丰,流民来投,粮+2000`, 'good');
    } else if (roll < 0.5) {
      c.gold += 300;
      SGEngine.log(game, `💰 ${c.name}商旅云集,市税增收,金+300`, 'good');
    } else if (roll < 0.65) {
      c.morale = Math.max(0, c.morale - 8);
      SGEngine.log(game, `🜄 ${c.name}疫病流行,民心惶惶(民忠-8)`, 'bad');
    } else if (roll < 0.8) {
      const gens = SGEngine.cityGenerals(game, c.name).filter(x => x.faction === game.playerFaction);
      if (gens.length) {
        const t = gens[Math.floor(Math.random() * gens.length)];
        t.loyalty = Math.min(100, t.loyalty + 10);
        SGEngine.log(game, `🍶 ${t.name}感主上知遇之恩,效死之心愈坚(忠诚+10)`, 'good');
      }
    } else {
      c.troops += 800;
      SGEngine.log(game, `🛡 ${c.name}豪侠率乡勇来投,兵+800`, 'good');
    }
  }

  /* ---------- 玩家战斗一轮(由 UI 战斗面板调用) ---------- */
  function battleStep(battle, playerTactic, playerSide) {
    const side = playerSide === 'atk' ? battle.atk : battle.def;
    const other = playerSide === 'atk' ? battle.def : battle.atk;
    side.tactic = playerTactic;
    other.tactic = SGBattle.aiTactic(g, battle, other);
    SGBattle.step(g, battle);
    return battle;
  }

  /* 战斗快速自动打完(玩家点"委任") */
  function battleAuto(battle, playerSide) {
    let guard = 0;
    while (battle.phase !== 'end' && guard++ < 200) {
      battle.atk.tactic = SGBattle.aiTactic(g, battle, battle.atk);
      battle.def.tactic = SGBattle.aiTactic(g, battle, battle.def);
      SGBattle.step(g, battle);
    }
    return battle;
  }

  return {
    current, setGame, startNew, endTurn, finishTurn,
    battleStep, battleAuto, randomEvent,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGGame;
