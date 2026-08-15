// ============================================================
// entities.js - 玩家 / 敌人 / Boss / 弹道 / 粒子
// ============================================================
const GRAV = .32, MAXFALL = 6.5;

// ---------- 瓦片查询 ----------
function tileAtPx(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || tx >= game.level.W) return '#';
  if (ty < 0 || ty >= ROWS) return '.';
  return game.level.grid[ty][tx];
}
const solidPx = (px, py) => tileAtPx(px, py) === '#';

function collideX(e) {
  const dir = Math.sign(e.vx); if (!dir) return false;
  const edge = dir > 0 ? e.x + e.w : e.x;
  const ys = [e.y + 2, e.y + e.h * .5, e.y + e.h - 2];
  for (const yy of ys) {
    if (solidPx(edge, yy)) {
      e.x = dir > 0 ? Math.floor(edge / TILE) * TILE - e.w - .01
                    : (Math.floor(edge / TILE) + 1) * TILE + .01;
      e.vx = 0; e.hitWall = true; return true;
    }
  }
  return false;
}
function collideY(e) {
  e.onGround = false;
  const dir = Math.sign(e.vy); if (!dir) return false;
  const xs = [e.x + 1, e.x + e.w - 1];
  if (dir > 0) {
    const feet = e.y + e.h;
    for (const xx of xs) {
      const t = tileAtPx(xx, feet), tTop = Math.floor(feet / TILE) * TILE;
      if (t === '#' || (t === '=' && e.prevBottom <= tTop + .5)) {
        e.y = tTop - e.h; e.vy = 0; e.onGround = true; return true;
      }
    }
  } else {
    for (const xx of xs)
      if (solidPx(xx, e.y)) {
        e.y = (Math.floor(e.y / TILE) + 1) * TILE + .01; e.vy = 0; return true;
      }
  }
  return false;
}
function moveEntity(e) {
  e.hitWall = false;
  e.prevBottom = e.y + e.h;
  e.x += e.vx; collideX(e);
  e.y += e.vy; collideY(e);
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// 锚点翻转绘制: 翻转时保持身体位置不动 (世界坐标, 内部换算屏幕坐标)
function drawSprA(g, img, ax, anchorCol, y, flip, white) {
  const im = white ? img.white : img;
  ax -= game.camX;
  y = Math.round(y);
  if (flip) {
    const dx = Math.round(ax + anchorCol - im.width);
    g.save(); g.translate(dx + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore();
  } else g.drawImage(im, Math.round(ax - anchorCol), y);
}

// ============================================================
// 玩家
// ============================================================
const WEAPONS = {
  R: { cd: 9, dmg: 6, spd: 4.6, sfx: 'shoot' },
  H: { cd: 5, dmg: 4, spd: 5.2, sfx: 'mgShoot' },
  S: { cd: 16, dmg: 3, spd: 4.2, sfx: 'spreadShoot' }
};
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 10; this.h = 21;
    this.vx = 0; this.vy = 0; this.face = 1; this.onGround = false;
    this.hp = 4; this.maxHp = 4; this.inv = 0;
    this.dead = false; this.deadT = 0;
    this.weapon = 'R'; this.fireCd = 0; this.nades = 3; this.nadeCd = 0;
    this.coyote = 0; this.jbuf = 0; this.animT = 0; this.aim = 'f';
    this.jumpHeld = false; this.muzzleT = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  hurt(dmg, kdir) {
    if (this.inv > 0 || this.dead) return;
    this.hp -= dmg; game.shake = 5; Sfx.hurt();
    this.inv = 70; this.vx = (kdir || 1) * 1.8; this.vy = -2.4;
    game.fxSpark(this.cx, this.cy, 6, '#ff6a5a', 2);
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true; this.deadT = 0;
    this.hp = 0; Sfx.playerDie();
    game.fxDebris(this.cx, this.cy, 8, '#8ba06a'); game.fxPoof(this.cx, this.cy, 5);
    game.onPlayerDeath();
  }
  fallDie() {
    if (this.dead) return;
    if (this.god) {  // 调试无敌: 坠落时温和传送回检查点
      this.hp = this.maxHp;
      this.x = game.respawnPt.x; this.y = game.respawnPt.y - 30;
      this.vx = 0; this.vy = 0; this.inv = 60;
      game.camX = Math.max(0, Math.min(game.level.pxW - VW, this.cx - 120));
      return;
    }
    this.hp = 0; this.die();
  }

  update() {
    if (this.dead) {
      this.deadT++;
      this.vy = Math.min(this.vy + GRAV, MAXFALL); this.y += this.vy;
      return;
    }
    if (this.inv > 0) this.inv--;
    if (this.fireCd > 0) this.fireCd--;
    if (this.nadeCd > 0) this.nadeCd--;
    if (this.muzzleT > 0) this.muzzleT--;
    const inL = Input.down('left'), inR = Input.down('right');
    this.vx = (inR ? 1 : 0) - (inL ? 1 : 0) ? ((inR ? 1 : 0) - (inL ? 1 : 0)) * 1.55 : 0;
    if (this.vx !== 0) { this.face = Math.sign(this.vx); this.animT++; }

    // 瞄准方向
    this.aim = Input.down('up') ? 'u' : (Input.down('down') && !this.onGround) ? 'd' : 'f';

    // 跳跃: 缓冲 + 土狼时间 + 可变高度
    if (Input.pressed('jump')) this.jbuf = 7;
    if (this.jbuf > 0) this.jbuf--;
    if (this.onGround) this.coyote = 7; else if (this.coyote > 0) this.coyote--;
    if (this.jbuf > 0 && this.coyote > 0) {
      this.vy = -6.15; this.jbuf = 0; this.coyote = 0;
      this.jumpHeld = true; Sfx.jump();
      game.fxPoof(this.cx, this.y + this.h, 2);
    }
    if (this.jumpHeld && !Input.down('jump')) { if (this.vy < -2.2) this.vy = -2.2; this.jumpHeld = false; }

    // 重力
    this.vy = Math.min(this.vy + GRAV, MAXFALL);
    const wasGround = this.onGround;
    moveEntity(this);
    if (!wasGround && this.onGround) { Sfx.land(); game.fxPoof(this.cx, this.y + this.h, 2); }

    // 开火
    if (Input.down('fire') && this.fireCd <= 0) this.fire();
    if (Input.pressed('nade') && this.nades > 0 && this.nadeCd <= 0) {
      this.nades--; this.nadeCd = 20; Sfx.nadeThrow();
      game.grenades.push(new Grenade(this.cx + this.face * 6, this.y + 6, this.face * 2.4, -4.4, 'p'));
    }

    // 尖刺
    if (this.inv <= 0) {
      const c = tileAtPx(this.cx, this.y + this.h - 2);
      if (c === '^') this.hurt(2, -this.face);
    }
    // Boss 战区边界
    if (game.lockX0 > 0) {
      this.x = Math.max(this.x, game.lockX0 + 4);
      this.x = Math.min(this.x, game.lockX1 - this.w - 4);
    }
  }

  fire() {
    const W = WEAPONS[this.weapon];
    this.fireCd = W.cd; this.muzzleT = 4;
    Sfx[W.sfx]();
    const f = this.face, s = W.spd;
    let mx, my, dx, dy;
    if (this.aim === 'u')      { mx = this.cx + f * 4; my = this.y - 1; dx = 0; dy = -1; }
    else if (this.aim === 'd') { mx = this.cx + f * 4; my = this.y + 16; dx = 0; dy = 1; }
    else                       { mx = this.cx + f * 17; my = this.y + 9; dx = f; dy = 0; }
    game.fxFlash(mx, my, 3, '#ffd23e');
    game.fxCasing(this.cx - f * 2, this.y + 10, f);
    if (this.weapon === 'S') {
      for (const a of [-.7, 0, .7]) {
        const ax = dx * Math.cos(a) - dy * Math.sin(a), ay = dx * Math.sin(a) + dy * Math.cos(a);
        game.pbullets.push(new Bullet(mx, my, ax * s, ay * s, W.dmg, 'p'));
      }
    } else if (this.weapon === 'H') {
      game.pbullets.push(new Bullet(mx, my, dx * s, dy * s + (Math.random() - .5) * .35, W.dmg, 'p'));
    } else {
      game.pbullets.push(new Bullet(mx, my, dx * s, dy * s, W.dmg, 'p'));
    }
  }

  draw(g) {
    if (this.dead) { // 死亡: 后仰闪烁
      if ((this.deadT >> 2) % 2 === 0) {
        drawSprA(g, Sprites.player.torso.f, this.cx, 8, this.y, this.face < 0);
        drawSprA(g, Sprites.player.legs[3], this.cx, 8, this.y + 12, this.face < 0);
      }
      return;
    }
    if (this.inv > 0 && this.inv < 9999 && (this.inv >> 2) % 2 === 0) return; // 受击无敌闪烁(上帝模式除外)
    const flip = this.face < 0;
    let legI;
    if (!this.onGround) legI = 3;
    else if (Math.abs(this.vx) > .1) legI = 1 + ((this.animT / 7) | 0) % 2;
    else legI = 0;
    const white = false;
    drawSprA(g, Sprites.player.legs[legI], this.cx, 8, this.y + 12, flip);
    drawSprA(g, Sprites.player.torso[this.aim], this.cx, 8, this.y, flip);
    if (this.muzzleT > 0) {
      const m = this.muzzlePos();
      const mx = Math.round(m.x - game.camX), my = Math.round(m.y);
      g.fillStyle = '#fff3b0';
      g.fillRect(mx - 2, my - 2, 4, 4);
      g.fillStyle = '#ffd23e';
      g.fillRect(mx - 3, my - 1, 6, 2);
    }
  }
  muzzlePos() {
    const f = this.face;
    if (this.aim === 'u') return { x: this.cx + f * 4, y: this.y - 1 };
    if (this.aim === 'd') return { x: this.cx + f * 4, y: this.y + 16 };
    return { x: this.cx + f * 17, y: this.y + 9 };
  }
}

// ============================================================
// 敌人
// ============================================================
class Enemy {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.dead = false; this.flash = 0;
    this.activated = false; this.touchDmg = 0; this.score = 100;
    this.t = 0; this.face = -1; this.dir = -1; this.type = '?';
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 5;
    if (this.hp <= 0) this.die(); else Sfx.clank();
  }
  die() {
    this.dead = true;
    game.addScore(this.score);
    game.fxPoof(this.cx, this.cy, 4);
    game.fxDebris(this.cx, this.cy, 6, '#8b93a1');
    game.fxText(this.cx, this.y - 4, '+' + this.score, '#ffd23e');
    Sfx.enemyDie();
    this.dropLoot();
  }
  dropLoot() {
    const r = Math.random();
    if (r < .10) game.pickups.push(new Pickup('gem', this.cx, this.cy));
    else if (r < .16) game.pickups.push(new Pickup('med', this.cx, this.cy));
  }
  tryActivate(p) {
    if (this.activated) return true;
    if (Math.abs(p.cx - this.cx) < 340 && Math.abs(p.cy - this.cy) < 170) this.activated = true;
    return this.activated;
  }
  onScreen(m) { return this.cx > game.camX - (m || 60) && this.cx < game.camX + 480 + (m || 60); }
}

