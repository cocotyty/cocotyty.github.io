/* ============================================================
 * 征服纪元 · util.js — 种子随机数 / 通用工具
 * 无 DOM 依赖,可在 Node 中 require 用于自动化测试
 * ============================================================ */
(function (G) {
  'use strict';

  /* ---------- 种子随机数(mulberry32) ---------- */
  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      let t = (this.s += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }   // [a,b]
    float(a, b) { return a + this.next() * (b - a); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    /* 按权重挑选 [{w:..},..] */
    weighted(arr, wf) {
      let sum = 0; for (const it of arr) sum += (wf ? wf(it) : it.w) || 0;
      if (sum <= 0) return arr[0];
      let r = this.next() * sum;
      for (const it of arr) { r -= (wf ? wf(it) : it.w) || 0; if (r <= 0) return it; }
      return arr[arr.length - 1];
    }
  }

  let _uid = 1;
  const uid = (p) => (p || 'u') + '_' + (_uid++);
  const setUidBase = (n) => { _uid = Math.max(_uid, n | 0); };
  const uidBase = () => _uid;

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const fmt = (n) => {
    n = Math.round(n);
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
    return '' + n;
  };

  /* 深拷贝(可JSON化数据) */
  const deepClone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

  const RES_LIST = ['gold', 'wood', 'ore', 'mercury', 'sulfur', 'crystal', 'gems'];
  const RES_CN = { gold: '金币', wood: '木材', ore: '矿石', mercury: '水银', sulfur: '硫磺', crystal: '水晶', gems: '宝石' };
  const RES_EMOJI = { gold: '🪙', wood: '🪵', ore: '⛰️', mercury: '🧪', sulfur: '🟡', crystal: '💎', gems: '💠' };

  /* 资源是否够 */
  const canAfford = (have, cost) => {
    if (!cost) return true;
    for (const k of RES_LIST) if ((cost[k] || 0) > (have[k] || 0)) return false;
    return true;
  };
  const payCost = (have, cost) => { if (cost) for (const k of RES_LIST) have[k] -= (cost[k] || 0); };
  const addRes = (have, gain) => { if (gain) for (const k of RES_LIST) have[k] = (have[k] || 0) + (gain[k] || 0); };
  const costText = (cost) => {
    if (!cost) return '免费';
    return RES_LIST.filter(k => cost[k]).map(k => (RES_EMOJI[k] || '') + cost[k]).join(' ');
  };

  G.RNG = RNG;
  G.uid = uid; G.setUidBase = setUidBase; G.uidBase = uidBase;
  G.clamp = clamp; G.fmt = fmt; G.deepClone = deepClone;
  G.RES_LIST = RES_LIST; G.RES_CN = RES_CN; G.RES_EMOJI = RES_EMOJI;
  G.canAfford = canAfford; G.payCost = payCost; G.addRes = addRes; G.costText = costText;
})(typeof window !== 'undefined' ? (window.HOMM = window.HOMM || {}) : (globalThis.HOMM = globalThis.HOMM || {}));
