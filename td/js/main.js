/* ============================================================
 * 魂火守卫 - 主程序
 * 界面流程 / 输入 / 商店 / 面板 / 存档 / 主循环
 * ============================================================ */
'use strict';

(function(){

const $ = id => document.getElementById(id);
const boardCv = $('board');
const bctx = boardCv.getContext('2d');

const App = {
  save: loadSave(),
  sprites: null,
  game: null,
  levelIdx: 0,
  speed: 1,
  paused: false,
  zoom: 1, ox: 0, oy: 0,
  selectedShop: null,   // 商店选中待建造
  hudCache: '',
  thumbCache: {},
  raf: 0, lastT: 0,
  menuT: 0,
  coarse: false,        // 触屏设备(两步建造)
  softLandscape: false, // 软件横屏开关
  rotated: false,       // 当前处于旋转渲染
  pendingBuild: null    // 触屏待确认的建造 {gx,gy}
};

/* URL 调试参数:?touch 强制触屏逻辑 / ?landscape 强制软件横屏 */
(function(){
  const qp = new URLSearchParams(location.search);
  if(qp.has('touch')) App.coarse = true;
  if(qp.has('landscape')) App.softLandscape = true;
  try{
    if(window.matchMedia && matchMedia('(pointer:coarse)').matches) App.coarse = true;
  }catch(e){}
})();

Sound.setMuted(App.save.muted);

/* ---------------- 通用 UI ---------------- */
function show(id){
  ['scr-menu','scr-levels','scr-game'].forEach(s=>$(s).classList.add('hidden'));
  $(id).classList.remove('hidden');
  App.screen = id;
}

let toastTimer = 0;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.add('hidden'), 1800);
}

let bannerTimer = 0;
function banner(text, boss){
  const b = $('wave-banner');
  b.innerHTML = text.replace('⚠','<span style="color:#ff2e2e">⚠</span>');
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(()=>b.classList.add('hidden'), boss?3200:2000);
}

