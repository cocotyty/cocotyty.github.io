/* ============================================================
 * 魂火守卫 SOULFIRE DEFENSE - 数据定义
 * 像素素材 / 塔 / 怪物 / 关卡 / 波次
 * ============================================================
 * 世界坐标:1 tile = 16px,棋盘 18x10 tiles = 288x160
 * ============================================================ */
'use strict';

const TILE = 16;
const GRID_W = 18;
const GRID_H = 10;
const WORLD_W = GRID_W * TILE;
const WORLD_H = GRID_H * TILE;

/* ---------------- 全局调色板 ---------------- */
const PAL = {
  k:'#0b0b12', // 描边近黑
  d:'#26262f', D:'#34343f', g:'#4c4c5c', q:'#17171f',
  G:'#567d3e', F:'#3a5a2a',      // 丧尸绿 / 深绿
  e:'#ff2e2e', E:'#ffb52e',      // 红眼光 / 琥珀光
  w:'#e8e2cf', W:'#f8f4e8',      // 骨白 / 亮白
  n:'#cfc39b', N:'#948a68',      // 骨 / 骨影
  b:'#7e1414', B:'#c22323',      // 血
  p:'#5d3a75', P:'#8e5bb0', v:'#322245', // 紫
  c:'#8fd4e8', C:'#dff7ff',      // 幽灵青
  m:'#6f7d8c', M:'#a3b4c4',      // 金属
  u:'#5f4426', U:'#8a6134',      // 木
  o:'#d96e2a', O:'#f39d3c', y:'#f2cf46', // 橙 / 金
  l:'#7cd63e', L:'#48942c',      // 毒绿
  s:'#4a4551', S:'#67616f',      // 石
  h:'#d8c9a5',                    // 角
  i:'#bfe9f5', I:'#eef9ff',      // 冰
  R:'#b33a2e',                    // 魔鬼红
  x:'#3d2b4f'                     // 暗紫块
};

/* ---------------- 像素素材 ----------------
 * '.' 为透明;行宽不一致时解析器会右侧自动补 '.'
 * ------------------------------------------------ */