class Grunt extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 12, 20);
    this.type = 'grunt'; this.elite = elite;
    this.hp = elite ? 22 : 12; this.score = elite ? 200 : 100;
    this.cd = 40; this.shots = 0; this.moving = true;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (Math.abs(dx) < 170 && Math.abs(dy) < 34 && !p.dead) {
      this.face = Math.sign(dx) || 1; this.moving = false; this.vx = 0;
      if (--this.cd <= 0 && this.onScreen(20)) {
        game.ebullets.push(new Bullet(this.cx + this.face * 12, this.y + 8, this.face * 1.9, 0, 1, 'e'));
        Sfx.eShoot(); this.shots++;
        if (this.shots >= 3) { this.shots = 0; this.cd = this.elite ? 55 : 85; }
        else this.cd = 13;
      }
    } else {
      this.moving = true;
      this.vx = this.dir * .4; this.face = this.dir;
      // 悬崖/墙转身
      const ahead = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
      if (this.hitWall || (this.onGround && !solidPx(ahead, this.y + this.h + 3) && tileAtPx(ahead, this.y + this.h + 3) !== '=')) this.dir *= -1;
    }
    this.vy = Math.min(this.vy + GRAV, MAXFALL);
    moveEntity(this);
  }
  draw(g) {
    const set = this.elite ? Sprites.grunt.e : Sprites.grunt.n;
    const frame = this.moving ? ((this.t / 9 | 0) % 2) : (this.shots > 0 ? 2 : 0);
    drawSprA(g, set[frame], this.cx, 6, this.y, this.face < 0, this.flash > 0);
  }
}

