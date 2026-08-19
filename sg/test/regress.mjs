/* ============================================================
 * 三国烽火 · 回归测试(bug 修复验证)
 * 用法: node sg/test/regress.mjs
 * 覆盖:单挑胜负归属、俘虏 formerFaction、新开局存档槽指向
 * ============================================================ */
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function load() {
  const files = ['data.js', 'engine.js', 'battle.js', 'ai.js', 'save.js', 'game.js'].map(f => path.join(ROOT, 'js', f));
  const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const fn = new Function(code + '\n;return {SG_DATA, SGEngine, SGBattle, SGAI, SGSave, SGGame};');
  return fn();
}

const { SGEngine, SGBattle, SGSave, SGGame } = load();

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail || ''}`); }
}

/* ---------- 1. 单挑胜负归属:守方发起并获胜 → 攻方受罚 ---------- */
console.log('[1] 单挑胜负归属');
{
  const g = SGEngine.newGame('cao', 1);
  const move = { faction: 'cao', troops: 9000, gens: ['荀彧'], from: '濮阳', eta: 1 };
  const b = SGBattle.create(g, move, g.cities['下邳']);   // 守将首列为吕布(武100)
  b.def.tactic = 5; b.def.duelCd = 0;                     // 守方发起单挑
  const origRandom = Math.random;
  Math.random = () => 0.5;                                // 固定随机:吕布(100+15) 必胜 荀彧(24+15)
  SGBattle.step(g, b);                                    // 进入 duel 阶段
  SGBattle.step(g, b);                                    // 演算单挑
  Math.random = origRandom;
  const winnerIsDefender = b.duel && b.duel.a === '吕布';
  check('守方吕布单挑获胜', winnerIsDefender && b.phase === 'fight');
  check('受罚的是攻方(士气-25)', b.atk.morale === 45, `atk.morale=${b.atk.morale}`);
  check('守方不受罚', b.def.morale === 70, `def.morale=${b.def.morale}`);
  check('攻方损兵4%', b.atk.troops === 8640, `atk.troops=${b.atk.troops}`);
}

/* ---------- 2. 俘虏记录 formerFaction,处决触发旧势力忠诚下降 ---------- */
console.log('[2] 俘虏 formerFaction 与处决惩罚');
{
  const g = SGEngine.newGame('cao', 1);
  g.cities['下邳'].troops = 1000;                          // 守军必败
  const move = { faction: 'cao', troops: 50000, gens: ['夏侯惇'], from: '濮阳', eta: 1 };
  const b = SGBattle.create(g, move, g.cities['下邳']);
  const origRandom = Math.random;
  Math.random = () => 0.9;                                // flee 判定失败 → 守将被俘
  let guard = 0;
  while (b.phase !== 'end' && guard++ < 50) SGBattle.step(g, b);
  Math.random = origRandom;
  check('战斗以攻方胜利结束', b.winner === 'atk');
  check('吕布被俘并记录 formerFaction',
    g.generals['吕布'].status === 'captured' && g.generals['吕布'].formerFaction === 'lyu',
    `status=${g.generals['吕布'].status} formerFaction=${g.generals['吕布'].formerFaction}`);
  const before = g.generals['高顺'].loyalty;               // 吕布势力同僚
  const r = SGBattle.executePrisoner(g, '吕布');
  check('处决成功', r.ok);
  check('旧势力武将忠诚-3', g.generals['高顺'].loyalty === before - 3,
    `${before} → ${g.generals['高顺'].loyalty}`);
}

/* ---------- 3. 新开局后 sg_last 指向槽0,不劫持旧手动存档 ---------- */
console.log('[3] 新开局存档槽指向');
{
  const g1 = SGEngine.newGame('sun', 1);
  SGSave.save(3, g1, true);                               // 玩家手动存槽3(写 sg_last=3)
  check('手动存档后 sg_last=3', SGSave.lastSlot() === 3, `lastSlot=${SGSave.lastSlot()}`);
  const slot3Before = JSON.stringify(SGSave.load(3));
  SGGame.startNew('cao', 1);                              // 开新局(写槽0)
  check('新开局后 sg_last=0(自动保存不再覆写槽3)', SGSave.lastSlot() === 0, `lastSlot=${SGSave.lastSlot()}`);
  check('槽3 手动存档未被破坏', JSON.stringify(SGSave.load(3)) === slot3Before);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
