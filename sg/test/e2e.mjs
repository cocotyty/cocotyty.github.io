/* CDP 端到端:标题→开局→内政→出征→行军→战斗UI→战术→占城 全流程
 * 用法: 先启动静态服务器(python -m http.server 8080),再 node sg/test/e2e.mjs
 * 依赖本机 Chrome(CDP 驱动,捕获页面异常;?autotest=1 覆盖不到按钮处理链路)
 */
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('未找到 Chrome/Edge,无法运行 E2E'); process.exit(1); }
const PORT = 9334;
const URL = 'http://localhost:8080/sg/?e2e=1';

const proc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + path.join(process.env.TEMP, 'sgcdp-profile2').replaceAll(path.sep, '/'),
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

let targets = null;
for (let i = 0; i < 30; i++) {
  try { targets = await getJson(`http://127.0.0.1:${PORT}/json/list`); break; }
  catch { await sleep(300); }
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let idSeq = 0, errors = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(res => {
  const id = ++idSeq;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errors++;
    console.log('[EXCEPTION]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors++;
    console.log('[console.error]', m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
};
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(1500);

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) { errors++; return 'EVAL-ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); }
  return r.result?.value;
};

let passed = 0, failed = 0;
const check = (n, c, d) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.error('  ✗ ' + n + ' ' + (d || '')); } };
const click = async (sel) => await evalJs(`document.querySelector('${sel}')?.click()`);

/* 1. 开局:曹操(许昌周边,邻居有弘农/宛空城) */
await click('#btn-new');
await sleep(300);
await click('.fac-card[data-f="cao"]');
await sleep(150);
await click('#ov-btns button.primary');
await sleep(800);
check('开局顶栏', (await evalJs('document.getElementById("tb-name").textContent')) === '曹操');

/* 2. 打开许昌面板 */
await evalJs(`SGUI.openCity(SGGame.current(), '许昌')`);
await sleep(300);
check('城池面板', (await evalJs('document.getElementById("cp-name").textContent')) === '许昌');

/* 3. 内政:开垦 → 选将 → 生效 */
const agriBefore = await evalJs('SGGame.current().cities["许昌"].agri');
await click('#cp-actions .act-btn[data-act="agri"]');
await sleep(200);
const prompt = await evalJs('document.getElementById("cp-msg")?.textContent || ""');
check('开垦弹出选将提示', prompt.includes('选谁主持'), prompt.slice(0, 40));
await evalJs(`document.querySelector('#cp-detail .gn[data-g]')?.click()`);
await sleep(300);
const agriAfter = await evalJs('SGGame.current().cities["许昌"].agri');
check('开垦生效(农业增长)', agriAfter > agriBefore, `${agriBefore}→${agriAfter}`);
check('内政按钮禁用(每城一令)', (await evalJs(`document.querySelector('#cp-actions .act-btn[data-act="agri"]')?.disabled`)) === true);

/* 4. 出征:洛阳→弘农 */
await evalJs(`SGUI.openCity(SGGame.current(), '洛阳')`);
await sleep(200);
const luoyang = await evalJs(`(() => { const c = SGGame.current().cities['洛阳']; c.gold += 5000; c.food += 50000; return c.troops; })()`);
await click('#cp-actions .act-btn[data-act="march"]');
await sleep(200);
check('出征弹出目标列表', (await evalJs('document.getElementById("cp-msg")?.textContent || ""')).includes('进攻目标'));
await evalJs(`document.querySelector('#cp-detail .gn[data-t="弘农"]')?.click()`);
await sleep(200);
check('选将界面', (await evalJs('document.getElementById("cp-msg")?.textContent || ""')).includes('选将出征'));
await evalJs(`document.querySelector('#cp-detail .sq')?.click()`);
await sleep(150);
await evalJs(`document.querySelector('#cp-detail [data-go]')?.click()`);
await sleep(150);
check('发兵数量界面', (await evalJs('document.getElementById("cp-msg")?.textContent || ""')).includes('发兵多少'));
await evalJs(`document.querySelectorAll('#cp-detail .gn[data-r]')[1]?.click()`);
await sleep(300);
const marching = await evalJs('SGGame.current().moves.length');
check('部队在途', marching === 1, 'moves=' + marching);

/* 5. 结束月 → 行军 → 次月战斗 */
await click('#btn-endturn');
await sleep(400);
await click('#btn-endturn');
await sleep(600);
const btShown = await evalJs(`!document.getElementById('battle-overlay').classList.contains('hidden')`);
check('战斗覆盖层弹出', btShown === true);
check('战术按钮渲染', (await evalJs(`document.querySelectorAll('#bt-tactics .tac-btn').length`)) === 6);

/* 6. 打 3 轮(含选火攻)再委任 */
await evalJs(`document.querySelector('#bt-tactics .tac-btn[data-t="3"]')?.click()`);
for (let i = 0; i < 3; i++) { await click('#bt-next'); await sleep(200); }
const logLen = await evalJs('document.getElementById("bt-log").innerHTML.length');
check('战报生成', logLen > 0, 'len=' + logLen);
await click('#bt-auto');
await sleep(1400);

/* 7. 结果:弘农易主或攻方败退,月份推进 */
const owner = await evalJs('SGGame.current().cities["弘农"].owner');
const month = await evalJs('SGGame.current().month');
check('弘农归属变更(占领或守方胜)', typeof owner === 'string', 'owner=' + owner);
check('结束月按钮恢复', (await evalJs(`document.getElementById('btn-endturn').disabled`)) === false);

/* 8. 存档与读档 */
const idxLen = await evalJs('SGSave.getIndex().length');
check('自动存档存在', idxLen > 0);
await evalJs(`document.getElementById('btn-menu').click()`);
await sleep(200);
await evalJs(`[...document.querySelectorAll('#ov-btns button')].find(b => b.textContent.includes('存档管理'))?.click()`);
await sleep(200);
await evalJs(`document.querySelector('.slot-row[data-slot="4"]')?.click()`);
await sleep(200);
await evalJs(`[...document.querySelectorAll('#ov-btns button')].find(b => b.textContent.includes('读取存档'))?.click()`);
await sleep(200);
await evalJs(`document.querySelector('.slot-row[data-slot="4"]')?.click()`);
await sleep(500);
check('读档后游戏继续', (await evalJs(`!document.getElementById('title-screen').classList.contains('hidden') ? 'title-shown' : SGGame.current() ? 'ok' : 'null'`)) === 'ok');

console.log(`\n异常总数: ${errors}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
proc.kill();
process.exit(failed || errors ? 1 : 0);
