/* ============================================================
 * 狂飙公路 · audio.js
 * WebAudio 合成音效:引擎轰鸣 / 风噪 / 碰撞 / 道具 / 纪录
 * 无音频文件依赖,首次用户手势时初始化(自动播放策略)
 * ============================================================ */
'use strict';
const Sfx = (() => {

  let ctx = null, master = null;
  let engOscA = null, engOscB = null, engGain = null, engFilter = null;
  let windSrc = null, windGain = null, windFilter = null;
  let muted = false;

  try { muted = localStorage.getItem('race_muted') === '1'; } catch (e) {}

  function makeNoiseBuffer(c) {
    const len = c.sampleRate * 1.2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(ctx.destination);

      /* 引擎:锯齿波 + 方波失谐 → 低通 */
      engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 700;
      engGain = ctx.createGain();
      engGain.gain.value = 0;
      engOscA = ctx.createOscillator(); engOscA.type = 'sawtooth';
      engOscB = ctx.createOscillator(); engOscB.type = 'square';
      engOscA.frequency.value = 60; engOscB.frequency.value = 61;
      engOscB.detune.value = 8;
      engOscA.connect(engFilter); engOscB.connect(engFilter);
      engFilter.connect(engGain); engGain.connect(master);
      engOscA.start(); engOscB.start();

      /* 风噪:白噪声 → 带通 */
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 900; windFilter.Q.value = 0.6;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = makeNoiseBuffer(ctx);
      windSrc.loop = true;
      windSrc.connect(windFilter); windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
    } catch (e) { ctx = null; }
  }

  /* 每帧更新引擎声:speedRatio 0~1,running 是否驾驶中 */
  function engine(speedRatio, turbo, running) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 55 + speedRatio * 150 + (turbo ? 40 : 0);
    engOscA.frequency.setTargetAtTime(base, t, 0.08);
    engOscB.frequency.setTargetAtTime(base * 1.005, t, 0.08);
    engFilter.frequency.setTargetAtTime(500 + speedRatio * 1400, t, 0.1);
    const g = running ? (0.05 + speedRatio * 0.075) : 0;
    engGain.gain.setTargetAtTime(g, t, 0.12);
    windGain.gain.setTargetAtTime(running ? speedRatio * speedRatio * 0.1 : 0, t, 0.2);
    windFilter.frequency.setTargetAtTime(600 + speedRatio * 1600, t, 0.2);
  }

  function blip(freq, dur, type, vol, sweep) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (sweep) o.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    g.gain.setValueAtTime(vol || 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* 碰撞:intensity 0~1 */
  function crash(intensity) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(2600 + intensity * 2200, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22 + intensity * 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.4);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    og.gain.setValueAtTime(0.32 * (0.5 + intensity * 0.5), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(og); og.connect(master);
    o.start(t); o.stop(t + 0.34);
  }

  function coin()   { blip(880, 0.09, 'square', 0.09, 1320); }
  function pickup() { blip(523, 0.1, 'triangle', 0.16, 784); setTimeout(() => blip(784, 0.12, 'triangle', 0.16, 1046), 80); }
  function shield() { blip(392, 0.14, 'triangle', 0.15, 523); setTimeout(() => blip(523, 0.16, 'triangle', 0.15, 659), 90); }
  function turbo()  { blip(180, 0.34, 'sawtooth', 0.14, 760); }
  function ui()     { blip(660, 0.06, 'square', 0.08); }
  function warn()   { blip(990, 0.09, 'square', 0.08); setTimeout(() => blip(990, 0.09, 'square', 0.08), 130); }

  /* ---- 必杀技 ---- */
  function skillUp() { blip(392, 0.12, 'square', 0.14, 523); setTimeout(() => blip(659, 0.18, 'square', 0.13, 880), 100); }
  function siren(hi) { blip(hi ? 945 : 708, 0.32, 'triangle', 0.05); }
  function emp()     { blip(880, 0.5, 'sine', 0.16, 55); setTimeout(() => blip(440, 0.42, 'sine', 0.1, 48), 60); }
  function splash()  { blip(320, 0.3, 'sawtooth', 0.1, 85); setTimeout(() => blip(210, 0.22, 'sawtooth', 0.08, 70), 70); }

  function record() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.16), i * 110));
  }

  function gameOverSfx() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => blip(f, 0.22, 'sawtooth', 0.12), i * 150));
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('race_muted', m ? '1' : '0'); } catch (e) {}
    if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
  }
  function isMuted() { return muted; }

  return { init, engine, crash, coin, pickup, shield, turbo, ui, warn, record, gameOverSfx,
    skillUp, siren, emp, splash, setMuted, isMuted };
})();
