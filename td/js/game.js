/* ============================================================
 * 魂火守卫 - 游戏引擎
 * 精灵构建 / 地图渲染 / 战斗逻辑 / 波次 / 特效
 * ============================================================ */
'use strict';

/* ---------------- 工具 ---------------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v,a,b)=> v<a?a : v>b?b : v;
const dist2d = (ax,ay,bx,by)=> Math.hypot(ax-bx, ay-by);

/* ---------------- 精灵库 ---------------- */
const SpriteLib = {
  cache: {},

  build(name, palOver){
    const key = name + (palOver ? '#'+JSON.stringify(palOver) : '');
    if(this.cache[key]) return this.cache[key];
    const rows = SPR[name];
    if(!rows){ console.warn('missing sprite', name); return null; }
    const w = Math.max(...rows.map(r=>r.length));
    const h = rows.length;
    // 校验:行宽不一致仅警告(右侧自动补透明)
    for(let i=0;i<rows.length;i++){
      if(rows[i].length !== w)
        console.warn('sprite row width mismatch:', name, 'row', i, rows[i].length, 'vs', w);
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    for(let y=0;y<h;y++){
      const row = rows[y];
      for(let x=0;x<row.length;x++){
        const ch = row[x];
        if(ch === '.' || ch === ' ') continue;
        const col = (palOver && palOver[ch]) || PAL[ch];
        if(!col){ console.warn('unknown palette char', ch, 'in', name); continue; }
        c.fillStyle = col;
        c.fillRect(x,y,1,1);
      }
    }
    this.cache[key] = cv;
    return cv;
  },

  /* 绘制:锚点为底部中心 */
  draw(ctx, spr, x, y, alpha){
    if(alpha !== undefined && alpha < 1){ ctx.globalAlpha = alpha; }
    ctx.drawImage(spr, Math.round(x - spr.width/2), Math.round(y - spr.height));
    if(alpha !== undefined && alpha < 1){ ctx.globalAlpha = 1; }
  }
};

/* 预构建所有精灵(含塔的等级换色变体) */
function buildAllSprites(){
  const out = { enemy:{}, tower:{}, deco:{} };
  for(const key in ENEMIES){
    out.enemy[key] = ENEMIES[key].spr.map(n=>SpriteLib.build(n));
  }
  for(const key in TOWERS){
    const t = TOWERS[key];
    out.tower[key] = [0,1,2].map(lv=>{
      const swap = t.palSwap ? t.palSwap[lv] : null;
      return SpriteLib.build(t.icon, swap);
    });
  }
  for(const n in SPR){
    if(n.startsWith('deco_')) out.deco[n] = SpriteLib.build(n);
  }
  out.slot = SpriteLib.build('slot');
  out.portal = SpriteLib.build('portal');
  out.bonfire = SpriteLib.build('bonfire');
  out.flame = [SpriteLib.build('flame0'), SpriteLib.build('flame1'), SpriteLib.build('flame2')];
  return out;
}

/* ============================================================
 * Game - 一局游戏
 * ============================================================ */
class Game {

  constructor(levelIdx, sprites){
    this.levelIdx = levelIdx;
    this.level = LEVELS[levelIdx];
    this.S = sprites;

    this.gold = this.level.startGold;
    this.hp = 10;
    this.maxHp = 10;
    this.time = 0;

    this.waveIdx = -1;          // 已开始的波(0基)
    this.state = 'countdown';   // countdown | active | won | lost
    this.countdown = 30;        // 首波准备时间
    this.waveTime = 0;
    this.spawnQueue = [];

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.particles = [];
    this.bolts = [];
    this.rings = [];
    this.floaters = [];

    this.shakeT = 0; this.shakeMag = 0;
    this.bonfireFlash = 0;
    this.selectedTower = null;
    this.buildType = null;      // 商店选中待建造的塔
    this.hoverGX = -1; this.hoverGY = -1;  // 悬停格(建造预览)

    // 路径(世界像素)
    this.pathPts = this.level.path.map(p=>({x:(p[0]+0.5)*TILE, y:(p[1]+0.5)*TILE}));
    this.segLen = [];
    this.pathTotal = 0;
    for(let i=0;i<this.pathPts.length-1;i++){
      const l = dist2d(this.pathPts[i].x,this.pathPts[i].y,this.pathPts[i+1].x,this.pathPts[i+1].y);
      this.segLen.push(l); this.pathTotal += l;
    }
    this.endPt = this.pathPts[this.pathPts.length-1];
    this.startPt = this.pathPts[0];

    // 塔占位表(格坐标 "gx,gy" -> 塔)
    this.towerAt = new Map();

    // 地图 / 装饰 / 血迹三个预渲染层
    this.decoCv = document.createElement('canvas');
    this.decoCv.width = WORLD_W; this.decoCv.height = WORLD_H;
    this.mapCv = this.renderMap();
    this.decalCv = document.createElement('canvas');
    this.decalCv.width = WORLD_W; this.decalCv.height = WORLD_H;

    // 事件回调(main.js 注入)
    this.events = {};
  }

  /* ---------- 难度系数 ---------- */
  hpMult(){ const i = this.levelIdx; return 1 + 0.35*i + 0.05*i*i; }
  waveMult(){ return 1 + 0.045*Math.max(0,this.waveIdx); }
  bountyMult(){ const i = this.levelIdx; return 1 + 0.22*i; }

  /* ---------- 地图预渲染 ---------- */
  renderMap(){
    const rng = mulberry32(1234 + this.levelIdx*7919);
    const th = this.level.theme;
    const cv = document.createElement('canvas');
    cv.width = WORLD_W; cv.height = WORLD_H;
    const c = cv.getContext('2d');

    // 路径格子集合
    const pathSet = new Set();
    const key = (x,y)=> x+','+y;
    for(let i=0;i<this.pathPts.length-1;i++){
      const a = this.level.path[i], b = this.level.path[i+1];
      const sx = Math.sign(b[0]-a[0]), sy = Math.sign(b[1]-a[1]);
      let x=a[0], y=a[1];
      pathSet.add(key(x,y));
      while(x!==b[0] || y!==b[1]){ x+=sx; y+=sy; pathSet.add(key(x,y)); }
    }
    this._pathSet = pathSet;
    const endTile = this.level.path[this.level.path.length-1];
    const portalTile = this._portalTile();
    this._endTile = endTile;

    // 地面
    for(let ty=0; ty<GRID_H; ty++){
      for(let tx=0; tx<GRID_W; tx++){
        const isPath = pathSet.has(key(tx,ty));
        const base = isPath ? th.path : th.ground;
        const speck = isPath ? th.pathSpeck : th.speck;
        // 每格亮度微差
        const v = (rng()-0.5)*0.10;
        c.fillStyle = shade(base, v);
        c.fillRect(tx*TILE, ty*TILE, TILE, TILE);
        // 颗粒
        const n = 3 + Math.floor(rng()*4);
        c.fillStyle = shade(speck, (rng()-0.5)*0.08);
        for(let k=0;k<n;k++){
          c.fillRect(tx*TILE + Math.floor(rng()*TILE), ty*TILE + Math.floor(rng()*TILE), 1, 1);
        }
        if(isPath){
          // 石块
          const st = 2 + Math.floor(rng()*3);
          for(let k=0;k<st;k++){
            const sw = 2+Math.floor(rng()*3), sh = 1+Math.floor(rng()*2);
            c.fillStyle = shade(speck, (rng()-0.3)*0.15);
            c.fillRect(tx*TILE + Math.floor(rng()*(TILE-sw)), ty*TILE + Math.floor(rng()*(TILE-sh)), sw, sh);
          }
        } else if(rng() < 0.18){
          // 杂草/枯枝
          c.fillStyle = shade(th.tuft, (rng()-0.5)*0.1);
          const gx = tx*TILE + 2 + Math.floor(rng()*(TILE-5));
          const gy = ty*TILE + 4 + Math.floor(rng()*(TILE-6));
          c.fillRect(gx, gy, 1, 2+Math.floor(rng()*2));
          c.fillRect(gx+2, gy+1, 1, 2);
        }
      }
    }

    // 路径边缘阴影
    c.fillStyle = th.pathEdge;
    for(let ty=0; ty<GRID_H; ty++){
      for(let tx=0; tx<GRID_W; tx++){
        if(!pathSet.has(key(tx,ty))) continue;
        const px = tx*TILE, py = ty*TILE;
        if(!pathSet.has(key(tx,ty-1))) c.fillRect(px, py, TILE, 1);
        if(!pathSet.has(key(tx,ty+1))) c.fillRect(px, py+TILE-1, TILE, 1);
        if(!pathSet.has(key(tx-1,ty))) c.fillRect(px, py, 1, TILE);
        if(!pathSet.has(key(tx+1,ty))) c.fillRect(px+TILE-1, py, 1, TILE);
      }
    }

    // 装饰物(独立图层,建塔时可单格清除)
    const dc = this.decoCv.getContext('2d');
    for(let ty=0; ty<GRID_H; ty++){
      for(let tx=0; tx<GRID_W; tx++){
        if(pathSet.has(key(tx,ty))) continue;
        if(tx===portalTile[0]&&ty===portalTile[1]) continue;
        if(tx===endTile[0]&&ty===endTile[1]) continue;
        if(rng() < 0.13){
          const list = th.deco;
          const spr = this.S.deco[list[Math.floor(rng()*list.length)]];
          if(spr){
            const dx = Math.floor(rng()*5)-2, dy = Math.floor(rng()*4)-2;
            dc.drawImage(spr, tx*TILE + Math.floor((TILE-spr.width)/2)+dx,
                              ty*TILE + TILE - spr.height + dy);
          }
        }
      }
    }
    return cv;
  }

  _portalTile(){
    const p = this.level.path[0];
    return [clamp(p[0],0,GRID_W-1), clamp(p[1],0,GRID_H-1)];
  }

  /* ---------- 路径采样 ---------- */
  posAt(d){
    d = clamp(d, 0, this.pathTotal);
    let acc = 0;
    for(let i=0;i<this.segLen.length;i++){
      if(d <= acc + this.segLen[i]){
        const t = (d - acc) / this.segLen[i];
        const a = this.pathPts[i], b = this.pathPts[i+1];
        return { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t,
                 ax: Math.atan2(b.y-a.y, b.x-a.x) };
      }
      acc += this.segLen[i];
    }
    const e = this.pathPts[this.pathPts.length-1];
    return { x:e.x, y:e.y, ax:0 };
  }

  /* ---------- 波次 ---------- */
  buildQueue(w){
    const q = [];
    for(const g of w){
      for(let k=0;k<g.n;k++) q.push({ t: g.delay + k*g.gap, type: g.type });
    }
    q.sort((a,b)=>a.t-b.t);
    return q;
  }

  startWave(early){
    if(this.state !== 'countdown') return;
    if(early && this.waveIdx >= 0){
      const bonus = Math.floor(this.countdown * 1.5);
      if(bonus > 0){ this.gold += bonus; this.floater(this.endPt.x, this.endPt.y-20, '+'+bonus, '#f2cf46'); }
    }
    this.waveIdx++;
    this.spawnQueue = this.buildQueue(this.level.waves[this.waveIdx]);
    this.waveTime = 0;
    this.state = 'active';

    const isBoss = this.spawnQueue.some(s=>ENEMIES[s.type].boss);
    const isFinal = this.waveIdx === this.level.waves.length-1;
    let label = '第 '+(this.waveIdx+1)+' / '+this.level.waves.length+' 波';
    if(isBoss){ label = WAVE_LABELS.boss; Sound.play('bosswave'); }
    else { if(isFinal) label += ' — '+WAVE_LABELS.final; Sound.play('wave'); }
    if(this.events.onBanner) this.events.onBanner(label, isBoss);
  }

  callWave(){
    if(this.state === 'countdown' && this.waveIdx < this.level.waves.length-1)
      this.startWave(true);
    else if(this.state === 'countdown')
      this.startWave(true);
  }

  /* ---------- 敌人 ---------- */
  spawnEnemy(type, dist){
    const def = ENEMIES[type];
    const hp = Math.round(def.hp * this.hpMult() * this.waveMult());
    const e = {
      type, def,
      hp, maxHp: hp,
      dist: dist || 0,
      x: this.startPt.x, y: this.startPt.y, prevX: 0,
      dir: 1,
      animT: Math.random()*10, lane: (Math.random()-0.5)*7,
      wob: Math.random()*6.28,
      slowAmt: 0, slowT: 0,
      poisonDps: 0, poisonT: 0,
      burnDps: 0, burnT: 0,
      curseAmp: 1, curseT: 0,
      bounty: Math.round(def.bounty * this.bountyMult()),
      dead: false, flash: 0, statT: Math.random()*0.3
    };
    this.enemies.push(e);
    // 传送门粒子
    for(let i=0;i<6;i++) this.particle(e.x, e.y, (Math.random()-0.5)*30, -Math.random()*25,
      0.4, def.goo, 1, 0);
  }

  effSpeed(e){
    return e.def.spd * TILE * (1 - e.slowAmt);
  }

  dealDamage(e, amount, dtype){
    if(e.dead || amount <= 0) return;
    let amt = amount;
    if(dtype === 'phys'){
      amt = Math.max(1, amt - e.def.armor);
      amt *= (1 - e.def.pres);
    } else {
      amt *= (1 - e.def.mres);
    }
    if(e.curseT > 0) amt *= e.curseAmp;
    e.hp -= amt;
    e.flash = 0.08;
    if(e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e){
    if(e.dead) return;
    e.dead = true;
    this.gold += e.bounty;
    this.floater(e.x, e.y - 12, '+'+e.bounty, '#f2cf46');
    Sound.play('coin');
    // 血浆
    const n = e.def.boss ? 60 : (e.def.big ? 26 : 12);
    for(let i=0;i<n;i++){
      const a = Math.random()*6.28, sp = 15+Math.random()*45;
      this.particle(e.x, e.y - 4, Math.cos(a)*sp, Math.sin(a)*sp - 20,
        0.5+Math.random()*0.4, e.def.goo, 1+(e.def.big?1:0), 60);
    }
    this.stampDecal(e.x, e.y, e.def.boss?5:2);
    if(e.def.boss){
      this.shake(0.7, 3);
      Sound.play('bossdie');
      this.rings.push({x:e.x, y:e.y-6, r:4, r2:60, life:0.6, maxLife:0.6, color:'#8e5bb0'});
    } else Sound.play('die');
    // 分裂
    if(e.def.spawnOnDeath){
      e.def.spawnOnDeath.forEach((t,i)=>{
        this.spawnEnemy(t, Math.max(0, e.dist - 3 - i*3));
      });
    }
    if(this.events.onKill) this.events.onKill(e);
  }

  leak(e){
    e.dead = true;
    this.hp = Math.max(0, this.hp - e.def.dmg);
    this.bonfireFlash = 0.4;
    this.shake(0.35, 2);
    Sound.play('leak');
    for(let i=0;i<10;i++)
      this.particle(this.endPt.x, this.endPt.y-6, (Math.random()-0.5)*40, -Math.random()*40,
        0.5, '#ff8c28', 1, 40);
    if(this.hp <= 0 && this.state !== 'lost'){
      this.state = 'lost';
      if(this.events.onLose) setTimeout(()=>this.events.onLose(), 600);
    }
  }

  /* ---------- 塔建造(自由放置:路径外的空格均可) ---------- */
  canBuildAt(gx, gy){
    if(gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
    const k = gx+','+gy;
    if(this._pathSet.has(k)) return false;        // 路径上
    if(this.towerAt.has(k)) return false;          // 已有塔
    const p = this._portalTile();
    if(p[0]===gx && p[1]===gy) return false;       // 传送门
    const e = this._endTile;
    if(e[0]===gx && e[1]===gy) return false;       // 魂火
    return true;
  }

  buildTower(gx, gy, type){
    if(!this.canBuildAt(gx, gy)) return false;
    const def = TOWERS[type];
    if(this.gold < def.cost[0]){ Sound.play('error'); return false; }
    this.gold -= def.cost[0];
    const t = {
      gx, gy, type, def, lv: 0,
      x: (gx+0.5)*TILE, y: (gy+0.5)*TILE,
      cool: 0, tick: 0, spent: def.cost[0], flash: 0,
      target: null, pulseT: 0
    };
    this.towers.push(t);
    this.towerAt.set(gx+','+gy, t);
    // 清除该格装饰
    this.decoCv.getContext('2d').clearRect(gx*TILE, gy*TILE, TILE, TILE);
    Sound.play('build');
    for(let i=0;i<10;i++)
      this.particle(t.x, t.y, (Math.random()-0.5)*40, -Math.random()*40, 0.4, '#67616f', 1, 60);
    return true;
  }

  upgradeTower(t){
    if(t.lv >= 2) return false;
    const cost = t.def.cost[t.lv+1];
    if(this.gold < cost){ Sound.play('error'); return false; }
    this.gold -= cost;
    t.spent += cost;
    t.lv++;
    t.flash = 0.3;
    Sound.play('upgrade');
    this.rings.push({x:t.x, y:t.y-6, r:2, r2:20, life:0.4, maxLife:0.4, color:'#f2cf46'});
    return true;
  }

  sellTower(t){
    const refund = Math.floor(t.spent * 0.6);
    this.gold += refund;
    this.floater(t.x, t.y-14, '+'+refund, '#f2cf46');
    this.towerAt.delete(t.gx+','+t.gy);
    this.towers = this.towers.filter(x=>x!==t);
    if(this.selectedTower === t) this.selectedTower = null;
    Sound.play('sell');
    return refund;
  }

  towerStat(t){
    const d = t.def;
    return {
      dmg: d.dmg[t.lv],
      rate: d.rate[t.lv],
      range: d.range[t.lv],
      splash: d.splash ? d.splash[t.lv] : 0,
      slow: d.slow ? d.slow[t.lv] : 0,
      poison: d.poison ? d.poison[t.lv] : 0,
      burn: d.burn ? d.burn[t.lv] : 0,
      chains: d.chains ? d.chains[t.lv] : 0,
      amp: d.amp ? d.amp[t.lv] : 0
    };
  }

  /* ---------- 目标选择:最靠前 ---------- */
  acquireTarget(t, range){
    let best = null, bestD = -1;
    for(const e of this.enemies){
      if(e.dead) continue;
      const d = dist2d(t.x, t.y-6, e.x, e.y);
      if(d <= range && e.dist > bestD){ best = e; bestD = e.dist; }
    }
    return best;
  }

  /* ---------- 更新 ---------- */
  update(dt){
    if(this.state === 'won' || this.state === 'lost') { this.updateFx(dt); return; }
    this.time += dt;

    // 波次
    if(this.state === 'countdown'){
      this.countdown -= dt;
      if(this.countdown <= 0) this.startWave(false);
    } else if(this.state === 'active'){
      this.waveTime += dt;
      while(this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTime){
        const s = this.spawnQueue.shift();
        this.spawnEnemy(s.type);
        const p = this._portalTile();
        for(let i=0;i<4;i++)
          this.particle((p[0]+0.5)*TILE, (p[1]+0.5)*TILE, (Math.random()-0.5)*30, -Math.random()*20, 0.4, '#8e5bb0', 1, 0);
      }
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateFx(dt);

    // 波次结束判定
    if(this.state === 'active' && this.spawnQueue.length === 0 && this.enemies.length === 0){
      const reward = 15 + this.waveIdx*4;
      this.gold += reward;
      this.floater(this.endPt.x, this.endPt.y-18, '+'+reward, '#f2cf46');
      if(this.waveIdx >= this.level.waves.length-1){
        this.state = 'won';
        if(this.events.onWin) setTimeout(()=>this.events.onWin(this.stars()), 800);
      } else {
        this.state = 'countdown';
        this.countdown = 14;
      }
    }
  }

  stars(){
    return this.hp >= 10 ? 3 : this.hp >= 6 ? 2 : 1;
  }

  updateEnemies(dt){
    for(const e of this.enemies){
      if(e.dead) continue;
      e.animT += dt;
      e.flash = Math.max(0, e.flash - dt);

      // 状态衰减
      if(e.slowT > 0){ e.slowT -= dt; if(e.slowT <= 0) e.slowAmt = 0; }
      if(e.curseT > 0){ e.curseT -= dt; if(e.curseT <= 0) e.curseAmp = 1; }
      if(e.poisonT > 0){
        e.poisonT -= dt;
        e.hp -= e.poisonDps * dt;
        if(e.hp <= 0){ this.killEnemy(e); continue; }
      }
      if(e.burnT > 0){
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if(e.hp <= 0){ this.killEnemy(e); continue; }
      }
      if(e.def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.def.regen*this.hpMult()*dt);

      // 移动
      e.dist += this.effSpeed(e) * dt;
      if(e.dist >= this.pathTotal){ this.leak(e); continue; }
      const p = this.posAt(e.dist);
      // 垂直于路径的车道偏移
      const nx = Math.sin(p.ax), ny = -Math.cos(p.ax);
      e.x = p.x + nx * e.lane * (e.def.fly ? 1.6 : 1);
      e.y = p.y + ny * e.lane * (e.def.fly ? 1.6 : 1);
      if(e.x < e.prevX - 0.01) e.dir = -1;
      else if(e.x > e.prevX + 0.01) e.dir = 1;
      e.prevX = e.x;

      // 状态粒子
      e.statT -= dt;
      if(e.statT <= 0){
        e.statT = 0.28;
        if(e.slowAmt > 0) this.particle(e.x+(Math.random()-0.5)*6, e.y-6, 0, -8, 0.5, '#bfe9f5', 1, 0);
        if(e.poisonT > 0) this.particle(e.x+(Math.random()-0.5)*6, e.y-8, 0, -12, 0.6, '#7cd63e', 1, 0);
        if(e.burnT > 0) this.particle(e.x+(Math.random()-0.5)*6, e.y-8, (Math.random()-0.5)*8, -20, 0.4, '#f39d3c', 1, 0);
        if(e.curseT > 0) this.particle(e.x+(Math.random()-0.5)*8, e.y-6-Math.random()*8, 0, -4, 0.5, '#8e5bb0', 1, 0);
      }
    }
    this.enemies = this.enemies.filter(e=>!e.dead);
  }

  updateTowers(dt){
    for(const t of this.towers){
      t.cool -= dt; t.tick -= dt; t.flash = Math.max(0, t.flash - dt);
      const st = this.towerStat(t);
      const hx = t.x, hy = t.y - 8;

      if(t.type === 'totem'){
        t.pulseT -= dt;
        if(t.pulseT <= 0){
          t.pulseT = 0.5;
          let hitAny = false;
          for(const e of this.enemies){
            if(e.dead) continue;
            if(dist2d(t.x, t.y-4, e.x, e.y) <= st.range){
              const amp = st.amp;
              if(amp >= e.curseAmp || e.curseT <= 0){ e.curseAmp = amp; }
              e.curseT = 1.2;
              hitAny = true;
            }
          }
          if(hitAny){
            this.rings.push({x:t.x, y:t.y-4, r:4, r2:st.range, life:0.5, maxLife:0.5, color:'#8e5bb0'});
            Sound.play('curse');
          }
        }
        continue;
      }

      // 目标
      if(t.target && (t.target.dead || dist2d(t.x,t.y-6,t.target.x,t.target.y) > st.range + 4))
        t.target = null;
      if(!t.target) t.target = this.acquireTarget(t, st.range);
      if(!t.target) continue;

      if(t.type === 'flame'){
        // 持续喷火:0.25s 一跳
        if(t.tick <= 0){
          t.tick = 0.25;
          const e = t.target;
          this.dealDamage(e, st.dmg, 'magic');
          e.burnDps = Math.max(e.burnDps, st.burn); e.burnT = 2;
          // 火舌粒子
          const n = 5;
          for(let i=0;i<n;i++){
            const p = 0.3 + Math.random()*0.7;
            this.particle(hx+(e.x-hx)*p+(Math.random()-0.5)*3, hy+(e.y-4-hy)*p+(Math.random()-0.5)*3,
              (Math.random()-0.5)*10, -14, 0.25+Math.random()*0.15,
              Math.random()<0.5?'#f39d3c':'#d96e2a', 1, 0);
          }
          if(Math.random()<0.4) Sound.play('flame');
        }
        continue;
      }

      if(t.cool > 0) continue;
      const e = t.target;
      t.cool = st.rate;
      t.flash = 0.12;

      switch(t.type){
        case 'crossbow': {
          this.projectiles.push({kind:'arrow', x:hx, y:hy, target:e, speed:210,
            dmg: st.dmg, dtype:'phys', life:2});
          Sound.play('arrow');
          break;
        }
        case 'cannon': {
          // 预判落点
          const lead = clamp(dist2d(hx,hy,e.x,e.y)/90, 0.3, 0.9);
          const fut = this.posAt(e.dist + this.effSpeed(e)*lead);
          this.projectiles.push({kind:'shell', x0:hx, y0:hy, x1:fut.x, y1:fut.y,
            t:0, dur:lead, dmg: st.dmg, splash: st.splash});
          Sound.play('cannon');
          this.shake(0.08, 0.6);
          break;
        }
        case 'frost': {
          this.projectiles.push({kind:'shard', x:hx, y:hy, target:e, speed:150,
            dmg: st.dmg, dtype:'magic', slow: st.slow, slowDur: t.def.slowDur, life:2.5});
          Sound.play('frost');
          break;
        }
        case 'poison': {
          this.projectiles.push({kind:'glob', x:hx, y:hy, target:e, speed:95,
            dmg: st.dmg, dtype:'magic', poison: st.poison, poisonDur: t.def.poisonDur, life:3});
          Sound.play('poison');
          break;
        }
        case 'lightning': {
          // 即时链电
          const pts = [{x:hx, y:hy}];
          let cur = e, dmg = st.dmg;
          const hitSet = new Set();
          for(let i=0;i<st.chains;i++){
            if(!cur) break;
            hitSet.add(cur);
            pts.push({x:cur.x, y:cur.y-5});
            this.dealDamage(cur, dmg, 'magic');
            this.particle(cur.x, cur.y-5, (Math.random()-0.5)*30, (Math.random()-0.5)*30, 0.3, '#dff7ff', 1, 0);
            dmg *= 0.72;
            // 下一个:离当前最近且未命中
            let next = null, nd = 1e9;
            for(const o of this.enemies){
              if(o.dead || hitSet.has(o)) continue;
              const d = dist2d(cur.x, cur.y, o.x, o.y);
              if(d < 38 && d < nd){ next = o; nd = d; }
            }
            cur = next;
          }
          this.bolts.push({pts, life:0.16});
          Sound.play('zap');
          break;
        }
        case 'orb': {
          this.projectiles.push({kind:'orb', x:hx, y:hy-2, target:e, speed:75,
            dmg: st.dmg, dtype:'magic', splash: st.splash, life:4});
          Sound.play('orb');
          break;
        }
      }
    }
  }

  updateProjectiles(dt){
    for(const p of this.projectiles){
      p.life -= dt;
      if(p.life <= 0){ p.dead = true; continue; }

      if(p.kind === 'shell'){
        p.t += dt / p.dur;
        if(p.t >= 1){
          p.dead = true;
          this.explode(p.x1, p.y1, p.splash, p.dmg, 'phys');
        }
        continue;
      }

      // 追踪弹
      const e = p.target;
      let tx, ty;
      if(e && !e.dead){ tx = e.x; ty = e.y - 4; p.lx = tx; p.ly = ty; }
      else { tx = p.lx; ty = p.ly; if(tx === undefined){ p.dead = true; continue; } }
      const d = dist2d(p.x, p.y, tx, ty);
      if(d < (p.kind==='orb'?4:3)){
        p.dead = true;
        this.projectileHit(p, e);
        continue;
      }
      const vx = (tx-p.x)/d * p.speed, vy = (ty-p.y)/d * p.speed;
      p.x += vx*dt; p.y += vy*dt;
      p.angle = Math.atan2(vy, vx);
      // 尾迹
      if(p.kind==='orb' && Math.random()<0.5)
        this.particle(p.x, p.y, (Math.random()-0.5)*8, (Math.random()-0.5)*8, 0.3, '#8e5bb0', 1, 0);
      if(p.kind==='shard' && Math.random()<0.3)
        this.particle(p.x, p.y, 0, 4, 0.2, '#bfe9f5', 1, 0);
    }
    this.projectiles = this.projectiles.filter(p=>!p.dead);
  }

  projectileHit(p, e){
    if(e && !e.dead){
      this.dealDamage(e, p.dmg, p.dtype);
      if(p.slow){ e.slowAmt = Math.max(e.slowAmt, p.slow); e.slowT = p.slowDur; }
      if(p.poison){ e.poisonDps = Math.max(e.poisonDps, p.poison); e.poisonT = p.poisonDur; }
      Sound.play('hit');
      for(let i=0;i<4;i++)
        this.particle(p.x, p.y, (Math.random()-0.5)*30, (Math.random()-0.5)*30, 0.25,
          p.kind==='shard'?'#bfe9f5':(p.kind==='glob'?'#7cd63e':'#e8e2cf'), 1, 0);
      if(p.kind==='orb') this.explode(p.x, p.y, p.splash, p.dmg*0.6, 'magic', e);
    }
  }

  explode(x, y, r, dmg, dtype, exclude){
    this.rings.push({x, y, r:2, r2:r, life:0.25, maxLife:0.25, color:'#f39d3c'});
    for(let i=0;i<12;i++){
      const a = Math.random()*6.28, sp = 20+Math.random()*40;
      this.particle(x, y, Math.cos(a)*sp, Math.sin(a)*sp-15, 0.4,
        Math.random()<0.5?'#f39d3c':'#6f7d8c', 1, 50);
    }
    Sound.play('boom');
    this.shake(0.12, 1);
    for(const e of this.enemies){
      if(e.dead || e === exclude) continue;
      if(dist2d(x, y, e.x, e.y) <= r) this.dealDamage(e, dmg, dtype);
    }
    // 弹坑
    const dc = this.decalCv.getContext('2d');
    dc.fillStyle = 'rgba(10,8,6,0.35)';
    dc.beginPath(); dc.arc(x, y, r*0.45, 0, 6.28); dc.fill();
  }

  updateFx(dt){
    for(const p of this.particles){
      p.life -= dt;
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.vy += p.grav*dt;
    }
    this.particles = this.particles.filter(p=>p.life>0);
    for(const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter(b=>b.life>0);
    for(const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r=>r.life>0);
    for(const f of this.floaters){ f.life -= dt; f.y -= 10*dt; }
    this.floaters = this.floaters.filter(f=>f.life>0);
    if(this.shakeT > 0) this.shakeT -= dt;
    if(this.bonfireFlash > 0) this.bonfireFlash -= dt;
  }

  particle(x,y,vx,vy,life,color,size,grav){
    if(this.particles.length > 500) return;
    this.particles.push({x,y,vx,vy,life,maxLife:life,color,size:size||1,grav:grav||0});
  }
  floater(x,y,txt,color){
    this.floaters.push({x,y,txt,color,life:1.0});
  }
  shake(t,m){ this.shakeT = Math.max(this.shakeT, t); this.shakeMag = Math.max(this.shakeMag, m); }
  stampDecal(x,y,r){
    const dc = this.decalCv.getContext('2d');
    dc.fillStyle = 'rgba(90,10,10,0.5)';
    for(let i=0;i<r+2;i++){
      const a = Math.random()*6.28, d = Math.random()*r;
      const s = Math.random()<0.3?2:1;
      dc.fillRect(Math.round(x+Math.cos(a)*d), Math.round(y+Math.sin(a)*d*0.5), s, s);
    }
  }

  /* ---------- HUD 状态 ---------- */
  hud(){
    return {
      hp: this.hp, gold: Math.floor(this.gold),
      wave: Math.min(this.waveIdx+1, this.level.waves.length),
      total: this.level.waves.length,
      state: this.state,
      countdown: Math.max(0, Math.ceil(this.countdown)),
      canCall: this.state === 'countdown' && this.waveIdx < this.level.waves.length-1
    };
  }

  /* ============================================================
   * 渲染(ctx 已按 zoom 缩放,直接使用世界坐标)
   * ============================================================ */
  draw(ctx, zoom){
    const S = this.S;
    ctx.save();
    // 屏幕震动
    if(this.shakeT > 0){
      const m = this.shakeMag * (this.shakeT);
      ctx.translate((Math.random()-0.5)*m, (Math.random()-0.5)*m);
    }

    ctx.drawImage(this.mapCv, 0, 0);
    ctx.drawImage(this.decoCv, 0, 0);
    ctx.drawImage(this.decalCv, 0, 0);

    // ---- 建造预览(跟随悬停格) ----
    if(this.buildType && this.hoverGX >= 0){
      const def = TOWERS[this.buildType];
      const ok = this.canBuildAt(this.hoverGX, this.hoverGY);
      const cx = (this.hoverGX+0.5)*TILE, cy = (this.hoverGY+0.5)*TILE;
      this.drawRange(ctx, cx, cy-6, def.range[0], ok ? '#f2cf46' : '#ff3b30');
      if(ok){
        const spr = this.S.tower[this.buildType][0];
        SpriteLib.draw(ctx, spr, cx, cy+7, 0.55);
      } else {
        ctx.fillStyle = 'rgba(255,59,48,0.30)';
        ctx.fillRect(this.hoverGX*TILE, this.hoverGY*TILE, TILE, TILE);
      }
    }

    // ---- 选中塔的射程 ----
    if(this.selectedTower){
      const st = this.towerStat(this.selectedTower);
      this.drawRange(ctx, this.selectedTower.x, this.selectedTower.y-6, st.range, '#8fd4e8');
    }

    // ---- 传送门 ----
    const pt = this._portalTile();
    const px = (pt[0]+0.5)*TILE, py = (pt[1]+0.5)*TILE;
    const pg = 0.3 + Math.sin(this.time*3)*0.15;
    const grad = ctx.createRadialGradient(px, py, 1, px, py, 14);
    grad.addColorStop(0, 'rgba(142,91,176,'+(pg*0.8).toFixed(2)+')');
    grad.addColorStop(1, 'rgba(142,91,176,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px-14, py-14, 28, 28);
    SpriteLib.draw(ctx, S.portal, px, py+7);

    // ---- 实体按 y 排序 ----
    const ents = [];
    for(const t of this.towers) ents.push({y:t.y, tower:t});
    for(const e of this.enemies) ents.push({y:e.y + (e.def.fly?6:0), enemy:e});
    ents.push({y:this.endPt.y, bonfire:true});
    ents.sort((a,b)=>a.y-b.y);

    for(const en of ents){
      if(en.tower) this.drawTower(ctx, en.tower);
      else if(en.enemy) this.drawEnemy(ctx, en.enemy);
      else this.drawBonfire(ctx);
    }

    // ---- 投射物 ----
    for(const p of this.projectiles){
      if(p.kind === 'arrow'){
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle || 0);
        ctx.fillStyle = '#e8e2cf'; ctx.fillRect(-3, -0.5, 5, 1);
        ctx.fillStyle = '#a3b4c4'; ctx.fillRect(-3, -0.5, 1, 1);
        ctx.fillStyle = '#f8f4e8'; ctx.fillRect(2, -0.5, 1, 1);
        ctx.restore();
      } else if(p.kind === 'shell'){
        const t = p.t;
        const x = p.x0 + (p.x1-p.x0)*t;
        const y = p.y0 + (p.y1-p.y0)*t - Math.sin(Math.PI*t)*14;
        // 影子
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x-1, p.y0 + (p.y1-p.y0)*t - 1, 3, 1);
        ctx.fillStyle = '#17171f'; ctx.fillRect(x-2, y-2, 4, 4);
        ctx.fillStyle = '#6f7d8c'; ctx.fillRect(x-1, y-2, 1, 1);
      } else if(p.kind === 'shard'){
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.angle||0);
        ctx.fillStyle = '#eef9ff'; ctx.fillRect(-3, -1, 5, 2);
        ctx.fillStyle = '#8fd4e8'; ctx.fillRect(-4, 0, 2, 1);
        ctx.restore();
      } else if(p.kind === 'glob'){
        ctx.fillStyle = '#48942c'; ctx.fillRect(p.x-2, p.y-2, 4, 4);
        ctx.fillStyle = '#7cd63e'; ctx.fillRect(p.x-1, p.y-2, 2, 2);
      } else if(p.kind === 'orb'){
        const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6);
        g2.addColorStop(0, 'rgba(199,142,240,0.9)');
        g2.addColorStop(1, 'rgba(142,91,176,0)');
        ctx.fillStyle = g2; ctx.fillRect(p.x-6, p.y-6, 12, 12);
        ctx.fillStyle = '#8e5bb0'; ctx.fillRect(p.x-2, p.y-2, 4, 4);
        ctx.fillStyle = '#e8c0ff'; ctx.fillRect(p.x-1, p.y-2, 2, 2);
      }
    }

    // ---- 闪电 ----
    for(const b of this.bolts){
      const a = b.life / 0.16;
      ctx.strokeStyle = 'rgba(223,247,255,'+(a*0.9).toFixed(2)+')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=0;i<b.pts.length-1;i++){
        const p1 = b.pts[i], p2 = b.pts[i+1];
        ctx.moveTo(p1.x, p1.y);
        const mx = (p1.x+p2.x)/2 + (Math.random()-0.5)*6;
        const my = (p1.y+p2.y)/2 + (Math.random()-0.5)*6;
        ctx.lineTo(mx, my);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
    }

    // ---- 光环 ----
    for(const r of this.rings){
      const p = 1 - r.life/r.maxLife;
      const rr = r.r + (r.r2-r.r)*p;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1-p)*0.7;
      ctx.beginPath(); ctx.arc(r.x, r.y, rr, 0, 6.28); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ---- 粒子 ----
    for(const p of this.particles){
      ctx.globalAlpha = clamp(p.life/p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // ---- 漂浮文字 ----
    ctx.font = '5px monospace';
    ctx.textAlign = 'center';
    for(const f of this.floaters){
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = '#000';
      ctx.fillText(f.txt, f.x+0.5, f.y+0.5);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    ctx.restore();
  }

  drawRange(ctx, x, y, r, color){
    ctx.fillStyle = 'rgba(200,220,255,0.05)';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawTower(ctx, t){
    const S = this.S;
    const spr = S.tower[t.type][t.lv];
    const bob = t.flash > 0 ? (Math.random()-0.5)*1.5 : 0;
    SpriteLib.draw(ctx, spr, t.x + bob, t.y + 7);
    // 等级标记
    ctx.fillStyle = '#f2cf46';
    for(let i=0;i<=t.lv;i++){
      ctx.fillRect(t.x-4+i*4, t.y+7, 2, 2);
    }
    // 图腾脉动
    if(t.type === 'totem'){
      const a = 0.15 + Math.sin(this.time*4)*0.1;
      ctx.fillStyle = 'rgba(142,91,176,'+a.toFixed(2)+')';
      ctx.fillRect(t.x-2, t.y-14, 4, 2);
    }
    // 法球悬浮光
    if(t.type === 'orb'){
      const g = ctx.createRadialGradient(t.x, t.y-9, 0, t.x, t.y-9, 5);
      g.addColorStop(0, 'rgba(199,142,240,0.35)');
      g.addColorStop(1, 'rgba(199,142,240,0)');
      ctx.fillStyle = g; ctx.fillRect(t.x-5, t.y-14, 10, 10);
    }
    if(t.flash > 0){
      ctx.fillStyle = 'rgba(255,240,200,'+(t.flash*2).toFixed(2)+')';
      ctx.fillRect(t.x-3, t.y-14, 6, 2);
    }
  }

  drawEnemy(ctx, e){
    const S = this.S;
    const frames = S.enemy[e.type];
    const spr = frames[Math.floor(e.animT*7) % frames.length];
    let alpha = 1;
    if(e.def.ghost) alpha = 0.72;
    let bob = 0;
    if(e.def.fly) bob = Math.sin(e.animT*9 + e.wob)*1.8;
    else bob = -Math.abs(Math.sin(e.animT*8 + e.wob))*1.0;

    // 阴影
    if(!e.def.ghost){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      const sw = e.def.boss ? 14 : (e.def.big ? 10 : 6);
      ctx.fillRect(Math.round(e.x - sw/2), Math.round(e.y + 1), sw, 2);
    }

    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(e.y + 5 + bob));
    if(e.dir < 0) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, -Math.floor(spr.width/2), -spr.height);
    if(e.flash > 0){
      ctx.globalAlpha = alpha * (e.flash/0.08) * 0.7;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#fff';
      ctx.fillRect(-Math.floor(spr.width/2), -spr.height, spr.width, spr.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // 血条
    if(e.hp < e.maxHp){
      const w = e.def.boss ? 30 : (e.def.big ? 18 : 10);
      const f = clamp(e.hp/e.maxHp, 0, 1);
      const yy = Math.round(e.y + bob - (e.def.boss? 24 : e.def.big? 20 : 16));
      ctx.fillStyle = '#0b0b12';
      ctx.fillRect(Math.round(e.x-w/2)-1, yy-1, w+2, 3);
      ctx.fillStyle = f > 0.5 ? '#7cd63e' : f > 0.25 ? '#f2cf46' : '#c22323';
      ctx.fillRect(Math.round(e.x-w/2), yy, Math.round(w*f), 1);
    }
  }

  drawBonfire(ctx){
    const S = this.S;
    const x = this.endPt.x, y = this.endPt.y;
    // 光晕
    const flick = 0.75 + Math.sin(this.time*9)*0.12 + Math.random()*0.06;
    const hpF = clamp(this.hp/this.maxHp, 0.15, 1);
    const g = ctx.createRadialGradient(x, y-4, 2, x, y-4, 34*flick*hpF + 8);
    g.addColorStop(0, 'rgba(120,200,255,'+(0.30*hpF+0.06).toFixed(2)+')');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x-42, y-46, 84, 84);
    // 柴堆
    SpriteLib.draw(ctx, S.bonfire, x, y+6);
    // 火焰(随生命值缩小)
    const fi = Math.floor(this.time*9) % 3;
    const fl = S.flame[fi];
    ctx.save();
    ctx.translate(x, y+2);
    const sc = 0.5 + 0.5*hpF;
    ctx.scale(sc, sc);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(fl, -fl.width/2, -fl.height);
    ctx.restore();
    ctx.globalAlpha = 1;
    // 火星
    if(Math.random() < 0.3){
      this.particle(x+(Math.random()-0.5)*6, y-8, (Math.random()-0.5)*6, -18-Math.random()*12,
        0.8, Math.random()<0.5?'#8fd4e8':'#dff7ff', 1, -6);
    }
    // 受击闪红
    if(this.bonfireFlash > 0){
      ctx.fillStyle = 'rgba(255,46,46,'+(this.bonfireFlash*0.8).toFixed(2)+')';
      ctx.fillRect(x-8, y-16, 16, 20);
    }
    // 生命微章
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(x-11, y-22, 22, 4);
    ctx.fillStyle = '#c22323';
    ctx.fillRect(x-10, y-21, Math.round(20*hpF), 2);
  }
}

/* ---------------- 颜色明暗工具 ---------------- */
function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  let r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  r = clamp(Math.round(r + amt*255), 0, 255);
  g = clamp(Math.round(g + amt*255), 0, 255);
  b = clamp(Math.round(b + amt*255), 0, 255);
  return 'rgb('+r+','+g+','+b+')';
}