const SPR = {

/* ======== 怪物 ======== */

zombie: [ // 行尸 12x14
'....kkkk....',
'...kGGGGk...',
'..kGGGGGGk..',
'..kGeGGeGk..',
'..kGGGGGGk..',
'...kwkwkw...',
'..kkddddkk..',
'.kGdddddGk..',
'.kGdbbddGk..',
'..kddddddk..',
'...kddddk...',
'..kFF..FFk..',
'..kFF..FFk..',
'..kk....kk..'
],

skeleton: [ // 白骨 12x14
'....kkkk....',
'...knnnnk...',
'..knnnnnnk..',
'..knennenk..',
'..knnnnnnk..',
'...knwnwk...',
'....knnk....',
'..knnnnnnk..',
'.knknnnnknk.',
'.knkn..nknk.',
'..knnnnnnk..',
'..knn..nnk..',
'..knn..nnk..',
'..kk....kk..'
],

bat: [ // 血蝠 帧1 14x10
'.kk........kk.',
'.kPkk....kkPk.',
'..kPkk..kkPk..',
'....kppppk....',
'...kpeppepk...',
'....kppppk....',
'....kwbbwk....',
'.....kppk.....',
'......kk......',
'..............'
],
bat2: [ // 血蝠 帧2(翅下压)
'..............',
'..............',
'..............',
'....kppppk....',
'...kpeppepk...',
'....kppppk....',
'....kwbbwk....',
'.k...kppk...k.',
'.kk..kkkk..kk.',
'..kk......kk..'
],

ghost: [ // 哀魂 帧1 12x11
'....kkkk....',
'..kkcccckk..',
'.kcccccccck.',
'.kcvccccvck.',
'.kcccccccck.',
'.kcCcccccCk.',
'.kcccccccck.',
'.kcccccccck.',
'.kcc.cc.cck.',
'.kc..cc..ck.',
'..c..cc..c..'
],
ghost2: [ // 哀魂 帧2
'....kkkk....',
'..kkcccckk..',
'.kcccccccck.',
'.kcvccccvck.',
'.kcccccccck.',
'.kcCcccccCk.',
'.kcccccccck.',
'.kcccccccck.',
'.kc.cc.cc.k.',
'.cc..c..cc..',
'..c...c...c.'
],

spider: // 尸蛛 14x11
[
'..............',
'..k........k..',
'..kk..kk..kk..',
'...kkppppkk...',
'..kkppppppkk..',
'.kkpeppppepkk.',
'.kkppppppppkk.',
'..kkpPppPpkk..',
'...kkpbbpkk...',
'..kk..kk..kk..',
'..k...kk...k..'
],
spiderling: [ // 幼蛛 8x6
'........',
'.k....k.',
'..kppk..',
'.kpepek.',
'..kppk..',
'.k.kk.k.'
],

brute: // 裂躯者 16x15
[
'.....kkkkkk.....',
'....kGGGGGGk....',
'...kGGGGGGGGk...',
'...kGeGGGGeGk...',
'...kGGGGGGGGk...',
'...kGwkwkwkGk...',
'..kkddddddddkk..',
'.kGkwwwwwwwwkGk.',
'.kGkwwbbwwbbwkGk',
'.kGkwwwbbwwwkGk.',
'.kGkwwwwwwwwkGk.',
'..kkwwwwwwwwkk..',
'..kGk......kGk..',
'..kGGk....kGGk..',
'..kkkk....kkkk..'
],

demon: // 地狱魔 14x14
[
'.h..........h.',
'.kh........hk.',
'....kRRRRk....',
'...kRRRRRRk...',
'...kRERRERk...',
'...kRRRRRRk...',
'....kwbwRk....',
'v.kkRRRRRRkk.v',
'vkkkRRRRRRkkkv',
'.kkkRdRRdRkkk.',
'..kkRRRRRRkk..',
'...kRRkkRRk...',
'...kRk..kRk...',
'...kk....kk...'
],

boss: // 旧日支配者 24x19
[
'.......kkkkkkkkkk.......',
'.....kkvvvvvvvvvvkk.....',
'....kvvvvvvvvvvvvvvk....',
'...kvvvvvvvvvvvvvvvvk...',
'..kvvvkkkvvvvvvkkkvvvk..',
'..kvvkkkwwwwwwwwkkkvvk..',
'.kvvkkwwwwwwwwwwwwkkvvk.',
'.kvvkkwwwwweewwwwwwkkvvk',
'.kvvkkwwwwwwwwwwwwkkvvk.',
'kvvvvvkkwwwwwwwwkkvvvvvk',
'kvveevvvkkkkkkkkvvveevvk',
'kvvvvvvvvvvvvvvvvvvvvvvk',
'.kvvkwbwkvvvvvvkwbwkvvk.',
'.kvvvvvvvvvvvvvvvvvvvvk.',
'..kvvvvvvvvvvvvvvvvvvk..',
'..kvvvvvvvvvvvvvvvvvvk..',
'..kv...kv...kv...kv...kv',
'..kv...kv...kv...kv...kv',
'...k....k....k....k....k'
],

/* ======== 塔(16x16) ======== */

crossbow: [ // 弩楼
'................',
'..kkkkkkkkkkkk..',
'..kMMMMMMMMMMk..',
'....kkmkkmkk....',
'......kuuk......',
'......kuuk......',
'.....kkqqkk.....',
'....kuqqqquk....',
'....kuuqquuk....',
'...kSuuqquuSk...',
'...kSuuuuuuSk...',
'...ksuukkuusk...',
'..ksssuuuusssk..',
'..kssssssssssk..',
'..kqqqqqqqqqqk..',
'................'
],

cannon: [ // 轰天炮
'.....kkkkkk.....',
'....kqqqqqqk....',
'....kqmMMmqk....',
'....kqmMMmqk....',
'....kqMMMMqk....',
'...kkqqqqqqkk...',
'..kukkkkkkkkuk..',
'..kukqqqqqqkuk..',
'..kukqqqqqqkuk..',
'.kqqkk.qqq.kkqqk',
'.kqmqk.qqq.kqmqk',
'.kqqkk.qqq.kkqqk',
'..kk........kk..',
'................',
'................',
'................'
],

frost: [ // 凛冬晶塔
'.......kk.......',
'......kIik......',
'.....kiIIik.....',
'....kiIIIIik....',
'.ki.kiIIIIik.ik.',
'.kk.kiIIIIik.kk.',
'....kiIIIIik....',
'.....kiIIik.....',
'......kiik......',
'....kssssssk....',
'...kssSssSssk...',
'...kssssssssk...',
'..kssssssssssk..',
'..kqqqqqqqqqqk..',
'................',
'................'
],

poison: [ // 瘟疫釜
'................',
'................',
'...kqlLllLlqk...',
'..kkqqqqqqqqkk..',
'..kqqqqqqqqqqk..',
'..kqqqqqqqqqqk..',
'..kqqLqqqqLqqk..',
'...kqqqqqqqqk...',
'....kkqqqqkk....',
'..k..kqqqqk..k..',
'...kk.koOOk.kk..',
'....k.oOOo.k....',
'.......oo.......',
'................',
'................',
'................'
],

lightning: [ // 风暴尖塔
'......kyyk......',
'.....kyEEyk.....',
'......kyyk......',
'.......kk.......',
'.....kMMMMk.....',
'.....kMqqMk.....',
'.....kMMMMk.....',
'.....kMqqMk.....',
'.....kMMMMk.....',
'....kkqqqqkk....',
'...kssqqqqssk...',
'...kssssssssk...',
'..kssssssssssk..',
'..kqqqqqqqqqqk..',
'................',
'................'
],

flame: [ // 狱炎盆
'......kook......',
'.....koOOok.....',
'....kooOOook....',
'....kOoyyoOk....',
'...kkOOOOOOkk...',
'...kqqqqqqqqk...',
'..kqqqqqqqqqqk..',
'..kqqqsqqsqqk...',
'..kqqqqqqqqqqk..',
'...kqqqqqqqqk...',
'....kqqqqqqk....',
'.....kkqqkk.....',
'.....kssssk.....',
'....kssssssk....',
'...kssssssssk...',
'................'
],

orb: [ // 幽界法球
'......kPPk......',
'.....kpPPpk.....',
'.....kpPPpk.....',
'......kPPk......',
'...kk..kk..kk...',
'..kqpk....kpkqk.',
'..kqpk....kpkqk.',
'..kqpk....kpkqk.',
'..kqpk....kpkqk.',
'..kqqkkkkkkqqk..',
'..kqqqqqqqqqqk..',
'.kqqqssssssqqqk.',
'.kssssssssssssk.',
'.kqqqqqqqqqqqqk.',
'................',
'................'
],

totem: [ // 诅咒图腾
'.....kkkkkk.....',
'....kwnnnnwk....',
'....knennenk....',
'....kwnwnwnk....',
'.....kkkkkk.....',
'....kuuuuuuk....',
'...kuuekuueku...',
'...kuukkkkuuk...',
'...kuuukkuuuk...',
'..kuuuuuuuuuuk..',
'..kueeuueeuuk...',
'..kuuuuuuuuuuk..',
'.kuuuuuuuuuuuuk.',
'.kqqqqqqqqqqqqk.',
'................',
'................'
],

/* ======== 魂火(篝火) ======== */
bonfire: [
'................',
'................',
'................',
'................',
'................',
'................',
'................',
'................',
'................',
'................',
'...uuuqqqquuu...',
'..kquuqqqquuqk..',
'.ksqqquuuqqqsk..',
'kssqqqqqqqqqssk.',
'kqqqqqqqqqqqqqqk',
'................'
],

flame0: [ // 魂火火焰 帧1 10x11
'....CC....',
'...CCCC...',
'...cCCc...',
'..ccCCcc..',
'..ccCCcc..',
'.cccCCccc.',
'.cccCCccc.',
'.cccCCccc.',
'..cccccc..',
'..cccccc..',
'..cccccc..'
],
flame1: [ // 帧2
'.....C....',
'....CCC...',
'...cCCc...',
'..ccCCcc..',
'.cccCCcc..',
'.cccCCccc.',
'..ccCCccc.',
'.cccCCccc.',
'..cccccc..',
'...cccc...',
'...cccc...'
],
flame2: [ // 帧3
'....C.....',
'...CCC....',
'...cCCc...',
'..ccCCcc..',
'..ccCCccc.',
'.cccCCccc.',
'.cccCCcc..',
'.cccCCccc.',
'..cccccc..',
'...cccc...',
'..cccccc..'
],

/* ======== 传送门(怪物的裂隙) ======== */
portal: [
'................',
'................',
'................',
'....kkkkkkkk....',
'...kppppppppk...',
'..kpqqqqqqqqpk..',
'..kpqqeqqeqqpk..',
'..kpqqqqqqqqpk..',
'..kpqqeqqeqqpk..',
'..kpqqqqqqqqpk..',
'...kppppppppk...',
'....kkkkkkkk....',
'................',
'................',
'................',
'................'
],

/* ======== 建造槽 ======== */
slot: [
'................',
'................',
'................',
'................',
'..kkkkkkkkkkkk..',
'.kssssssssssssk.',
'.kSssssssssssSk.',
'.kssssseesssssk.',
'.kssssseesssssk.',
'.kSssssssssssSk.',
'.kssssssssssssk.',
'..kkkkkkkkkkkk..',
'................',
'................',
'................',
'................'
],

/* ============= 装饰物 ======== */
deco_tree: [ // 枯树 16x18
'..kk.....k.....',
'.kvkk...kpk....',
'..kvkk.kpvk....',
'...kvvkpvk.....',
'....kpvvk......',
'...kvpvvk......',
'..kvkkpvvkk....',
'..kpk.kvvk.....',
'.....kvvk......',
'....kvvvvk.....',
'....kvvvvk.....',
'....kvpvk......',
'....kvvvk......',
'....kvvvk......',
'...kvvvvvk.....',
'...kvqqqvk.....',
'..kvvqqqvvk....',
'..kkkkkkkkk....'
],
deco_grave: [ // 墓碑 12x13
'...kkkkk....',
'..ksssssk...',
'.ksSSSsssk..',
'.kssssssssk.',
'.ksskksSSsk.',
'.ksskksssSk.',
'.ksSssssssk.',
'.ksssssssSk.',
'.kssssssssk.',
'.ksssSsssk..',
'..kssssssk..',
'.kqqqqqqqqk.',
'.kkkkkkkkkk.'
],
deco_bones: [ // 散骨 14x8
'..............',
'.kk....kk...k.',
'knnk..knnk.knk',
'knnkk.knnkknkk',
'.knnkkknnkknnk',
'..kknnnnnkkkk.',
'...kkkkkkkk...',
'..............'
],
deco_rock: [ // 岩石 14x10
'..............',
'....kkkk......',
'..kksssSkk....',
'.kssssssSsk...',
'.ksSsssssssk..',
'ksssssssSsssk.',
'ksSsssssssssk.',
'ksssssSssssk..',
'kqqqqqqqqqqk..',
'.kkkkkkkkkk...'
],
deco_mushroom: [ // 幽荧光菇 10x10
'...kk....',
'..kppk...',
'.kpPPpk..',
'kpPcPPpk.',
'kppppppk.',
'..kCCk...',
'..kCck...',
'..kcCk...',
'..kcck...',
'.kkqqkk..'
],
deco_crystal: [ // 晶簇 12x13
'.....kk.....',
'....kppk....',
'...kpPPk....',
'...kpPPkk...',
'....kppkpk..',
'.kk...kppPk.',
'kppk..kpPPk.',
'kpPpk.kppPk.',
'kpppkkkppk..',
'kpPpppppPk..',
'kppppppppk..',
'.kqqqqqqk...',
'..kkkkkk....'
],
deco_skulls: [ // 骷髅堆 14x9
'..............',
'..kkk....kk...',
'.knnnk..knnk..',
'.kennenkknekn.',
'.knnnnnknnnnk.',
'kknnwnnkwnnnkk',
'knnnnnnnnnnnnk',
'kqqqqqqqqqqqqk',
'.kkkkkkkkkkkk.'
],
deco_tentacle: [ // 触手植物 12x14
'....kk......',
'...kppk.....',
'..kpPpk..k..',
'..kpPpk.kpk.',
'.kpPPpk.kpk.',
'.kpPppkkkpk.',
'.kpppppppk..',
'..kppppppk..',
'..kppppppk..',
'..kppppp k..',
'..kpppppk...',
'.kqqqqqqqk..',
'.kqqqqqqqk..',
'.kkkkkkkkk..'
],
deco_fence: [ // 残破栅栏 16x10
'..k...k....k....',
'..u...u....u....',
'.kuk.kuk..kuk...',
'.kukkukk..kukk..',
'.kUuukUukkkUuuk.',
'.kuuukuuukuuuuk.',
'kkukkkuukkuukkk.',
'kkkkkkkkkkkkkkk.',
'................',
'................'
],
deco_stump: [ // 树桩 10x8
'..kkkkk...',
'.knnnnnk..',
'knuununuk.',
'knuuuuunk.',
'kuuuuuuuk.',
'kquuuuuqk.',
'kqquuqqqk.',
'.kkkkkkk..'
]
};