class Runner extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 12, 20);
    this.type = 'runner'; this.elite = elite;
    this.hp = elite ? 18 : 10; this.score = elite ? 250 : 150;
    this.touchDmg = 1;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    if (p.dead) { this.vx = 0; }
    else {
      this.face = Math.sign(p.cx - this.cx) || 1;
      this.vx = this.face * (this.elite ? 2.0 : 1.65);
      if (this.hitWall && this.onGround) this.vy = -5.4; // 跳过障碍
    }
    this.vy = Math.min(this.vy + GRAV, MAXFALL);
    moveEntity(this);
    if (this.onGround && this.t % 8 === 0) game.fxPoof(this.cx - this.face * 5, this.y + this.h, 1);
  }
  draw(g) {
    drawSprA(g, Sprites.runner[(this.t / 5 | 0) % 2], this.cx, 6, this.y, this.face < 0, this.flash > 0);
  }
}

class Drone extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 14, 10);
    this.type = 'drone'; this.elite = elite;
    this.hp = elite ? 13 : 8; this.score = elite ? 300 : 200;
    this.baseY = y; this.touchDmg = 1; this.cd = 90;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx;
    this.face = Math.sign(dx) || 1;
    this.vx = Math.max(-.95, Math.min(.95, dx * .02));
    this.x += this.vx;
    this.y = this.baseY + Math.sin(this.t * .05) * 9;
    if (--this.cd <= 0 && !p.dead && Math.abs(dx) < 36 && p.cy > this.cy && this.onScreen(20)) {
      this.cd = this.elite ? 95 : 130;
      game.grenades.push(new Grenade(this.cx, this.y + this.h, 0, 1, 'bomb'));
    }
  }
  draw(g) {
    const bob = Math.sin(this.t * .3) > 0 ? 1 : 0;
    const scx = Math.round(this.cx - game.camX);
    g.fillStyle = '#78829a';
    const rw = bob ? 14 : 6;
    g.fillRect(scx - rw, Math.round(this.y - 2), rw * 2, 1);
    drawSprA(g, Sprites.drone, this.cx, 8, this.y, this.face < 0, this.flash > 0);
    // 警示灯
    if ((this.t >> 3) % 2 === 0) { g.fillStyle = '#ff3b30'; g.fillRect(scx - 1, Math.round(this.y + 2), 2, 2); }
  }
}

class Turret extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 16, 12);
    this.type = 'turret'; this.elite = elite;
    this.hp = elite ? 46 : 30; this.score = 300;
    this.cd = 70; this.ang = Math.PI;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = (p.cy - 4) - (this.y + 4);
    this.ang = Math.atan2(dy, dx);
    if (--this.cd <= 0 && Math.hypot(dx, dy) < 270 && !p.dead && this.onScreen(20)) {
      this.cd = this.elite ? 58 : 80;
      const s = 1.9;
      game.ebullets.push(new Bullet(this.cx + Math.cos(this.ang) * 10, this.y + 4 + Math.sin(this.ang) * 10,
        Math.cos(this.ang) * s, Math.sin(this.ang) * s, 1, 'e'));
      Sfx.eShoot();
    }
  }
  draw(g) {
    drawSprA(g, Sprites.turret, this.cx, 8, this.y, false, this.flash > 0);
    g.save();
    g.translate(Math.round(this.cx - game.camX), Math.round(this.y + 4));
    g.rotate(this.ang);
    g.fillStyle = this.flash > 0 ? '#fff' : '#23262e';
    g.fillRect(0, -1, 11, 3);
    g.fillStyle = this.flash > 0 ? '#fff' : '#4a5160';
    g.fillRect(7, -1, 3, 3);
    g.restore();
  }
}

class Shooter extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 12, 21);
    this.type = 'shooter'; this.elite = elite;
    this.hp = elite ? 24 : 14; this.score = elite ? 250 : 150;
    this.cd = 50; this.shots = 0;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (Math.hypot(dx, dy) < 240 && !p.dead) {
      if (--this.cd <= 0 && this.onScreen(20)) {
        let bx = Math.sign(dx), by = Math.sign(dy);
        if (bx && by) { bx *= .72; by *= .72; }
        else if (!bx && !by) bx = 1;
        const l = Math.hypot(bx, by) || 1;
        game.ebullets.push(new Bullet(this.cx + bx * 12 / l, this.cy + by * 12 / l,
          bx / l * 1.75, by / l * 1.75, 1, 'e'));
        Sfx.eShoot(); this.shots++;
        if (this.shots >= 2) { this.shots = 0; this.cd = this.elite ? 65 : 95; }
        else this.cd = 14;
      }
    }
  }
  draw(g) {
    drawSprA(g, Sprites.shooter, this.cx, 6, this.y, false, this.flash > 0);
  }
}

class Cannon extends Enemy {
  constructor(x, y, elite) {
    super(x, y, 16, 12);
    this.type = 'cannon'; this.elite = elite;
    this.hp = elite ? 38 : 24; this.score = 250;
    this.cd = 100;
  }
  update() {
    const p = game.player;
    if (!this.tryActivate(p)) return;
    this.t++; if (this.flash > 0) this.flash--;
    const dx = p.cx - this.cx, dy = (p.y + 10) - this.cy;
    if (--this.cd <= 0 && Math.abs(dx) < 300 && !p.dead && this.onScreen(20)) {
      this.cd = this.elite ? 100 : 135;
      const T = 75, G2 = .18;
      game.grenades.push(new Grenade(this.cx, this.y - 4, dx / T, dy / T - .5 * G2 * T, 'shell'));
      Sfx.nadeThrow();
    }
  }
  draw(g) {
    drawSprA(g, Sprites.cannon, this.cx, 8, this.y, false, this.flash > 0);
    if (this.cd < 20 && (this.t >> 2) % 2 === 0) {
      g.fillStyle = '#ffd23e';
      g.fillRect(Math.round(this.cx - game.camX + 4), Math.round(this.y - 4), 2, 2);
    }
  }
}

