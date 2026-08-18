/* 跟踪一局的前 N 月战况,诊断早灭原因 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
function load() {
  const files = ['data.js', 'engine.js', 'battle.js', 'ai.js', 'save.js'].map(f => path.join(ROOT, 'js', f));
  const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const fn = new Function(code + '\n;return {SG_DATA, SGEngine, SGBattle, SGAI};');
  return fn();
}
const { SG_DATA, SGEngine, SGAI } = load();

const g = SGEngine.newGame('___obs___', 1);
const TURNS = parseInt(process.argv[2] || '18', 10);
for (let t = 0; t < TURNS; t++) {
  Object.values(g.factions).forEach(f => {
    if (!f.alive || SGEngine.factionCities(g, f.id).length === 0) return;
    SGAI.runFaction(g, f.id);
  });
  SGAI.resolveArrivals(g);
  SGEngine.settleMonth(g);
  SGEngine.checkElimination(g);
}
console.log(`--- ${g.year}年${g.month}月 战报 ---`);
g.log.filter(l => l.type === 'battle' || l.type === 'faction').slice(-40).forEach(l => console.log(`[第${l.turn}月] ${l.msg}`));
console.log('\n--- 势力现状 ---');
Object.values(g.factions).forEach(f => {
  const cs = SGEngine.factionCities(g, f.id);
  const troops = cs.reduce((s, c) => s + c.troops, 0);
  const food = cs.reduce((s, c) => s + Math.round(c.food), 0);
  console.log(`${f.name.padEnd(4)} 城${cs.length} 兵${troops} 粮${food} ${f.alive ? '' : '(灭)'}`);
});