function modal(html){
  $('modal-box').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal(){ $('modal').classList.add('hidden'); }

/* ---------------- 音效解锁 ---------------- */
document.addEventListener('pointerdown', ()=>Sound.init(), {once:false});

/* ---------------- 画布尺寸(布局尺寸,不受旋转影响) ---------------- */
function resize(){
  const wrap = $('board-wrap');
  const w = wrap.offsetWidth, h = wrap.offsetHeight;
  App.rect = { w, h };
  const dpr = window.devicePixelRatio || 1;
  boardCv.width = Math.round(w * dpr);
  boardCv.height = Math.round(h * dpr);
  App.zoom = Math.min(w / WORLD_W, h / WORLD_H);
  App.ox = (w - WORLD_W * App.zoom) / 2;
  App.oy = (h - WORLD_H * App.zoom) / 2;
  bctx.imageSmoothingEnabled = false;
  positionPanel();
  if(App.pendingBuild && App.game) showBuildConfirm(App.pendingBuild.gx, App.pendingBuild.gy);
}
function updateRotation(){
  const app = $('app');
  const portrait = window.innerHeight > window.innerWidth;
  const active = App.softLandscape && portrait;
  App.rotated = active;
  if(active){
    app.classList.add('rot90');
    app.style.left = window.innerWidth + 'px';
    app.style.width = window.innerHeight + 'px';
    app.style.height = window.innerWidth + 'px';
  } else {
    app.classList.remove('rot90');
    app.style.left = ''; app.style.width = ''; app.style.height = '';
  }
  resize();
}
window.addEventListener('resize', updateRotation);
window.addEventListener('orientationchange', ()=>setTimeout(updateRotation, 250));
document.addEventListener('fullscreenchange', updateRotation);
document.addEventListener('webkitfullscreenchange', updateRotation);

/* 指针 → 世界坐标(软件横屏时做90°逆变换) */
function toWorld(ev){
  const r = boardCv.getBoundingClientRect();
  let cx, cy;
  if(App.rotated){
    // 容器顺时针旋转90°:本地x沿屏幕向下,本地y沿屏幕向左
    cx = ev.clientY - r.top;
    cy = r.right - ev.clientX;
  } else {
    cx = ev.clientX - r.left;
    cy = ev.clientY - r.top;
  }
  return { x: (cx - App.ox) / App.zoom,
           y: (cy - App.oy) / App.zoom };
}

/* ---------------- 触屏两步建造 ---------------- */
function cancelPendingBuild(){
  App.pendingBuild = null;
  $('build-confirm').classList.add('hidden');
  if(App.game){ App.game.hoverGX = -1; App.game.hoverGY = -1; }
}

function doBuild(gx, gy){
  const g = App.game;
  if(!g.buildTower(gx, gy, g.buildType)) toast('金币不足!');
  cancelPendingBuild();
  positionPanel();
}

function showBuildConfirm(gx, gy){
  const g = App.game;
  if(!g || !g.buildType) return;
  const bc = $('build-confirm');
  const def = TOWERS[g.buildType];
  bc.querySelector('.bc-title').textContent = '建造 ' + def.name + ' · ' + def.cost[0] + 'g';
  bc.classList.remove('hidden');
  const wrap = $('board-wrap');
  const pw = bc.offsetWidth || 150, ph = bc.offsetHeight || 72;
  const sx = App.ox + (gx + 0.5) * TILE * App.zoom;
  const sy = App.oy + (gy + 0.5) * TILE * App.zoom;
  let left = sx + 24;
  if(left + pw > wrap.offsetWidth - 6) left = sx - pw - 24;
  let top = sy - ph / 2;
  top = Math.max(6, Math.min(wrap.offsetHeight - ph - 6, top));
  left = Math.max(6, left);
  bc.style.left = left + 'px';
  bc.style.top = top + 'px';
}

/* ---------------- 输入 ---------------- */
boardCv.addEventListener('pointerdown', ev=>{
  ev.preventDefault();
  if(!App.game) return;
  Sound.init();
  const w = toWorld(ev);
  const gx = Math.floor(w.x / TILE), gy = Math.floor(w.y / TILE);
  const g = App.game;
  const touchMode = App.coarse || ev.pointerType === 'touch';
  g.hoverGX = gx; g.hoverGY = gy;

  if(gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H){
    // 已有塔:选中/取消选中(并退出建造模式)
    const t = g.towerAt.get(gx+','+gy);
    if(t){
      cancelPendingBuild();
      g.selectedTower = (g.selectedTower === t) ? null : t;
      g.buildType = null; App.selectedShop = null; refreshShop();
      positionPanel();
      Sound.play('click');
      return;
    }
    // 建造模式
    if(g.buildType){
      if(g.canBuildAt(gx, gy)){
        if(touchMode){
          // 触屏两步:首次点选位置并预览,再点同格或按 ✓ 确认
          if(App.pendingBuild && App.pendingBuild.gx === gx && App.pendingBuild.gy === gy){
            doBuild(gx, gy);
          } else {
            App.pendingBuild = {gx, gy};
            showBuildConfirm(gx, gy);
            Sound.play('click');
          }
        } else {
          doBuild(gx, gy);
        }
      } else {
        toast('这里无法建造 —— 挡住怪物的路了');
        Sound.play('error');
        cancelPendingBuild();
      }
      return;
    }
  }
  // 点空处:取消
  cancelPendingBuild();
  g.selectedTower = null;
  g.buildType = null;
  App.selectedShop = null;
  refreshShop();
  positionPanel();
});

boardCv.addEventListener('pointermove', ev=>{
  if(!App.game) return;
  if(ev.pointerType === 'touch') return; // 触屏无悬停,预览由待确认位置驱动
  const w = toWorld(ev);
  const gx = Math.floor(w.x / TILE), gy = Math.floor(w.y / TILE);
  if(gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H){
    App.game.hoverGX = gx; App.game.hoverGY = gy;
  } else {
    App.game.hoverGX = -1; App.game.hoverGY = -1;
  }
});

/* 键盘(桌面端便利) */
window.addEventListener('keydown', ev=>{
  if(App.screen !== 'scr-game') return;
  if(ev.key === 'Escape'){
    cancelPendingBuild();
    App.game.selectedTower = null;
    App.game.buildType = null; App.selectedShop = null;
    refreshShop(); positionPanel();
  } else if(ev.key === ' '){
    ev.preventDefault(); togglePause();
  } else if(ev.key >= '1' && ev.key <= '8'){
    const items = shopOrder();
    const idx = parseInt(ev.key)-1;
    if(items[idx]) selectShop(items[idx]);
  }
});

/* ---------------- 商店 ---------------- */
function shopOrder(){
  // 当前关卡可用的塔,按固定顺序
  return Object.keys(TOWERS).filter(k=>App.game.level.towers.includes(k));
}

function buildShop(){
  const shop = $('shop');
  shop.innerHTML = '';
  const avail = App.game.level.towers;
  // 解锁信息:该塔首次出现的关卡
  const unlockAt = {};
  Object.keys(TOWERS).forEach(k=>{
    unlockAt[k] = LEVELS.findIndex(l=>l.towers.includes(k));
  });
  Object.keys(TOWERS).forEach(k=>{
    const def = TOWERS[k];
    const unlocked = avail.includes(k);
    const item = document.createElement('div');
    item.className = 'shop-item' + (unlocked?'':' locked');
    item.dataset.type = k;
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    const spr = App.sprites.tower[k][0];
    c.drawImage(spr, 0, 0, spr.width, spr.height, 4, 2, 26, 26);
    item.appendChild(cv);
    const nm = document.createElement('div');
    nm.className = 'si-name'; nm.textContent = unlocked ? def.name : '???';
    item.appendChild(nm);
    const cost = document.createElement('div');
    cost.className = 'si-cost';
    cost.textContent = unlocked ? def.cost[0]+'g' : (unlockAt[k]+1)+'关';
    item.appendChild(cost);
    if(!unlocked){
      const lk = document.createElement('div');
      lk.className = 'si-lock'; lk.textContent = '🔒';
      item.appendChild(lk);
    }
    item.addEventListener('pointerdown', ev=>{
      ev.preventDefault();
      Sound.init();
      if(!unlocked){ toast('通关第'+(unlockAt[k]+1)+'关后解锁'); Sound.play('error'); return; }
      selectShop(k);
    });
    shop.appendChild(item);
  });
  refreshShop();
  const first = shop.children[0];
  if(first){
    const r = first.getBoundingClientRect();
    App.debugShop = { n: shop.children.length, w: r.width, h: r.height };
  }
}

function selectShop(k){
  cancelPendingBuild();
  if(App.selectedShop === k){
    App.selectedShop = null; App.game.buildType = null;
  } else {
    App.selectedShop = k; App.game.buildType = k;
    App.game.selectedTower = null; positionPanel();
  }
  Sound.play('click');
  refreshShop();
}

function refreshShop(){
  const items = $('shop').children;
  for(const el of items){
    const k = el.dataset.type;
    el.classList.toggle('selected', App.selectedShop === k);
    const unlocked = App.game.level.towers.includes(k);
    if(unlocked){
      el.classList.toggle('poor', App.game.gold < TOWERS[k].cost[0]);
    }
  }
}

/* ---------------- 塔操作面板 ---------------- */
function positionPanel(){
  const panel = $('ctx-panel');
  const g = App.game;
  if(!g || !g.selectedTower){ panel.classList.add('hidden'); return; }
  const t = g.selectedTower;
  const wrap = $('board-wrap');
  const wrapW = wrap.offsetWidth, wrapH = wrap.offsetHeight;
  panel.innerHTML = panelHTML(t);
  const pw = panel.offsetWidth || 196, ph = panel.offsetHeight || 150;
  const sx = App.ox + t.x * App.zoom, sy = App.oy + t.y * App.zoom;
  let left = sx + 24;
  if(left + pw > wrapW - 6) left = sx - pw - 24;
  let top = sy - ph/2;
  top = Math.max(6, Math.min(wrapH - ph - 6, top));
  left = Math.max(6, left);
  panel.style.left = left+'px';
  panel.style.top = top+'px';
  panel.classList.remove('hidden');

  const upBtn = panel.querySelector('.btn.up');
  if(upBtn) upBtn.addEventListener('pointerdown', ev=>{
    ev.preventDefault();
    if(App.game.upgradeTower(t)){ positionPanel(); refreshShop(); }
    else toast(t.lv>=2 ? '已是最高等级' : '金币不足!');
  });
  const sellBtn = panel.querySelector('.btn.sell');
  if(sellBtn) sellBtn.addEventListener('pointerdown', ev=>{
    ev.preventDefault();
    App.game.sellTower(t);
    positionPanel(); refreshShop();
  });
}

function panelHTML(t){
  const st = App.game.towerStat(t);
  const lvName = ['Ⅰ','Ⅱ','Ⅲ'][t.lv];
  let rows = '';
  const row = (k,v)=>'<div>'+k+' <b>'+v+'</b></div>';
  if(t.def.dtype) rows += row('伤害', st.dmg + (t.type==='flame'?'×4/秒':''));
  if(t.type==='flame') rows += row('灼烧', st.burn+'/秒');
  if(t.type==='poison') rows += row('中毒', st.poison+'/秒×'+t.def.poisonDur+'s');
  if(t.type==='frost') rows += row('减速', Math.round(st.slow*100)+'%');
  if(t.type==='lightning') rows += row('连锁', st.chains+'目标');
  if(t.type==='orb' || t.type==='cannon') rows += row('溅射', st.splash+'px');
  if(t.type==='totem') rows += row('诅咒', '+'+Math.round((st.amp-1)*100)+'%伤害');
  rows += row('射程', st.range);
  if(t.def.dtype && t.def.rate[0] !== 1) rows += row('攻速', st.rate+'s');

  let upHtml;
  if(t.lv >= 2) upHtml = '<button class="btn up" disabled>已满级</button>';
  else {
    const cost = t.def.cost[t.lv+1];
    const afford = App.game.gold >= cost;
    upHtml = '<button class="btn up'+(afford?'':' poorbtn')+'">升级 '+cost+'g</button>';
  }
  const refund = Math.floor(t.spent*0.6);
  return '<h3>'+t.def.name+' <span class="lv">Lv'+lvName+'</span></h3>'+
    '<div class="stats">'+rows+'</div>'+
    '<div class="prow">'+upHtml+
    '<button class="btn sell">卖 +'+refund+'g</button></div>';
}

/* ---------------- 关卡选择 ---------------- */
function buildLevelGrid(){
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i)=>{
    const locked = i > App.save.unlocked;
    const card = document.createElement('div');
    card.className = 'level-card' + (locked?' locked':'');
    const stars = App.save.stars[i] || 0;
    let starHtml = '';
    for(let s=0;s<3;s++) starHtml += '<span class="'+(s<stars?'on':'')+'">★</span>';
    card.innerHTML =
      '<div class="lv-num">STAGE '+(i+1)+'</div>'+
      '<div class="lv-skull">☠</div>'+
      '<canvas class="lv-thumb" width="288" height="160"></canvas>'+
      '<div class="lv-name">'+lv.name+'<br><span style="color:#5a5648;font-size:8px">'+lv.sub+'</span></div>'+
      '<div class="lv-stars">'+starHtml+'</div>'+
      (locked?'<div class="lv-lock">🔒</div>':'');
    // 缩略图(地图+装饰层合成)
    if(!App.thumbCache[i]){
      const g = new Game(i, App.sprites);
      const cv = document.createElement('canvas');
      cv.width = WORLD_W; cv.height = WORLD_H;
      const cc = cv.getContext('2d');
      cc.imageSmoothingEnabled = false;
      cc.drawImage(g.mapCv, 0, 0);
      cc.drawImage(g.decoCv, 0, 0);
      App.thumbCache[i] = cv;
    }
    const tc = card.querySelector('.lv-thumb').getContext('2d');
    tc.imageSmoothingEnabled = false;
    tc.drawImage(App.thumbCache[i], 0, 0);
    card.addEventListener('pointerdown', ev=>{
      ev.preventDefault(); Sound.init();
      if(locked){ toast('先通关前面的关卡!'); Sound.play('error'); return; }
      Sound.play('click');
      startLevel(i);
    });
    grid.appendChild(card);
  });
}