class Crate extends Enemy {
  constructor(x, y) {
    super(x, y - 14, 14, 14);
    this.type = 'crate'; this.hp = 10; this.score = 50;
    this.activated = true;
  }
  update() {}
  die() {
    this.dead = true;
    game.addScore(this.score);
    game.fxDebris(this.cx, this.cy, 8, '#8a5a33');
    game.fxPoof(this.cx, this.cy, 3);
    Sfx.crateBreak();
    const r = Math.random();
    let kind = 'gem';
    if (r < .30) kind = 'gem';
    else if (r < .50) kind = 'nade';
    else if (r < .70) kind = 'med';
    else kind = (game.crateWpn++ % 2) ? 'wS' : 'wH';
    game.pickups.push(new Pickup(kind, this.cx, this.y));
  }
  draw(g) {
    drawSprA(g, Sprites.crate, this.cx, 7, this.y, false, this.flash > 0);
  }
}

function spawnEnemy(code, x, y, elite) {
  switch (code) {
    case '1': return new Grunt(x - 6, y - 20, elite);
    case '2': return new Runner(x - 6, y - 20, elite);
    case '3': return new Drone(x - 7, y, elite);
    case '4': return new Turret(x - 8, y - 12, elite);
    case '5': return new Shooter(x - 6, y - 21, elite);
    case '6': return new Cannon(x - 8, y - 12, elite);
    case 'X': return new Crate(x, y);
  }
}

// ============================================================
// Boss
// ============================================================
class Boss {
  constructor(x, y, w, h, hp, name) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = hp; this.maxHp = hp; this.name = name;
    this.flash = 0; this.dying = false; this.dieT = 0; this.t = 0;
    this.touchDmg = 1; this.dead = false; this.intro = 60;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get phase2() { return this.hp < this.maxHp * .45; }
  hurt(dmg) {
    if (this.dying || this.intro > 0) return;
    this.hp -= dmg; this.flash = 4;
    if (this.hp <= 0) { this.hp = 0; this.startDeath(); }
  }
  startDeath() {
    this.dying = true; this.dieT = 0;
    game.shake = 10; Sfx.bossRoar();
    Music.stop();
  }
  updateDeath() {
    this.dieT++;
    game.shake = Math.max(game.shake, 4);
    if (this.dieT % 9 === 0) {
      const ex = this.x + Math.random() * this.w, ey = this.y + Math.random() * this.h;
      game.fxBoom(ex, ey, 14 + Math.random() * 10);
      Sfx.explode();
    }
    if (this.dieT > 110) {
      game.fxBoom(this.cx, this.cy, 40);
      Sfx.bigExplode(); game.shake = 14;
      this.dead = true;
      game.bossCleared();
    }
  }
  flashOverlay(g) {
    if (this.flash > 0) {
      this.flash--;
      g.globalAlpha = .55; g.fillStyle = '#fff';
      g.fillRect(Math.round(this.x - game.camX), Math.round(this.y), this.w, this.h);
      g.globalAlpha = 1;
    }
  }
}

// ---- Boss 1: 铁骡运兵车 ----
class Boss1 extends Boss {
  constructor(x, y) {
    super(x, y, 66, 38, 320, 'IRON MULE');
    this.groundY = y; this.dir = -1; this.turretAng = Math.PI;
    this.cd1 = 90; this.cd2 = 260; this.cd3 = 60; this.treadT = 0;
  }
  update() {
    if (this.dying) return this.updateDeath();
    this.t++; if (this.intro > 0) { this.intro--; return; }
    const p = game.player;
    // 行进
    const spd = this.phase2 ? .8 : .55;
    this.x += this.dir * spd; this.treadT += spd;
    if (this.x < game.lockX0 + 20) this.dir = 1;
    if (this.x + this.w > game.lockX1 - 20) this.dir = -1;
    const tx = p.cx - this.cx, ty = (p.cy - 6) - (this.y + 6);
    this.turretAng = Math.atan2(ty, tx);
    if (p.dead) return;
    // 扇形弹幕
    if (--this.cd1 <= 0) {
      this.cd1 = this.phase2 ? 80 : 115;
      const bx = this.cx + Math.cos(this.turretAng) * 16, by = this.y + 6 + Math.sin(this.turretAng) * 16;
      for (let i = -2; i <= 2; i++) {
        const a = this.turretAng + i * .21;
        game.ebullets.push(new Bullet(bx, by, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 1, 'e'));
      }
      Sfx.eShoot(); game.fxFlash(bx, by, 3, '#ffd23e');
    }
    // 二阶段: 直射三连
    if (this.phase2 && --this.cd3 <= 0) {
      this.cd3 = 55;
      const bx = this.cx, by = this.y + 8;
      game.ebullets.push(new Bullet(bx, by, Math.sign(tx) * 2.6, ty * .006, 1, 'e'));
      Sfx.eShoot();
    }
    // 放兵
    if (--this.cd2 <= 0) {
      this.cd2 = 330;
      const alive = game.enemies.filter(e => e.bossMinion && !e.dead).length;
      if (alive < 2) {
        for (let i = 0; i < 2; i++) {
          const g = new Grunt(this.cx + this.dir * 20, this.y - 4, false);
          g.bossMinion = true; g.dir = this.dir;
          game.enemies.push(g);
        }
        game.fxPoof(this.cx + this.dir * 18, this.y, 4);
      }
    }
  }
  draw(g) {
    const X = Math.round(this.x - game.camX), Y = Math.round(this.y);
    const p2 = this.phase2;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(X + x, Y + y, w, h); };
    // 履带
    R(0, 24, 66, 14, '#22262e');
    g.fillStyle = '#3a4150';
    for (let i = 0; i < 5; i++) { const wx = 8 + i * 12; g.beginPath(); g.arc(X + wx, Y + 31, 5, 0, 7); g.fill(); }
    g.fillStyle = '#141824';
    for (let i = 0; i < 9; i++) { const lx = ((i * 9 + this.treadT) % 66); g.fillRect(X + lx, Y + 24, 3, 2); g.fillRect(X + (lx + 60) % 66, Y + 36, 3, 2); }
    // 车体
    R(2, 12, 62, 14, p2 ? '#6e5238' : '#5c6e3c');
    R(2, 12, 62, 3, p2 ? '#8f6f4c' : '#7d9152');
    R(6, 9, 54, 4, p2 ? '#8f6f4c' : '#7d9152');
    R(2, 24, 62, 2, '#3e4c2a');
    // 舱门+徽章
    R(10, 15, 10, 8, '#4a5a30'); R(12, 17, 6, 4, '#c8383a');
    R(46, 16, 14, 6, '#3e4c2a');
    if (p2 && (this.t >> 3) % 2 === 0) { R(60, 16, 4, 4, '#ff5a3c'); }
    // 炮塔
    const tx = this.cx - game.camX, ty = Y + 6;
    g.save(); g.translate(Math.round(tx), Math.round(ty)); g.rotate(this.turretAng);
    g.fillStyle = '#23262e'; g.fillRect(6, -2, 18, 4);
    g.fillStyle = '#4a5160'; g.fillRect(18, -2, 5, 4);
    g.restore();
    g.fillStyle = p2 ? '#7d5a3a' : '#6a7752';
    g.beginPath(); g.arc(Math.round(tx), Math.round(ty), 9, Math.PI, 0); g.fill();
    g.fillStyle = '#c8383a'; g.fillRect(Math.round(tx) - 2, Math.round(ty) - 6, 4, 3);
    // 受击闪白
    g.globalAlpha = .5; g.fillStyle = '#fff';
    if (this.flash > 0) { this.flash--; g.fillRect(X, Y + 9, 66, 29); }
    g.globalAlpha = 1;
    if (this.intro > 0 && (this.intro >> 2) % 2 === 0) {
      drawTextC(g, '!! WARNING !!', 240, 60, '#ff5a3c', 2);
    }
  }
}