/* ---------------- 塔数据 ----------------
 * cost: [建造, 升2, 升3]
 * dmg/rate/range 按等级为数组
 * ------------------------------------------------ */
const TOWERS = {
  crossbow: {
    name:'弩楼', icon:'crossbow',
    desc:'高速连射的骨刺弩箭,便宜可靠。',
    projectile:'arrow', dtype:'phys',
    cost:[50,45,70],
    dmg:[9,16,28],
    rate:[0.55,0.48,0.42],
    range:[58,63,69],
    palSwap:[null,{M:'#f2cf46'},{M:'#f2cf46',q:'#241a10'}]
  },
  cannon: {
    name:'轰天炮', icon:'cannon',
    desc:'沉重铁炮,溅射一片敌人。',
    projectile:'shell', dtype:'phys',
    cost:[100,85,130],
    dmg:[26,46,80],
    rate:[1.7,1.6,1.5],
    range:[52,56,61],
    splash:[22,26,30],
    palSwap:[null,{M:'#f2cf46'},{M:'#ff5a3c',q:'#241a10'}]
  },
  frost: {
    name:'凛冬晶塔', icon:'frost',
    desc:'寒冰碎片减慢敌人步伐。',
    projectile:'shard', dtype:'magic',
    cost:[80,65,100],
    dmg:[5,9,15],
    rate:[1.1,1.0,0.95],
    range:[46,50,55],
    slow:[0.40,0.48,0.56],
    slowDur:1.6,
    palSwap:[null,{s:'#3f4f6a'},{s:'#3f4f6a',I:'#ffffff'}]
  },
  poison: {
    name:'瘟疫釜', icon:'poison',
    desc:'泼洒毒液,使敌人持续腐烂。',
    projectile:'glob', dtype:'magic',
    cost:[90,75,115],
    dmg:[4,7,12],
    rate:[1.3,1.2,1.1],
    range:[50,54,59],
    poison:[6,10,16], poisonDur:4,
    palSwap:[null,{l:'#a8f050'},{l:'#d0ff70',q:'#1a2410'}]
  },
  lightning: {
    name:'风暴尖塔', icon:'lightning',
    desc:'闪电链在敌群间跳跃。',
    projectile:'zap', dtype:'magic',
    cost:[130,110,165],
    dmg:[14,25,43],
    rate:[1.4,1.3,1.2],
    range:[54,58,64],
    chains:[3,4,5],
    palSwap:[null,{y:'#8fd4e8'},{y:'#dff7ff',s:'#3f3f5a'}]
  },
  flame: {
    name:'狱炎盆', icon:'flame',
    desc:'近距离喷射地狱之火并点燃敌人。',
    projectile:'fire', dtype:'magic',
    cost:[70,55,85],
    dmg:[5,9,15],       // 每 0.25s 一次
    rate:[1,1,1],
    range:[34,37,41],
    burn:[8,13,20], burnDur:2,
    palSwap:[null,{O:'#ffe66e'},{O:'#ffe66e',q:'#26140e'}]
  },
  orb: {
    name:'幽界法球', icon:'orb',
    desc:'射出幽界法球,重创并小范围溅射。',
    projectile:'orb', dtype:'magic',
    cost:[160,130,200],
    dmg:[48,84,146],
    rate:[2.3,2.15,2.0],
    range:[66,72,79],
    splash:[12,14,16],
    palSwap:[null,{P:'#c98ef0'},{P:'#e8c0ff',s:'#3a2a4e'}]
  },
  totem: {
    name:'诅咒图腾', icon:'totem',
    desc:'不造成伤害;诅咒范围内的敌人,使其受到的伤害大幅提升。',
    projectile:'curse', dtype:'magic',
    cost:[60,50,80],
    dmg:[0,0,0],
    rate:[1,1,1],
    range:[40,46,52],
    amp:[1.30,1.45,1.60],
    palSwap:[null,{u:'#6a3a4a'},{u:'#7a2a3a',e:'#ff5a3c'}]
  }
};

