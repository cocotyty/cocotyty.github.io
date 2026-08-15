/* =============================================
   星穹编年史 · 星空粒子系统
   ============================================= */

const Starfield = {
  canvas: null,
  ctx: null,
  stars: [],
  animId: null,
  running: false,

  init(canvasId) {
    this.canvas = typeof canvasId === 'string'
      ? document.getElementById(canvasId)
      : canvasId;

    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this._resize();
    this._createStars();
    this._bindResize();
    this.start();
  },

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  _bindResize() {
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this._resize(), 150);
    });
  },

  _createStars() {
    this.stars = [];
    const w = this.canvas.width;
    const h = this.canvas.height;

    const count = Math.min(250, Math.floor((w * h) / 3000));

    for (let i = 0; i < count; i++) {
      const layer = Math.random();
      let size, speed, alphaBase;

      if (layer < 0.5) {
        // Distant layer
        size = Math.random() * 1.0 + 0.3;
        speed = Math.random() * 0.08 + 0.02;
        alphaBase = Math.random() * 0.4 + 0.2;
      } else if (layer < 0.85) {
        // Mid layer
        size = Math.random() * 1.5 + 0.8;
        speed = Math.random() * 0.15 + 0.05;
        alphaBase = Math.random() * 0.4 + 0.4;
      } else {
        // Close layer
        size = Math.random() * 2.5 + 1.2;
        speed = Math.random() * 0.25 + 0.08;
        alphaBase = Math.random() * 0.3 + 0.6;
      }

      const r = Math.random();
      let color;
      if (r < 0.04) {
        color = { r: 130, g: 210, b: 255 }; // cyan
      } else if (r < 0.07) {
        color = { r: 255, g: 215, b: 80 };  // gold
      } else if (r < 0.09) {
        color = { r: 255, g: 120, b: 120 }; // red
      } else {
        color = { r: 255, g: 255, b: 255 };  // white
      }

      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size,
        speed,
        phase: Math.random() * Math.PI * 2,
        alphaBase,
        color,
        driftX: (Math.random() - 0.5) * 0.15,
        driftY: (Math.random() - 0.5) * 0.15
      });
    }
  },

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  },

  stop() {
    this.running = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  },

  _loop() {
    if (!this.running) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const time = Date.now() / 1000;

    for (const star of this.stars) {
      const twinkle = Math.sin(time * star.speed * 2 + star.phase) * 0.5 + 0.5;
      const alpha = star.alphaBase * (twinkle * 0.7 + 0.3);

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);

      // Glow for brighter stars
      if (star.size > 2) {
        ctx.shadowBlur = star.size * 3;
        ctx.shadowColor = `rgba(${star.color.r}, ${star.color.g}, ${star.color.b}, ${alpha * 0.3})`;
      }

      ctx.fillStyle = `rgba(${star.color.r}, ${star.color.g}, ${star.color.b}, ${alpha})`;
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Subtle drift
      star.x += star.driftX;
      star.y += star.driftY;

      // Wrap around edges
      if (star.x < -10) star.x = w + 10;
      if (star.x > w + 10) star.x = -10;
      if (star.y < -10) star.y = h + 10;
      if (star.y > h + 10) star.y = -10;
    }

    this.animId = requestAnimationFrame(() => this._loop());
  },

  refresh() {
    this._createStars();
  }
};