// ---- Boss 2: 秃鹫炮艇 ----
class Boss2 extends Boss {
  constructor(x, y) {
    super(x, y, 60, 26, 430, 'VULTURE');
    this.mode = 'hover'; this.modeT = 0; this.cd = 60;
    this.homeY = y; this.bombN = 0;
  }
  update() {
    if (this.dying) return this.updateDeath();
    this.t++; if (this.intro > 0) { this.intro--; return; }
    const p = game.player;
    this.modeT++;
    const spd = this.phase2 ? 1.35 : 1.0;
    // 悬停巡航
    if (this.mode === 'hover') {
      const targetX = p.cx - 30 + Math.sin(this.t * .02) * 60;
      this.x += Math.max(-spd, Math.min(spd, (targetX - this.x) * .03));
      this.y = this.homeY + Math.sin(this.t * .045) * 14;
      if (--this.cd <= 0 && !p.dead) {
        const r = Math.random();
        if (r < .45) { this.mode = 'bomb'; this.modeT = 0; this.bombN = this.phase2 ? 4 : 3; this.cd = 46; }
        else if (r < .8) { this.mode = 'missile'; this.modeT = 0; this.mslN = this.phase2 ? 5 : 3; this.cd = 34; }
        else { this.mode = 'strafe'; this.modeT = 0; this.strafeDir = this.x < p.cx ? 1 : -1; this.cd = 30; }
      }
    }
    // 投弹
    else if (this.mode === 'bomb') {
      this.x += Math.sin(this.t * .1) * .4;
      if (--this.cd <= 0 && this.bombN > 0) {
        this.cd = 42; this.bombN--;
        game.grenades.push(new Grenade(this.cx - 4 + Math.random() * 8, this.y + this.h, (Math.random() - .5) * .6, .8, 'bomb'));
        Sfx.nadeThrow();
      }
      if (this.bombN <= 0 && this.cd <= 0) { this.mode = 'hover'; this.cd = this.phase2 ? 60 : 90; }
    }
    // 导弹齐射
    else if (this.mode === 'missile') {
      if (--this.cd <= 0 && this.mslN > 0) {
        this.cd = 32; this.mslN--;
        game.ebullets.push(new Bullet(this.cx + (this.mslN % 2 ? -20 : 20), this.y + this.h, 0, .4, 1, 'e', 'missile'));
        Sfx.missile();
      }
      if (this.mslN <= 0 && this.cd <= 0) { this.mode = 'hover'; this.cd = this.phase2 ? 55 : 85; }
    }
    // 低空扫射
    else if (this.mode === 'strafe') {
      const targetY = 170;
      this.y += Math.max(-1.2, Math.min(1.2, (targetY - this.y) * .05));
      this.x += this.strafeDir * (this.phase2 ? 1.6 : 1.2);
      if (this.x < game.lockX0 + 10 || this.x + this.w > game.lockX1 - 10) this.strafeDir *= -1;
      if (--this.cd <= 0) {
        this.cd = 16;
        const bx = this.cx + this.strafeDir * 26, by = this.y + 16;
        for (const vy of [-.35, 0, .35])
          game.ebullets.push(new Bullet(bx, by, this.strafeDir * 2.3, vy, 1, 'e'));
        Sfx.eShoot(); game.fxFlash(bx, by, 2, '#ffd23e');
      }
      if (this.modeT > 260) { this.mode = 'hover'; this.cd = 70; }
    }
  }
  draw(g) {
    const X = Math.round(this.x - game.camX), Y = Math.round(this.y);
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(X + x, Y + y, w, h); };
    // 旋翼
    const spin = Math.sin(this.t * .9) > 0;
    R(28, 0, 3, 6, '#23262e');
    g.fillStyle = '#39404e';
    if (spin) g.fillRect(X + 28 - 30, Y + 0, 60, 2);
    else g.fillRect(X + 28 - 16, Y + 0, 32, 2);
    // 机身
    R(6, 6, 48, 14, '#414a58'); R(6, 6, 48, 3, '#5f6a7e');
    R(10, 18, 38, 4, '#31384a');
    R(2, 9, 6, 8, '#31384a'); R(52, 8, 8, 10, '#4a5468');
    // 座舱
    R(48, 8, 10, 7, '#9fe8ff'); R(50, 9, 6, 3, '#d8fbff');
    // 机腹炮
    R(26, 20, 8, 5, '#23262e');
    if (this.mode === 'strafe' && (this.t >> 2) % 2 === 0) R(this.strafeDir > 0 ? 34 : 22, 21, 4, 3, '#ffd23e');
    // 挂架
    R(14, 19, 8, 4, '#31384a'); R(38, 19, 8, 4, '#31384a');
    // 尾焰
    if ((this.t >> 2) % 2 === 0) { R(0, 11, 4, 3, '#ff9a2a'); R(-2, 12, 3, 1, '#ffd23e'); }
    // 相位2 红灯
    if (this.phase2 && (this.t >> 3) % 2 === 0) R(28, 8, 4, 3, '#ff3b30');
    g.globalAlpha = .5; g.fillStyle = '#fff';
    if (this.flash > 0) { this.flash--; g.fillRect(X, Y, 60, 26); }
    g.globalAlpha = 1;
    if (this.intro > 0 && (this.intro >> 2) % 2 === 0)
      drawTextC(g, '!! WARNING !!', 240, 60, '#ff5a3c', 2);
  }
}

