/* =============================================
   星穹编年史 · 主应用逻辑 (完整版)
   ============================================= */

const App = {
  _isProcessing: false,
  _editingSlot: null,
  _pendingDeleteSlot: null,
  _pendingDeleteName: '',
  _reasoningInterval: null,
  _elapsedTimer: null,
  _reasoningStart: null,
  _reasoningMsgIdx: 0,
  _reasoningMsgs: [],
  _reasoningSubs: [],

  _skipHash: false,

  /* ===== INIT ===== */
  async init() {
    Store.init();
    Starfield.init('starfield');

    await DiceSystem.load();

    const config = Store.getConfig();
    if (config.debugMode) {
      const preset = Store.getDebugPreset();
      Store.setGame(preset);
      Pacing.init(preset.pacing);
      const genreMatch = preset.worldSummary.match(/流派[：:]?\s*(.+?)(?:\s*\||$)/);
      if (genreMatch) Pacing.genre = genreMatch[1].trim();
    }

    this._bindNavigation();
    this._bindSettings();
    this._bindPlay();
    this._bindMenu();
    this._bindApiPrompt();
    this._bindStatusToggle();
    this._bindHashRouting();
    this._restoreScreen();
  },

  /* ===== STATS DISPLAY ===== */
  _updateStatsDisplay() {
    const el = document.getElementById('token-stats');
    if (!el) return;
    const config = Store.getConfig();
    const model = config.model || 'deepseek-v4-flash';
    const totalUsage = MessageStore.totalUsage();
    el.textContent = TokenStats.formatReportHTML(totalUsage, model);
  },

  /* ===== SCREEN MGMT ===== */
  showScreen(name, pushState) {
    if (pushState !== false && location.hash.slice(1) !== name) {
      this._skipHash = true;
      if (pushState === 'replace') {
        history.replaceState(null, '', '#' + name);
      } else {
        history.pushState(null, '', '#' + name);
      }
      this._skipHash = false;
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) {
      el.classList.add('active');
      const inner = el.querySelector('.screen-inner');
      if (inner) inner.scrollTop = 0;
    }
    Store.set('screen', name);
    this._onScreenEnter(name);
  },

  _bindHashRouting() {
    window.addEventListener('popstate', () => {
      if (this._skipHash) return;
      const name = location.hash.slice(1) || 'splash';
      this.showScreen(name, false);
    });
  },

  _onScreenEnter(name) {
    if (name === 'settings') this._populateSettings();
    if (name === 'world-gen') this._initDiceScreen();
    if (name === 'splash') this._renderBookshelf();
    if (name === 'edit') this._initEditScreen();
  },

  _restoreScreen() {
    const config = Store.getConfig();
    if (config.debugMode && Store.getGame()) {
      const game = Store.getGame();
      if (game.messageStore) {
        MessageStore.fromState(game.messageStore);
      } else {
        MessageStore.reset();
      }
      this.showScreen('play', 'replace');
      this._loadPlayContent();
    } else {
      this.showScreen('splash', 'replace');
    }
  },

  /* ===== NAVIGATION ===== */
  _bindNavigation() {
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => this.showScreen(btn.dataset.goto));
    });

    document.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', () => history.back());
    });

    document.getElementById('btn-new-game').addEventListener('click', () => {
      const config = Store.getConfig();
      if (config.debugMode) {
        const preset = Store.getDebugPreset();
        Store.setGame(preset);
        Pacing.init(preset.pacing);
        const genreMatch = preset.worldSummary.match(/流派[：:]?\s*(.+?)(?:\s*\||$)/);
        if (genreMatch) Pacing.genre = genreMatch[1].trim();
        this.showScreen('play');
        this._loadPlayContent();
      } else if (!config.apiKey) {
        this._showApiPrompt();
      } else {
        this.showScreen('world-gen');
      }
    });

    document.getElementById('btn-confirm-world').addEventListener('click', () => this._confirmWorld());

    // Edit screen
    document.getElementById('btn-edit-back').addEventListener('click', () => history.back());
    document.getElementById('btn-edit-save').addEventListener('click', () => this._saveEditWorld());
    document.getElementById('btn-edit-delete').addEventListener('click', () => this._confirmDeleteWorld());

    // Confirm dialog
    document.getElementById('confirm-yes').addEventListener('click', () => this._doDeleteWorld());
    document.getElementById('confirm-no').addEventListener('click', () => this._closeConfirm());
    document.getElementById('confirm-bg').addEventListener('click', () => this._closeConfirm());
  },

  /* ===== BOOKSHELF ===== */
  _renderBookshelf() {
    const container = document.getElementById('bookshelf');
    const emptyEl = document.getElementById('bookshelf-empty');
    const saves = Store.listAllSaves();

    // Remove old world cards
    container.querySelectorAll('.world-card').forEach(el => el.remove());

    if (saves.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';

    saves.forEach(save => {
      const card = document.createElement('div');
      card.className = 'world-card';
      card.dataset.slot = save.slot;

      const star = document.createElement('div');
      star.className = 'world-card-star';
      star.textContent = '⭐';

      const info = document.createElement('div');
      info.className = 'world-card-info';

      const name = document.createElement('div');
      name.className = 'world-card-name';
      name.textContent = save.name;

      const meta = document.createElement('div');
      meta.className = 'world-card-meta';
      const timeAgo = this._timeAgo(new Date(save.updated));
      meta.innerHTML = `<span class="meta-chapter">第${save.chapter}章</span> · ${save.turn}回合 · <span class="meta-time">${timeAgo}</span>`;

      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'world-card-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'world-card-btn';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._editWorld(save.slot);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'world-card-btn danger';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._pendingDeleteSlot = save.slot;
        this._pendingDeleteName = save.name;
        this._showConfirm(`删除「${save.name}」？`, '此世界将被永久移除');
      });

      const playBtn = document.createElement('button');
      playBtn.className = 'world-card-btn';
      playBtn.textContent = '▶';
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._loadSaveAndPlay(save.slot);
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      actions.appendChild(playBtn);

      card.appendChild(star);
      card.appendChild(info);
      card.appendChild(actions);

      // Click card to play
      card.addEventListener('click', () => this._loadSaveAndPlay(save.slot));

      container.appendChild(card);
    });

    // Update API status indicator
    const statusEl = document.getElementById('api-status');
    const config = Store.getConfig();
    if (config.apiKey) {
      statusEl.textContent = '⚡ 已连接';
      statusEl.className = 'api-status';
    } else {
      statusEl.textContent = '⚠ 未配置';
      statusEl.className = 'api-status warning';
    }
  },

  _loadSaveAndPlay(slot) {
    const game = Store.loadGameBySlot(slot);
    if (game) {
      Pacing.init(game.pacing);
      if (!Pacing.genre && game.diceResults) {
        Pacing.genre = DiceSystem._getGenre(game.diceResults);
      }
      if (game.messageStore) {
        MessageStore.fromState(game.messageStore);
      } else {
        MessageStore.reset();
      }
      this.showScreen('play');
      this._loadPlayContent();
    }
  },

  _timeAgo(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
    return Math.floor(diff / 2592000) + '月前';
  },

  /* ===== EDIT / DELETE ===== */
  _editWorld(slot) {
    this._editingSlot = slot;
    this.showScreen('edit');
  },

  _initEditScreen() {
    if (!this._editingSlot) return;
    const game = Store.loadGameBySlot(this._editingSlot);
    if (!game) return;

    document.getElementById('edit-world-name').value = game.meta.name || '';

    const results = game.diceResults || DiceSystem.rollAll();
    const container = document.getElementById('edit-dice-container');
    container.innerHTML = '';

    const data = DiceSystem.getData();
    if (!data) return;

    // Build a map of current results & face indices
    const resultMap = {};
    const faceIdxMap = {};
    (results || []).forEach(layer => {
      layer.results.forEach(r => {
        resultMap[layer.layerId + ':' + r.dieId] = r.value;
        faceIdxMap[layer.layerId + ':' + r.dieId] = r.faceIndex || 0;
      });
    });

    data.layers.forEach(layer => {
      const section = document.createElement('div');
      section.className = 'pill-layer';

      const title = document.createElement('h3');
      title.className = 'pill-layer-title';
      title.textContent = layer.name;
      section.appendChild(title);

      const group = document.createElement('div');
      group.className = 'pill-group';

      layer.dice.forEach(die => {
        const key = layer.id + ':' + die.id;
        const currentVal = resultMap[key];
        const startIdx = faceIdxMap[key] !== undefined ? faceIdxMap[key] : die.faces.indexOf(currentVal);
        let faceIdx = startIdx >= 0 ? startIdx : 0;

        const pill = document.createElement('span');
        pill.className = 'pill pill-editable';
        pill.dataset.key = key;
        pill.innerHTML = `<span class="pill-label">${die.label}</span><span class="pill-value">${currentVal || die.faces[0]}</span>`;

        pill.addEventListener('click', () => {
          faceIdx = (faceIdx + 1) % die.faces.length;
          const newVal = die.faces[faceIdx];
          pill.querySelector('.pill-value').textContent = newVal;
          pill.classList.remove('pill-flash');
          void pill.offsetWidth;
          pill.classList.add('pill-flash');
        });

        group.appendChild(pill);
      });

      section.appendChild(group);
      container.appendChild(section);
    });

    this._renderEditStyleCards(game.writingStyle || 'default');
  },

  _saveEditWorld() {
    const slot = this._editingSlot;
    if (!slot) return;

    const worldName = document.getElementById('edit-world-name').value.trim();
    if (!worldName) {
      this._flashMessage('请输入世界名称');
      return;
    }

    // Read current results from the UI select elements
    const data = DiceSystem.getData();
    if (!data) return;

    const results = [];

    data.layers.forEach(layer => {
      const layerResults = { layerId: layer.id, layerName: layer.name, results: [] };
      layer.dice.forEach(die => {
        const key = layer.id + ':' + die.id;
        const pill = document.querySelector(`.pill-editable[data-key="${key}"] .pill-value`);
        const val = pill ? pill.textContent.trim() : die.faces[0];
        layerResults.results.push({
          dieId: die.id,
          label: die.label,
          value: val,
          faceIndex: die.faces.indexOf(val),
          totalFaces: die.faces.length
        });
      });
      results.push(layerResults);
    });

    Store.updateSaveDice(slot, results, worldName);
    Store.loadGameBySlot(slot);
    var game = Store.getGame();
    if (game) {
      game.writingStyle = this._selectedStyle || 'default';
      Store.saveGame();
    }
    this._flashMessage('已保存');
    this.showScreen('splash');
  },

  _confirmDeleteWorld() {
    if (this._editingSlot) {
      this._pendingDeleteSlot = this._editingSlot;
      this._pendingDeleteName = document.getElementById('edit-world-name').value || '此世界';
      this._showConfirm(`删除「${this._pendingDeleteName}」？`, '所有进度将被永久移除');
    }
  },

  _showConfirm(text, sub) {
    document.getElementById('confirm-text').textContent = text;
    document.getElementById('confirm-sub').textContent = sub || '';
    document.getElementById('confirm-dialog').style.display = 'flex';
  },

  _closeConfirm() {
    document.getElementById('confirm-dialog').style.display = 'none';
    this._pendingDeleteSlot = null;
  },

  _doDeleteWorld() {
    if (this._pendingDeleteSlot) {
      Store.deleteSaveBySlot(this._pendingDeleteSlot);
      this._closeConfirm();
      this._flashMessage('已删除');
      this.showScreen('splash');
    }
  },

  _showApiPrompt() {
    const config = Store.getConfig();
    document.getElementById('prompt-api-key').value = config.apiKey || '';
    document.getElementById('prompt-api-endpoint').value = config.apiEndpoint || 'https://api.deepseek.com/v1/chat/completions';
    document.getElementById('prompt-api-model').value = config.model || 'deepseek-chat';
    document.getElementById('api-prompt').style.display = 'flex';
    setTimeout(() => document.getElementById('prompt-api-key').focus(), 300);
  },

  _bindApiPrompt() {
    document.getElementById('api-prompt-save').addEventListener('click', () => {
      const key = document.getElementById('prompt-api-key').value.trim();
      const endpoint = document.getElementById('prompt-api-endpoint').value.trim();
      const model = document.getElementById('prompt-api-model').value.trim();
      if (!key) {
        this._flashMessage('请输入 API Key');
        return;
      }
      const config = Store.getConfig();
      config.apiKey = key;
      config.apiEndpoint = endpoint || 'https://api.deepseek.com/v1/chat/completions';
      config.model = model || 'deepseek-chat';
      Store.saveConfig();
      document.getElementById('api-prompt').style.display = 'none';
      this.showScreen('world-gen');
    });
    document.getElementById('api-prompt-close').addEventListener('click', () => {
      document.getElementById('api-prompt').style.display = 'none';
    });
    document.getElementById('api-prompt-bg').addEventListener('click', () => {
      document.getElementById('api-prompt').style.display = 'none';
    });

    // Fetch models
    document.getElementById('prompt-fetch-models').addEventListener('click', async () => {
      const endpoint = document.getElementById('prompt-api-endpoint').value.trim();
      const key = document.getElementById('prompt-api-key').value.trim();
      if (!endpoint || !key) {
        this._flashMessage('请先输入 API 端点和 Key');
        return;
      }
      // Convert chat endpoint to models endpoint
      const modelsUrl = endpoint.replace(/\/chat\/completions.*$/, '/models');
      try {
        const resp = await fetch(modelsUrl, { headers: { 'Authorization': `Bearer ${key}` } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const models = data.data || data;
        const list = document.getElementById('prompt-model-list');
        list.innerHTML = '';
        list.style.display = 'block';
        (Array.isArray(models) ? models : []).forEach(m => {
          const id = m.id || m.name || m;
          const item = document.createElement('div');
          item.textContent = id;
          Object.assign(item.style, {
            padding: '6px 10px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            borderRadius: '4px'
          });
          item.addEventListener('mouseenter', () => item.style.background = 'rgba(100,216,255,0.08)');
          item.addEventListener('mouseleave', () => item.style.background = '');
          item.addEventListener('click', () => {
            document.getElementById('prompt-api-model').value = id;
            list.style.display = 'none';
          });
          list.appendChild(item);
        });
      } catch (e) {
        this._flashMessage('获取模型列表失败: ' + e.message);
      }
    });

    // Enter key to save
    document.getElementById('prompt-api-key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('api-prompt-save').click();
    });
  },

  /* ===== SETTINGS ===== */
  _bindSettings() {
    const slider = document.getElementById('api-temp');
    const val = document.getElementById('temp-value');
    slider.addEventListener('input', () => { val.textContent = slider.value; });
    document.getElementById('settings-save').addEventListener('click', () => this._saveSettings());
  },

  _populateSettings() {
    const c = Store.getConfig();
    document.getElementById('api-endpoint').value = c.apiEndpoint || '';
    document.getElementById('api-key').value = c.apiKey || '';
    document.getElementById('api-model').value = c.model || 'deepseek-v4-flash';
    document.getElementById('api-temp').value = c.temperature || 0.9;
    document.getElementById('temp-value').textContent = c.temperature || 0.9;
    document.getElementById('api-debug').checked = c.debugMode || false;
  },

  _saveSettings() {
    const c = Store.getConfig();
    c.apiEndpoint = document.getElementById('api-endpoint').value.trim();
    c.apiKey = document.getElementById('api-key').value.trim();
    c.model = document.getElementById('api-model').value;
    c.temperature = parseFloat(document.getElementById('api-temp').value);
    c.debugMode = document.getElementById('api-debug').checked;
    Store.saveConfig();
    this.showScreen('splash');
  },

  /* ===== DICE / WORLD GEN ===== */
  _initDiceScreen() {
    const results = DiceSystem.rollAll();
    this._renderDicePills(results);
    this._renderStyleCards();
    document.getElementById('btn-confirm-world').disabled = false;
  },

  _renderDicePills(results) {
    const container = document.getElementById('dice-container');
    container.innerHTML = '';

    results.forEach(layer => {
      const section = document.createElement('div');
      section.className = 'pill-layer';

      const title = document.createElement('h3');
      title.className = 'pill-layer-title';
      title.textContent = layer.layerName;
      section.appendChild(title);

      const group = document.createElement('div');
      group.className = 'pill-group';

      layer.results.forEach(die => {
        const id = `${layer.layerId}:${die.dieId}`;
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.dataset.id = id;
        pill.innerHTML = `<span class="pill-label">${die.label}</span><span class="pill-value">${die.value}</span>`;

        pill.addEventListener('click', () => this._rerollPill(layer.layerId, die.dieId));

        group.appendChild(pill);
      });

      section.appendChild(group);
      container.appendChild(section);
    });
  },

  _renderStyleCards() {
    const container = document.getElementById('style-cards');
    const selector = document.getElementById('style-selector');
    container.innerHTML = '';
    selector.style.display = '';

    this._selectedStyle = 'default';

    WritingStyles.getAll().forEach(function (style) {
      const card = document.createElement('div');
      card.className = 'style-card' + (style.id === 'default' ? ' selected' : '');
      card.dataset.styleId = style.id;
      card.innerHTML =
        '<span class="style-card-icon">' + style.icon + '</span>' +
        '<div class="style-card-name">' + style.name + '</div>' +
        '<div class="style-card-subtitle">' + style.subtitle + '</div>' +
        '<div class="style-card-author">' + style.author + '</div>';

      card.addEventListener('click', function () {
        container.querySelectorAll('.style-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        this._selectedStyle = style.id;
      }.bind(this));

      container.appendChild(card);
    }.bind(this));
  },

  _renderEditStyleCards(currentStyleId) {
    var container = document.getElementById('edit-style-cards');
    var selector = document.getElementById('edit-style-selector');
    container.innerHTML = '';
    selector.style.display = '';

    this._selectedStyle = currentStyleId;

    var self = this;
    WritingStyles.getAll().forEach(function (style) {
      var card = document.createElement('div');
      card.className = 'style-card' + (style.id === currentStyleId ? ' selected' : '');
      card.dataset.styleId = style.id;
      card.innerHTML =
        '<span class="style-card-icon">' + style.icon + '</span>' +
        '<div class="style-card-name">' + style.name + '</div>' +
        '<div class="style-card-subtitle">' + style.subtitle + '</div>' +
        '<div class="style-card-author">' + style.author + '</div>';

      card.addEventListener('click', function () {
        container.querySelectorAll('.style-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        self._selectedStyle = style.id;
      });

      container.appendChild(card);
    });
  },

  _rerollPill(layerId, dieId) {
    const oldGenre = DiceSystem._getGenre(DiceSystem.getCurrentResults());
    const result = DiceSystem.rerollDie(layerId, dieId);
    if (!result) return;
    const newGenre = DiceSystem._getGenre(DiceSystem.getCurrentResults());
    if (oldGenre !== newGenre) {
      const results = DiceSystem.getCurrentResults();
      results.forEach(layer => {
        layer.results.forEach(die => {
          const pillId = `${layer.layerId}:${die.dieId}`;
          const pill = document.querySelector(`.pill[data-id="${pillId}"]`);
          if (pill) pill.querySelector('.pill-value').textContent = die.value;
        });
      });
    }
    const id = `${layerId}:${dieId}`;
    const pill = document.querySelector(`.pill[data-id="${id}"]`);
    if (pill) {
      pill.classList.remove('pill-flash');
      void pill.offsetWidth;
      pill.classList.add('pill-flash');
    }
  },

  async _confirmWorld() {
    const results = DiceSystem.getCurrentResults();
    const xml = DiceSystem.generateWorldBibleXml(results);
    const summary = DiceSystem.generateLlmSummary(results);
    const worldName = DiceSystem.generateWorldName(results);
    const genre = DiceSystem._getGenre(results);
    const powerFill = genre === '仙侠·修真问道' ? '练气期' :
      genre === '高武·破碎虚空' ? '淬体境' :
      genre === '都市·异能暗流' ? '觉醒阶' :
      genre === '末世·废土求生' ? '生存者' :
      genre === '诡异·复苏纪元' ? '凡人' : '凡体期';

    const game = {
      meta: {
        name: worldName,
        saveId: 'STORY-' + Date.now().toString(36).toUpperCase(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalTurns: 0,
        currentAct: 1,
        currentChapter: 1
      },
      worldBible: xml,
      worldSummary: summary,
      diceResults: results,
      writingStyle: this._selectedStyle || 'default',
      pacing: Pacing.getState(),
      state: {
        protagonist: {
          realm: powerFill,
          statusEffects: ['记忆封印'],
          inventory: ['随身物品']
        },
        npcs: {},
        flags: { created: true },
        currentLocation: '未知'
      },
      history: []
    };

    Store.setGame(game);
    Pacing.init(null, genre);
    game.pacing = Pacing.getState();
    Store.saveGame();

    this.showScreen('prologue');
    await this._generateContractAndPrologue();
  },

  /* ===== CONTRACT + VOLUME + PROLOGUE ===== */
  async _generateContractAndPrologue() {
    const game = Store.getGame();
    const config = Store.getConfig();

    this.showScreen('play');
    const inputArea = document.getElementById('play-input-area');
    inputArea.style.display = 'flex';
    inputArea.classList.add('thinking');
    this._showThinkingIndicator();

    try {
      // Step 1: Story Contract
      console.log('[App] Generating story contract...');
      const contractResult = await LLM.generateStoryContract(game.worldBible, game.worldSummary, config);
      const contract = contractResult.contract;
      Pacing.storyContract = contract;
      game.pacing = Pacing.getState();
      Store.saveGame();

      // Step 2: Volume 1 Outline
      console.log('[App] Generating volume 1 outline...');
      const volumeResult = await LLM.generateVolumeOutline(
        game.worldBible, game.worldSummary, contract,
        1, Pacing.totalVolumes, Pacing.persistentState, config
      );
      Pacing.volumeOutline = volumeResult.outline;
      game.pacing = Pacing.getState();
      Store.saveGame();

      // Step 3: Prologue (streamed)
      console.log('[App] Generating prologue...');
      this._addPageMarker(1);
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page-content streaming';
      document.getElementById('story-content').appendChild(pageDiv);

      const result = await LLM.generatePrologue(
        game.worldBible, game.worldSummary, config,
        (chunk) => {
          pageDiv.textContent += chunk;
          this._scrollStoryBottom();
        },
        game.writingStyle || 'default'
      );

      pageDiv.classList.remove('streaming');
      pageDiv.innerHTML = marked.parse ? marked.parse(result.narrative) : result.narrative;

      if (!game.history) game.history = [];
      game.history.push({
        turn: 1,
        type: 'story',
        content: result.narrative,
        assistantRaw: result.rawContent,
        reasoning: result.reasoning,
        playerAction: null
      });

      game.meta.totalTurns = 1;
      Pacing.recordTurn();
      game.pacing = Pacing.getState();
      game.messageStore = MessageStore.toState();
      Store.saveGame();

      const beat = document.getElementById('story-beat');
      beat.textContent = `── 节拍${Pacing.currentBeat} · ${Pacing.getBeatName()} ──`;

      this._removeThinkingIndicator();
      inputArea.classList.remove('thinking');
      this._showInputArea();
      this._updateStatsDisplay();
      this._scrollStoryBottom();

    } catch (err) {
      this._removeThinkingIndicator();
      inputArea.classList.remove('thinking');
      this._showError('故事生成失败: ' + err.message + '\n请检查 API Key 和网络连接');
      this.showScreen('splash');
    }
  },

  /* ===== PLAY SCREEN ===== */
  _bindPlay() {
    document.getElementById('btn-continue').addEventListener('click', () => this._onContinue());
    document.getElementById('btn-regenerate').addEventListener('click', () => this._onRegenerate());
    document.getElementById('free-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onFreeInput();
    });
  },

  _loadPlayContent() {
    const game = Store.getGame();
    if (!game) return;

    document.getElementById('play-chapter').textContent =
      `第${Pacing.currentChapter}章 · ${Pacing.getChapterName()}`;

    const state = game.state || {};
    const proto = state.protagonist || {};
    document.getElementById('status-realm').textContent = proto.realm || '凡体期';
    document.getElementById('status-state').textContent = (proto.statusEffects || ['正常'])[0];
    document.getElementById('status-location').textContent = state.currentLocation || '未知';

    const storyEl = document.getElementById('story-content');
    storyEl.innerHTML = '';
    storyEl.classList.remove('typing');

    const assistantMsgs = MessageStore.assistantMessages();
    const history = game.history || [];

    if (assistantMsgs.length > 0) {
      const narrativeMsgs = [];
      for (let i = 0; i < assistantMsgs.length; i++) {
        const msg = assistantMsgs[i];
        const narrative = this._extractNarrativeFromMessage(msg);
        if (narrative) narrativeMsgs.push(narrative);
      }

      if (narrativeMsgs.length > 0) {
        narrativeMsgs.forEach((narrative, i) => {
          this._addPageMarker(i + 1);
          const pageDiv = document.createElement('div');
          pageDiv.className = 'page-content';
          pageDiv.innerHTML = marked.parse ? marked.parse(narrative) : narrative;
          storyEl.appendChild(pageDiv);
        });
      }
      this._scrollStoryBottom();

      const beat = document.getElementById('story-beat');
      beat.textContent = `── 节拍${Pacing.currentBeat} · ${Pacing.getBeatName()} ──`;

      this._showInputArea();
      this._updateStatsDisplay();
    } else if (history.length > 0) {
      history.forEach((entry, i) => {
        this._addPageMarker(entry.turn);
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-content';
        pageDiv.innerHTML = marked.parse ? marked.parse(entry.content) : entry.content;
        storyEl.appendChild(pageDiv);
      });
      this._scrollStoryBottom();

      const beat = document.getElementById('story-beat');
      beat.textContent = `── 节拍${Pacing.currentBeat} · ${Pacing.getBeatName()} ──`;

      this._showInputArea();
      this._updateStatsDisplay();
    } else {
      this._startNewChapter();
    }
  },

  _extractNarrativeFromMessage(msg) {
    const text = msg.content || '';
    const narrMatch = text.match(/<narrative>([\s\S]*?)<\/narrative>/);
    if (narrMatch) return narrMatch[1].trim();
    const stripped = text.replace(/<response>|<\/response>/g, '').trim();
    return stripped || text;
  },

  _startNewChapter() {
    const container = document.getElementById('story-content');
    container.textContent = '';
    const beat = document.getElementById('story-beat');
    beat.textContent = '';
    container.textContent = '等待故事生成...';
  },

  _addPageMarker(turnNum) {
    const container = document.getElementById('story-content');
    const turn = turnNum || Store.getGame()?.history?.length || 1;
    const chName = Pacing.getChapterName();
    const maker = document.createElement('div');
    maker.className = 'page-marker';
    maker.innerHTML = `<span class="marker-icon">✦</span><span class="marker-text">第${turn}回 · ${chName}</span><span class="marker-icon">✦</span>`;
    container.appendChild(maker);
  },

  _scrollStoryBottom() {
    const storyEl = document.getElementById('play-story');
    storyEl.scrollTop = storyEl.scrollHeight;
  },

  _showInputArea() {
    const inputArea = document.getElementById('play-input-area');
    inputArea.style.display = 'flex';
    inputArea.classList.remove('thinking');
  },

  async _onContinue() {
    if (this._isProcessing) return;
    const action = this._buildDefaultAction();
    await this._submitAction(action);
  },

  _buildDefaultAction() {
    const beatType = Pacing.getBeatType();
    const beatGoal = Pacing.getBeatGoal();
    const beatName = Pacing.getBeatName();
    const actionMap = {
      'introduce': `探索当前场景，${beatGoal}`,
      'build': `深化当前冲突，${beatGoal}`,
      'twist': `引入意外转折，${beatGoal}`,
      'climax': `推动冲突爆发，${beatGoal}`,
      'resolve': `收束当前局面，${beatGoal}`
    };
    return actionMap[beatType] || `继续推进故事（当前节拍：${beatName}）`;
  },

  async _onRegenerate() {
    if (this._isProcessing) return;
    const game = Store.getGame();
    if (!game || !game.history || game.history.length === 0) return;
    game.history.pop();
    const lastDynamicIdx = MessageStore._messages.map((m, i) => m.role === 'user' && m.content.includes('<pacing>') ? i : -1).filter(i => i >= 0).pop();
    if (lastDynamicIdx !== undefined && lastDynamicIdx >= 0) MessageStore._messages.splice(lastDynamicIdx);
    const lastAssistant = MessageStore._messages.findLastIndex(m => m.role === 'assistant');
    if (lastAssistant >= 0) MessageStore._messages.splice(lastAssistant);
    if (Pacing.turnInChapter > 0) Pacing.turnInChapter--;
    if (Pacing.totalTurns > 0) Pacing.totalTurns--;
    Store.saveGame();
    const action = this._buildDefaultAction();
    await this._submitAction(action);
  },

  async _onFreeInput() {
    const input = document.getElementById('free-input');
    const text = input.value.trim();
    if (!text || this._isProcessing) return;
    input.value = '';
    await this._submitAction(text);
  },

  async _submitAction(playerAction) {
    this._isProcessing = true;
    const game = Store.getGame();
    const config = Store.getConfig();

    const inputArea = document.getElementById('play-input-area');
    inputArea.classList.add('thinking');
    this._showThinkingIndicator();

    try {
      const systemPrompt = LLM.buildSystemPrompt(game.worldSummary, game.writingStyle || 'default');
      const staticWorld = LLM.buildStaticWorld(
        game.worldSummary,
        Pacing.getStoryContractXml(),
        Pacing.getVolumeXml()
      );
      const pacingXml = Pacing.getPacingXml();
      const persistentXml = Pacing.getPersistentXml();
      const consequenceXml = Pacing.getConsequenceXml();
      const tropeHint = this._getCurrentTrope();
      const dynamicTurn = LLM.buildDynamicTurn(pacingXml, persistentXml, consequenceXml, tropeHint, playerAction);

      this._addPageMarker((game.history?.length || 0) + 1);
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page-content streaming';
      document.getElementById('story-content').appendChild(pageDiv);

      const result = await LLM.generateStory(
        systemPrompt, staticWorld, game.history || [],
        dynamicTurn, config,
        (chunk) => {
          pageDiv.textContent += chunk;
          this._scrollStoryBottom();
        }
      );

      pageDiv.classList.remove('streaming');
      pageDiv.innerHTML = marked.parse ? marked.parse(result.narrative) : result.narrative;

      if (!game.history) game.history = [];
      game.history.push({
        turn: game.history.length + 1,
        type: 'story',
        content: result.narrative,
        assistantRaw: result.rawContent,
        reasoning: result.reasoning,
        playerAction: playerAction
      });

      game.meta.totalTurns = game.history.length;
      Pacing.recordTurn();

      this._extractConsequences(result.narrative);

      if (Pacing.turnInChapter > 0 && Pacing.turnInChapter % 2 === 0) {
        const beatResult = Pacing.advanceBeat();
        if (beatResult === 'chapter_complete') {
          Pacing.advanceChapter();
        }
      }

      game.pacing = Pacing.getState();
      game.messageStore = MessageStore.toState();
      Store.saveGame();

      const beat = document.getElementById('story-beat');
      beat.textContent = `── 节拍${Pacing.currentBeat} · ${Pacing.getBeatName()} ──`;

      document.getElementById('play-chapter').textContent =
        `第${Pacing.currentChapter}章 · ${Pacing.getChapterName()}`;

      this._removeThinkingIndicator();
      this._isProcessing = false;
      this._updateStatsDisplay();
      this._scrollStoryBottom();
    } catch (err) {
      this._removeThinkingIndicator();
      this._isProcessing = false;
      this._showError('故事生成失败: ' + err.message);
    }
  },

  _getCurrentTrope() {
    const genre = Pacing.genre || '';
    const tropeMap = {
      '仙侠': '天命之子、师徒传承、修炼突破',
      '高武': '热血突破、武道争锋、以力破巧',
      '都市': '隐藏身份、势力暗斗、能力觉醒',
      '末世': '生存抉择、人性考验、资源争夺',
      '诡异': '规则类怪谈、认知危害、不可名状'
    };
    for (const [k, v] of Object.entries(tropeMap)) {
      if (genre.includes(k)) return v;
    }
    return '英雄之旅、成长蜕变';
  },

  _extractConsequences(narrative) {
    if (!narrative) return;
    const text = narrative;
    const keywords = [
      { pattern: /击败了?(\S+)/, template: '战斗' },
      { pattern: /杀死了?(\S+)/, template: '击杀' },
      { pattern: /获得了?(\S+?)(?:，|。|、)/, template: '获得' },
      { pattern: /遇到了?(\S+?)(?:，|。|、)/, template: '遭遇' },
      { pattern: /发现了?(\S+?)(?:，|。|、)/, template: '发现' },
      { pattern: /逃出了?(\S+?)(?:，|。|、)/, template: '逃脱' },
      { pattern: /觉醒了?(\S+?)(?:，|。|、)/, template: '觉醒' },
      { pattern: /受伤了?/, template: '受伤' }
    ];
    for (const kw of keywords) {
      const match = text.match(kw.pattern);
      if (match) {
        Pacing.addConsequence(kw.template, match[0].substring(0, 50));
        break;
      }
    }
    const growthMatch = text.match(/(明白了?|领悟了?|学会了?|意识到?|决定了?)(.{2,20}?)(?:，|。)/);
    if (growthMatch) {
      Pacing.addCharacterGrowth(growthMatch[0].substring(0, 40));
    }
    const npcMatch = text.match(/[""「]([^""」]{2,10})[""」].*?说了?[:：]?\s*[""「]([^""」]{5,40})/);
    if (npcMatch) {
      Pacing.addRelationship(npcMatch[1], '对话', '互动');
    }
  },

  _showThinkingIndicator() {
    const bar = document.getElementById('thinking-bar');
    if (bar) bar.style.display = 'flex';

    const genre = Pacing.genre || '';
    const genreMap = {
      '仙侠': ['天机推演中', '灵气汇聚中'],
      '高武': ['真气运转中', '武道推演中'],
      '都市': ['情报收集中', '数据推演中'],
      '末世': ['危机评估中', '生存推演中'],
      '诡异': ['灵异感应中', '规则解析中']
    };

    let msgs = ['命运推演中', '因果编织中'];
    for (const [k, v] of Object.entries(genreMap)) {
      if (genre.includes(k)) { msgs = v; break; }
    }

    this._reasoningMsgIdx = 0;
    this._reasoningStart = Date.now();
    const msgEl = document.getElementById('reasoning-msg');
    const subEl = document.getElementById('reasoning-sub');
    const elapsedEl = document.getElementById('reasoning-elapsed');

    if (msgEl) msgEl.textContent = msgs[0];

    if (this._reasoningInterval) clearInterval(this._reasoningInterval);
    this._reasoningInterval = setInterval(() => {
      this._reasoningMsgIdx = (this._reasoningMsgIdx + 1) % msgs.length;
      if (msgEl) msgEl.textContent = msgs[this._reasoningMsgIdx];
      if (elapsedEl) {
        const elapsed = Math.floor((Date.now() - this._reasoningStart) / 1000);
        if (elapsed > 3) elapsedEl.textContent = `${elapsed}s`;
      }
    }, 4000);
  },

  _removeThinkingIndicator() {
    const bar = document.getElementById('thinking-bar');
    if (bar) bar.style.display = 'none';

    const inputArea = document.getElementById('play-input-area');
    inputArea.classList.remove('thinking');

    if (this._reasoningInterval) {
      clearInterval(this._reasoningInterval);
      this._reasoningInterval = null;
    }
    this._reasoningStart = null;

    const elapsedEl = document.getElementById('reasoning-elapsed');
    if (elapsedEl) elapsedEl.textContent = '';
  },

  /* ===== STATUS TOGGLE ===== */
  _bindStatusToggle() {
    const toggle = document.getElementById('status-toggle');
    const status = document.getElementById('play-status');
    if (!toggle || !status) return;
    toggle.addEventListener('click', () => {
      const collapsed = status.classList.toggle('collapsed');
      toggle.textContent = collapsed ? '▼' : '▲';
    });
  },

  /* ===== MENU ===== */
  _bindMenu() {
    const overlay = document.getElementById('menu-overlay');

    document.getElementById('btn-menu').addEventListener('click', () => {
      overlay.style.display = 'flex';
    });

    document.getElementById('menu-bg').addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    document.getElementById('menu-close').addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    document.getElementById('menu-settings').addEventListener('click', () => {
      overlay.style.display = 'none';
      this.showScreen('settings');
      this._populateSettings();
    });

    document.getElementById('menu-quit').addEventListener('click', () => {
      if (confirm('返回标题页？未保存的进度将丢失。')) {
        overlay.style.display = 'none';
        this.showScreen('splash');
      }
    });

    document.getElementById('menu-status').addEventListener('click', () => {
      overlay.style.display = 'none';
      const game = Store.getGame();
      if (!game) return;
      const s = game.state || {};
      const p = s.protagonist || {};
      this._flashMessage(
        `境界: ${p.realm} | 状态: ${(p.statusEffects || ['正常']).join(', ')} | ` +
        `第${Pacing.currentChapter}章 | ${Pacing.totalTurns}回合`
      );
    });

    document.getElementById('menu-outline').addEventListener('click', () => {
      overlay.style.display = 'none';
      const game = Store.getGame();
      if (!game) return;
      const chName = Pacing.getChapterName();
      const actName = Pacing.getActName();
      const beatType = Pacing.getBeatType();
      const beatGoal = Pacing.getBeatGoal();
      this._flashMessage(
        `${actName} · 第${Pacing.currentChapter}章「${chName}」\n` +
        `节拍 ${Pacing.currentBeat}/${Pacing.totalBeats} (${beatType})\n` +
        `${beatGoal}`
      );
    });

    document.getElementById('menu-world').addEventListener('click', () => {
      overlay.style.display = 'none';
      this._showWorldInfo();
    });

    document.getElementById('menu-stats').addEventListener('click', () => {
      overlay.style.display = 'none';
      this._showStatsPanel();
    });

    document.getElementById('world-info-bg').addEventListener('click', () => {
      document.getElementById('world-info-overlay').style.display = 'none';
    });
    document.getElementById('world-info-close').addEventListener('click', () => {
      document.getElementById('world-info-overlay').style.display = 'none';
    });

    document.getElementById('stats-bg').addEventListener('click', () => {
      document.getElementById('stats-overlay').style.display = 'none';
    });
    document.getElementById('stats-close').addEventListener('click', () => {
      document.getElementById('stats-overlay').style.display = 'none';
    });
  },

  /* ===== WORLD INFO ===== */
  _showWorldInfo() {
    const game = Store.getGame();
    if (!game) return;

    const body = document.getElementById('world-info-body');
    const summary = game.worldSummary || '';
    const lines = summary.split('\n').filter(l => l.trim());

    const summaryRows = lines.map(line => {
      const parts = line.split('|').map(p => p.trim());
      return parts.map(pair => {
        const [label, ...rest] = pair.split(':');
        const value = rest.join(':').trim();
        if (!value) return `<div class="world-info-row"><span class="world-info-value">${label}</span></div>`;
        const isGenre = label.includes('流派');
        return `<div class="world-info-row"><span class="world-info-label">${label}</span><span class="world-info-value${isGenre ? ' accent' : ''}">${value}</span></div>`;
      }).join('');
    }).join('');

    const pacingXml = Pacing.getPacingXml();
    const state = game.state || {};
    const proto = state.protagonist || {};

    body.innerHTML = `
      <div class="world-info-section">
        <div class="world-info-section-title">世界概要</div>
        ${summaryRows}
      </div>
      <div class="world-info-section">
        <div class="world-info-section-title">主角状态</div>
        <div class="world-info-row"><span class="world-info-label">境界</span><span class="world-info-value accent">${proto.realm || '凡体期'}</span></div>
        <div class="world-info-row"><span class="world-info-label">状态</span><span class="world-info-value">${(proto.statusEffects || ['正常']).join(', ')}</span></div>
        <div class="world-info-row"><span class="world-info-label">物品</span><span class="world-info-value">${(proto.inventory || []).join(', ') || '无'}</span></div>
        <div class="world-info-row"><span class="world-info-label">位置</span><span class="world-info-value">${state.currentLocation || '未知'}</span></div>
      </div>
      <div class="world-info-section">
        <div class="world-info-section-title">节奏状态 (XML)</div>
        <div class="world-info-xml">${pacingXml.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
      <div class="world-info-section">
        <div class="world-info-section-title">World Bible (XML)</div>
        <div class="world-info-xml">${(game.worldBible || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
    `;

    document.getElementById('world-info-overlay').style.display = 'flex';
  },

  /* ===== STATS PANEL ===== */
  _showStatsPanel() {
    const config = Store.getConfig();
    const model = config.model || 'deepseek-v4-flash';
    const totalUsage = MessageStore.totalUsage();
    const report = TokenStats.buildReport(totalUsage, model);
    const perCallRows = MessageStore.getUsage().map((u, i) => {
      const r = TokenStats.buildReport(u, model);
      return `<div class="world-info-row">
        <span class="world-info-label">第${i + 1}次</span>
        <span class="world-info-value">入${TokenStats.formatTokens(r.input)} 出${TokenStats.formatTokens(r.output)} 缓存${TokenStats.formatTokens(r.cache_hit)} → ${TokenStats.formatCost(r.total_cost_cny)}</span>
      </div>`;
    }).join('');

    const body = document.getElementById('stats-body');
    body.innerHTML = `
      <div class="world-info-section">
        <div class="world-info-section-title">累计统计 (${model})</div>
        <div class="world-info-row"><span class="world-info-label">输入 Token</span><span class="world-info-value">${TokenStats.formatTokens(report.input)}</span></div>
        <div class="world-info-row"><span class="world-info-label">输出 Token</span><span class="world-info-value">${TokenStats.formatTokens(report.output)}</span></div>
        <div class="world-info-row"><span class="world-info-label">缓存命中</span><span class="world-info-value accent">${TokenStats.formatTokens(report.cache_hit)}</span></div>
        <div class="world-info-row"><span class="world-info-label">缓存节省</span><span class="world-info-value accent">${TokenStats.formatCost(report.cache_saving_cny)}</span></div>
        <div class="world-info-row"><span class="world-info-label">累计费用</span><span class="world-info-value accent">${TokenStats.formatCost(report.total_cost_cny)}</span></div>
      </div>
      <div class="world-info-section">
        <div class="world-info-section-title">每次调用明细</div>
        ${perCallRows || '<div class="world-info-row"><span class="world-info-value">暂无数据</span></div>'}
      </div>
    `;
    document.getElementById('stats-overlay').style.display = 'flex';
  },

  /* ===== UTILITIES ===== */
  _showError(msg) {
    const el = document.createElement('div');
    el.className = 'error-toast';
    el.innerHTML = `<strong>⚠ 出错了</strong><br>${msg}<br><button class="btn" style="margin-top:10px;font-size:13px;padding:8px;" onclick="this.parentElement.remove()">知道了</button>`;
    Object.assign(el.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      background: 'rgba(30,10,20,0.95)',
      color: '#ff6688',
      padding: '20px 24px',
      borderRadius: '12px',
      zIndex: '200',
      fontSize: '14px',
      maxWidth: '320px',
      textAlign: 'center',
      border: '1px solid rgba(255,68,102,0.3)',
      lineHeight: '1.5'
    });
    document.body.appendChild(el);
  },

  _flashMessage(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      background: 'rgba(26,26,46,0.92)',
      color: '#64d8ff',
      padding: '16px 28px',
      borderRadius: '10px',
      zIndex: '100',
      fontSize: '15px',
      border: '1px solid rgba(100,216,255,0.25)',
      transition: 'opacity 0.4s',
      pointerEvents: 'none',
      textAlign: 'center',
      maxWidth: '280px'
    });
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, 1500);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
