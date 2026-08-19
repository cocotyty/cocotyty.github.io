/* UI 层修复验证:月末双结算守卫 + 委任计时器(DOM 桩,走真实 SGUI 代码路径) */
import fs from 'fs';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
const elements = {};
function makeEl(id) {
  return {
    id, style: {}, dataset: {}, textContent: '', innerHTML: '', disabled: false,
    classList: { _s: new Set(['hidden']), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    onclick: null, onmouseenter: null, onmouseleave: null,
    getContext: () => ctx2d,
    querySelectorAll() { return []; }, querySelector() { return null; },
    addEventListener() {}, appendChild() {},
  };
}
global.document = { getElementById: (id) => elements[id] || (elements[id] = makeEl(id)), createElement: makeEl, querySelectorAll: () => [], body: makeEl('body'), addEventListener() {} };
global.window = { addEventListener() {} };
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => {};
global.location = { search: '', href: '' };

const files = ['data.js', 'engine.js', 'battle.js', 'ai.js', 'save.js', 'game.js', 'map.js', 'ui.js'].map(f => path.join(ROOT, 'js', f));
const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const sandbox = new Function('document', 'window', 'performance', 'requestAnimationFrame', 'location',
  code + '\n;return {SGEngine, SGBattle, SGAI, SGSave, SGGame, SGUI};')(
  global.document, global.window, global.performance, global.requestAnimationFrame, global.location);
const { SGEngine, SGGame, SGUI } = sandbox;

let passed = 0, failed = 0;
const check = (n, c, d) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.error('  ✗ ' + n + ' ' + (d || '')); } };

SGUI.bind();
const $btn = () => elements['btn-endturn'];

/* 制造一场玩家战斗:洛阳→弘农 */
const g0 = SGGame.startNew('cao', 1);
g0.cities['洛阳'].troops = 20000;
const luoGens = SGEngine.cityGenerals(g0, '洛阳').filter(x => x.faction === 'cao');
const mr = SGEngine.cmdMarch(g0, '洛阳', '弘农', 8000, [luoGens[0].name]);
if (!mr.ok) { console.error('出征失败: ' + mr.msg); process.exit(1); }
$btn().onclick();                                        // 结束月(部队在途)

/* 第二月:接战,进入战斗覆盖层 */
console.log('[1] 委任后连点"战后"+过期计时器 → 只结算一次');
{
  const g = SGGame.current();
  const t0 = g.turn;
  $btn().onclick();                                      // → battle 覆盖层
  check('战斗覆盖层已显示', !elements['battle-overlay'].classList.contains('hidden'));
  elements['bt-auto'].onclick();                         // 委任:battleAuto + 900ms 延时关闭
  elements['bt-next'].onclick();                         // 第1击:按钮重绑为"战后"
  elements['bt-next'].onclick();                         // 第2击:closeBattle → 第一次结算
  const tAfterFirst = g.turn;
  elements['bt-next'].onclick();                         // 第3击:重复 closeBattle(守卫应拦截)
  await new Promise(r => setTimeout(r, 1100));           // 过期的委任计时器此刻触发(守卫应拦截)
  check('月末仅结算一次', g.turn === t0 + 1 && tAfterFirst === t0 + 1, `turn ${t0} → ${tAfterFirst} → ${g.turn}`);
  check('结束月按钮恢复', $btn().disabled === false);
}

console.log('[2] 无战斗月点结束月 → 推进一月且按钮可用');
{
  const g = SGGame.current();
  const t0 = g.turn;
  $btn().onclick();
  check('月份 +1', g.turn === t0 + 1 || g.gameOver, `turn ${t0}→${g.turn}`);
  check('按钮可用', $btn().disabled === false);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