/* ---------------- 怪物数据 ----------------
 * spd 单位:tile/秒;pres/mres:物理/魔法减伤
 * ------------------------------------------------ */
const ENEMIES = {
  zombie:     {name:'行尸',     spr:['zombie'],          hp:42,  spd:0.85, bounty:7,  dmg:1, armor:0, pres:0,   mres:0,   goo:'#567d3a'},
  skeleton:   {name:'白骨',     spr:['skeleton'],        hp:26,  spd:1.4,  bounty:6,  dmg:1, armor:2, pres:0,   mres:0,   goo:'#cfc39b'},
  bat:        {name:'血蝠',     spr:['bat','bat2'],      hp:14,  spd:2.1,  bounty:4,  dmg:1, armor:0, pres:0,   mres:0,   goo:'#8e5bb0', fly:true},
  ghost:      {name:'哀魂',     spr:['ghost','ghost2'],  hp:55,  spd:1.0,  bounty:9,  dmg:1, armor:0, pres:0.55,mres:0,   goo:'#8fd4e8', ghost:true, fly:true},
  spider:     {name:'尸蛛',     spr:['spider'],          hp:75,  spd:1.25, bounty:9,  dmg:1, armor:0, pres:0,   mres:0.2, goo:'#5d3a75', spawnOnDeath:['spiderling','spiderling','spiderling']},
  spiderling: {name:'幼蛛',     spr:['spiderling'],      hp:10,  spd:1.8,  bounty:2,  dmg:1, armor:0, pres:0,   mres:0,   goo:'#5d3a75'},
  brute:      {name:'裂躯者',   spr:['brute'],           hp:420, spd:0.5,  bounty:35, dmg:2, armor:5, pres:0.1, mres:0,   goo:'#7e1414', big:true},
  demon:      {name:'地狱魔',   spr:['demon'],           hp:280, spd:1.05, bounty:38, dmg:2, armor:0, pres:0,   mres:0.2, goo:'#b33a2e', regen:6, big:true},
  boss:       {name:'旧日支配者',spr:['boss'],           hp:3600,spd:0.42, bounty:250,dmg:5, armor:3, pres:0.35,mres:0.25,goo:'#5d3a75', boss:true, big:true}
};

