/* ============================================================
 * 三国烽火 · 无头平衡性模拟(AI vs AI)
 * 用法: node sg/test/sim.mjs [局数] [回合数]
 * 验证:无死锁、势力强弱符合历史直觉、统一节奏合理
 * ============================================================ */
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/* 无头加载浏览器风格脚本 */
function load() {
  const files = ['data.js', 'engine.js', 'battle.js', 'ai.js', 'save.js'].map(f => path.join(ROOT, 'js', f));
  const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const fn = new Function(code + '\n;return {SG_DATA, SGEngine, SGBattle, SGAI, SGSave};');
  return fn();
}

const { SG_DATA, SGEngine, SGBattle, SGAI } = load();

const GAMES = parseInt(process.argv[2] || '60', 10);
const TURNS = parseInt(process.argv[3] || '240', 10);

function simTurn(g) {
  Object.values(g.factions).forEach(f => {
    if (!f.alive) return;
    if (SGEngine.factionCities(g, f.id).length === 0) return;
    SGAI.runFaction(g, f.id);
  });
  SGAI.resolveArrivals(g);
  SGEngine.settleMonth(g);
  SGEngine.checkElimination(g);
}

let total = 0, unified = 0, deadlocks = 0;
const firstDeath = [], unifyTurn = [];
const finalCityCounts = {};   // faction -> [城数...]
const maxCities = {};         // faction -> 历史最大城数

for (let gi = 0; gi < GAMES; gi++) {
  /* observer 势力不存在 → 全 AI 平权(难度普通) */
  const g = SGEngine.newGame('___observer___', 1);
  let ended = null;
  let first = null;
  for (let t = 0; t < TURNS; t++) {
    simTurn(g);
    if (g.defeated.length && first === null) first = g.turn;
    Object.values(g.factions).forEach(f => {
      if (!f.alive) return;
      const n = SGEngine.factionCities(g, f.id).length;
      if (n > (maxCities[f.id] || 0)) maxCities[f.id] = n;
    });
    if (g.gameOver) { ended = g.gameOver; break; }
  }
  if (first !== null) firstDeath.push(first);
  if (ended) { unified++; unifyTurn.push(g.turn); }
  /* 死锁检测:20个月无任何战斗且多势力并存 → 无进展 */
  const battleLogs = g.log.filter(l => l.type === 'battle').length;
  if (!ended && g.log.length > 0) {
    const recent = g.log.slice(-30).filter(l => l.type === 'battle').length;
    if (recent === 0 && Object.values(g.factions).filter(f => f.alive && SGEngine.factionCities(g, f.id).length).length > 1) deadlocks++;
  }
  Object.values(g.factions).forEach(f => {
    const n = SGEngine.factionCities(g, f.id).length;
    (finalCityCounts[f.id] = finalCityCounts[f.id] || []).push(n);
  });
  total++;
}

const avg = (a) => (a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : '-');
console.log('======= 三国烽火 平衡性模拟 =======');
console.log(`局数: ${GAMES} × ${TURNS}月(20年)`);
console.log(`统一局: ${unified}/${GAMES} (${(unified / GAMES * 100).toFixed(0)}%)  平均统一月数: ${avg(unifyTurn)}`);
console.log(`首次灭亡平均月数: ${avg(firstDeath)}  疑似僵局局数: ${deadlocks}`);
console.log('\n势力 | 平均终局城数 | 最大占领 | 胜局数');
const winners = {};
for (let i = 0; i < GAMES; i++) {
  for (const f of SG_DATA.FACTIONS) {
    if ((finalCityCounts[f.id] || [])[i] === Object.keys(SG_DATA.CITY_DEFS).length) winners[f.id] = (winners[f.id] || 0) + 1;
  }
}
for (const f of SG_DATA.FACTIONS) {
  const arr = finalCityCounts[f.id] || [];
  const avgC = avg(arr);
  console.log(`${f.name.padEnd(4)} | ${avgC.padStart(6)} | ${(maxCities[f.id] || 0).toString().padStart(3)} | ${winners[f.id] || 0}`);
}
