// ============================================================
// _shim.js - 微信小游戏平台垫片 (打包时置于 bundle 最前)
// 提供 window/document/localStorage/AudioContext 等浏览器全局的等价物
// ============================================================
(function () {
  if (typeof wx === 'undefined' || !wx.createCanvas) return; // 非微信环境直通
  const sys = wx.getSystemInfoSync();
  const dpr = sys.pixelRatio || 1;

  // 第一个 createCanvas 是上屏画布
  const screenCanvas = wx.createCanvas();
  screenCanvas.width = sys.screenWidth * dpr;
  screenCanvas.height = sys.screenHeight * dpr;
  const sctx = screenCanvas.getContext('2d');
  sctx.imageSmoothingEnabled = false;

  // 游戏专用离屏画布 (480x270, 与网页版一致)
  const gameCanvas = wx.createCanvas();
  gameCanvas.width = 480;
  gameCanvas.height = 270;
  gameCanvas.addEventListener = function () {};
  gameCanvas.removeEventListener = function () {};
  gameCanvas.style = gameCanvas.style || {};

  const noop = function () {};
  const mkStubEl = function () {
    return {
      style: {}, classList: { add: noop, toggle: noop, contains: function () { return false; } },
      addEventListener: noop, removeEventListener: noop,
      appendChild: noop, contains: function () { return false; },
      setPointerCapture: noop, parentElement: null
    };
  };

  // window → 全局自身 (保持 window.xxx 写法可用)
  globalThis.window = globalThis;
  window.innerWidth = sys.screenWidth;
  window.innerHeight = sys.screenHeight;
  window.devicePixelRatio = dpr;
  window.addEventListener = noop;
  window.matchMedia = null; // IS_TOUCH 走 navigator.maxTouchPoints 分支
  globalThis.navigator = { maxTouchPoints: 1, userAgent: 'wx-minigame' };
  globalThis.location = { search: '' };
  if (typeof performance === 'undefined') globalThis.performance = { now: function () { return Date.now(); } };
  globalThis.localStorage = {
    getItem: function (k) { const v = wx.getStorageSync(k); return v === '' || v == null ? null : v; },
    setItem: function (k, val) { try { wx.setStorageSync(k, String(val)); } catch (e) {} }
  };

  // document 垫片
  const els = { game: gameCanvas, wrap: mkStubEl() };
  ['touchui', 'dpad', 'btns', 'bt-fire', 'bt-jump', 'bt-nade', 'sysbtns', 'sb-pause', 'sb-mute', 'sb-fs']
    .forEach(function (id) { els[id] = mkStubEl(); });
  globalThis.document = {
    createElement: function (tag) { return tag === 'canvas' ? wx.createCanvas() : mkStubEl(); },
    getElementById: function (id) { return els[id] || mkStubEl(); },
    addEventListener: noop, removeEventListener: noop,
    documentElement: mkStubEl(), body: mkStubEl(),
    hidden: false, fullscreenElement: null
  };

  // WebAudio → wx.createWebAudioContext (基础库 2.19.0+; 不可用则静音运行)
  try {
    if (wx.createWebAudioContext) window.AudioContext = function () { return wx.createWebAudioContext(); };
  } catch (e) {}

  globalThis.__WX_BOOT = { screenCanvas: screenCanvas, sctx: sctx, gameCanvas: gameCanvas, sys: sys, dpr: dpr };
})();