// ---- Boss 3: 铁狱守卫 (机甲) ----
class Boss3 extends Boss {
  constructor(x, y) {
    super(x, y, 46, 62, 620, 'IRON WARDEN');
    this.groundY = y; this.state = 'idle'; this.stateT = 0;
    this.pattern = 0; this.cd = 80; this.walkT = 0;
    this.laser = null; this.armAng = 0;
  }
  update() {
    if (this.dying) return this.updateDeath();
    this.t++; if (this.intro > 0) { this.intro--; return; }
    const p = game.player;
    this.stateT++;
    const dx = p.cx - this.cx;
    // 激光持续检测
    if (this.laser) {
      const L = this.laser; L.t++;
      if (L.t < 45) { // 蓄力: 缓慢追踪
        L.ang += Math.max(-.02, Math.min(.02, Math.atan2(p.cy - L.y, p.cx - L.x) - L.ang));
        if (L.t === 1) Sfx.laserCharge();
      } else if (L.t === 45) { Sfx.laserFire(); game.shake = 6; }
      else if (L.t > 45 && L.t < 90 && !p.dead) {
        // 直线判定
        const ex = L.x, ey = L.y, c = Math.cos(L.ang), s = Math.sin(L.ang);
        const px = p.cx - ex, py = p.cy - ey;
        const proj = px * c + py * s;
        if (proj > 0 && proj < 340) {
          const d = Math.abs(px * s - py * c);
          if (d < 7) p.hurt(1, Math.sign(Math.cos(L.ang)) || 1);
        }
      }
      if (L.t >= 100) this.laser = null;
    }
    switch (this.state) {
      case 'idle': {
        if (--this.cd <= 0 && !p.dead) {
          this.pattern = (this.pattern + 1) % (this.phase2 ? 4 : 3);
          if (this.pattern === 0) { this.state = 'cannon'; this.stateT = 0; this.volley = this.phase2 ? 8 : 5; }
          else if (this.pattern === 1) { this.state = 'stompJump'; this.stateT = 0; }
          else if (this.pattern === 2) { this.state = 'laserAtk'; this.stateT = 0; }
          else { this.state = 'deploy'; this.stateT = 0; }
        }
        // 缓慢逼近
        else {
          this.face = Math.sign(dx) || 1;
          if (Math.abs(dx) > 70) { this.x += this.face * (this.phase2 ? .5 : .3); this.walkT++; }
        }
        break;
      }
      case 'cannon': {
        this.face = Math.sign(dx) || 1;
        if (this.stateT % 16 === 0 && this.volley > 0) {
          this.volley--;
          const bx = this.cx + this.face * 26, by = this.y + 20;
          const base = Math.atan2(p.cy - by, p.cx - bx);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * .16 + (Math.random() - .5) * .06;
            game.ebullets.push(new Bullet(bx, by, Math.cos(a) * 2.1, Math.sin(a) * 2.1, 1, 'e'));
          }
          Sfx.eShoot(); game.fxFlash(bx, by, 3, '#ffd23e');
        }
        if (this.volley <= 0 && this.stateT > 50) { this.state = 'idle'; this.cd = this.phase2 ? 46 : 75; }
        break;
      }
      case 'stompJump': {
        if (this.stateT === 1) this.vy = -4.6;
        this.vy = (this.vy || 0) + .3;
        this.y += this.vy;
        if (this.y >= this.groundY) {
          this.y = this.groundY; this.vy = 0;
          game.shake = 9; Sfx.stomp();
          game.fxPoof(this.cx - 18, this.y + this.h, 5); game.fxPoof(this.cx + 18, this.y + this.h, 5);
          for (const dir of [-1, 1])
            game.ebullets.push(new Bullet(this.cx + dir * 20, this.y + this.h - 8, dir * 1.7, 0, 1, 'e', 'wave'));
          this.state = 'idle'; this.cd = this.phase2 ? 42 : 70;
        }
        break;
      }
      case 'laserAtk': {
        if (this.stateT === 1)
          this.laser = { x: this.cx + this.face * 8, y: this.y + 10, ang: Math.atan2(p.cy - this.y - 10, p.cx - this.cx), t: 0 };
        if (this.stateT > 110) { this.state = 'idle'; this.cd = this.phase2 ? 50 : 80; }
        break;
      }
      case 'deploy': {
        if (this.stateT === 20) {
          for (let i = 0; i < 2; i++) {
            const d = new Drone(this.cx + (i ? 30 : -30), this.y - 10, true);
            d.bossMinion = true; d.activated = true;
            game.enemies.push(d);
          }
          game.fxPoof(this.cx - 30, this.y, 3); game.fxPoof(this.cx + 30, this.y, 3);
        }
        if (this.stateT > 60) { this.state = 'idle'; this.cd = 70; }
        break;
      }
    }
    this.x = Math.max(game.lockX0 + 12, Math.min(game.lockX1 - this.w - 12, this.x));
  }
  draw(g) {
    const X = Math.round(this.x - game.camX), Y = Math.round(this.y);
    const p2 = this.phase2;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(X + x, Y + y, w, h); };
    const walk = Math.sin(this.walkT * .15) * 2;
    // 腿
    R(6, 34, 10, 22 + walk, '#2c3240'); R(30, 34, 10, 22 - walk, '#2c3240');
    R(4, 56 + walk, 14, 5, '#23262e'); R(28, 56 - walk, 14, 5, '#23262e');
    R(7, 38, 4, 12, '#3c4454'); R(31, 38, 4, 12, '#3c4454');
    // 躯干
    R(2, 8, 42, 28, '#3a4250'); R(2, 8, 42, 4, '#525c70');
    R(4, 12, 38, 20, '#2f3644');
    // 核心发光
    const coreC = p2 ? ((this.t >> 3) % 2 ? '#ff5a3c' : '#c8383a') : '#37e0c8';
    R(18, 18, 10, 10, '#1c2130'); R(20, 20, 6, 6, coreC); R(21, 21, 4, 2, '#c8fff8');
    // 肩甲
    R(0, 6, 12, 10, '#434b5c'); R(34, 6, 12, 10, '#434b5c');
    R(0, 6, 12, 3, '#5f6a80'); R(34, 6, 12, 3, '#5f6a80');
    // 头
    R(16, 0, 14, 9, '#434b5c'); R(18, 3, 10, 4, '#1c2130');
    R(20, 4, 6, 2, '#ff3b30'); // 眼
    // 臂炮
    const f = this.face;
    R(f > 0 ? 36 : 0, 18, 10, 8, '#31384a');
    R(f > 0 ? 42 : -6, 19, 10, 6, '#23262e');
    R(f > 0 ? 50 : -12, 20, 4, 4, '#4a5160');
    if (this.state === 'cannon' && (this.stateT >> 2) % 2 === 0)
      R(f > 0 ? 52 : -16, 19, 4, 5, '#ffd23e');
    // 激光
    if (this.laser) {
      const L = this.laser;
      const sx = L.x - game.camX, sy = L.y;
      if (L.t < 45) { // 蓄力指示线
        g.strokeStyle = 'rgba(255,90,60,' + (.15 + .2 * Math.sin(L.t * .4)) + ')';
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(L.ang) * 340, sy + Math.sin(L.ang) * 340); g.stroke();
        g.fillStyle = '#ff5a3c'; g.fillRect(sx - 2, sy - 2, 5, 5);
      } else if (L.t < 90) {
        g.strokeStyle = '#ff5a3c'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(L.ang) * 340, sy + Math.sin(L.ang) * 340); g.stroke();
        g.strokeStyle = '#ffd8c8'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(L.ang) * 340, sy + Math.sin(L.ang) * 340); g.stroke();
        g.lineWidth = 1;
        if (L.t % 3 === 0) game.fxSpark(L.x + Math.cos(L.ang) * (Math.random() * 300), L.y + Math.sin(L.ang) * (Math.random() * 300), 2, '#ff9a7a', 1);
      }
    }
    g.globalAlpha = .5; g.fillStyle = '#fff';
    if (this.flash > 0) { this.flash--; g.fillRect(X, Y, 46, 62); }
    g.globalAlpha = 1;
    if (this.intro > 0 && (this.intro >> 2) % 2 === 0)
      drawTextC(g, '!! WARNING !!', 240, 60, '#ff5a3c', 2);
  }
}
const BOSS_CLASSES = [null, Boss1, Boss2, Boss3];
const BOSS_SCORES = [0, 2000, 3000, 5000];

