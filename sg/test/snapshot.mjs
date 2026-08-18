/* 单局长跑诊断:每 40 月快照各势力 城/兵/粮/将,找均势根源 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
function load() {
  const files = ['data.js', 'engine.js', 'battle.js', 'ai.js', 'save.js'].map(f => path.join(ROOT, 'js', f));
  const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  return new Function(code + '\n;return {SG_DATA, SGEngine, SGAI};')();
}
const { SG_DATA, SGEngine, SGAI } = load();

const g = SGEngine.newGame('___obs___', 1);
const SNAP = [40, 80, 120, 160, 200, 240];
let battlesTotal = 0, battlesWon40 = [0, 0], battlesWon160 = [0, 0]; // [atk胜, def胜]
for (let t = 0; t < 240; t++) {
  Object.values(g.factions).forEach(f => {
    if (!f.alive || SGEngine.factionCities(g, f.id).length === 0) return;
    SGAI.runFaction(g, f.id);
  });
  const before = g.log.length;
  SGAI.resolveArrivals(g);
  const after = g.log.slice(before).filter(l => l.type === 'battle');
  after.forEach(l => {
    battlesTotal++;
    if (t < 80) { l.msg.includes('攻陷') ? battlesWon40[0]++ : battlesWon40[1]++; }
    if (t >= 160) { l.msg.includes('攻陷') ? battlesWon160[0]++ : battlesWon160[1]++; }
  });
  SGEngine.settleMonth(g);
  SGEngine.checkElimination(g);
  if (SNAP.includes(g.turn)) {
    console.log(`\n===== 第${g.turn}月 (${g.year}年${g.month}月) =====`);
    Object.values(g.factions).filter(f => f.alive && SGEngine.factionCities(g, f.id).length).forEach(f => {
      const cs = SGEngine.factionCities(g, f.id);
      const troops = cs.reduce((s, c) => s + c.troops, 0);
      const food = cs.reduce((s, c) => s + Math.round(c.food), 0);
      const gold = cs.reduce((s, c) => s + Math.round(c.gold), 0);
      const gens = SGEngine.factionGenerals(g, f.id).length;
      console.log(`${f.name.padEnd(4)} 城${String(cs.length).padStart(2)} 兵${String(troops).padStart(7)} 将${gens} 金${gold} 粮${food}`);
    });
  }
}
console.log(`\n总战斗 ${battlesTotal} 场; 前80月 攻/守胜 ${battlesWon40}; 160月后 攻/守胜 ${battlesWon160}`);
