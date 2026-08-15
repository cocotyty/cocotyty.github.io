/* =============================================
   星穹编年史 · 状态管理 + 持久化
   ============================================= */

const Store = {
  _data: {
    screen: 'splash',
    config: null,
    game: null
  },

  _listeners: {},

  /* ---- 初始化 ---- */
  init() {
    const saved = localStorage.getItem('ss_config');
    if (saved) {
      try {
        this._data.config = JSON.parse(saved);
      } catch {
        this._data.config = null;
      }
    }
    if (!this._data.config) {
      this._data.config = this._defaultConfig();
    }
  },

  _defaultConfig() {
    return {
      apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: '',
      model: 'deepseek-v4-flash',
      temperature: 0.9,
      debugMode: false
    };
  },

  /* ---- 通用 get/set ---- */
  get(key) {
    return this._data[key];
  },

  set(key, val) {
    this._data[key] = val;
    this._emit('change:' + key, val);
    return val;
  },

  /* ---- Config ---- */
  getConfig() {
    return this._data.config;
  },

  saveConfig() {
    localStorage.setItem('ss_config', JSON.stringify(this._data.config));
  },

  /* ---- Game Save (Multi-slot) ---- */
  getGame() {
    return this._data.game;
  },

  setGame(game) {
    this._data.game = game;
  },

  _nextSlotId() {
    const index = this._loadSaveIndex();
    let max = 0;
    for (const entry of index) {
      const num = parseInt(entry.slot.replace('slot_', ''));
      if (num > max) max = num;
    }
    return 'slot_' + (max + 1);
  },

  saveGame(slot) {
    if (!this._data.game) return false;
    if (!slot) {
      // Check if current game already has a slot
      slot = this._data.game.meta._slot;
      if (!slot) {
        slot = this._nextSlotId();
        this._data.game.meta._slot = slot;
      }
    }
    this._data.game.meta.updatedAt = new Date().toISOString();
    localStorage.setItem('ss_' + slot, JSON.stringify(this._data.game));
    this._updateSaveIndex(slot);
    return slot;
  },

  loadGame(slot) {
    if (!slot) {
      const index = this._loadSaveIndex();
      if (index.length === 0) return null;
      slot = index[index.length - 1].slot;
    }
    const saved = localStorage.getItem('ss_' + slot);
    if (!saved) return null;
    try {
      this._data.game = JSON.parse(saved);
    } catch {
      this._data.game = null;
    }
    return this._data.game;
  },

  loadGameBySlot(slot) {
    return this.loadGame(slot);
  },

  hasSavedGames() {
    return this._loadSaveIndex().length > 0;
  },

  deleteSaveBySlot(slot) {
    localStorage.removeItem('ss_' + slot);
    const index = this._loadSaveIndex().filter(e => e.slot !== slot);
    localStorage.setItem('ss_save_index', JSON.stringify(index));
    if (this._data.game && this._data.game.meta._slot === slot) {
      this._data.game = null;
    }
  },

  updateSaveDice(slot, diceResults, worldName) {
    const game = this.loadGameBySlot(slot);
    if (!game) return false;
    game.diceResults = diceResults;
    game.worldBible = DiceSystem.generateWorldBibleXml(diceResults);
    game.worldSummary = DiceSystem.generateLlmSummary(diceResults);
    if (worldName) game.meta.name = worldName;
    this._data.game = game;
    this.saveGame(slot);
    return true;
  },

  listAllSaves() {
    return this._loadSaveIndex()
      .map(entry => {
        const data = localStorage.getItem('ss_' + entry.slot);
        if (!data) return null;
        try {
          const game = JSON.parse(data);
          return {
            slot: entry.slot,
            name: entry.name,
            turn: entry.turn,
            chapter: entry.chapter,
            updated: entry.updated,
            diceResults: game.diceResults || null,
            hasHistory: (game.history || []).length > 0
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
  },

  _updateSaveIndex(slot) {
    const game = this._data.game;
    if (!game) return;
    const index = this._loadSaveIndex();
    const entry = {
      slot,
      name: game.meta.name || '未命名',
      turn: game.meta.totalTurns || 0,
      chapter: game.meta.currentChapter || 1,
      updated: game.meta.updatedAt
    };
    const existing = index.findIndex(e => e.slot === slot);
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.push(entry);
    }
    localStorage.setItem('ss_save_index', JSON.stringify(index));
  },

  _loadSaveIndex() {
    const saved = localStorage.getItem('ss_save_index');
    if (!saved) return [];
    try { return JSON.parse(saved); } catch { return []; }
  },

  getSaveIndex() {
    return this._loadSaveIndex();
  },

  /* ---- Debug Preset ---- */
  getDebugPreset() {
    return {
      meta: {
        name: '预设世界·万界交汇',
        saveId: 'DEBUG-' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalTurns: 0,
        currentAct: 1,
        currentChapter: 1
      },
      worldBible: `<?xml version="1.0"?>
<world_bible version="1.0">
  <meta_rules>
    <fundamental_law>混搭——科学与修真共存</fundamental_law>
    <time_flow>线性</time_flow>
    <death_rule>轮回转世</death_rule>
    <space_structure>多维世界叠层</space_structure>
  </meta_rules>
  <cosmic_setting>
    <civilization_form>修真联盟·万宗林立</civilization_form>
    <power_system>修真·炼气化神</power_system>
    <cosmic_atmosphere>大探索时代</cosmic_atmosphere>
    <core_resource>灵脉灵气</core_resource>
    <primary_threat>上古封印松动</primary_threat>
    <social_structure>实力为尊</social_structure>
  </cosmic_setting>
  <protagonist>
    <name>???</name>
    <birthright>散修遗孤</birthright>
    <talent>剑心通明</talent>
    <personality>冷静</personality>
    <core_desire>追寻真相</core_desire>
    <hidden_identity>穿越者</hidden_identity>
    <flaw>关键记忆封印</flaw>
  </protagonist>
</world_bible>`,
      worldSummary: `世界法则: 混搭——科学与修真共存 | 时间: 线性 | 死亡: 轮回转世 | 空间: 多维世界叠层
文明: 修真联盟·万宗林立 | 力量: 修真·炼气化神 | 气氛: 大探索时代
资源: 灵脉灵气 | 威胁: 上古封印松动 | 社会: 实力为尊
主角出身: 散修遗孤 | 天赋: 剑心通明 | 性格: 冷静
欲望: 追寻真相 | 隐藏身份: 穿越者 | 缺陷: 关键记忆封印
流派: 仙侠·修真问道 | 标签: 灵气复苏·万物觉醒 / 热血王道·永不言弃
开场: 破败古庙的偏殿中 | 状态: 刚刚苏醒·记忆全失 | 物品: 一枚家传的玉佩`,
      state: {
        protagonist: {
          realm: '练气期',
          statusEffects: ['记忆封印'],
          inventory: ['家传玉佩']
        },
        npcs: {},
        flags: { debugMode: true },
        currentLocation: '破败古庙'
      },
      history: [],
      storyOutline: null
    };
  },

  /* ---- Events ---- */
  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
  },

  off(event, fn) {
    const fns = this._listeners[event];
    if (!fns) return;
    this._listeners[event] = fns.filter(f => f !== fn);
  },

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
};
