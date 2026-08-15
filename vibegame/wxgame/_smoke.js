// ============================================================
// _smoke.js - Node 环境冒烟测试: 用 mock wx 加载 game.js,
// 验证初始化/关卡加载/更新循环/绘制不抛异常
// 用法: node wxgame/_smoke.js
// ============================================================
const fs = require('fs');
const path = require('path');

// ---- mock canvas 2d context (全方法空实现) ----
function mkCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 8 });
      if (typeof k === 'string') return function () {};
      return undefined;
    },
    set() { return true; }
  });
}
function mkCanvas() {
  return {
    width: 0, height: 0, style: {},
    getContext: () => mkCtx(),
    addEventListener() {}, removeEventListener() {}
  };
}
// ---- mock wx ----
global.wx = {
  createCanvas: mkCanvas,
  getSystemInfoSync: () => ({ screenWidth: 800, screenHeight: 400, pixelRatio: 2 }),
  getStorageSync: () => '', setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onHide() {}, onShow() {}
};
global.requestAnimationFrame = () => 0;

// ---- 加载 bundle 并取回内部引用 ----
const src = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
const factory = new Function(
  src + '\nreturn { game: game, Input: Input, Sprites: Sprites, LEVEL_COUNT: LEVEL_COUNT, Music: Music };'
);
const refs = factory();

function step(n) {
  for (let i = 0; i < n; i++) { refs.game.update(); refs.Input.clear(); }
}
function assert(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1); }
  console.log('PASS: ' + msg);
}

assert(refs.game && refs.game.state === 'title', 'bundle 加载成功, 标题状态');
assert(refs.Sprites.player && refs.Sprites.player.legs.length === 4, '精灵已构建');

refs.game.startRun();
assert(refs.game.state === 'intro', '开始游戏 → 任务卡');
refs.Input.set('confirm', true); refs.Input.set('confirm', false);
step(5);
assert(refs.game.state === 'play', '进入战斗');
refs.game.player.god = true; refs.game.player.inv = 99999;

step(120);
refs.game.player.x += 100; step(60);
assert(refs.game.state === 'play' && !isNaN(refs.game.player.x), '120+ 帧物理更新无异常');

refs.Input.set('right', true); step(40); refs.Input.set('right', false);
assert(refs.game.player.x > 40, '虚拟输入(右移)生效');

for (let i = 0; i < refs.LEVEL_COUNT; i++) {
  refs.game.loadLevel(i);
  refs.Input.set('confirm', true); refs.Input.set('confirm', false);
  step(5);
  refs.game.draw();
  step(90);
  assert(refs.game.state === 'play', '第 ' + (i + 1) + ' 关加载并更新 90 帧');
}
refs.game.draw();
console.log('\n全部冒烟测试通过 ✓  (音乐/音频在 mock 下静音属预期)');
process.exit(0);