/* ---------------- 游戏流程 ---------------- */
function startLevel(idx){
  App.levelIdx = idx;
  App.game = new Game(idx, App.sprites);
  App.game.events = {
    onBanner: banner,
    onWin: (stars)=>{
      const old = App.save.stars[idx] || 0;
      App.save.stars[idx] = Math.max(old, stars);
      App.save.unlocked = Math.max(App.save.unlocked, Math.min(idx+1, LEVELS.length-1));
      saveSave(App.save);
      Sound.play('win');
      const hasNext = idx+1 < LEVELS.length;
      modal(
        '<h2 class="win">守 卫 成 功</h2>'+
        '<div class="m-stars">'+[0,1,2].map(s=>'<span class="'+(s<stars?'on':'')+'">★</span>').join('')+'</div>'+
        '<div class="m-desc">魂火仍在燃烧……<br>「'+LEVELS[idx].name+'」Clear</div>'+
        '<div class="m-btns">'+
        (hasNext?'<button class="btn btn-blood" id="m-next">下一关 ▶</button>':'')+
        '<button class="btn" id="m-retry">重新挑战</button>'+
        '<button class="btn" id="m-levels">选择关卡</button></div>'
      );
      if(hasNext) $('m-next').addEventListener('pointerdown', ()=>{ closeModal(); startLevel(idx+1); });
      $('m-retry').addEventListener('pointerdown', ()=>{ closeModal(); startLevel(idx); });
      $('m-levels').addEventListener('pointerdown', ()=>{ closeModal(); openLevels(); });
    },
    onLose: ()=>{
      Sound.play('lose');
      modal(
        '<h2 class="lose">魂 火 熄 灭</h2>'+
        '<div class="m-desc">黑暗吞噬了一切……<br>但灰烬中还能重燃微光。</div>'+
        '<div class="m-btns">'+
        '<button class="btn btn-blood" id="m-retry">再试一次</button>'+
        '<button class="btn" id="m-levels">选择关卡</button></div>'
      );
      $('m-retry').addEventListener('pointerdown', ()=>{ closeModal(); startLevel(App.levelIdx); });
      $('m-levels').addEventListener('pointerdown', ()=>{ closeModal(); openLevels(); });
    },
    onKill: ()=>{},
    onLeak: ()=>{}
  };
  App.selectedShop = null;
  App.pendingBuild = null;
  $('build-confirm').classList.add('hidden');
  App.paused = false;
  App.speed = 1;
  $('btn-speed').textContent = '×1';
  show('scr-game');
  buildShop();
  updateRotation();
  positionPanel();
  banner('「'+LEVELS[idx].name+'」— 守住魂火!', false);
}

