/* ============================================================
 * 征服纪元 · main.js — 启动与主菜单(浏览器入口)
 * ============================================================ */
(function (G) {
  'use strict';
  const { FACTIONS, FACTION_IDS, MAP_SIZES } = G;
  const $ = (id) => document.getElementById(id);

  const setup = {
    size: 'L',
    players: 4,
    faction: 'castle',
    difficulty: 'normal',
  };

  function init() {
    /* 主菜单 */
    const sizeSel = $('opt-size');
    for (const k of Object.keys(MAP_SIZES)) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = MAP_SIZES[k].label;
      sizeSel.appendChild(o);
    }
    sizeSel.value = 'L';
    sizeSel.onchange = () => {
      setup.size = sizeSel.value;
      const rec = { S: 2, M: 4, L: 6, XL: 8 }[setup.size];
      const ps = $('opt-players');
      ps.innerHTML = '';
      for (let i = 2; i <= 8; i++) {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = i + ' 家' + (i === rec ? '(推荐)' : '');
        ps.appendChild(o);
      }
      ps.value = rec;
      setup.players = rec;
    };
    $('opt-players').onchange = () => setup.players = parseInt($('opt-players').value, 10);
    $('opt-diff').onchange = () => setup.difficulty = $('opt-diff').value;
    /* 种族卡 */
    const frow = $('faction-row');
    for (const fid of FACTION_IDS) {
      const f = FACTIONS[fid];
      const card = document.createElement('div');
      card.className = 'fac-card' + (fid === setup.faction ? ' sel' : '');
      card.dataset.fac = fid;
      card.innerHTML = `<div class="fc-emoji">${f.emoji}</div><h3>${f.name}</h3><p>${f.desc}</p>
        <div class="fc-units">${f.units.map(u => `<span title="${G.CREATURES[u].name}">${G.CREATURES[u].emoji}</span>`).join('')}</div>`;
      card.onclick = () => {
        setup.faction = fid;
        document.querySelectorAll('.fac-card').forEach(c2 => c2.classList.toggle('sel', c2 === card));
      };
      frow.appendChild(card);
    }
    $('btn-start').onclick = () => startNew();
    const hasSave = !!G.Game.loadGame('auto');
    $('btn-continue').style.display = hasSave ? '' : 'none';
    $('btn-continue').onclick = () => {
      const g = G.Game.loadGame('auto');
      if (!g) return;
      enterGame(g, false);
    };
    $('btn-back').onclick = () => { window.location.href = '../index.html'; };
    /* 游戏内按钮 */
    G.UI.bindBattleInput();
    $('btn-menu').onclick = () => G.UI.openMenuModal();
    $('btn-next-hero').onclick = () => G.UI.nextHero();
    $('btn-end-turn').onclick = () => G.UI.endTurnClick();
  }

  function startNew() {
    const g = G.Game.newGame({
      size: setup.size,
      players: setup.players,
      playerFaction: setup.faction,
      difficulty: setup.difficulty,
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
    });
    G.Battle.setBattleRng(() => G.Game.rnd(g));
    enterGame(g, true);
  }

  function enterGame(g, fresh) {
    $('screen-menu').classList.add('hidden');
    $('game').classList.remove('hidden');
    G.UI.init();
    G.UI.game = g;
    G.UI.start(g, fresh);
    if (fresh) G.Game.saveGame(g, 'auto');
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.HOMM);
