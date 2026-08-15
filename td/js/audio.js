/* ============================================================
 * 魂火守卫 - WebAudio 程序化音效
 * 全部音效由振荡器/噪声实时合成,无外部资源
 * ============================================================ */
'use strict';

const Sound = {
  ctx: null,
  master: null,
  muted: false,
  _last: {},       // 同名音效节流
  _noiseBuf: null,

  init(){
    if(this.ctx) { if(this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(this.ctx.destination);
      // 预生成噪声缓冲
      const len = this.ctx.sampleRate * 1;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
    }catch(e){ this.ctx = null; }
  },

  setMuted(m){
    this.muted = m;
    if(this.master) this.master.gain.value = m ? 0 : 0.42;
  },

  _env(gain, t0, a, peak, dur){
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0+a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  },

  _osc(type, f0, f1, t0, dur, peak, dest){
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if(f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1), t0+dur);
    const g = this.ctx.createGain();
    this._env(g, t0, 0.005, peak, dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t0); o.stop(t0+dur+0.05);
    return o;
  },

  _noise(t0, dur, peak, filterType, f0, f1, q, dest){
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(f0||2000, t0);
    if(f1) f.frequency.exponentialRampToValueAtTime(Math.max(10,f1), t0+dur);
    f.Q.value = q || 0.8;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.005, peak, dur);
    src.connect(f); f.connect(g); g.connect(dest || this.master);
    src.start(t0); src.stop(t0+dur+0.05);
  },

  play(name){
    if(!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // 节流:同名音效 60ms 内不重复
    if(this._last[name] && now - this._last[name] < 0.06) return;
    this._last[name] = now;
    const t = now + 0.001;

    switch(name){

      case 'arrow':    // 弩箭
        this._osc('square', 900, 300, t, 0.08, 0.10);
        break;
      case 'cannon':   // 炮击
        this._noise(t, 0.25, 0.35, 'lowpass', 900, 120, 0.7);
        this._osc('sine', 110, 40, t, 0.22, 0.35);
        break;
      case 'boom':
        this._noise(t, 0.3, 0.30, 'lowpass', 600, 80, 0.6);
        this._osc('sine', 80, 30, t, 0.3, 0.3);
        break;
      case 'frost':
        this._osc('triangle', 1400, 900, t, 0.12, 0.10);
        this._noise(t, 0.1, 0.05, 'highpass', 5000, 7000, 1);
        break;
      case 'poison':
        this._osc('sine', 300, 140, t, 0.16, 0.14);
        break;
      case 'zap':{     // 闪电
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        for(let i=0;i<6;i++)
          o.frequency.linearRampToValueAtTime(200+Math.random()*2200, t+0.02+i*0.022);
        const g = this.ctx.createGain();
        this._env(g, t, 0.003, 0.12, 0.16);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t+0.25);
        break;
      }
      case 'flame':
        this._noise(t, 0.12, 0.07, 'bandpass', 700, 400, 1.5);
        break;
      case 'orb':
        this._osc('sine', 180, 60, t, 0.28, 0.30);
        this._osc('sine', 360, 120, t, 0.2, 0.10);
        break;
      case 'curse':
        this._osc('sine', 220, 110, t, 0.3, 0.08);
        break;

      case 'hit':
        this._noise(t, 0.05, 0.10, 'highpass', 2500, 3000, 1);
        break;
      case 'die':      // 怪物死亡(湿黏)
        this._noise(t, 0.18, 0.20, 'lowpass', 1200, 150, 0.8);
        this._osc('sine', 260, 60, t, 0.16, 0.12);
        break;
      case 'bossdie':
        this._noise(t, 0.8, 0.35, 'lowpass', 500, 60, 0.6);
        this._osc('sine', 70, 25, t, 0.9, 0.4);
        this._osc('sawtooth', 200, 30, t, 0.7, 0.10);
        break;
      case 'leak':     // 魂火被攻击
        this._noise(t, 0.3, 0.25, 'lowpass', 2000, 200, 0.7);
        this._osc('sine', 150, 50, t, 0.3, 0.3);
        break;

      case 'coin':
        this._osc('sine', 900, 900, t, 0.06, 0.12);
        this._osc('sine', 1350, 1350, t+0.06, 0.09, 0.12);
        break;
      case 'build':
        this._noise(t, 0.08, 0.18, 'lowpass', 1500, 500, 0.8);
        this._osc('square', 220, 160, t, 0.09, 0.08);
        break;
      case 'upgrade':
        this._osc('square', 520, 520, t, 0.07, 0.08);
        this._osc('square', 660, 660, t+0.07, 0.07, 0.08);
        this._osc('square', 880, 880, t+0.14, 0.1, 0.08);
        break;
      case 'sell':
        this._osc('sine', 700, 700, t, 0.06, 0.10);
        this._osc('sine', 460, 460, t+0.06, 0.09, 0.10);
        break;
      case 'error':
        this._osc('square', 160, 120, t, 0.14, 0.10);
        break;
      case 'click':
        this._noise(t, 0.03, 0.08, 'highpass', 3000, 4000, 1);
        break;

      case 'wave':     // 波次号角
        this._osc('sawtooth', 98, 98, t, 0.5, 0.16);
        this._osc('sawtooth', 147, 147, t+0.05, 0.5, 0.12);
        this._osc('sawtooth', 98, 90, t+0.55, 0.6, 0.14);
        break;
      case 'bosswave':
        this._osc('sawtooth', 65, 65, t, 0.9, 0.22);
        this._osc('sawtooth', 98, 98, t+0.1, 0.9, 0.16);
        this._noise(t+0.2, 0.7, 0.10, 'lowpass', 400, 100, 0.6);
        break;
      case 'win':
        [392,494,587,784].forEach((f,i)=>this._osc('square', f, f, t+i*0.12, 0.16, 0.10));
        break;
      case 'lose':
        [330,262,208,165].forEach((f,i)=>this._osc('sawtooth', f, f*0.95, t+i*0.18, 0.25, 0.12));
        break;
    }
  }
};