function openLevels(){
  buildLevelGrid();
  show('scr-levels');
}

function togglePause(){
  if(!App.game || App.game.state === 'won' || App.game.state === 'lost') return;
  App.paused = !App.paused;
  if(App.paused){
    modal(
      '<h2>暂 停</h2>'+
      '<div class="m-desc">'+LEVELS[App.levelIdx].name+' · 第'+(App.game.waveIdx+1)+'波</div>'+
      '<div class="m-btns">'+
      '<button class="btn btn-blood" id="m-resume">继续守卫</button>'+
      '<button class="btn" id="m-retry">重新开始</button>'+
      '<button class="btn" id="m-levels">放弃并返回</button></div>'
    );
    $('m-resume').addEventListener('pointerdown', ()=>{ closeModal(); App.paused = false; });
    $('m-retry').addEventListener('pointerdown', ()=>{ closeModal(); startLevel(App.levelIdx); });
    $('m-levels').addEventListener('pointerdown', ()=>{ closeModal(); openLevels(); });
  } else closeModal();
}

/* ---------------- HUD 刷新 ---------------- */
function updateHud(){
  if(!App.game) return;
  const h = App.game.hud();
  const sig = h.hp+'|'+h.gold+'|'+h.wave+'|'+h.total+'|'+h.state+'|'+h.countdown;
  const callBtn = $('btn-callwave');
  if(h.state === 'countdown'){
    callBtn.classList.remove('hidden');
    callBtn.textContent = (App.game.waveIdx < 0 ? '出发! ▶ ' : '下一波 ▶ ') + h.countdown + 's';
  } else callBtn.classList.add('hidden');
  if(sig === App.hudCache) return;
  App.hudCache = sig;
  $('hud-hp').querySelector('span').textContent = h.hp;
  $('hud-gold').querySelector('span').textContent = h.gold;
  $('hud-wave').querySelector('span').textContent = h.wave+'/'+h.total;
  refreshShop();
  // 面板金币状态刷新
  if(App.game.selectedTower) positionPanel();
}

