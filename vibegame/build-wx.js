// ============================================================
// build-wx.js - 把网页版游戏打包成微信小游戏单文件
// 用法: node build-wx.js  → 生成 wxgame/game.js
// ============================================================
const fs = require('fs');
const path = require('path');
const root = __dirname;
const parts = [
  'wxgame/_shim.js',
  'js/audio.js',
  'js/sprites.js',
  'js/levels.js',
  'js/entities.js',
  'js/main.js',
  'wxgame/_boot.js'
];
const banner =
  '// ============================================================\n' +
  '// game.js - 自动构建, 勿手改 (源码见 js/ 与 wxgame/_shim.js _boot.js)\n' +
  '// 构建命令: node build-wx.js\n' +
  '// ============================================================\n';
let out = banner;
for (const p of parts) {
  const f = path.join(root, p);
  if (!fs.existsSync(f)) { console.error('缺少文件: ' + p); process.exit(1); }
  out += '\n// ===== ' + p + ' =====\n' + fs.readFileSync(f, 'utf8') + '\n';
}
fs.writeFileSync(path.join(root, 'wxgame/game.js'), out);
console.log('OK -> wxgame/game.js  (' + Math.round(out.length / 1024) + ' KB)');
