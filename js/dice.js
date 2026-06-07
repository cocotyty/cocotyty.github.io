/* =============================================
   星穹编年史 · 骰子系统 + 世界生成
   ============================================= */

const DiceSystem = {
  data: null,
  _resultCache: null,

  /* ---- 加载骰子数据 ---- */
  async load() {
    if (this.data) return this.data;
    const resp = await fetch('data/cosmology-dice.json');
    this.data = await resp.json();
    return this.data;
  },

  getData() {
    return this.data;
  },

  /* ---- 掷骰 ---- */
  rollDie(die) {
    const idx = Math.floor(Math.random() * die.faces.length);
    return {
      dieId: die.id,
      label: die.label,
      value: die.faces[idx],
      faceIndex: idx,
      totalFaces: die.faces.length
    };
  },

  rollLayer(layer) {
    return {
      layerId: layer.id,
      layerName: layer.name,
      results: layer.dice.map(d => this.rollDie(d))
    };
  },

  rollAll() {
    if (!this.data) return null;
    const results = this.data.layers.map(l => this.rollLayer(l));
    this._resultCache = this._applyGenreOverrides(results);
    return this._resultCache;
  },

  _getGenre(results) {
    const tagLayer = results.find(l => l.layerId === 'tags');
    if (!tagLayer) return null;
    const genreDie = tagLayer.results.find(r => r.dieId === 'genre');
    return genreDie ? genreDie.value : null;
  },

  _applyGenreOverrides(results) {
    if (!this.data || !results) return results;
    const genre = this._getGenre(results);
    if (!genre) return results;

    // 第一步：把所有曾有流派映射的骰子还原到原始 faces 值
    //（处理流派变更后旧映射残留的问题）
    for (const layer of this.data.layers) {
      for (const die of layer.dice) {
        if (!die.genre_faces) continue;
        const layerResult = results.find(l => l.layerId === layer.id);
        if (!layerResult) continue;
        const dieResult = layerResult.results.find(r => r.dieId === die.id);
        if (!dieResult) continue;
        if (dieResult.faceIndex < die.faces.length) {
          dieResult.value = die.faces[dieResult.faceIndex];
          dieResult.totalFaces = die.faces.length;
        }
      }
    }

    // 第二步：对当前流派有映射的骰子，替换为流派适配值
    for (const layer of this.data.layers) {
      for (const die of layer.dice) {
        if (!die.genre_faces || !die.genre_faces[genre]) continue;
        const alternatives = die.genre_faces[genre];
        const layerResult = results.find(l => l.layerId === layer.id);
        if (!layerResult) continue;
        const dieResult = layerResult.results.find(r => r.dieId === die.id);
        if (!dieResult) continue;
        const idx = Math.min(dieResult.faceIndex, alternatives.length - 1);
        dieResult.value = alternatives[idx];
        dieResult.totalFaces = alternatives.length;
      }
    }
    return results;
  },

  rerollDie(layerId, dieId) {
    if (!this._resultCache) return null;
    const layer = this._resultCache.find(l => l.layerId === layerId);
    if (!layer) return null;
    const dieData = this._findDieData(layerId, dieId);
    if (!dieData) return null;
    const dieIdx = layer.results.findIndex(r => r.dieId === dieId);
    if (dieIdx < 0) return null;
    layer.results[dieIdx] = this.rollDie(dieData);
    // Re-apply genre overrides in case genre changed or other dice need remapping
    this._resultCache = this._applyGenreOverrides(this._resultCache);
    return layer.results[dieIdx];
  },

  getCurrentResults() {
    return this._resultCache;
  },

  _findDieData(layerId, dieId) {
    if (!this.data) return null;
    const layer = this.data.layers.find(l => l.id === layerId);
    if (!layer) return null;
    return layer.dice.find(d => d.id === dieId);
  },

  /* ---- World Bible XML 生成 ---- */
  generateWorldBibleXml(results) {
    const layers = {};
    results.forEach(layer => {
      layers[layer.layerId] = {};
      layer.results.forEach(r => {
        layers[layer.layerId][r.dieId] = r.value;
      });
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<world_bible version="1.0">
  <meta>
    <save_id>STORY-${Date.now().toString(36).toUpperCase()}</save_id>
    <created_at>${new Date().toISOString()}</created_at>
    <playthrough>1</playthrough>
    <chapter>1</chapter>
    <turn>0</turn>
  </meta>
  <meta_rules>
    <fundamental_law>${this._escapeXml(layers.meta_rules?.world_type || '未知')}</fundamental_law>
    <time_flow>${this._escapeXml(layers.meta_rules?.time_flow || '线性')}</time_flow>
    <death_rule>${this._escapeXml(layers.meta_rules?.death_rule || '永久死亡')}</death_rule>
    <space_structure>${this._escapeXml(layers.meta_rules?.space_structure || '未知')}</space_structure>
  </meta_rules>
  <cosmic_setting>
    <civilization_form>${this._escapeXml(layers.cosmic?.civilization || '未知')}</civilization_form>
    <power_system>${this._escapeXml(layers.cosmic?.power_system || '未知')}</power_system>
    <cosmic_atmosphere>${this._escapeXml(layers.cosmic?.atmosphere || '未知')}</cosmic_atmosphere>
    <core_resource>${this._escapeXml(layers.cosmic?.resource || '未知')}</core_resource>
    <primary_threat>${this._escapeXml(layers.cosmic?.threat || '未知')}</primary_threat>
    <social_structure>${this._escapeXml(layers.cosmic?.society || '未知')}</social_structure>
  </cosmic_setting>
  <protagonist>
    <name>???</name>
    <birthright>${this._escapeXml(layers.protagonist?.origin || '未知')}</birthright>
    <talent>${this._escapeXml(layers.protagonist?.talent || '无')}</talent>
    <personality>${this._escapeXml(layers.protagonist?.personality || '冷静')}</personality>
    <core_desire>${this._escapeXml(layers.protagonist?.desire || '未知')}</core_desire>
    <hidden_identity>${this._escapeXml(layers.protagonist?.hidden_id || '无')}</hidden_identity>
    <flaw>${this._escapeXml(layers.protagonist?.flaw || '无')}</flaw>
    <power_level>
      <realm>凡体期</realm>
      <status>记忆封印·轻伤</status>
    </power_level>
  </protagonist>
  <initial_situation>
    <opening_scene>${this._escapeXml(layers.initial?.location || '未知')}</opening_scene>
    <initial_state>${this._escapeXml(layers.initial?.state || '未知')}</initial_state>
    <carried_item>${this._escapeXml(layers.initial?.item || '无')}</carried_item>
  </initial_situation>
</world_bible>`;
  },

  /* ---- 人类可读的世界摘要 ---- */
  generateSummary(results) {
    if (!results) return '未生成世界';
    const parts = [];
    results.forEach(layer => {
      const items = layer.results.map(r => `${r.label}: ${r.value}`);
      parts.push(`【${layer.layerName}】\n  ${items.join('\n  ')}`);
    });
    return parts.join('\n\n');
  },

  /* ---- 给LLM的简洁摘要 ---- */
  generateLlmSummary(results) {
    if (!results) return '';
    const map = {};
    results.forEach(layer => {
      layer.results.forEach(r => {
        map[r.dieId] = r.value;
      });
    });

    const lines = [
      `世界法则: ${map.world_type || '未知'} | 时间: ${map.time_flow || '线性'} | 死亡: ${map.death_rule || '永久'} | 空间: ${map.space_structure || '未知'}`,
      `文明: ${map.civilization || '未知'} | 力量: ${map.power_system || '未知'} | 气氛: ${map.atmosphere || '未知'}`,
      `资源: ${map.resource || '未知'} | 威胁: ${map.threat || '未知'} | 社会: ${map.society || '未知'}`,
      `主角出身: ${map.origin || '未知'} | 天赋: ${map.talent || '无'} | 性格: ${map.personality || '冷静'}`,
      `欲望: ${map.desire || '未知'} | 隐藏身份: ${map.hidden_id || '无'} | 缺陷: ${map.flaw || '无'}`,
      `流派: ${map.genre || '未知'} | 标签: ${map.trope_a || '无'} / ${map.trope_b || '无'}`,
      `开场: ${map.location || '未知'} | 状态: ${map.state || '未知'} | 物品: ${map.item || '无'}`
    ];
    return lines.join('\n');
  },

  /* ---- 世界名生成 ---- */
  generateWorldName(results) {
    if (!results) return '未命名世界';
    const map = {};
    results.forEach(layer => {
      layer.results.forEach(r => { map[r.dieId] = r.value; });
    });

    const civ = (map.civilization || '').replace(/[··].*$/, '').trim() || '星海';
    const origin = (map.origin || '').replace(/[··].*$/, '').trim() || '流浪者';
    const genre = (map.genre || '').replace(/[··].*$/, '').trim() || '未知';
    const trope = (map.trope_a || '').replace(/[··].*$/, '').trim() || '冒险';
    const loc = (map.location || '').replace(/[··].*$/, '').trim() || '星海';
    const desire = (map.desire || '').trim() || '远行';
    const atmosphere = (map.atmosphere || '').replace(/[··].*$/, '').trim() || '无尽';
    const power = (map.power_system || '').replace(/[··].*$/, '').trim() || '未知';

    const templates = [
      `${civ}·${origin}的${desire}`,
      `${genre}·${trope}`,
      `${atmosphere}·${civ}`,
      `${loc}·${power}`,
      `${origin}·${desire}`,
      `${civ}·${trope}`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  },

  /* ---- 解析骰子结果为map ---- */
  resultsToMap(results) {
    if (!results) return {};
    const map = {};
    results.forEach(layer => {
      layer.results.forEach(r => { map[r.dieId] = r.value; });
    });
    return map;
  },

  _escapeXml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
};
