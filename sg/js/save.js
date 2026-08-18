/* ============================================================
 * 三国烽火 · 存档系统
 * localStorage 键:
 *   sg_save_index   : [{slot, name, turn, date}] 槽位摘要
 *   sg_slot_0..5    : 完整对局 JSON
 *   sg_last         : 最近一次自动保存(含 index)
 * 自动保存:每月结束回合后写入当前槽 + sg_last
 * ============================================================ */
'use strict';

const SGSave = (() => {
  const KEY_INDEX = 'sg_save_index';
  const KEY_SLOT = (i) => 'sg_slot_' + i;
  const KEY_LAST = 'sg_last';
  const SLOTS = 6;

  const hasLS = (() => {
    try { localStorage.setItem('_sg_t', '1'); localStorage.removeItem('_sg_t'); return true; }
    catch (e) { return false; }
  })();
  const mem = {};
  const store = {
    get(k) { if (hasLS) return localStorage.getItem(k); return mem[k] || null; },
    set(k, v) { try { if (hasLS) localStorage.setItem(k, v); else mem[k] = v; } catch (e) { /* 空间满:丢最旧 */ } },
    del(k) { if (hasLS) localStorage.removeItem(k); else delete mem[k]; },
  };

  function getIndex() {
    try { return JSON.parse(store.get(KEY_INDEX) || '[]'); } catch (e) { return []; }
  }
  function setIndex(idx) { store.set(KEY_INDEX, JSON.stringify(idx)); }

  function metaOf(g) {
    const f = g.factions[g.playerFaction] || { name: '?' };
    const dif = ['简单', '普通', '困难'][g.difficulty] || '';
    return {
      name: `${f.name} · ${dif} · ${g.year}年${g.month}月`,
      ruler: f.ruler, faction: g.playerFaction,
      turn: g.turn, cities: SGEngine.factionCities(g, g.playerFaction).length,
      date: Date.now(),
    };
  }

  /* 保存到槽(0..5)。auto=true 时同步写 sg_last */
  function save(slot, g, auto) {
    if (slot < 0 || slot >= SLOTS) return { ok: false, msg: '槽位无效' };
    const payload = JSON.stringify(g);
    try {
      store.set(KEY_SLOT(slot), payload);
    } catch (e) {
      return { ok: false, msg: '存储空间不足' };
    }
    const idx = getIndex().filter(x => x.slot !== slot);
    idx.push({ slot, ...metaOf(g) });
    setIndex(idx);
    if (auto) store.set(KEY_LAST, JSON.stringify({ slot, at: Date.now() }));
    return { ok: true, msg: auto ? '已自动保存' : `已保存至存档 ${slot + 1}` };
  }

  function load(slot) {
    try {
      const raw = store.get(KEY_SLOT(slot));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function remove(slot) {
    store.del(KEY_SLOT(slot));
    setIndex(getIndex().filter(x => x.slot !== slot));
    return { ok: true };
  }

  function lastSlot() {
    try {
      const raw = store.get(KEY_LAST);
      if (!raw) return null;
      return JSON.parse(raw).slot;
    } catch (e) { return null; }
  }

  /* 恢复对局时需要重建的运行时字段(JSON 存档不含函数,数据全量可序列化) */
  function revive(g) {
    if (!g) return null;
    g.battles = g.battles || [];
    g.moves = g.moves || [];
    g.log = g.log || [];
    return g;
  }

  return { SLOTS, save, load, remove, getIndex, lastSlot, revive, metaOf };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGSave;