/* ---------------- 主循环 ---------------- */
function loop(now){
  App.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - App.lastT)/1000 || 0.016);
  App.lastT = now;

  if(App.screen === 'scr-game' && App.game){
    if(!App.paused && !$('modal').classList.contains('hidden') === false){}
    if(!App.paused && $('modal').classList.contains('hidden')){
      for(let i=0;i<App.speed;i++) App.game.update(dt);
    }
    const dpr = window.devicePixelRatio || 1;
    bctx.setTransform(1,0,0,1,0,0);
    bctx.fillStyle = '#050508';
    bctx.fillRect(0,0,boardCv.width,boardCv.height);
    bctx.setTransform(dpr*App.zoom, 0, 0, dpr*App.zoom, dpr*App.ox, dpr*App.oy);
    bctx.imageSmoothingEnabled = false;
    App.game.draw(bctx, App.zoom);
    updateHud();
  }
  else if(App.screen === 'scr-menu'){
    App.menuT += dt;
    drawMenuFire();
  }
}

/* ---------------- 主菜单魂火动画 ---------------- */
const mfc = $('menu-fire');
const mctx = mfc.getContext('2d');
function drawMenuFire(){
  mctx.setTransform(1,0,0,1,0,0);
  mctx.clearRect(0,0,96,96);
  mctx.imageSmoothingEnabled = false;
  const t = App.menuT;
  // 光晕
  const g = mctx.createRadialGradient(48, 52, 4, 48, 52, 46);
  g.addColorStop(0, 'rgba(120,200,255,0.35)');
  g.addColorStop(1, 'rgba(120,200,255,0)');
  mctx.fillStyle = g;
  mctx.fillRect(0,0,96,96);
  // 柴堆 ×5
  const logs = App.sprites.bonfire;
  mctx.drawImage(logs, 0, 0, logs.width, logs.height, 8, 40, 80, 80);
  // 火焰 ×5
  const fi = Math.floor(t*8) % 3;
  const fl = App.sprites.flame[fi];
  mctx.drawImage(fl, 0, 0, fl.width, fl.height, 23, 6, 50, 55);
}

