// ============================================================
// audio.js - WebAudio 程序化音效 + 芯片音乐 (无外部文件)
// ============================================================
const AudioSys = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let muted = false, noiseBuf = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.42; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    // 白噪声缓冲
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.8;
    return muted;
  }
  const now = () => ctx ? ctx.currentTime : 0;

  // ---- 合成基础件 ----
  function blip(f0, f1, dur, type, vol, dest) {
    if (!ctx || muted) return;
    const t = now(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, vol, f0, f1, q) {
    if (!ctx || muted) return;
    const t = now(), s = ctx.createBufferSource(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true;
    flt.type = 'lowpass'; flt.Q.value = q || 1;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(sfxGain);
    s.start(t); s.stop(t + dur + .02);
  }

  // ---- 音效表 ----
  const Sfx = {
    shoot()      { blip(900, 240, .07, 'square', .11); noise(.04, .05, 3500, 900); },
    mgShoot()    { blip(760, 300, .05, 'square', .08); },
    spreadShoot(){ blip(520, 160, .10, 'sawtooth', .10); noise(.06, .06, 2600, 500); },
    eShoot()     { blip(330, 170, .10, 'square', .06); },
    jump()       { blip(190, 540, .12, 'square', .10); },
    land()       { noise(.05, .05, 700, 150); },
    nadeThrow()  { blip(500, 800, .06, 'triangle', .09); },
    explode()    { noise(.38, .30, 1600, 60, 1); blip(150, 40, .35, 'triangle', .20); },
    bigExplode() { noise(.8, .40, 1800, 40, 1); blip(110, 30, .7, 'triangle', .28); blip(70, 24, .9, 'sawtooth', .12); },
    hurt()       { blip(300, 70, .22, 'sawtooth', .16); noise(.12, .10, 900, 200); },
    enemyDie()   { noise(.16, .16, 1400, 120); blip(400, 90, .14, 'square', .08); },
    crateBreak() { noise(.12, .16, 1100, 200, 2); blip(240, 100, .08, 'triangle', .10); },
    pickup()     { blip(660, 660, .06, 'square', .10); setTimeout(() => blip(990, 990, .09, 'square', .10), 55); },
    weaponUp()   { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, f, .07, 'square', .10), i * 55)); },
    lifeUp()     { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => blip(f, f, .09, 'square', .10), i * 70)); },
    checkpoint() { [392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, f, .08, 'triangle', .12), i * 70)); },
    clank()      { blip(1400, 900, .05, 'square', .07); noise(.04, .06, 4000, 1500, 3); },
    bossRoar()   { blip(70, 40, .7, 'sawtooth', .22); noise(.7, .16, 500, 60); },
    stomp()      { noise(.25, .25, 500, 40); blip(70, 32, .3, 'triangle', .22); },
    laserCharge(){ blip(120, 1200, .5, 'sawtooth', .07); },
    laserFire()  { noise(.5, .18, 5000, 800, 4); blip(1800, 400, .5, 'sawtooth', .09); },
    missile()    { noise(.3, .08, 900, 2200, 2); },
    playerDie()  { blip(600, 60, .5, 'sawtooth', .16); noise(.4, .18, 1200, 80); },
    uiMove()     { blip(440, 660, .05, 'square', .07); },
    uiSel()      { blip(660, 990, .09, 'square', .10); },
    sting(type) {
      if (type === 'win')  [523, 523, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, f, .14, 'square', .11), i * 110));
      if (type === 'lose') [330, 311, 294, 220].forEach((f, i) => setTimeout(() => blip(f, f * .97, .3, 'sawtooth', .10), i * 220));
    }
  };

  // ---- 芯片音乐 ----
  const N = m => 440 * Math.pow(2, (m - 69) / 12);
  // 每步为 8 分音符; 0 = 休止; 鼓: k底鼓 s军鼓 h踩镲
  const TRACKS = {
    title: { bpm: 84, steps: 32,
      bass: [40,0,0,0,40,0,0,0,45,0,0,0,43,0,0,0,40,0,0,0,40,0,0,0,47,0,0,0,43,0,0,0],
      lead: [64,0,67,0,71,0,74,0,72,0,71,0,67,0,64,0,64,0,67,0,71,0,76,0,74,0,71,0,72,0,0,0],
      drum: 'k.h.s.h.k.h.s.hh' },
    jungle: { bpm: 112, steps: 32,
      bass: [40,0,40,0,43,0,45,0,40,0,40,0,47,0,45,0,40,0,40,0,43,0,45,0,52,0,50,0,47,0,43,0],
      lead: [64,0,67,0,71,0,69,0,67,0,64,0,62,0,64,0,64,0,67,0,71,0,74,0,72,0,71,0,67,0,64,0],
      drum: 'k.h.s.h.k.h.s.hk.h.s.h.k.hks.h' },
    city: { bpm: 96, steps: 32,
      bass: [45,0,0,45,0,48,0,0,45,0,0,45,0,52,0,50,45,0,0,45,0,48,0,0,53,0,52,0,50,0,48,0],
      lead: [69,0,72,0,76,0,74,0,72,0,69,0,68,0,69,0,69,0,72,0,76,0,79,0,77,0,76,0,72,0,69,0],
      drum: 'k..hs..hk..hs..hk..hs..hk..hshh' },
    fort: { bpm: 128, steps: 32,
      bass: [41,41,0,41,41,0,44,0,41,41,0,41,46,0,44,0,41,41,0,41,41,0,44,0,48,0,46,0,44,0,43,0],
      lead: [65,0,0,68,0,0,72,0,70,0,68,0,65,0,63,0,65,0,0,68,0,0,72,0,75,0,74,0,72,0,70,0],
      drum: 'k.hks.hkk.hks.hkk.hks.hkk.hks.hk' },
    boss: { bpm: 140, steps: 32,
      bass: [38,38,0,38,41,0,38,0,38,38,0,38,44,0,43,0,38,38,0,38,41,0,44,0,46,0,44,0,41,0,38,0],
      lead: [62,0,65,0,69,0,68,0,65,0,62,0,61,0,62,0,62,0,65,0,69,0,74,0,73,0,69,0,65,0,62,0],
      drum: 'k.hks.hkk.hks.hkk.hks.hkk.hks.hk' }
  };

  const Music = {
    cur: null, step: 0, nextT: 0, timer: null,
    play(name) {
      init(); if (!ctx) return;
      this.cur = TRACKS[name] || null; this.step = 0; this.nextT = now() + .1;
      if (!this.timer) this.timer = setInterval(() => this.tick(), 30);
    },
    stop() { this.cur = null; },
    tick() {
      if (!ctx || !this.cur || muted) { if (this.cur) this.nextT = Math.max(this.nextT, now()); return; }
      const spb = 60 / this.cur.bpm / 2;
      while (this.nextT < now() + .14) {
        this.sched(this.cur, this.step, this.nextT, spb);
        this.step = (this.step + 1) % this.cur.steps;
        this.nextT += spb;
      }
    },
    sched(tr, i, t, spb) {
      const dn = tr.drum[i % tr.drum.length];
      if (tr.bass[i]) this.tone(N(tr.bass[i]), t, spb * .9, 'square', .055);
      if (tr.lead[i]) this.tone(N(tr.lead[i]), t, spb * .8, 'square', .030);
      if (dn === 'h') this.tickN(t, .018, 6000);
      else if (dn === 's') this.tickN(t, .05, 1800);
      else if (dn === 'k') this.tone(70, t, .1, 'triangle', .09);
    },
    tone(f, t, dur, type, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur + .02);
    },
    tickN(t, vol, fq) {
      const s = ctx.createBufferSource(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
      s.buffer = noiseBuf; flt.type = 'highpass'; flt.frequency.value = fq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + .05);
      s.connect(flt); flt.connect(g); g.connect(musicGain);
      s.start(t); s.stop(t + .08);
    }
  };

  return { resume, suspendAudio, toggleMute, get muted() { return muted; }, Sfx, Music, get ctx() { return ctx; } };
})();
const Sfx = AudioSys.Sfx, Music = AudioSys.Music;