/* ---------------- 关卡 ---------------- */
/* G(type, count, gap, delay) 生成一波中的一组 */
function G(type,n,gap,delay){ return {type,n,gap,delay:delay||0}; }

const LEVELS = [
{ /* ==== L1 外围村落 ==== */
  name:'外围村落', sub:'OUTSKIRTS',
  theme:{ground:'#2f3226', speck:'#39402e', tuft:'#454e33', path:'#4a4132',
         pathSpeck:'#5a4f3c', pathEdge:'#2c2620',
         deco:['deco_tree','deco_fence','deco_rock','deco_stump','deco_bones']},
  path:[[-1,2],[5,2],[5,7],[12,7],[12,4],[15,4]],
  slots:[[3,4],[7,6],[7,8],[10,5],[10,8],[13,6],[14,2],[8,2],[13,2]],
  startGold:280,
  towers:['crossbow','cannon'],
  waves:[
    [G('zombie',5,1.4)],
    [G('zombie',8,1.0)],
    [G('skeleton',6,0.9), G('zombie',4,1.2,6)],
    [G('zombie',10,0.8), G('skeleton',5,0.9,7)],
    [G('skeleton',12,0.55)],
    [G('zombie',14,0.6), G('skeleton',6,0.5,8)],
    [G('skeleton',14,0.45), G('zombie',8,0.8,5)],
    [G('zombie',16,0.5), G('skeleton',12,0.5,6)]
  ]
},
{ /* ==== L2 白骨丘 ==== */
  name:'白骨丘', sub:'BONE HOLLOW',
  theme:{ground:'#37342c', speck:'#413d33', tuft:'#4c473a', path:'#494337',
         pathSpeck:'#585142', pathEdge:'#2b2721',
         deco:['deco_grave','deco_bones','deco_skulls','deco_tree','deco_rock']},
  path:[[-1,7],[3,7],[3,2],[8,2],[8,7],[13,7],[13,3],[16,3]],
  slots:[[1,5],[5,4],[5,6],[6,1],[10,4],[10,6],[11,8],[15,5],[14,1],[2,2]],
  startGold:300,
  towers:['crossbow','cannon','flame','frost'],
  waves:[
    [G('zombie',6,1.0)],
    [G('bat',8,0.4)],
    [G('skeleton',8,0.7), G('bat',6,0.35,5)],
    [G('zombie',12,0.6), G('bat',8,0.3,6)],
    [G('bat',16,0.25)],
    [G('skeleton',10,0.5), G('zombie',8,0.7,4)],
    [G('zombie',16,0.5), G('bat',10,0.3,8)],
    [G('skeleton',14,0.4), G('bat',8,0.25,7)],
    [G('bat',20,0.2), G('zombie',10,0.6,4)],
    [G('zombie',18,0.45), G('skeleton',14,0.4,5), G('bat',12,0.25,10)]
  ]
},
{ /* ==== L3 瘴雾沼泽 ==== */
  name:'瘴雾沼泽', sub:'MIRE OF MISTS',
  theme:{ground:'#26332b', speck:'#2e3d33', tuft:'#39493a', path:'#3a4638',
         pathSpeck:'#485646', pathEdge:'#212a21',
         deco:['deco_mushroom','deco_tree','deco_rock','deco_bones','deco_stump']},
  path:[[-1,1],[4,1],[4,8],[13,8],[13,1],[16,1]],
  slots:[[2,3],[6,3],[6,6],[2,6],[9,4],[10,6],[11,3],[15,3],[15,6],[7,5]],
  startGold:320,
  towers:['crossbow','cannon','flame','frost','poison'],
  waves:[
    [G('zombie',8,0.9)],
    [G('ghost',4,1.6)],
    [G('skeleton',10,0.5), G('ghost',4,1.4,6)],
    [G('ghost',6,1.2), G('bat',8,0.3,4)],
    [G('zombie',14,0.5), G('ghost',5,1.2,7)],
    [G('skeleton',12,0.45), G('bat',10,0.25,5)],
    [G('ghost',8,1.0), G('zombie',8,0.6,6)],
    [G('bat',18,0.2), G('ghost',6,1.1,5)],
    [G('zombie',16,0.45), G('skeleton',10,0.45,6), G('ghost',5,1.2,12)],
    [G('ghost',10,0.9), G('skeleton',12,0.4,4), G('bat',10,0.25,10)]
  ]
},
{ /* ==== L4 废弃矿坑 ==== */
  name:'废弃矿坑', sub:'ABANDONED MINE',
  theme:{ground:'#2c2a33', speck:'#35323d', tuft:'#403c48', path:'#3d3a44',
         pathSpeck:'#4a4652', pathEdge:'#25232b',
         deco:['deco_rock','deco_crystal','deco_bones','deco_skulls','deco_stump']},
  path:[[-1,8],[3,8],[3,5],[7,5],[7,8],[11,8],[11,5],[15,5],[15,2],[16,2]],
  slots:[[1,6],[5,7],[5,3],[9,6],[9,3],[13,7],[13,3],[14,6],[4,1],[8,1]],
  startGold:340,
  towers:['crossbow','cannon','flame','frost','poison','lightning'],
  waves:[
    [G('zombie',10,0.7)],
    [G('skeleton',10,0.5), G('bat',6,0.3,5)],
    [G('spider',4,1.5)],
    [G('zombie',12,0.5), G('spider',4,1.4,6)],
    [G('skeleton',12,0.4), G('bat',10,0.25,4)],
    [G('spider',7,1.1), G('ghost',4,1.3,5)],
    [G('zombie',16,0.45), G('bat',10,0.25,7)],
    [G('brute',1,1), G('zombie',10,0.6,3)],
    [G('spider',8,0.9), G('skeleton',10,0.4,5)],
    [G('ghost',8,0.9), G('bat',14,0.2,4)],
    [G('brute',2,4), G('spider',6,1.2,3), G('skeleton',10,0.5,8)]
  ]
},
{ /* ==== L5 古墓大厅 ==== */
  name:'古墓大厅', sub:'HALL OF TOMBS',
  theme:{ground:'#332e3a', speck:'#3c3644', tuft:'#474050', path:'#423c4a',
         pathSpeck:'#504959', pathEdge:'#292430',
         deco:['deco_grave','deco_skulls','deco_crystal','deco_bones','deco_rock']},
  path:[[-1,1],[15,1],[15,3],[2,3],[2,5],[15,5],[15,7],[3,7]],
  slots:[[3,2],[7,2],[11,2],[6,4],[10,4],[4,6],[7,6],[11,6],[14,8],[1,7]],
  startGold:360,
  towers:['crossbow','cannon','flame','frost','poison','lightning','orb'],
  waves:[
    [G('zombie',12,0.6)],
    [G('skeleton',12,0.45)],
    [G('ghost',8,0.9), G('bat',8,0.25,5)],
    [G('spider',7,1.0)],
    [G('zombie',16,0.45), G('ghost',6,1.0,6)],
    [G('skeleton',16,0.35), G('bat',10,0.2,5)],
    [G('demon',1,1), G('zombie',10,0.55,4)],
    [G('spider',9,0.8), G('ghost',7,0.9,5)],
    [G('brute',2,5), G('skeleton',12,0.4,4)],
    [G('bat',22,0.18), G('ghost',8,0.8,5)],
    [G('zombie',18,0.4), G('spider',8,0.9,7)],
    [G('demon',3,3), G('brute',2,5,4), G('spider',8,0.8,2)]
  ]
},
{ /* ==== L6 哀嚎深渊 ==== */
  name:'哀嚎深渊', sub:'WAILING ABYSS',
  theme:{ground:'#1f2430', speck:'#262c3a', tuft:'#323a4a', path:'#2c3342',
         pathSpeck:'#3a4252', pathEdge:'#191d26',
         deco:['deco_crystal','deco_mushroom','deco_skulls','deco_rock','deco_bones']},
  path:[[-1,2],[16,2],[16,5],[2,5],[2,8],[12,8]],
  slots:[[2,1],[6,1],[10,1],[14,1],[5,4],[9,4],[13,4],[6,7],[10,7],[3,6],[14,7]],
  startGold:450,
  towers:['crossbow','cannon','flame','frost','poison','lightning','orb','totem'],
  waves:[
    [G('zombie',10,0.6)],
    [G('skeleton',12,0.45), G('bat',8,0.25,6)],
    [G('ghost',8,1.0)],
    [G('spider',8,0.95)],
    [G('zombie',16,0.4), G('bat',12,0.2,5)],
    [G('brute',2,4), G('ghost',7,0.9,4)],
    [G('skeleton',18,0.3), G('spider',6,1.0,8)],
    [G('demon',2,2.5), G('zombie',12,0.5,4)],
    [G('ghost',11,0.75), G('bat',13,0.2,5)],
    [G('spider',10,0.7), G('skeleton',13,0.35,5)],
    [G('brute',3,3.5), G('ghost',8,0.8,4)],
    [G('demon',3,2.5), G('bat',15,0.18,5)],
    [G('zombie',22,0.3), G('skeleton',15,0.3,6), G('ghost',9,0.7,10), G('demon',2,3,14)]
  ]
},
{ /* ==== L7 魔鬼城 ==== */
  name:'魔鬼城', sub:'DEMON CITADEL',
  theme:{ground:'#38262a', speck:'#432e32', tuft:'#4f383c', path:'#483036',
         pathSpeck:'#573c42', pathEdge:'#291d20',
         deco:['deco_skulls','deco_bones','deco_grave','deco_rock','deco_tree']},
  path:[[-1,4],[3,4],[3,1],[14,1],[14,6],[6,6],[6,3],[12,3]],
  slots:[[2,5],[5,2],[8,2],[11,2],[1,1],[8,4],[11,5],[16,2],[16,4],[9,7],[12,7]],
  startGold:480,
  towers:['crossbow','cannon','flame','frost','poison','lightning','orb','totem'],
  waves:[
    [G('zombie',12,0.5)],
    [G('skeleton',14,0.38), G('bat',10,0.22,6)],
    [G('ghost',10,0.75)],
    [G('spider',9,0.75)],
    [G('demon',2,2.5), G('zombie',13,0.45,4)],
    [G('brute',3,3), G('bat',13,0.2,4)],
    [G('skeleton',20,0.3), G('spider',8,0.8,7)],
    [G('demon',3,2.2), G('ghost',10,0.7,4)],
    [G('zombie',20,0.32), G('bat',15,0.18,5)],
    [G('brute',4,2.8), G('skeleton',15,0.32,4)],
    [G('ghost',13,0.6), G('spider',10,0.7,5)],
    [G('demon',4,2), G('zombie',16,0.35,5)],
    [G('brute',5,2.5), G('bat',18,0.16,4)],
    [G('demon',5,1.8), G('brute',3,4,5), G('ghost',12,0.6,3), G('spider',10,0.6,8)]
  ]
},
{ /* ==== L8 旧日之国(最终) ==== */
  name:'旧日之国', sub:'REALM OF THE OLD ONE',
  theme:{ground:'#1d2430', speck:'#242c3b', tuft:'#2f3949', path:'#262f3f',
         pathSpeck:'#343f52', pathEdge:'#161b24',
         deco:['deco_tentacle','deco_crystal','deco_skulls','deco_mushroom','deco_bones']},
  path:[[-1,0],[2,0],[2,3],[6,3],[6,0],[10,0],[10,4],[5,4],[5,7],[13,7],[13,4],[16,4]],
  slots:[[0,2],[4,1],[8,1],[12,1],[3,5],[8,6],[11,6],[15,6],[7,2],[15,2],[1,6],[14,8]],
  startGold:560,
  towers:['crossbow','cannon','flame','frost','poison','lightning','orb','totem'],
  waves:[
    [G('zombie',12,0.5)],
    [G('skeleton',14,0.35), G('bat',10,0.2,5)],
    [G('ghost',11,0.65)],
    [G('spider',10,0.6)],
    [G('demon',2,2.2), G('zombie',14,0.4,4)],
    [G('brute',3,2.5), G('bat',14,0.18,4)],
    [G('skeleton',17,0.28), G('ghost',8,0.65,6)],
    [G('spider',11,0.55), G('skeleton',14,0.3,5)],
    [G('demon',3,2), G('brute',2,3,4)],
    [G('ghost',12,0.5), G('bat',16,0.16,5)],
    [G('zombie',20,0.28), G('spider',10,0.55,7)],
    [G('brute',5,2.2), G('skeleton',18,0.26,4)],
    [G('demon',4,1.8), G('ghost',12,0.5,4)],
    [G('spider',13,0.5), G('bat',22,0.14,4), G('brute',4,2.5,8)],
    [G('demon',5,1.6), G('brute',4,2.2,5), G('skeleton',18,0.24,3)],
    [G('boss',1,1), G('demon',2,2.5,4), G('brute',2,4,8), G('spider',8,0.6,6)]
  ]
}
];

/* ---------------- 波次说明文字(可空) ---------------- */
const WAVE_LABELS = {
  boss:'⚠ 旧日支配者 苏醒 ⚠',
  final:'最后一波 —— 坚守!'
};

/* ---------------- 存档 ---------------- */
const SAVE_KEY = 'soulfire_td_save_v1';
function loadSave(){
  try{
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if(s && typeof s.unlocked === 'number') return s;
  }catch(e){}
  return {unlocked:0, stars:{}, muted:false};
}
function saveSave(s){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }catch(e){} }