/* ---------------- 全屏 / 软件横屏 ---------------- */
async function toggleFullscreen(){
  const doc = document;
  const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
  if(fsEl){
    try{
      if(doc.exitFullscreen) await doc.exitFullscreen();
      else if(doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    }catch(e){}
    App.softLandscape = false;
    updateRotation();
    return;
  }
  const el = doc.documentElement;
  let entered = false;
  try{
    if(el.requestFullscreen){ await el.requestFullscreen(); entered = true; }
    else if(el.webkitRequestFullscreen){ el.webkitRequestFullscreen(); entered = true; }
  }catch(e){}
  if(!entered){
    // iPhone 等:不支持页面全屏,退化为软件横屏模式
    App.softLandscape = !App.softLandscape;
    toast(App.softLandscape ? '已开启横屏模式:请旋转设备' : '已关闭横屏模式');
    updateRotation();
    return;
  }
  // 全屏成功:优先系统级锁定横屏(安卓),失败则软件横屏兜底
  let locked = false;
  try{
    if(screen.orientation && screen.orientation.lock){
      await screen.orientation.lock('landscape');
      locked = true;
    }
  }catch(e){}
  if(!locked){
    App.softLandscape = true;
    toast('已开启软件横屏:请旋转设备');
  }
  updateRotation();
}

$('btn-fs').addEventListener('pointerdown', ()=>{ Sound.init(); Sound.play('click'); toggleFullscreen(); });
$('bc-ok').addEventListener('pointerdown', ev=>{
  ev.preventDefault();
  if(App.pendingBuild && App.game && App.game.buildType)
    doBuild(App.pendingBuild.gx, App.pendingBuild.gy);
});
$('bc-no').addEventListener('pointerdown', ev=>{
  ev.preventDefault();
  cancelPendingBuild();
  Sound.play('click');
});

/* ---------------- 按钮绑定 ---------------- */
$('btn-start').addEventListener('pointerdown', ()=>{ Sound.init(); Sound.play('click'); startLevel(Math.min(App.save.unlocked, LEVELS.length-1)); });
$('btn-levels').addEventListener('pointerdown', ()=>{ Sound.init(); Sound.play('click'); openLevels(); });
$('btn-back-menu').addEventListener('pointerdown', ()=>{ Sound.play('click'); show('scr-menu'); });
$('btn-pause').addEventListener('pointerdown', ()=>{ Sound.init(); Sound.play('click'); togglePause(); });
$('btn-speed').addEventListener('pointerdown', ()=>{
  Sound.init(); Sound.play('click');
  App.speed = App.speed === 1 ? 2 : 1;
  $('btn-speed').textContent = '×'+App.speed;
});
$('btn-callwave').addEventListener('pointerdown', ()=>{
  Sound.init();
  if(App.game) App.game.callWave();
});

function syncMuteButtons(){
  const m = Sound.muted;
  $('btn-mute').textContent = m ? '♪ 音效:关' : '♪ 音效:开';
  $('btn-mute2').textContent = m ? '✕' : '♪';
}
[$('btn-mute'), $('btn-mute2')].forEach(b=>b.addEventListener('pointerdown', ()=>{
  Sound.init();
  Sound.setMuted(!Sound.muted);
  App.save.muted = Sound.muted;
  saveSave(App.save);
  syncMuteButtons();
}));
$('btn-reset').addEventListener('pointerdown', ()=>{
  modal(
    '<h2 class="lose">重置进度?</h2>'+
    '<div class="m-desc">所有关卡的星级与解锁将被清除,<br>此操作无法撤销。</div>'+
    '<div class="m-btns">'+
    '<button class="btn btn-blood" id="m-yes">确认重置</button>'+
    '<button class="btn" id="m-no">取消</button></div>'
  );
  $('m-yes').addEventListener('pointerdown', ()=>{
    App.save = {unlocked:0, stars:{}, muted:Sound.muted};
    saveSave(App.save);
    closeModal();
    toast('进度已重置');
  });
  $('m-no').addEventListener('pointerdown', closeModal);
});

/* 阻止移动端双击缩放/长按菜单 */
document.addEventListener('gesturestart', ev=>ev.preventDefault());
document.addEventListener('contextmenu', ev=>{ if(App.screen==='scr-game') ev.preventDefault(); });
document.addEventListener('dblclick', ev=>ev.preventDefault());

/* ---------------- 启动 ---------------- */
App.sprites = buildAllSprites();
syncMuteButtons();
show('scr-menu');
updateRotation();
requestAnimationFrame(t=>{ App.lastT = t; loop(t); });

/* 调试/测试只读入口 */
window.__SF = App;

})();