// ============================================================
// 弹道
// ============================================================
class Bullet {
  constructor(x, y, vx, vy, dmg, side, kind) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.side = side; this.kind = kind || 'n';
    this.dead = false; this.life = kind === 'wave' ? 110 : 260;
    this.w = 2; this.h = 2;
  }
  update() {
    const steps = 2;
    for (let i = 0; i < steps && !this.dead; i++) {
      if (this.kind === 'missile') {
        const p = game.player;
        if (!p.dead) {
          const want = Math.atan2(p.cy - this.y, p.cx - this.x);
          let cur = Math.atan2(this.vy, this.vx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          cur += Math.max(-.045, Math.min(.045, d));
          const spd = Math.min(2.5, Math.hypot(this.vx, this.vy) + .05);
          this.vx = Math.cos(cur) * spd; this.vy = Math.sin(cur) * spd;
        }
        game.fxSpark(this.x, this.y, 1, '#ff9a2a', .6);
      }
      if (this.kind === 'wave') {
        // 贴地冲击波
        if (!solidPx(this.x, this.y + 10) && tileAtPx(this.x, this.y + 10) !== '=') { this.dead = true; break; }
        game.fxSpark(this.x, this.y + (Math.random() * 8 - 4), 1, '#ff9a2a', .8);
      }
      this.x += this.vx / steps; this.y += this.vy / steps;
      const t = tileAtPx(this.x, this.y);
      if (t === '#') {
        if (this.kind === 'missile') game.explode(this.x, this.y, 16, 1, false);
        else game.fxSpark(this.x, this.y, 2, '#d8dce4', 1);
        this.dead = true; break;
      }
    }
    if (--this.life <= 0) this.dead = true;
    if (this.x < game.camX - 90 || this.x > game.camX + 570 || this.y > ROWS * TILE + 20 || this.y < -30) this.dead = true;
  }
  draw(g) {
    const x = Math.round(this.x - game.camX), y = Math.round(this.y);
    if (this.side === 'p') {
      g.strokeStyle = '#ffd23e'; g.beginPath();
      g.moveTo(x - this.vx * 1.6, y - this.vy * 1.6); g.lineTo(x, y); g.stroke();
      g.fillStyle = '#fff3b0'; g.fillRect(x - 1, y - 1, 2, 2);
    } else if (this.kind === 'missile') {
      g.fillStyle = '#8b93a1'; g.fillRect(x - 3, y - 1, 6, 3);
      g.fillStyle = '#ff9a2a'; g.fillRect(x - Math.sign(this.vx) * 5 - 1, y - 1, 3, 2);
    } else if (this.kind === 'wave') {
      g.fillStyle = '#ff9a2a';
      g.fillRect(x - 5, y + 2, 10, 3);
      g.fillStyle = '#ffd23e';
      g.fillRect(x - 2, y - 3 + Math.sin(this.life * .8) * 2, 4, 5);
    } else {
      g.fillStyle = '#ff5a3c'; g.fillRect(x - 2, y - 2, 4, 4);
      g.fillStyle = '#ffd8c8'; g.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}

class Grenade {
  constructor(x, y, vx, vy, kind) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.kind = kind; // 'p' 玩家 | 'bomb' 无人机 | 'shell' 迫击炮
    this.dead = false;
    this.fuse = kind === 'p' ? 55 : kind === 'shell' ? 78 : 46;
    this.grav = kind === 'p' ? .21 : .18;
  }
  update() {
    this.vy += this.grav;
    const nx = this.x + this.vx;
    if (solidPx(nx + Math.sign(this.vx) * 2, this.y)) this.vx *= -.5;
    else this.x = nx;
    const ny = this.y + this.vy;
    if (this.vy > 0 && (solidPx(this.x, ny + 2) || tileAtPx(this.x, ny + 2) === '=')) {
      if (this.kind !== 'p') { this.explodeNow(); return; }
      this.y = Math.floor((ny + 2) / TILE) * TILE - 2;
      this.vy *= -.38; this.vx *= .62;
      if (Math.abs(this.vy) < .5) this.vy = 0;
    } else if (this.vy < 0 && solidPx(this.x, ny - 2)) this.vy = 0;
    else this.y = ny;
    if (this.kind === 'p' && this.fuse < 50 && this.fuse % 8 < 2)
      game.fxSpark(this.x, this.y, 1, '#ffd23e', .5);
    if (--this.fuse <= 0) this.explodeNow();
  }
  explodeNow() {
    this.dead = true;
    if (this.kind === 'p') game.explode(this.x, this.y, 27, 30, true);
    else if (this.kind === 'shell') game.explode(this.x, this.y, 22, 1, false);
    else game.explode(this.x, this.y, 18, 1, false);
  }
  draw(g) {
    const x = Math.round(this.x - game.camX), y = Math.round(this.y);
    if (this.kind === 'p') {
      g.fillStyle = '#4a6a38'; g.fillRect(x - 2, y - 3, 4, 5);
      g.fillStyle = '#7ba35c'; g.fillRect(x - 1, y - 3, 2, 2);
      if (this.fuse % 6 < 3) { g.fillStyle = '#ffd23e'; g.fillRect(x - 1, y - 5, 2, 2); }
    } else {
      g.fillStyle = '#3a4150'; g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = this.fuse % 6 < 3 ? '#ff5a3c' : '#8b93a1'; g.fillRect(x, y - 4, 2, 2);
    }
  }
}

// ============================================================
// 拾取物
// ============================================================
const PICKUP_INFO = {
  gem: { spr: 'gem', label: '+500' },
  med: { spr: 'med', label: 'HP +1' },
  nade: { spr: 'nade', label: 'NADE +3' },
  wS: { spr: 'wS', label: 'SPREAD!' },
  wH: { spr: 'wH', label: 'MACHINE GUN!' },
  life: { spr: 'life', label: '1UP!' }
};
class Pickup {
  constructor(kind, x, y) {
    this.kind = kind; this.x = x - 5; this.y = y - 10; this.w = 10; this.h = 10;
    this.vy = -1.4; this.vx = (Math.random() - .5) * .8;
    this.t = 0; this.dead = false; this.life = 640; this.rest = false;
  }
  get cx() { return this.x + 5; }
  update() {
    this.t++;
    if (!this.rest) {
      this.vy += .12;
      const ny = this.y + this.vy;
      if (this.vy > 0 && (tileAtPx(this.x + 5, ny + 10) === '#' || tileAtPx(this.x + 5, ny + 10) === '=')) {
        this.y = Math.floor((ny + 10) / TILE) * TILE - 10; this.vy = 0; this.vx = 0; this.rest = true;
      } else this.y = ny;
      this.x += this.vx;
    }
    if (--this.life <= 0) this.dead = true;
  }
  apply(p) {
    this.dead = true;
    const info = PICKUP_INFO[this.kind];
    let color = '#ffd23e';
    switch (this.kind) {
      case 'gem': game.addScore(500); Sfx.pickup(); break;
      case 'med': p.hp = Math.min(p.maxHp, p.hp + 1); Sfx.pickup(); color = '#7dff8a'; break;
      case 'nade': p.nades = Math.min(9, p.nades + 3); Sfx.pickup(); break;
      case 'wS': p.weapon = 'S'; p.nades = Math.min(9, p.nades + 1); Sfx.weaponUp(); color = '#ff9a2a'; break;
      case 'wH': p.weapon = 'H'; p.nades = Math.min(9, p.nades + 1); Sfx.weaponUp(); color = '#5ad1ff'; break;
      case 'life': game.lives++; Sfx.lifeUp(); color = '#ff5a3c'; break;
    }
    game.fxText(this.cx, this.y - 6, info.label, color);
  }
  draw(g) {
    if (this.life < 120 && (this.life >> 2) % 2 === 0) return;
    const img = Sprites[PICKUP_INFO[this.kind].spr];
    const bob = this.rest ? Math.sin(this.t * .1) * 2 : 0;
    drawSpr(g, img, this.cx - img.width / 2 - game.camX, this.y - game.camYOff + bob, false);
    // 光晕
    g.globalAlpha = .18 + .1 * Math.sin(this.t * .15);
    g.fillStyle = '#fff';
    g.fillRect(Math.round(this.cx - game.camX - 7), Math.round(this.y + bob - 4), 14, 14);
    g.globalAlpha = 1;
  }
}

// ============================================================
// 粒子
// ============================================================
class Particle {
  constructor(o) {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.grav = 0;
    this.life = 30; this.size = 2; this.color = '#fff'; this.type = 'spark';
    this.grow = 0; this.str = '';
    Object.assign(this, o);
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += this.grav;
    if (this.grow) this.size += this.grow;
    this.life--;
  }
  draw(g) {
    const x = Math.round(this.x - game.camX), y = Math.round(this.y - game.camYOff);
    const a = Math.max(0, Math.min(1, this.life / 20));
    switch (this.type) {
      case 'spark':
        g.strokeStyle = this.color; g.globalAlpha = a;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - this.vx * 2, y - this.vy * 2); g.stroke();
        break;
      case 'deb':
        g.fillStyle = this.color; g.globalAlpha = a;
        g.fillRect(x, y, this.size, this.size);
        break;
      case 'smoke':
        g.fillStyle = this.color; g.globalAlpha = a * .5;
        g.beginPath(); g.arc(x, y, Math.max(.5, this.size), 0, 7); g.fill();
        break;
      case 'fire': {
        const fr = Math.max(.5, this.size);
        g.globalAlpha = a;
        g.fillStyle = '#ffd23e';
        g.beginPath(); g.arc(x, y, fr, 0, 7); g.fill();
        g.fillStyle = '#ff7a2a';
        g.beginPath(); g.arc(x, y, fr * .6, 0, 7); g.fill();
        break;
      }
      case 'flash':
        g.globalAlpha = a * .9;
        g.fillStyle = this.color;
        g.beginPath(); g.arc(x, y, Math.max(.5, this.size), 0, 7); g.fill();
        break;
      case 'ring':
        g.strokeStyle = this.color; g.globalAlpha = a;
        g.beginPath(); g.arc(x, y, Math.max(.5, this.size), 0, 7); g.stroke();
        break;
      case 'txt':
        g.globalAlpha = Math.min(1, a * 2);
        drawText(g, this.str, x - textW(this.str) / 2, y, this.color, 1);
        break;
    }
    g.globalAlpha = 1;
  }
}
