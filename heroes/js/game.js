/* ============================================================
 * 征服纪元 · game.js — 游戏主引擎
 * 回合/经济/建造/招募/移动触发/战斗结算/升级/存档
 * 无 DOM 依赖
 * ============================================================ */
(function (G) {
  'use strict';
  const {
    CREATURES, FACTIONS, FACTION_IDS, TERRAIN, SPELLS, SPELLS_BY_LEVEL, SKILLS, SKILL_IDS,
    ARTIFACTS, COMMON_BUILDINGS, FACTION_BUILDINGS, MINE_DEFS, unitPower, growthOf,
    MIGHT_HEROES, MAGIC_HEROES, MIGHT_EMOJI, MAGIC_EMOJI,
    RNG, clamp, canAfford, payCost, addRes,
  } = G;

  const PLAYER_COLORS = [
    { name: '红', hex: '#e5484d' }, { name: '蓝', hex: '#3b82f6' }, { name: '绿', hex: '#22c55e' },
    { name: '黄', hex: '#eab308' }, { name: '紫', hex: '#a855f7' }, { name: '青', hex: '#06b6d4' },
    { name: '橙', hex: '#f97316' }, { name: '粉', hex: '#ec4899' },
  ];

  /* ---------- 游戏内随机数(mulberry32,状态可序列化) ---------- */
  function rnd(game) {
    let t = (game.rngS = (game.rngS + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rndInt = (g, a, b) => a + Math.floor(rnd(g) * (b - a + 1));
  const rndPick = (g, arr) => arr[Math.floor(rnd(g) * arr.length)];
  const rndChance = (g, p) => rnd(g) < p;

  /* ================= 新游戏 ================= */
  function newGame(opts) {
    /* opts: {size, players, playerFaction, difficulty, seed, playerName} */
    const gen = G.genMap({
      size: opts.size, players: opts.players,
      playerFactions: Object.assign({ 0: opts.playerFaction }, opts.playerFactions || {}),
      seed: opts.seed,
    });
    const game = {
      v: 1,
      seed: opts.seed, rngS: (opts.seed >>> 0) || 12345,
      day: 1, curPlayer: 0, ended: false, winner: -1,
      difficulty: opts.difficulty || 'normal',
      map: gen.map, objects: gen.objects, objAt: gen.objAt,
      towns: gen.townObjs.map(o => o.id),
      players: [], heroes: [],
      fog: [],
      pendingLevels: [],
      usedHeroNames: {},
      log: [],
      stats: { battles: 0, captures: 0 },
    };
    for (let i = 0; i < opts.players; i++) {
      game.players.push({
        id: i, name: i === 0 ? (opts.playerName || '玩家') : (PLAYER_COLORS[i].name + '方'),
        color: PLAYER_COLORS[i].name, hex: PLAYER_COLORS[i].hex,
        isHuman: i === 0, defeated: false,
        resources: { gold: 10000 + (i === 0 ? 0 : aiBonusGold(opts.difficulty)), wood: 20, ore: 20, mercury: 5, sulfur: 5, crystal: 5, gems: 5 },
        personality: ['aggressive', 'economic', 'balanced'][i % 3 === 0 ? 0 : (i % 3)],
      });
      game.fog.push(new Uint8Array(gen.map.w * gen.map.h));
    }
    /* 城镇法术(魔法行会随机) */
    for (const t of game.objects.filter(o => o.type === 'town')) {
      t.spells = rollGuildSpells(game, t.faction);
      refreshTavern(game, t);
      /* 玩家主城初始驻军,防开局裸奔被偷 */
      if (t.owner >= 0) {
        const f = FACTIONS[t.faction];
        t.garrison[0] = { id: f.units[0], count: 30 };
        t.garrison[1] = { id: f.units[1], count: 15 };
        t.garrison[2] = { id: f.units[2], count: 8 };
      }
    }
    /* 初始英雄 + 迷雾 */
    for (let i = 0; i < opts.players; i++) {
      const town = game.objects.find(o => o.type === 'town' && o.owner === i);
      if (town) {
        const h = createHero(game, i, town.faction, town.x, town.y, i === 0 ? 'might' : rndChance(game, 0.5) ? 'might' : 'magic');
        game.heroes.push(h);
        revealAt(game, i, town.x, town.y, 8);
      }
    }
    return game;
  }
  const aiBonusGold = (d) => d === 'hard' ? 8000 : d === 'insane' ? 16000 : 0;

  /* ================= 英雄 ================= */
  function createHero(game, owner, faction, x, y, cls) {
    const isMight = cls !== 'magic';
    const pool = isMight ? MIGHT_HEROES : MAGIC_HEROES;
    const emojis = isMight ? MIGHT_EMOJI : MAGIC_EMOJI;
    let name = rndPick(game, pool);
    let guard = 0;
    while (game.usedHeroNames[name] && guard++ < 40) name = rndPick(game, pool) + '·' + rndInt(game, 2, 99);
    game.usedHeroNames[name] = 1;
    const h = {
      id: G.uid('h'), owner, x, y, name, emoji: rndPick(game, emojis),
      faction, cls: isMight ? 'might' : 'magic',
      level: 1, exp: 0,
      bAtt: isMight ? 2 : 1, bDef: isMight ? 2 : 1, bPow: isMight ? 1 : 2, bKnow: isMight ? 1 : 2,
      mana: 10, moveLeft: 0,
      army: new Array(7).fill(null),
      skills: {}, artifacts: [], spells: [],
      path: null, visits: {},
    };
    const sk = rndPick(game, SKILL_IDS);
    h.skills[sk] = 1;
    const f = FACTIONS[faction];
    h.army[0] = { id: f.units[0], count: 20 + rndInt(game, 0, 6) };
    h.army[1] = { id: f.units[1], count: 6 + rndInt(game, 0, 4) };
    h.spells = [rndPick(game, SPELLS_BY_LEVEL[1])];
    if (!isMight) h.spells.push(rndPick(game, SPELLS_BY_LEVEL[1]));
    h.spells = h.spells.filter((v, i, a) => a.indexOf(v) === i);
    refreshHero(h);
    h.mana = heroMaxMana(h);
    h.moveLeft = heroMaxMove(h);
    return h;
  }

  function heroArtSum(h, cls) {
    let s = 0;
    for (const aid of h.artifacts) {
      const a = ARTIFACTS[aid];
      if (!a) continue;
      if (a.cls === cls || a.cls === 'all') s += a.val;
    }
    return s;
  }

  function refreshHero(h) {
    h.att = h.bAtt + heroArtSum(h, 'att');
    h.def = h.bDef + heroArtSum(h, 'def');
    h.pow = h.bPow + heroArtSum(h, 'pow');
    h.know = h.bKnow + heroArtSum(h, 'know');
    h.spdBonus = heroArtSum(h, 'spd');
    h.mpBonus = heroArtSum(h, 'mp');
    h.sightBonus = heroArtSum(h, 'sight');
    h.goldPerDay = heroArtSum(h, 'gold');
    h.dmgPct = heroArtSum(h, 'dmgPct');
    h.rangedPct = heroArtSum(h, 'rangedPct');
    h.res = Math.min(70, heroArtSum(h, 'res'));
    h.manaBonus = heroArtSum(h, 'mana');
  }
  const heroMaxMove = (h) => Math.round((1560 + (h.mpBonus || 0)) * (1 + 0.1 * ((h.skills && h.skills.logistics) || 0)));
  const heroMaxMana = (h) => h.know * 10 + (h.manaBonus || 0);
  const heroSight = (h) => 5 + ((h.skills && h.skills.scouting) || 0) + (h.sightBonus || 0);
  const expForLevel = (lvl) => 500 * (lvl - 1) * lvl;   /* 累计 */

  function gainExp(game, hero, xp) {
    if (!hero || hero.dead) return;
    xp = Math.round(xp * (1 + 0.15 * ((hero.skills && hero.skills.learning) || 0)));
    hero.exp += xp;
    while (hero.exp >= expForLevel(hero.level + 1)) {
      hero.level++;
      levelUpStats(game, hero);
    }
  }

  function levelUpStats(game, hero) {
    const w = hero.cls === 'might'
      ? [['bAtt', 0.34], ['bDef', 0.34], ['bPow', 0.16], ['bKnow', 0.16]]
      : [['bAtt', 0.16], ['bDef', 0.16], ['bPow', 0.34], ['bKnow', 0.34]];
    let r = rnd(game);
    for (const [k, p] of w) { r -= p; if (r <= 0) { hero[k]++; break; } }
    refreshHero(hero);
    /* 技能二选一 */
    const avail = SKILL_IDS.filter(s => (hero.skills[s] || 0) < 3);
    if (!avail.length) return;
    const opts = [];
    const poolCopy = avail.slice();
    for (let i = 0; i < 2 && poolCopy.length; i++) {
      const s = poolCopy.splice(Math.floor(rnd(game) * poolCopy.length), 1)[0];
      opts.push(s);
    }
    if (game.players[hero.owner].isHuman) {
      game.pendingLevels.push({ hero: hero.id, options: opts });
    } else {
      hero.skills[opts[0]] = (hero.skills[opts[0]] || 0) + 1;
    }
  }

  function applyLevelChoice(game, heroId, skillId) {
    const hero = game.heroes.find(h => h.id === heroId);
    if (!hero) return;
    hero.skills[skillId] = (hero.skills[skillId] || 0) + 1;
    refreshHero(hero);
  }

  /* ================= 迷雾 ================= */
  function revealAt(game, pi, cx, cy, r) {
    const { w, h } = game.map, fog = game.fog[pi];
    const r2 = r * r;
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) fog[y * w + x] = 1;
  }
  const isRevealed = (game, pi, x, y) => game.fog[pi][y * game.map.w + x] === 1;

  /* ================= 部队工具 ================= */
  function armyPower(army) {
    let p = 0;
    for (const s of army || []) if (s && s.count > 0) p += unitPower(s.id) * s.count;
    return p;
  }
  function mergeStacks(army) {
    const map = {};
    const out = [];
    for (const s of army || []) {
      if (!s || s.count <= 0) continue;
      if (!map[s.id]) { map[s.id] = { id: s.id, count: 0 }; out.push(map[s.id]); }
      map[s.id].count += s.count;
    }
    out.sort((a, b) => b.count - a.count);
    const seven = out.slice(0, 7);
    while (seven.length < 7) seven.push(null);
    return seven;
  }
  /* 把 stack 加入 7 格军队,返回加入不了的数量 */
  function armyAdd(army, id, count) {
    for (const s of army) if (s && s.id === id && s.count > 0) {
      s.count += count; return 0;
    }
    for (let i = 0; i < army.length; i++) if (!army[i] || army[i].count <= 0) {
      army[i] = { id, count }; return 0;
    }
    return count;
  }
  const armyCount = (army) => army.reduce((n, s) => n + (s && s.count > 0 ? s.count : 0), 0);

  /* ================= 回合 ================= */
  function beginTurn(game) {
    const p = game.players[game.curPlayer];
    if (p.defeated) { endTurn(game); return; }
    /* 收入 */
    let income = 0, daily = {};
    const has = (town, id) => town.buildings.includes(id);
    for (const t of ownTowns(game, p.id)) {
      if (has(t, 'capitol')) income += 4000;
      else if (has(t, 'cityHall')) income += 2000;
      else if (has(t, 'townHall')) income += 1000;
      else income += 500;
      if (has(t, 'silo')) { daily.wood = (daily.wood || 0) + 2; daily.ore = (daily.ore || 0) + 2; }
      if (has(t, 'sp_rampart')) income += 350;
      if (has(t, 'sp_inferno')) daily.sulfur = (daily.sulfur || 0) + 1;
      const def = MINE_DEFS;
      void def;
    }
    for (const o of game.objects) {
      if (MINE_DEFS[o.type] && o.owner === p.id) {
        const m = MINE_DEFS[o.type];
        if (m.res === 'gold') income += m.n;
        else daily[m.res] = (daily[m.res] || 0) + m.n;
      }
    }
    for (const h of game.heroes) {
      if (h.owner === p.id && !h.dead) income += (h.goldPerDay || 0) + [0, 150, 300, 500][h.skills.estates || 0];
    }
    const aiMul = !p.isHuman && game.difficulty === 'hard' ? 1.3 : (!p.isHuman && game.difficulty === 'insane' ? 1.6 : 1);
    p.resources.gold += Math.round(income * aiMul);
    addRes(p.resources, daily);
    /* 英雄恢复 */
    for (const h of game.heroes) {
      if (h.owner !== p.id || h.dead) continue;
      h.moveLeft = heroMaxMove(h);
      const regen = 2 + 2 * (h.skills.mysticism || 0);
      h.mana = Math.min(heroMaxMana(h), h.mana + regen);
    }
    for (const t of ownTowns(game, p.id)) t.builtToday = false;
  }

  function endTurn(game) {
    checkDefeats(game);
    if (game.ended) return;
    /* 下一个玩家 */
    let next = game.curPlayer;
    for (let i = 1; i <= game.players.length; i++) {
      const cand = (game.curPlayer + i) % game.players.length;
      if (!game.players[cand].defeated) { next = cand; break; }
    }
    if (next <= game.curPlayer) {
      /* 新的一天 */
      game.day++;
      if ((game.day - 1) % 7 === 0) newWeek(game);
    }
    game.curPlayer = next;
    beginTurn(game);
  }

  function newWeek(game) {
    for (const o of game.objects) {
      if (o.type === 'town') {
        const mul = o.buildings.includes('castleB') ? 2 : o.buildings.includes('citadel') ? 1.5 : 1;
        const f = FACTIONS[o.faction];
        for (let t = 1; t <= 7; t++) {
          if (o.buildings.includes('dw' + t)) {
            const cid = f.units[t - 1];
            o.pool[cid] = (o.pool[cid] || 0) + Math.round(growthOf(cid, o.buildings) * mul);
          }
        }
        if (o.buildings.includes('sp_necro')) o.pool.skeleton = (o.pool.skeleton || 0) + 6;
        refreshTavern(game, o);
      } else if (o.type === 'dwelling') {
        o.pool = (o.pool || 0) + CREATURES[o.c].grow;
      } else if (o.type === 'windmill') {
        const res = ['mercury', 'sulfur', 'crystal', 'gems', 'gold'][Math.floor(rnd(game) * 5)];
        o.stock = { res, n: res === 'gold' ? rndInt(game, 300, 900) : rndInt(game, 1, 3) };
      }
    }
  }

  function checkDefeats(game) {
    for (const p of game.players) {
      if (p.defeated) continue;
      const hasTown = game.objects.some(o => o.type === 'town' && o.owner === p.id);
      const hasHero = game.heroes.some(h => h.owner === p.id && !h.dead);
      if (!hasTown && !hasHero) {
        p.defeated = true;
        pushLog(game, `${p.name} 被消灭了!`);
      }
    }
    const alive = game.players.filter(p => !p.defeated);
    if (alive.length <= 1) {
      game.ended = true;
      game.winner = alive.length ? alive[0].id : -1;
    }
  }

  const ownTowns = (game, pid) => game.objects.filter(o => o.type === 'town' && o.owner === pid);
  const ownHeroes = (game, pid) => game.heroes.filter(h => h.owner === pid && !h.dead);
  const pushLog = (game, msg) => { game.log.push({ day: game.day, msg }); if (game.log.length > 120) game.log.shift(); };

  /* ================= 移动与交互 ================= */
  /* hero.path: [{x,y}...]。逐步执行,遇事件暂停。
   * 返回 {status:'done'|'wait', need?:{...}} */
  function moveAlong(game, hero, onEvent) {
    if (!hero.path || !hero.path.length) return { status: 'done' };
    const pi = hero.owner;
    while (hero.path.length) {
      const step = hero.path[0];
      const cost = G.stepCost(game, hero, step.x, step.y);
      if (cost > hero.moveLeft) { return { status: 'wait' }; }
      hero.path.shift();
      hero.moveLeft -= cost;
      hero.x = step.x; hero.y = step.y;
      revealAt(game, pi, step.x, step.y, heroSight(hero));
      const o = game.objAt[step.y * game.map.w + step.x];
      if (!o) continue;
      const need = interact(game, hero, o);
      if (need) {
        if (need.type === 'battle') {
          const res = resolveBattleNeed(game, hero, need, onEvent);
          if (res === 'lost') return { status: 'dead' };
          if (res === 'stop') return { status: 'done' };
        } else {
          return { status: 'wait', need };
        }
      }
    }
    return { status: 'done' };
  }

  /* 触发物件;返回 need 或 null(自动完成) */
  function interact(game, hero, o) {
    const p = game.players[hero.owner];
    const gain = (res, n) => { p.resources[res] += n; };
    switch (o.type) {
      case 'pileGold': gain('gold', o.n); removeObject(game, o); pushLog(game, `捡到 ${o.n} 金币`); return null;
      case 'pileWood': gain('wood', o.n); removeObject(game, o); pushLog(game, `捡到 ${o.n} 木材`); return null;
      case 'pileOre': gain('ore', o.n); removeObject(game, o); pushLog(game, `捡到 ${o.n} 矿石`); return null;
      case 'pileRare': gain(o.res, o.n); removeObject(game, o); pushLog(game, `捡到 ${o.n} ${G.RES_CN[o.res]}`); return null;
      case 'campfire': {
        const gold = rndInt(game, 400, 900);
        p.resources.gold += gold;
        const res = rndPick(game, ['wood', 'ore', 'mercury', 'sulfur', 'crystal', 'gems']);
        gain(res, rndInt(game, 2, 5));
        removeObject(game, o);
        pushLog(game, `篝火:获得 ${gold} 金币与资源`);
        return null;
      }
      case 'chest': {
        if (p.isHuman) return { type: 'chest', obj: o };
        const gold = rndInt(game, 1000, 2500);
        if (game.day < 15 || rndChance(game, 0.5)) p.resources.gold += gold;
        else gainExp(game, hero, gold * 0.6);
        removeObject(game, o);
        return null;
      }
      case 'artifact': {
        const aid = o.a || randomArtifactId(game, 1);
        hero.artifacts.push(aid);
        refreshHero(hero);
        removeObject(game, o);
        pushLog(game, `${hero.name} 获得宝物 ${ARTIFACTS[aid].name}`);
        return null;
      }
      case 'learnstone': {
        if (o.used) return null;
        o.used = true;
        gainExp(game, hero, 1000);
        pushLog(game, `${hero.name} 在学习石前领悟,获得经验`);
        return null;
      }
      case 'shrine': {
        if (o.used) return null;
        o.used = true;
        if (!hero.spells.includes(o.spell)) {
          hero.spells.push(o.spell);
          pushLog(game, `${hero.name} 学会了 ${SPELLS[o.spell].name}`);
        }
        return null;
      }
      case 'windmill': {
        if (o.stock) {
          const s = o.stock;
          gain(s.res, s.n);
          pushLog(game, `风车磨坊:获得 ${s.n} ${s.res === 'gold' ? '金币' : G.RES_CN[s.res]}`);
          o.stock = null;
        }
        return null;
      }
      case 'watchtower': {
        if (o.used) return null;
        o.used = true;
        revealAt(game, hero.owner, o.x, o.y, 14);
        return null;
      }
      case 'arena': {
        if (o.used) return null;
        if (p.isHuman) return { type: 'arena', obj: o };
        o.used = true;
        hero.bAtt++; refreshHero(hero);
        return null;
      }
      case 'witchhut': {
        if (o.used) return null;
        if (p.isHuman) return { type: 'witch', obj: o };
        o.used = true;
        const sk = o.skill;
        if ((hero.skills[sk] || 0) < 3) hero.skills[sk] = (hero.skills[sk] || 0) + 1;
        return null;
      }
      case 'dwelling': {
        if (p.isHuman) return { type: 'dwelling', obj: o };
        aiBuyDwelling(game, hero, o);
        return null;
      }
      case 'monster': {
        const army = [{ id: o.c, count: o.n }];
        return { type: 'battle', kind: 'monster', obj: o, defArmy: army, defHero: null };
      }
      case 'sawmill': case 'orepit': case 'goldmine': case 'alchlab': case 'sulfurdune': case 'crystallcave': case 'gempond': {
        if (o.owner === hero.owner) return null;
        if (o.guard) {
          return { type: 'battle', kind: 'mine', obj: o, defArmy: [{ id: o.guard.c, count: o.guard.n }], defHero: null };
        }
        captureMine(game, hero, o);
        return null;
      }
      case 'town': {
        if (o.owner === hero.owner) {
          visitTown(game, hero, o);
          return { type: 'town', obj: o };
        }
        /* 攻城:守军 = 驻军 + 城内英雄部队 */
        const defHero = game.heroes.find(h => !h.dead && h.x === o.x && h.y === o.y && h.owner === o.owner);
        let defArmy = o.garrison.filter(s => s && s.count > 0);
        if (defHero) defArmy = defArmy.concat(defHero.army.filter(s => s && s.count > 0));
        if (!defArmy.length) {
          captureTown(game, hero, o);
          return { type: 'townCaptured', obj: o };
        }
        const siegeDef = o.buildings.includes('castleB') ? 5 : o.buildings.includes('citadel') ? 3 : o.buildings.includes('fort') ? 2 : 0;
        return { type: 'battle', kind: 'town', obj: o, defArmy, defHero: defHero || null, siegeDef };
      }
      default: return null;
    }
  }

  function removeObject(game, o) {
    const i = game.objects.indexOf(o);
    if (i >= 0) game.objects.splice(i, 1);
    if (game.objAt[o.y * game.map.w + o.x] === o) game.objAt[o.y * game.map.w + o.x] = null;
  }

  function captureMine(game, hero, o) {
    if (o.owner >= 0 && game.fog) { /* 无额外逻辑 */ }
    o.owner = hero.owner;
    pushLog(game, `${game.players[hero.owner].name} 占领了${MINE_DEFS[o.type] ? MINE_DEFS[o.type].name : '矿点'}`);
  }

  function captureTown(game, hero, o) {
    const oldOwner = o.owner;
    o.owner = hero.owner;
    o.garrison = new Array(7).fill(null);
    game.stats.captures++;
    pushLog(game, `${game.players[hero.owner].name} 攻占了 ${o.name}!`);
    /* AI 占城后留下较弱部队驻防,英雄驻守一段时间,避免城池被轻易翻盘 */
    if (!game.players[hero.owner].isHuman) {
      const stacks = hero.army.filter(s => s && s.count > 0).sort((a, b) => a.count * unitPower(a.id) - b.count * unitPower(b.id));
      const deposit = o.owner !== undefined && oldOwner >= 0 ? 3 : 2;
      for (const s of stacks.slice(0, deposit)) {
        const idx = hero.army.indexOf(s);
        if (idx >= 0) {
          armyAdd(o.garrison, s.id, s.count);
          hero.army[idx] = null;
        }
      }
      hero.garrisonUntil = game.day + 2;
      hero.anchorTown = o.id;
    }
    hero.path = null;
    if (oldOwner >= 0) checkDefeats(game);
    visitTown(game, hero, o);
  }

  /* 进城:学法术 + 补法力 */
  function visitTown(game, hero, o) {
    const lvl = guildLevel(o);
    let learned = [];
    for (let l = 1; l <= lvl; l++) {
      for (const sp of o.spells[l] || []) {
        if (!hero.spells.includes(sp)) { hero.spells.push(sp); learned.push(SPELLS[sp].name); }
      }
    }
    if (learned.length) pushLog(game, `${hero.name} 在${o.name}学会了 ${learned.join('、')}`);
    hero.mana = heroMaxMana(hero);
  }
  const guildLevel = (town) => {
    let l = 0;
    for (let i = 1; i <= 5; i++) if (town.buildings.includes('mage' + i)) l = i;
    return l;
  };

  function rollGuildSpells(game, faction) {
    const out = {};
    const counts = [0, 3, 2, 2, 1, 1];
    for (let l = 1; l <= 5; l++) {
      const pool = SPELLS_BY_LEVEL[l].slice();
      out[l] = [];
      for (let i = 0; i < counts[l] && pool.length; i++) {
        out[l].push(pool.splice(Math.floor(rnd(game) * pool.length), 1)[0]);
      }
    }
    return out;
  }

  function randomArtifactId(game, tier) {
    const ids = Object.keys(ARTIFACTS).filter(a => {
      const v = ARTIFACTS[a].val;
      return tier === 1 ? v <= 2 : tier === 2 ? (v >= 2 && v <= 3) : v >= 4;
    });
    return rndPick(game, ids);
  }

  /* ---------- 战斗结算 ---------- */
  function createBattleNeed(game, hero, need) {
    game.stats.battles++;
    return G.Battle.create({ hero, army: hero.army }, { hero: need.defHero, army: need.defArmy }, { siegeDef: need.siegeDef || 0 });
  }
  function resolveBattleNeed(game, hero, need, onEvent) {
    const b = createBattleNeed(game, hero, need);
    const runner = onEvent || ((battle) => G.AI.playBattle(game, battle));
    runner(b, hero);
    return finishBattleNeed(game, hero, need, b);
  }
  function finishBattleNeed(game, hero, need, b) {
    const surv = G.Battle.survivors(b);
    const win = b.winner === 0;
    if (win) {
      gainExp(game, hero, b.killedHp[0] + Math.round(b.killedHp[0] * 0.1));
      hero.army = mergeStacks(surv[0]);
      const p = game.players[hero.owner];
      if (need.kind === 'monster') {
        const r = need.obj.reward;
        if (r) {
          if (r.kind === 'artifact') {
            const aid = randomArtifactId(game, r.tier || 1);
            hero.artifacts.push(aid); refreshHero(hero);
            pushLog(game, `${hero.name} 获得宝物 ${ARTIFACTS[aid].name}!`);
          } else {
            const gold = rndInt(game, 600, 2200);
            p.resources.gold += gold;
            pushLog(game, `击败守卫,缴获 ${gold} 金币`);
          }
        }
        removeObject(game, need.obj);
      } else if (need.kind === 'mine') {
        captureMine(game, hero, need.obj);
      } else if (need.kind === 'town') {
        captureTown(game, hero, need.obj);
        return 'stop';
      }
      return 'win';
    } else {
      /* 失败:英雄阵亡 */
      heroDeath(game, hero);
      if (need.defHero) {
        need.defHero.army = mergeStacks(surv[1]);
        gainExp(game, need.defHero, b.killedHp[1]);
      } else if (need.kind === 'monster') {
        /* 野怪保留残余兵力 */
        const left = surv[1][0];
        if (left) { need.obj.n = Math.max(1, left.count); } else removeObject(game, need.obj);
      } else if (need.kind === 'mine') {
        const left = surv[1][0];
        if (left) need.obj.guard = { c: left.id, n: left.count }; else delete need.obj.guard;
      } else if (need.kind === 'town') {
        const g = mergeStacks(surv[1]);
        const gh = need.defHero;
        if (gh) gh.army = g.filter((s, i) => i < 7);
        else o_garrison_from(need.obj, g);
      }
      return 'lost';
    }
  }
  function o_garrison_from(town, stacks) {
    town.garrison = stacks.slice(0, 7);
    while (town.garrison.length < 7) town.garrison.push(null);
  }

  function heroDeath(game, hero) {
    hero.dead = true;
    const i = game.heroes.indexOf(hero);
    if (i >= 0) game.heroes.splice(i, 1);
    pushLog(game, `${game.players[hero.owner].name} 的英雄 ${hero.name} 阵亡了`);
    checkDefeats(game);
  }

  /* ================= 城镇操作 ================= */
  function townBuildingList(town) {
    const common = COMMON_BUILDINGS.filter(b => !b.faction);
    const fac = FACTION_BUILDINGS.filter(b => b.faction === town.faction);
    return common.concat(fac);
  }
  function buildingDef(town, id) {
    return townBuildingList(town).find(b => b.id === id) || null;
  }
  function canBuildNow(game, town, id) {
    const def = buildingDef(town, id);
    if (!def) return { ok: false, why: '未知建筑' };
    if (town.buildings.includes(id)) return { ok: false, why: '已建成' };
    if (town.builtToday) return { ok: false, why: '今日已建造' };
    for (const r of def.req) if (!town.buildings.includes(r)) return { ok: false, why: '需要前置建筑' };
    if (!canAfford(game.players[town.owner].resources, def.cost)) return { ok: false, why: '资源不足' };
    return { ok: true };
  }
  function build(game, town, id) {
    const chk = canBuildNow(game, town, id);
    if (!chk.ok) return chk;
    const def = buildingDef(town, id);
    payCost(game.players[town.owner].resources, def.cost);
    town.buildings.push(id);
    if (def.replaces) {
      const i = town.buildings.indexOf(def.replaces);
      if (i >= 0) town.buildings.splice(i, 1);
    }
    town.builtToday = true;
    pushLog(game, `${town.name} 建成了 ${def.name}`);
    return { ok: true };
  }

  function creatureCost(cid) { return { gold: CREATURES[cid].cost }; }

  function recruit(game, town, cid, count, hero) {
    const avail = town.pool[cid] || 0;
    count = Math.min(count, avail);
    if (count <= 0) return 0;
    const cost = creatureCost(cid);
    const p = game.players[town.owner];
    let afford = count;
    if (cost.gold) afford = Math.min(afford, Math.floor(p.resources.gold / cost.gold));
    if (afford <= 0) return 0;
    count = afford;
    p.resources.gold -= cost.gold * count;
    town.pool[cid] -= count;
    const target = hero ? hero.army : town.garrison;
    const left = armyAdd(target, cid, count);
    if (left > 0) {
      town.pool[cid] += left;
      p.resources.gold += cost.gold * left;   /* 放不下的退钱 */
      count -= left;
    }
    return count;
  }

  function aiBuyDwelling(game, hero, o) {
    const p = game.players[hero.owner];
    const c = CREATURES[o.c];
    let afford = Math.min(o.pool || 0, Math.floor(p.resources.gold / Math.max(1, c.cost)));
    if (afford <= 0) return;
    /* 保留建设资金 */
    const reserve = 3000;
    afford = Math.min(afford, Math.floor(Math.max(0, p.resources.gold - reserve) / Math.max(1, c.cost)));
    if (afford <= 0) return;
    p.resources.gold -= afford * c.cost;
    o.pool -= afford;
    armyAdd(hero.army, o.c, afford);
  }

  function refreshTavern(game, town) {
    town.tavern = [];
    for (let i = 0; i < 2; i++) {
      town.tavern.push({
        cls: rndChance(game, 0.5) ? 'might' : 'magic',
        faction: town.faction,
      });
    }
  }

  function hireHero(game, town, slot) {
    const p = game.players[town.owner];
    if (p.resources.gold < 2500) return { ok: false, why: '金币不足(需 2500)' };
    if (ownHeroes(game, p.id).length >= 5) return { ok: false, why: '英雄已达上限' };
    const offer = town.tavern[slot];
    if (!offer) return { ok: false, why: '没有候选人' };
    p.resources.gold -= 2500;
    const h = createHero(game, p.id, offer.faction, town.x, town.y, offer.cls);
    game.heroes.push(h);
    refreshTavern(game, town);
    revealAt(game, p.id, town.x, town.y, heroSight(h));
    pushLog(game, `${p.name} 雇佣了英雄 ${h.name}`);
    return { ok: true, hero: h };
  }

  /* ---------- 市场 ---------- */
  const resBaseValue = (r) => r === 'gold' ? 1 : (r === 'wood' || r === 'ore') ? 250 : 500;
  function marketRate(game, pid, from, to) {
    /* 返回 1 单位 from 可换多少 to(市场越多越划算) */
    const towns = ownTowns(game, pid).filter(t => t.buildings.includes('marketplace')).length;
    const disc = 1 - Math.min(0.3, towns * 0.06);
    return Math.max(0.004, resBaseValue(from) / resBaseValue(to) * disc);
  }
  function trade(game, pid, from, to, amount) {
    const p = game.players[pid];
    if (from === to || amount <= 0) return 0;
    if ((p.resources[from] || 0) < amount) return 0;
    const got = Math.floor(amount * marketRate(game, pid, from, to));
    if (got <= 0) return 0;
    p.resources[from] -= amount;
    p.resources[to] += got;
    return got;
  }

  /* 人类玩家的交互抉择(宝箱/竞技场/女巫小屋) */
  function resolveNeed(game, hero, need, choice) {
    const o = need.obj;
    switch (need.type) {
      case 'chest': {
        const gold = rndInt(game, 1000, 2500);
        if (choice === 'exp') gainExp(game, hero, Math.round(gold * 0.6));
        else game.players[hero.owner].resources.gold += gold;
        removeObject(game, o);
        pushLog(game, `打开宝箱:获得 ${choice === 'exp' ? Math.round(gold * 0.6) + ' 经验' : gold + ' 金币'}`);
        return { ok: true };
      }
      case 'arena': {
        o.used = true;
        if (choice === 'def') hero.bDef++; else hero.bAtt++;
        refreshHero(hero);
        pushLog(game, `${hero.name} 在竞技场历练${choice === 'def' ? '防御' : '攻击'} +1`);
        return { ok: true };
      }
      case 'witch': {
        o.used = true;
        const sk = o.skill;
        if ((hero.skills[sk] || 0) < 3) {
          hero.skills[sk] = (hero.skills[sk] || 0) + 1;
          pushLog(game, `${hero.name} 领悟了 ${SKILLS[sk].name}`);
        }
        return { ok: true };
      }
      case 'dwelling': {
        /* choice = {count} 购买野外巢穴兵力 */
        const c = CREATURES[o.c];
        const p = game.players[hero.owner];
        const count = Math.min(choice.count || 0, o.pool || 0, Math.floor(p.resources.gold / Math.max(1, c.cost)));
        if (count <= 0) return { ok: false };
        p.resources.gold -= count * c.cost;
        o.pool -= count;
        const left = armyAdd(hero.army, o.c, count);
        if (left > 0) { o.pool += left; p.resources.gold += left * c.cost; }
        return { ok: true };
      }
      default: return { ok: true };
    }
  }

  /* ---------- 序列化 ---------- */
  function serialize(game) {
    const data = JSON.parse(JSON.stringify(game, (k, v) => {
      if (v instanceof Uint8Array) return { __u8: Array.from(v) };
      return v;
    }));
    return data;
  }
  function deserialize(data) {
    const game = data;
    game.map.terrain = new Uint8Array(game.map.terrain.__u8 || game.map.terrain);
    game.map.road = new Uint8Array(game.map.road.__u8 || game.map.road);
    game.fog = game.fog.map(f => new Uint8Array(f.__u8 || f));
    game.objects.forEach(o => { if (o.type === 'town') o.pool = o.pool || {}; });
    /* 重建 objAt */
    game.objAt = new Array(game.map.w * game.map.h).fill(null);
    for (const o of game.objects) game.objAt[o.y * game.map.w + o.x] = o;
    G.setUidBase((game.seed % 900000) + 50000);
    return game;
  }

  function saveGame(game, slot) {
    const key = 'homm_save_' + (slot || 'auto');
    try {
      localStorage.setItem(key, JSON.stringify(serialize(game)));
      return true;
    } catch (e) { return false; }
  }
  function loadGame(slot) {
    try {
      const raw = localStorage.getItem('homm_save_' + (slot || 'auto'));
      if (!raw) return null;
      return deserialize(JSON.parse(raw));
    } catch (e) { return null; }
  }

  G.Game = {
    newGame, beginTurn, endTurn, newWeek, checkDefeats,
    createHero, refreshHero, heroMaxMove, heroMaxMana, heroSight, expForLevel,
    gainExp, applyLevelChoice,
    revealAt, isRevealed,
    armyPower, mergeStacks, armyAdd, armyCount,
    moveAlong, interact, removeObject, captureMine, captureTown, visitTown,
    guildLevel, rollGuildSpells, randomArtifactId,
    createBattleNeed, resolveBattleNeed, finishBattleNeed, resolveNeed, heroDeath,
    townBuildingList, buildingDef, canBuildNow, build, recruit,
    refreshTavern, hireHero, marketRate, trade,
    serialize, deserialize, saveGame, loadGame,
    ownTowns, ownHeroes, pushLog, rnd, rndInt, rndPick, rndChance,
    PLAYER_COLORS,
  };
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
