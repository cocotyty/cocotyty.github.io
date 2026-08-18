/* ============================================================
 * 征服纪元 · data.js — 静态数据:种族/兵种/建筑/法术/宝物/技能/英雄
 * 无 DOM 依赖,可在 Node 中 require 用于自动化测试
 * ============================================================ */
(function (G) {
  'use strict';
  const U = G;

  /* ================= 地形 =================
   * cost: 每步移动消耗; pass: 是否可通行 */
  const TERRAIN = [
    { id: 0, key: 'grass', name: '草原', cost: 100, pass: true, colors: ['#4e7a3a', '#568440', '#476f35'], decor: ['🌿', '🌷', '🍄'] },
    { id: 1, key: 'dirt', name: '泥地', cost: 100, pass: true, colors: ['#7a6248', '#84705a', '#6e5840'], decor: ['🪨', '🌾'] },
    { id: 2, key: 'sand', name: '沙漠', cost: 150, pass: true, colors: ['#c2a86a', '#ccb476', '#b69d5e'], decor: ['🌵', '🦴'] },
    { id: 3, key: 'snow', name: '雪原', cost: 150, pass: true, colors: ['#c9d4dd', '#d5dee6', '#bcc8d3'], decor: ['🌲', '❄️'] },
    { id: 4, key: 'swamp', name: '沼泽', cost: 175, pass: true, colors: ['#4a5f3d', '#566b46', '#3f5233'], decor: ['🪷', '🕸️'] },
    { id: 5, key: 'rough', name: '荒地', cost: 125, pass: true, colors: ['#8a7a5c', '#96856a', '#7c6d50'], decor: ['🪨'] },
    { id: 6, key: 'lava', name: '熔岩地', cost: 150, pass: true, colors: ['#5f3630', '#6b3e34', '#522e28'], decor: ['🔥', '🌋'] },
    { id: 7, key: 'water', name: '水域', cost: 0, pass: false, colors: ['#2d5a8e', '#35659c', '#274f7d'], decor: ['🌊'] },
    { id: 8, key: 'rock', name: '山脉', cost: 0, pass: false, colors: ['#5a555e', '#665f6a', '#4d4850'], decor: ['⛰️'] },
  ];
  const ROAD_COST = 66;

  /* ================= 兵种 =================
   * flags: shooter 射手 / flyer 飞行 / drain 吸血 / charge 冲锋 / noRetal 敌无法反击 / retaliations 反击次数 */
  const mkC = (id, name, emoji, fac, tier, att, def, d0, d1, hp, spd, cost, grow, flags, sp) =>
    ({ id, name, emoji, fac, tier, att, def, d0, d1, hp, spd, cost: cost || 0, costRes: null, grow, flags: flags || [], sp: sp || null });

  const CREATURES = {};
  const addCreatures = (list) => list.forEach(c => CREATURES[c.id] = c);

  /* ---- 城堡(人类) ---- */
  addCreatures([
    mkC('pikeman', '长枪兵', '💂', 'castle', 1, 4, 5, 1, 4, 10, 4, 60, 14, [], '长枪如林'),
    mkC('archer', '弓箭手', '🏹', 'castle', 2, 6, 3, 2, 4, 10, 4, 100, 9, ['shooter'], null),
    mkC('griffin', '狮鹫', '🦅', 'castle', 3, 8, 8, 4, 6, 25, 6, 240, 7, ['flyer', 'retalAll'], '无限反击'),
    mkC('swordsman', '剑士', '⚔️', 'castle', 4, 10, 12, 7, 10, 35, 5, 300, 4, [], null),
    mkC('monk', '僧侣', '🧘', 'castle', 5, 12, 7, 10, 12, 30, 5, 400, 3, ['shooter'], null),
    mkC('cavalier', '骑士', '🐎', 'castle', 6, 15, 15, 15, 25, 100, 7, 1000, 2, ['charge'], '冲锋伤害加成'),
    mkC('angel', '天使', '👼', 'castle', 7, 20, 20, 50, 50, 200, 12, 3000, 1, ['flyer'], '神圣威仪'),
  ]);
  /* ---- 壁垒(精灵) ---- */
  addCreatures([
    mkC('centaur', '半人马', '🐴', 'rampart', 1, 4, 3, 2, 3, 8, 5, 80, 14, [], null),
    mkC('dwarf', '矮人战士', '🧔', 'rampart', 2, 6, 7, 2, 4, 20, 3, 150, 8, [], '坚韧如岩'),
    mkC('elf', '大精灵', '🧝', 'rampart', 3, 9, 5, 3, 4, 15, 6, 200, 7, ['shooter'], '百步穿杨'),
    mkC('pegasus', '飞马', '🦢', 'rampart', 4, 9, 8, 5, 9, 30, 8, 250, 5, ['flyer'], null),
    mkC('dendroid', '树精卫士', '🌳', 'rampart', 5, 9, 12, 10, 14, 55, 3, 350, 3, [], '根须缠绕'),
    mkC('unicorn', '独角兽', '🦄', 'rampart', 6, 15, 14, 18, 22, 90, 7, 850, 2, [], '魔法抵抗'),
    mkC('greendragon', '绿龙', '🐉', 'rampart', 7, 18, 18, 40, 60, 200, 10, 2400, 1, ['flyer'], '龙息喷吐'),
  ]);
  /* ---- 塔楼(法师) ---- */
  addCreatures([
    mkC('gremlin', '小精怪', '🧌', 'tower', 1, 3, 3, 1, 2, 4, 5, 30, 16, [], null),
    mkC('gargoyle', '石像鬼', '🗿', 'tower', 2, 6, 6, 2, 3, 16, 6, 130, 9, ['flyer'], null),
    mkC('golem', '石皮铁人', '🤖', 'tower', 3, 7, 10, 4, 5, 30, 3, 150, 6, [], '魔抗体质'),
    mkC('mage', '大法师', '🧙', 'tower', 4, 12, 10, 7, 9, 25, 5, 350, 4, ['shooter'], '奥术飞弹'),
    mkC('genie', '神灵', '🧞', 'tower', 5, 12, 12, 13, 16, 40, 6, 550, 3, ['flyer'], '愿望之力'),
    mkC('naga', '蛇灵女妖', '🐍', 'tower', 6, 16, 13, 20, 20, 110, 5, 1600, 2, ['noRetal'], '敌人无法反击'),
    mkC('titan', '泰坦', '⚡', 'tower', 7, 24, 24, 40, 60, 300, 11, 5000, 1, ['shooter'], '雷霆万钧'),
  ]);
  /* ---- 地狱(恶魔) ---- */
  addCreatures([
    mkC('imp', '恶魔崽', '👿', 'inferno', 1, 3, 3, 1, 3, 5, 5, 50, 15, [], null),
    mkC('gog', '火怪', '🔥', 'inferno', 2, 6, 4, 2, 5, 13, 4, 150, 8, ['shooter'], null),
    mkC('hound', '地狱犬', '🐕', 'inferno', 3, 10, 6, 3, 7, 25, 7, 200, 6, [], '三头撕咬'),
    mkC('demon', '利刃恶魔', '😈', 'inferno', 4, 14, 8, 7, 9, 35, 6, 400, 4, [], null),
    mkC('pitlord', '深渊领主', '🦹', 'inferno', 5, 15, 13, 13, 17, 45, 6, 700, 3, [], '嗜血狂怒'),
    mkC('efreet', '火焰魔灵', '👹', 'inferno', 6, 16, 14, 16, 24, 90, 9, 1300, 2, ['flyer'], '烈焰之躯'),
    mkC('devil', '魔王', '🕴️', 'inferno', 7, 19, 21, 30, 40, 166, 11, 3500, 1, ['flyer', 'noRetal'], '死神之触'),
  ]);
  /* ---- 墓地(亡灵) ---- */
  addCreatures([
    mkC('skeleton', '骷髅兵', '💀', 'necro', 1, 5, 4, 2, 3, 7, 4, 60, 14, ['undead'], null),
    mkC('zombie', '僵尸', '🧟', 'necro', 2, 5, 6, 2, 4, 22, 4, 100, 9, ['undead'], null),
    mkC('ghost', '幽灵', '👻', 'necro', 3, 7, 7, 3, 5, 22, 7, 180, 8, ['flyer', 'undead', 'drain'], '汲取生命'),
    mkC('vampire', '吸血鬼', '🧛', 'necro', 4, 10, 9, 6, 9, 30, 6, 360, 5, ['flyer', 'undead', 'drain'], '汲取生命'),
    mkC('lich', '巫妖', '☠️', 'necro', 5, 13, 10, 11, 13, 30, 5, 550, 4, ['shooter', 'undead'], '死亡之云'),
    mkC('blackknight', '黑骑士', '♞', 'necro', 6, 16, 16, 15, 30, 120, 7, 1200, 2, ['undead'], '诅咒之刃'),
    mkC('bonedragon', '骨龙', '🦴', 'necro', 7, 17, 15, 25, 50, 150, 9, 1800, 1, ['flyer', 'undead'], '衰老龙息'),
  ]);
  /* ---- 中立(野怪/野外巢穴) ---- */
  addCreatures([
    mkC('peasant', '农民', '🧑‍🌾', 'neutral', 1, 1, 1, 1, 1, 3, 3, 20, 20, [], '人海战术'),
    mkC('rogue', '盗贼', '🥷', 'neutral', 2, 7, 3, 2, 4, 10, 6, 100, 9, [], '神出鬼没'),
    mkC('boar', '野猪', '🐗', 'neutral', 2, 6, 5, 3, 5, 15, 6, 130, 8, [], '横冲直撞'),
    mkC('ogre', '食人魔', '🪓', 'neutral', 4, 13, 7, 6, 12, 40, 4, 400, 4, [], '蛮力重击'),
    mkC('manticore', '蝎尾狮', '🦂', 'neutral', 5, 15, 13, 14, 20, 45, 6, 700, 3, ['flyer'], '毒刺尾击'),
    mkC('cyclops', '独眼巨人', '👁️', 'neutral', 6, 17, 13, 16, 25, 70, 6, 900, 2, ['shooter'], '投掷巨石'),
    mkC('elemental', '火焰元素', '🧚', 'neutral', 4, 14, 12, 10, 16, 60, 6, [], '魔法造物'),
  ]);

  /* ================= 种族 ================= */
  const FACTIONS = {
    castle: {
      id: 'castle', name: '城堡', cn: '神圣城堡', emoji: '🏰', theme: [0, 0, 0, 1], rareRes: 'gems',
      desc: '人类王国,均衡强大,天使与骑士是陆战之王。',
      units: ['pikeman', 'archer', 'griffin', 'swordsman', 'monk', 'cavalier', 'angel'],
      special: { id: 'sp_castle', name: '皇家训练营', emoji: '🏟️', cost: { gold: 3000, wood: 5 }, desc: '长枪兵与弓箭手周产量 +5' },
    },
    rampart: {
      id: 'rampart', name: '壁垒', cn: '精灵壁垒', emoji: '🌳', theme: [0, 0, 1, 4], rareRes: 'crystal',
      desc: '森林精灵与自然守护者,防御坚韧,绿龙守护家园。',
      units: ['centaur', 'dwarf', 'elf', 'pegasus', 'dendroid', 'unicorn', 'greendragon'],
      special: { id: 'sp_rampart', name: '藏宝密穴', emoji: '🧰', cost: { gold: 2500, wood: 5, crystal: 3 }, desc: '每日 +350 金币' },
    },
    tower: {
      id: 'tower', name: '塔楼', cn: '法师塔楼', emoji: '🗼', theme: [3, 3, 1, 3], rareRes: 'mercury',
      desc: '魔法师之国,法师与泰坦以奥术和雷霆碾压敌人。',
      units: ['gremlin', 'gargoyle', 'golem', 'mage', 'genie', 'naga', 'titan'],
      special: { id: 'sp_tower', name: '奥术圣殿', emoji: '🔮', cost: { gold: 3000, mercury: 5 }, desc: '城内英雄每日额外恢复 5 点法力' },
    },
    inferno: {
      id: 'inferno', name: '地狱', cn: '燃烧地狱', emoji: '🌋', theme: [6, 5, 6, 2], rareRes: 'sulfur',
      desc: '恶魔军团自熔岩中涌出,攻势凶猛,魔王终结一切。',
      units: ['imp', 'gog', 'hound', 'demon', 'pitlord', 'efreet', 'devil'],
      special: { id: 'sp_inferno', name: '深渊熔炉', emoji: '🔥', cost: { gold: 3000, sulfur: 5 }, desc: '每日 +1 硫磺' },
    },
    necro: {
      id: 'necro', name: '墓地', cn: '亡灵墓地', emoji: '⚰️', theme: [4, 1, 4, 1], rareRes: 'mercury',
      desc: '不死军团从坟墓中爬出,越战越多,骨龙遮蔽天空。',
      units: ['skeleton', 'zombie', 'ghost', 'vampire', 'lich', 'blackknight', 'bonedragon'],
      special: { id: 'sp_necro', name: '招魂塔', emoji: '🗼', cost: { gold: 3000, ore: 5 }, desc: '每周额外 +6 骷髅兵' },
    },
  };
  const FACTION_IDS = ['castle', 'rampart', 'tower', 'inferno', 'necro'];

  /* ================= 通用城镇建筑 =================
   * growth 建筑影响产量;income 每日金币;每城镇每天只能建 1 座 */
  const COMMON_BUILDINGS = [
    { id: 'townHall', name: '议事厅', emoji: '🏛️', cost: { gold: 2500 }, req: [], desc: '每日收入 +500', income: 500, replaces: 'villageHall' },
    { id: 'cityHall', name: '市政厅', emoji: '🏛️', cost: { gold: 5000, wood: 5, ore: 5 }, req: ['townHall', 'marketplace'], desc: '每日收入 +1000', income: 1000, replaces: 'townHall' },
    { id: 'capitol', name: '国会', emoji: '👑', cost: { gold: 10000, wood: 10, ore: 10 }, req: ['cityHall', 'castle'], desc: '每日收入 +4000', income: 4000, replaces: 'cityHall' },
    { id: 'fort', name: '堡垒', emoji: '🧱', cost: { gold: 1500, wood: 5, ore: 5 }, req: [], desc: '城镇防御基础,解锁 4 级兵营', growthMul: 1 },
    { id: 'citadel', name: '要塞', emoji: '🏯', cost: { gold: 2500, wood: 5, ore: 5 }, req: ['fort'], desc: '周产量 ×1.5', growthMul: 1.5 },
    { id: 'castleB', name: '城堡', emoji: '🏰', cost: { gold: 4000, wood: 10, ore: 10 }, req: ['citadel'], desc: '周产量 ×2,解锁 7 级兵营', growthMul: 2 },
    { id: 'tavern', name: '酒馆', emoji: '🍺', cost: { gold: 500, wood: 3 }, req: [], desc: '可招募英雄,交换情报' },
    { id: 'marketplace', name: '市场', emoji: '⚖️', cost: { gold: 500, wood: 5 }, req: [], desc: '资源交换(拥有市场越多汇率越优)' },
    { id: 'silo', name: '资源筒仓', emoji: '🛢️', cost: { gold: 1000, ore: 5 }, req: ['marketplace'], desc: '每日 +2 木材 +2 矿石', income: 0, daily: { wood: 2, ore: 2 } },
    { id: 'mage1', name: '魔法行会 1 层', emoji: '📖', cost: { gold: 2000, wood: 2, ore: 2 }, req: [], desc: '英雄可学习 1 级魔法' },
    { id: 'mage2', name: '魔法行会 2 层', emoji: '📚', cost: { gold: 1500, mercury: 4 }, req: ['mage1'], desc: '解锁 2 级魔法' },
    { id: 'mage3', name: '魔法行会 3 层', emoji: '📚', cost: { gold: 2500, sulfur: 4 }, req: ['mage2'], desc: '解锁 3 级魔法' },
    { id: 'mage4', name: '魔法行会 4 层', emoji: '📚', cost: { gold: 4000, crystal: 4 }, req: ['mage3'], desc: '解锁 4 级魔法' },
    { id: 'mage5', name: '魔法行会 5 层', emoji: '📜', cost: { gold: 6000, gems: 4 }, req: ['mage4'], desc: '解锁 5 级魔法' },
  ];

  /* 各种族兵营(1-7 级) */
  const DWELLING_TIERS = [
    { tier: 1, cost: { gold: 400 }, req: [] },
    { tier: 2, cost: { gold: 900, wood: 2 }, req: ['dw1'] },
    { tier: 3, cost: { gold: 1500, wood: 3 }, req: ['dw2'] },
    { tier: 4, cost: { gold: 2000, wood: 3, ore: 3 }, req: ['dw3', 'fort'] },
    { tier: 5, cost: { gold: 3000, ore: 5 }, req: ['dw4'] },
    { tier: 6, cost: { gold: 4500, wood: 5, ore: 5 }, req: ['dw5', 'citadel'] },
    { tier: 7, cost: { gold: 8000, wood: 10, ore: 10 }, req: ['dw6', 'castleB'] },
  ];
  /* 高级兵营消耗稀有资源 */
  const DWELLING_RARE = {
    5: { n: 3 }, 6: { n: 5 }, 7: { n: 5 },
  };

  function buildDwellings() {
    const out = [];
    for (const fid of FACTION_IDS) {
      const f = FACTIONS[fid];
      for (let t = 1; t <= 7; t++) {
        const cu = CREATURES[f.units[t - 1]];
        const def = DWELLING_TIERS[t - 1];
        const cost = Object.assign({}, def.cost);
        if (DWELLING_RARE[t]) cost[f.rareRes] = (cost[f.rareRes] || 0) + DWELLING_RARE[t].n;
        out.push({
          id: 'dw' + t, faction: fid, tier: t, name: cu.name + ' 营地', emoji: '🏕️',
          cost, req: def.req, creature: cu.id, desc: `每周产出 ${cu.grow} 只${cu.name}`,
        });
      }
      out.push({ id: f.special.id, faction: fid, name: f.special.name, emoji: f.special.emoji, cost: f.special.cost, req: [], special: f.special.id, desc: f.special.desc });
    }
    return out;
  }
  const FACTION_BUILDINGS = buildDwellings();

  /* 城镇初始建筑 */
  const TOWN_START_BUILDINGS = ['villageHall'];

  /* ================= 技能(12 种,各 3 级) ================= */
  const SKILLS = {
    offense: { id: 'offense', name: '进攻术', emoji: '🗡️', desc: l => `近战伤害 +${[10, 20, 30][l]}%` },
    armorer: { id: 'armorer', name: '防御术', emoji: '🛡️', desc: l => `所受伤害 -${[10, 20, 30][l]}%` },
    archery: { id: 'archery', name: '箭术', emoji: '🏹', desc: l => `远程伤害 +${[25, 50, 100][l]}%` },
    tactics: { id: 'tactics', name: '战术学', emoji: '♟️', desc: l => `战场布阵纵深 +${[1, 2, 3][l]}格` },
    logistics: { id: 'logistics', name: '后勤学', emoji: '🧭', desc: l => `每日移动力 +${[10, 20, 30][l]}%` },
    scouting: { id: 'scouting', name: '侦察术', emoji: '🔭', desc: l => `视野 +${[1, 2, 3][l]}格` },
    pathfinding: { id: 'pathfinding', name: '寻路术', emoji: '🗺️', desc: l => `恶劣地形消耗 -${[25, 50, 75][l]}%` },
    estates: { id: 'estates', name: '理财术', emoji: '💰', desc: l => `每日 +${[150, 300, 500][l]} 金币` },
    learning: { id: 'learning', name: '学习学', emoji: '🎓', desc: l => `经验获取 +${[15, 30, 45][l]}%` },
    mysticism: { id: 'mysticism', name: '神秘术', emoji: '🌌', desc: l => `每日法力恢复 +${[2, 4, 6][l]}` },
    sorcery: { id: 'sorcery', name: '魔力', emoji: '✨', desc: l => `魔法伤害 +${[15, 30, 45][l]}%` },
    resistance: { id: 'resistance', name: '抗魔', emoji: '🧿', desc: l => `所受魔法伤害 -${[15, 30, 45][l]}%` },
  };
  const SKILL_IDS = Object.keys(SKILLS);

  /* ================= 法术(18) =================
   * dmg: [基础, 每点法力加成] */
  const SPELLS = {
    magicArrow: { id: 'magicArrow', name: '魔法箭', emoji: '🪄', lvl: 1, mp: 5, type: 'damage', dmg: [10, 10], target: 'enemy', desc: '对单个敌人造成少量魔法伤害' },
    haste: { id: 'haste', name: '急行军', emoji: '💨', lvl: 1, mp: 5, type: 'buff', buff: { spd: 3 }, target: 'own', desc: '目标速度 +3' },
    slow: { id: 'slow', name: '迟缓术', emoji: '🐌', lvl: 1, mp: 5, type: 'debuff', buff: { spd: -3 }, target: 'enemy', desc: '目标速度 -3' },
    bless: { id: 'bless', name: '祝福术', emoji: '🌟', lvl: 1, mp: 5, type: 'buff', buff: { bless: 1 }, target: 'own', desc: '目标始终造成最大伤害' },
    shield: { id: 'shield', name: '护盾术', emoji: '🛡️', lvl: 1, mp: 5, type: 'buff', buff: { shield: 30 }, target: 'own', desc: '目标所受近战伤害 -30%' },
    cure: { id: 'cure', name: '治疗术', emoji: '💚', lvl: 1, mp: 6, type: 'heal', dmg: [15, 5], target: 'own', desc: '治疗友军并驱散负面魔法' },
    lightning: { id: 'lightning', name: '闪电术', emoji: '⚡', lvl: 2, mp: 10, type: 'damage', dmg: [25, 25], target: 'enemy', desc: '对单个敌人造成大量雷电伤害' },
    stoneSkin: { id: 'stoneSkin', name: '石肤术', emoji: '🪨', lvl: 2, mp: 5, type: 'buff', buff: { defPct: 30 }, target: 'own', desc: '目标防御 +30%' },
    dispel: { id: 'dispel', name: '驱散术', emoji: '🌈', lvl: 2, mp: 5, type: 'dispel', target: 'any', desc: '驱散目标身上的所有魔法效果' },
    blind: { id: 'blind', name: '失明术', emoji: '🙈', lvl: 2, mp: 15, type: 'debuff', buff: { blind: 1 }, target: 'enemy', desc: '目标失明,受到伤害后恢复' },
    fireball: { id: 'fireball', name: '火球术', emoji: '🔥', lvl: 3, mp: 12, type: 'damage', dmg: [16, 16], target: 'enemy', aoe: 1, desc: '爆炸波及目标及其周围' },
    massHaste: { id: 'massHaste', name: '群体加速', emoji: '🌪️', lvl: 3, mp: 10, type: 'buff', buff: { spd: 2 }, target: 'ownAll', desc: '全体友军速度 +2' },
    massSlow: { id: 'massSlow', name: '群体迟缓', emoji: '🕸️', lvl: 3, mp: 10, type: 'debuff', buff: { spd: -2 }, target: 'enemyAll', desc: '全体敌人速度 -2' },
    resurrection: { id: 'resurrection', name: '复生术', emoji: '♰', lvl: 4, mp: 15, type: 'heal', dmg: [60, 30], target: 'own', revive: true, desc: '大幅治疗或复活友军单位' },
    chainLightning: { id: 'chainLightning', name: '连锁闪电', emoji: '🌩️', lvl: 4, mp: 20, type: 'damage', dmg: [45, 35], target: 'enemy', chain: 3, desc: '闪电跳跃打击多个敌人' },
    summon: { id: 'summon', name: '召唤元素', emoji: '🪬', lvl: 4, mp: 20, type: 'summon', target: 'own', desc: '召唤一支元素大军加入战斗' },
    implosion: { id: 'implosion', name: '内爆术', emoji: '💥', lvl: 5, mp: 25, type: 'damage', dmg: [80, 60], target: 'enemy', desc: '对单个敌人造成毁灭性伤害' },
    massBless: { id: 'massBless', name: '群体祝福', emoji: '😇', lvl: 5, mp: 20, type: 'buff', buff: { bless: 1 }, target: 'ownAll', desc: '全体友军始终造成最大伤害' },
  };
  const SPELL_IDS = Object.keys(SPELLS);
  const SPELLS_BY_LEVEL = [[], [], [], [], [], []];
  SPELL_IDS.forEach(id => SPELLS_BY_LEVEL[SPELLS[id].lvl].push(id));

  /* ================= 宝物(31) ================= */
  const mkA = (id, name, emoji, cls, val, desc) => ({ id, name, emoji, cls, val, desc: desc || '' });
  const ARTIFACTS = {};
  [
    mkA('sw1', '铁剑', '🗡️', 'att', 1), mkA('sw2', '骑士之剑', '⚔️', 'att', 2), mkA('sw3', '战神之刃', '🗡️', 'att', 3),
    mkA('sw4', '泰坦之刃', '⚔️', 'att', 5), mkA('sh1', '橡木盾', '🛡️', 'def', 1), mkA('sh2', '锁子甲', '🦺', 'def', 2),
    mkA('sh3', '圣骑士之盾', '🛡️', 'def', 3), mkA('sh4', '巨龙甲', '🦺', 'def', 5),
    mkA('po1', '学徒法杖', '🪄', 'pow', 1), mkA('po2', '贤者之杖', '🪄', 'pow', 2), mkA('po3', '大法师之杖', '🔮', 'pow', 4),
    mkA('kn1', '智慧头冠', '👑', 'know', 2), mkA('kn2', '贤者之石', '💎', 'know', 3), mkA('kn3', '永恒之书', '📖', 'know', 5),
    mkA('sp1', '骑士马靴', '👢', 'spd', 1, '全军速度 +1'), mkA('sp2', '疾风之靴', '👟', 'spd', 2, '全军速度 +2'),
    mkA('mp1', '旅行者之靴', '🥾', 'mp', 300, '每日移动力 +300'),
    mkA('gd1', '金色圣杯', '🏆', 'gold', 500, '每日 +500 金币'), mkA('gd2', '无尽钱箱', '🧰', 'gold', 750, '每日 +750 金币'),
    mkA('dm1', '战鼓', '🥁', 'dmgPct', 10, '全军伤害 +10%'), mkA('dm2', '军号', '📯', 'dmgPct', 15, '全军伤害 +15%'),
    mkA('ar1', '猎人之弓', '🏹', 'rangedPct', 20, '远程伤害 +20%'), mkA('ar2', '神射手臂铠', '🎯', 'rangedPct', 35, '远程伤害 +35%'),
    mkA('mr1', '护身符', '🧿', 'res', 20, '受到的魔法伤害 -20%'), mkA('mr2', '抗魔披风', '🧥', 'res', 30, '受到的魔法伤害 -30%'),
    mkA('al1', '狮心勋章', '💝', 'all', 1, '四维各 +1'), mkA('al2', '龙眼戒指', '💍', 'all', 2, '四维各 +2'),
    mkA('sc1', '望远镜', '🔭', 'sight', 2, '视野 +2'), mkA('ml1', '法力宝珠', '🔵', 'mana', 20, '法力上限 +20'),
  ].forEach(a => ARTIFACTS[a.id] = a);

  /* ================= 英雄 ================= */
  const MIGHT_HEROES = ['雷恩', '加雷斯', '罗兰德', '克里斯蒂安', '贝奥武夫', '卡尔文', '铁手戴恩', '血鹰', '白狼', '狂斧奥恩', '银枪骑士', '黑鸦', '石心', '龙裔凯尔', '疾风剑豪', '独眼格尔', '北境之狼', '玫瑰骑士'];
  const MAGIC_HEROES = ['赛拉', '阿德拉', '米娅', '阿斯塔', '月影', '星陨', '艾德里安', '夜莺', '苍白之书', '凛冬法师', '烈焰使徒', '风暴召唤者', '蛇眼术士', '灰袍贤者', '血月女巫', '时之守望者', '迷雾先知', '深渊语者'];
  const MIGHT_EMOJI = ['🤺', '🤴', '💂', '🦸', '🗡️', '🛡️'];
  const MAGIC_EMOJI = ['🧙', '🧙‍♀️', '🧝', '🧝‍♀️', '🦹', '🪄'];

  /* ================= 地图物件类型 ================= */
  const OBJ = {
    TOWN: 'town', GOLDMINE: 'goldmine', SAWMILL: 'sawmill', OREPIT: 'orepit',
    MERCURY: 'alchlab', SULFUR: 'sulfurdune', CRYSTAL: 'crystalcave', GEMS: 'gempond',
    PILE_GOLD: 'pileGold', PILE_WOOD: 'pileWood', PILE_ORE: 'pileOre', PILE_RARE: 'pileRare',
    CHEST: 'chest', ARTIFACT: 'artifact', MONSTER: 'monster',
    LEARNSTONE: 'learnstone', SHRINE: 'shrine', WINDMILL: 'windmill', CAMPFIRE: 'campfire',
    DWELLING: 'dwelling', ARENA: 'arena', WITCHHUT: 'witchhut', WATCHTOWER: 'watchtower',
  };
  const MINE_DEFS = {
    goldmine: { res: 'gold', n: 1000, emoji: '🏛️', name: '金矿' },
    sawmill: { res: 'wood', n: 2, emoji: '🪚', name: '锯木场' },
    orepit: { res: 'ore', n: 2, emoji: '⛏️', name: '矿石场' },
    alchlab: { res: 'mercury', n: 1, emoji: '⚗️', name: '炼金塔' },
    sulfurdune: { res: 'sulfur', n: 1, emoji: '🌋', name: '硫磺堆' },
    crystallcave: { res: 'crystal', n: 1, emoji: '💎', name: '水晶洞' },
    gempond: { res: 'gems', n: 1, emoji: '💠', name: '宝石池' },
  };

  /* ================= 兵种战力估值(AI 用) ================= */
  function creaturePower(c) {
    const avg = (c.d0 + c.d1) / 2;
    let p = Math.pow(c.hp, 0.55) * Math.pow(avg, 0.6) * Math.pow(c.att + c.def + 4, 0.5) * (1 + c.spd * 0.045);
    if (c.flags.includes('shooter')) p *= 1.35;
    if (c.flags.includes('flyer')) p *= 1.12;
    if (c.flags.includes('drain')) p *= 1.15;
    if (c.flags.includes('noRetal')) p *= 1.15;
    return p;
  }
  const POWER_CACHE = {};
  function unitPower(id) {
    if (!POWER_CACHE[id]) POWER_CACHE[id] = creaturePower(CREATURES[id]);
    return POWER_CACHE[id];
  }

  /* 兵种周产量(含城堡加成在城镇逻辑中计算) */
  function growthOf(creatureId, townBuildings) {
    const c = CREATURES[creatureId];
    let g = c.grow;
    if (c.fac === 'castle' && townBuildings && townBuildings.includes('sp_castle')) {
      if (c.tier <= 2) g += 5;
    }
    return g;
  }

  G.TERRAIN = TERRAIN; G.ROAD_COST = ROAD_COST;
  G.CREATURES = CREATURES; G.FACTIONS = FACTIONS; G.FACTION_IDS = FACTION_IDS;
  G.COMMON_BUILDINGS = COMMON_BUILDINGS; G.FACTION_BUILDINGS = FACTION_BUILDINGS;
  G.TOWN_START_BUILDINGS = TOWN_START_BUILDINGS;
  G.SKILLS = SKILLS; G.SKILL_IDS = SKILL_IDS;
  G.SPELLS = SPELLS; G.SPELL_IDS = SPELL_IDS; G.SPELLS_BY_LEVEL = SPELLS_BY_LEVEL;
  G.ARTIFACTS = ARTIFACTS;
  G.MIGHT_HEROES = MIGHT_HEROES; G.MAGIC_HEROES = MAGIC_HEROES; G.MIGHT_EMOJI = MIGHT_EMOJI; G.MAGIC_EMOJI = MAGIC_EMOJI;
  G.OBJ = OBJ; G.MINE_DEFS = MINE_DEFS;
  G.creaturePower = creaturePower; G.unitPower = unitPower; G.growthOf = growthOf;
  void U;
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
