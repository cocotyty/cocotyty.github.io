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
    }

    this._bindNavigation();
    this._bindSettings();
    this._bindPlay();
    this._bindMenu();
    this._bindApiPrompt();
    this._restoreScreen();
  },

  /* ===== SCREEN MGMT ===== */
  showScreen(name) {
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

  _onScreenEnter(name) {
    if (name === 'settings') this._populateSettings();
    if (name === 'world-gen') this._initDiceScreen();
    if (name === 'splash') this._renderBookshelf();
    if (name === 'edit') this._initEditScreen();
  },

  _restoreScreen() {
    const config = Store.getConfig();
    if (config.debugMode && Store.getGame()) {
      this.showScreen('play');
      this._loadPlayContent();
    } else {
      this.showScreen('splash');
    }
  },

  /* ===== NAVIGATION ===== */
  _bindNavigation() {
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => this.showScreen(btn.dataset.goto));
    });

    document.getElementById('btn-new-game').addEventListener('click', () => {
      const config = Store.getConfig();
      if (config.debugMode) {
        const preset = Store.getDebugPreset();
        Store.setGame(preset);
        Pacing.init(preset.pacing);
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
    document.getElementById('btn-edit-back').addEventListener('click', () => this.showScreen('splash'));
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

  _rerollPill(layerId, dieId) {
    const result = DiceSystem.rerollDie(layerId, dieId);
    if (!result) return;
    const id = `${layerId}:${dieId}`;
    const pill = document.querySelector(`.pill[data-id="${id}"]`);
    if (pill) {
      pill.querySelector('.pill-value').textContent = result.value;
      pill.classList.remove('pill-flash');
      // Force reflow
      void pill.offsetWidth;
      pill.classList.add('pill-flash');
    }
  },

  async _confirmWorld() {
    const results = DiceSystem.getCurrentResults();
    const xml = DiceSystem.generateWorldBibleXml(results);
    const summary = DiceSystem.generateLlmSummary(results);
    const worldName = DiceSystem.generateWorldName(results);

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
      pacing: Pacing.getState(),
      state: {
        protagonist: {
          realm: '凡体期',
          statusEffects: ['记忆封印', '轻伤'],
          inventory: ['家传玉简', '标准救生服']
        },
        npcs: {},
        flags: { created: true },
        currentLocation: '未知空间'
      },
      history: []
    };

    Store.setGame(game);
    Pacing.init();
    game.pacing = Pacing.getState();
    Store.saveGame();

    this.showScreen('prologue');
    await this._generatePrologue();
  },

  /* ===== PROLOGUE ===== */
  async _generatePrologue() {
    const game = Store.getGame();
    const config = Store.getConfig();

    try {
      const result = await LLM.generatePrologue(game.worldBible, game.worldSummary, config);

      if (!game.history) game.history = [];
      game.history.push({
        turn: 1,
        type: 'story',
        content: result.narrative,
        choices: result.choices,
        playerChoice: -1,
        playerInput: null
      });

      game.meta.totalTurns = 1;
      Pacing.recordTurn();
      game.pacing = Pacing.getState();
      Store.saveGame();

      this.showScreen('play');
      this._loadPlayContent();
    } catch (err) {
      this._removeThinkingIndicator();
      this._showError('故事生成失败: ' + err.message + '\n请检查 API Key 和网络连接');
    }
  },

  /* ===== PLAY SCREEN ===== */
  _bindPlay() {
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this._onChoice(idx);
      });
    });

    document.getElementById('btn-send').addEventListener('click', () => this._onFreeInput());
    document.getElementById('free-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onFreeInput();
    });

    // Regenerate choices container dynamically
    document.getElementById('choices-container').addEventListener('click', (e) => {
      const btn = e.target.closest('.choice-btn');
      if (btn && !btn.disabled) {
        this._onChoice(parseInt(btn.dataset.idx));
      }
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

    const history = game.history || [];
    if (history.length > 0) {
      const last = history[history.length - 1];
      storyEl.textContent = last.content;
      this._scrollStoryBottom();

      const beat = document.getElementById('story-beat');
      beat.textContent = `── 节拍${Pacing.currentBeat} · ${Pacing.getBeatName()} ──`;

      if (last.choices && last.choices.length >= 2) {
        this._showChoices(last.choices);
      } else {
        document.getElementById('play-input-area').style.display = 'none';
      }
    } else {
      this._startNewChapter();
    }
  },

  _startNewChapter() {
    const container = document.getElementById('story-content');
    container.textContent = '';
    const beat = document.getElementById('story-beat');
    beat.textContent = '';
    container.textContent = '等待故事生成...';
  },

  _addPageMarker() {
    const container = document.getElementById('story-content');
    const turn = (Store.getGame()?.history?.length || 0) + 1;
    const chName = Pacing.getChapterName();
    const maker = document.createElement('div');
    maker.className = 'page-marker';
    maker.innerHTML = `<span class="marker-icon">✦</span><span class="marker-text">第${turn}回 · ${chName}</span><span class="marker-icon">✦</span>`;
    container.appendChild(maker);
  },

  _displayStory(text) {
    const container = document.getElementById('story-content');
    container.classList.remove('typing');
    this._addPageMarker();
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page-content';
    const rendered = marked.parse ? marked.parse(text) : text;
    pageDiv.innerHTML = rendered;
    container.appendChild(pageDiv);

    const beat = document.getElementById('story-beat');
    beat.textContent = `── 节拍${Pacing.currentBeat} · ${Pacing.getBeatName()} ──`;
    this._scrollStoryBottom();
  },

  _typewrite(text, speed, callback) {
    const container = document.getElementById('story-content');
    const inputArea = document.getElementById('play-input-area');
    const beat = document.getElementById('story-beat');

    container.classList.add('typing');
    inputArea.style.display = 'none';
    beat.textContent = '';

    // Add page marker
    this._addPageMarker();

    // Create page content div
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page-content';
    container.appendChild(pageDiv);

    let i = 0;
    const chars = [...text];

    const next = () => {
      if (i < chars.length) {
        pageDiv.textContent += chars[i];
        i++;
        this._scrollStoryBottom();

        if (i % 3 === 0) {
          setTimeout(next, speed);
        } else {
          requestAnimationFrame(next);
        }
      } else {
        container.classList.remove('typing');
        beat.textContent = `── 节拍${Pacing.currentBeat} · ${Pacing.getBeatName()} ──`;
        this._scrollStoryBottom();
        if (callback) callback();
      }
    };
    next();
  },

  _showChoices(choices) {
    const container = document.getElementById('choices-container');
    const inputArea = document.getElementById('play-input-area');

    container.innerHTML = '';
    choices.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.dataset.idx = i;
      btn.textContent = text;
      container.appendChild(btn);
    });

    inputArea.style.display = 'flex';
    document.getElementById('free-input').disabled = false;
    document.getElementById('free-input').value = '';
    document.getElementById('btn-send').disabled = false;
  },

  async _onChoice(idx) {
    if (this._isProcessing) return;
    this._isProcessing = true;

    document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
    document.getElementById('free-input').disabled = true;
    document.getElementById('btn-send').disabled = true;

    const inputArea = document.getElementById('play-input-area');
    inputArea.classList.add('thinking');
    this._showThinkingIndicator();

    const game = Store.getGame();
    const config = Store.getConfig();
    const history = game.history || [];
    const lastEntry = history[history.length - 1] || {};
    const choiceText = lastEntry.choices ? `玩家选择了: ${lastEntry.choices[idx] || '未知选项'}` : '玩家做出了选择';

    Pacing.recordTurn();

    try {
      const pacXml = Pacing.getPacingXml();
      const trope = this._getCurrentTrope();
      const result = await LLM.generateStory(pacXml, game.worldSummary, history, choiceText, config, trope);

      history.push({
        turn: history.length + 1,
        type: 'story',
        content: result.narrative,
        choices: result.choices,
        playerChoice: idx,
        playerInput: null
      });
      game.meta.totalTurns = Pacing.totalTurns;
      game.pacing = Pacing.getState();
      Store.saveGame();

      this._removeThinkingIndicator();
      inputArea.classList.remove('thinking');

      this._typewrite(result.narrative, 18, () => {
        if (result.choices && result.choices.length >= 2) {
          setTimeout(() => this._showChoices(result.choices), 300);
        } else {
          this._showChoices([
            '① 继续探索',
            '② 调查周围环境',
            '③ 检查随身物品'
          ]);
        }
      });

      this._checkChapterProgress();

    } catch (err) {
      this._removeThinkingIndicator();
      inputArea.classList.remove('thinking');
      this._showError(err.message);
    } finally {
      this._isProcessing = false;
    }
  },

  async _onFreeInput() {
    const input = document.getElementById('free-input');
    const text = input.value.trim();
    if (!text || this._isProcessing) return;
    input.value = '';

    this._isProcessing = true;
    document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
    document.getElementById('btn-send').disabled = true;

    const inputArea = document.getElementById('play-input-area');
    inputArea.classList.add('thinking');
    this._showThinkingIndicator();

    const game = Store.getGame();
    const config = Store.getConfig();
    const history = game.history || [];
    const choiceText = `玩家自由行动: ${text}`;

    Pacing.recordTurn();

    try {
      const pacXml = Pacing.getPacingXml();
      const result = await LLM.generateStory(pacXml, game.worldSummary, history, choiceText, config);

      history.push({
        turn: history.length + 1,
        type: 'story',
        content: result.narrative,
        choices: result.choices,
        playerChoice: -1,
        playerInput: text
      });
      game.meta.totalTurns = Pacing.totalTurns;
      game.pacing = Pacing.getState();
      Store.saveGame();

      this._removeThinkingIndicator();
      inputArea.classList.remove('thinking');

      this._typewrite(result.narrative, 18, () => {
        if (result.choices && result.choices.length >= 2) {
          setTimeout(() => this._showChoices(result.choices), 300);
        } else {
          this._showChoices([
            '① 继续前进',
            '② 停下来观察四周',
            '③ 回想你记得的一切'
          ]);
        }
      });

      this._checkChapterProgress();

    } catch (err) {
      this._removeThinkingIndicator();
      inputArea.classList.remove('thinking');
      this._showError(err.message);
    } finally {
      this._isProcessing = false;
    }
  },

  _checkChapterProgress() {
    const beatResult = Pacing.advanceBeat();
    if (beatResult === 'chapter_complete') {
      const chResult = Pacing.advanceChapter();
      const game = Store.getGame();
      if (game) {
        game.meta.currentChapter = Pacing.currentChapter;
        game.meta.currentAct = Pacing.currentAct;
        game.pacing = Pacing.getState();
      }

      document.getElementById('play-chapter').textContent =
        `第${Pacing.currentChapter}章 · ${Pacing.getChapterName()}`;

      if (chResult === 'game_complete') {
        this._flashMessage('🏆 故事终章');
      }
    }
  },

  _getCurrentTrope() {
    const tropeHints = {
      1: '',
      2: '失忆英雄·主角的记忆封印在压力下可能产生被动触发',
      3: '星空遗迹·废弃空间站中隐藏着远古文明的线索',
      4: '绝境逢生·当前处境危险，但危机中藏着转机',
      5: '真相碎片·发现的每一块信息都在拼凑更大的图景',
      6: '宿命对决·距离第一次直面反派势力越来越近',
      7: '扮猪吃虎·主角的实际潜力远超表面战力'
    };
    return tropeHints[Pacing.currentChapter] || '';
  },

  _showThinkingIndicator() {
    const inputArea = document.getElementById('play-input-area');
    const overlay = document.getElementById('reasoning-overlay');
    if (overlay) overlay.style.display = 'flex';

    // Show thinking state on input area
    inputArea.classList.add('thinking');

    // Cycle through status messages
    this._reasoningMsgs = [
      '星穹推演中',
      '命运之线编织中',
      '群星正在排列',
      '因果律运算中',
      '时间线收束中',
      '叙事引擎运转中'
    ];
    this._reasoningSubs = [
      '命运的齿轮开始转动',
      '世界的脉络逐渐清晰',
      '无数可能性坍缩为现实',
      '星轨在虚空中延展',
      '你选择的道路正在成形',
      '故事在星辉中浮现'
    ];
    this._reasoningMsgIdx = 0;
    this._reasoningStart = Date.now();

    const msgEl = document.getElementById('reasoning-msg');
    const subEl = document.getElementById('reasoning-sub');
    const elapsedEl = document.getElementById('reasoning-elapsed');

    if (msgEl) msgEl.textContent = this._reasoningMsgs[0];
    if (subEl) subEl.textContent = this._reasoningSubs[0];

    // Cycle messages every 4 seconds
    if (this._reasoningInterval) clearInterval(this._reasoningInterval);
    this._reasoningInterval = setInterval(() => {
      this._reasoningMsgIdx = (this._reasoningMsgIdx + 1) % this._reasoningMsgs.length;
      if (msgEl) msgEl.textContent = this._reasoningMsgs[this._reasoningMsgIdx];
      if (subEl) {
        subEl.style.opacity = '0';
        setTimeout(() => {
          subEl.textContent = this._reasoningSubs[this._reasoningMsgIdx];
          subEl.style.opacity = '1';
        }, 200);
      }

      // Show elapsed time
      if (elapsedEl) {
        const elapsed = Math.floor((Date.now() - this._reasoningStart) / 1000);
        if (elapsed > 3) {
          elapsedEl.textContent = `${elapsed}s · 星海深处传来回响`;
        }
      }
    }, 4000);

    // Initial elapsed timer
    if (this._elapsedTimer) clearInterval(this._elapsedTimer);
    this._elapsedTimer = setInterval(() => {
      if (elapsedEl && this._reasoningStart) {
        const elapsed = Math.floor((Date.now() - this._reasoningStart) / 1000);
        if (elapsed > 3) {
          elapsedEl.textContent = `${elapsed}s · 星海深处传来回响`;
        }
      }
    }, 1000);
  },

  _removeThinkingIndicator() {
    const overlay = document.getElementById('reasoning-overlay');
    if (overlay) overlay.style.display = 'none';

    const inputArea = document.getElementById('play-input-area');
    inputArea.classList.remove('thinking');

    if (this._reasoningInterval) {
      clearInterval(this._reasoningInterval);
      this._reasoningInterval = null;
    }
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }
    this._reasoningStart = null;

    const elapsedEl = document.getElementById('reasoning-elapsed');
    if (elapsedEl) elapsedEl.textContent = '';
  },

  _scrollStoryBottom() {
    const storyEl = document.getElementById('play-story');
    const isAtBottom = storyEl.scrollHeight - storyEl.scrollTop - storyEl.clientHeight < 60;
    if (isAtBottom) {
      storyEl.scrollTo({
        top: storyEl.scrollHeight,
        behavior: 'smooth'
      });
    }
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

    document.getElementById('menu-save').addEventListener('click', () => {
      const game = Store.getGame();
      if (game) {
        game.pacing = Pacing.getState();
        Store.setGame(game);
        Store.saveGame();
        overlay.style.display = 'none';
        this._flashMessage('已保存');
      }
    });

    document.getElementById('menu-load').addEventListener('click', () => {
      if (Store.hasSavedGame()) {
        Store.loadGame();
        const loaded = Store.getGame();
        if (loaded && loaded.pacing) {
          Pacing.init(loaded.pacing);
        }
        overlay.style.display = 'none';
        this._loadPlayContent();
        this._flashMessage('已读取存档');
      }
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
