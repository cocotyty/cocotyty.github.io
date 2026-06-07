/* =============================================
   星穹编年史 · 节奏控制 (Pacing Manager)
   四层架构: 故事契约 → 册(卷) → 章 → 节拍
   ============================================= */

const Pacing = {
  /* ---- 旧字段（章/节拍层，保持兼容） ---- */
  currentAct: 1,
  currentChapter: 1,
  currentBeat: 1,
  totalBeats: 4,
  turnInChapter: 0,
  totalTurns: 0,
  genre: null,
  outline: null,

  /* ---- 新字段：故事契约层 ---- */
  storyContract: null,
  // { centralQuestion, coreConflict, characterArc, coreCharacters }

  /* ---- 新字段：册层 ---- */
  currentVolume: 1,
  totalVolumes: 3,
  volumeOutline: null,
  // { name, conflict, sandbox, characterArcStage, chapters: [...] }

  /* ---- 新字段：持久层（跨册携带） ---- */
  persistentState: null,
  // { characterGrowth:[], relationships:[], revealedTruths:[], hangingThreads:[] }

  /* ---- 新字段：册内后果账本 ---- */
  consequenceLedger: [],
  // [{ turn, event, consequence }]

  /* ---- 册名表 ---- */
  volumeNames: {
    default: ['凡尘卷', '问道卷', '终章卷'],
    '仙侠·修真问道': ['凡尘卷', '问道卷', '飞升卷'],
    '高武·破碎虚空': ['初露卷', '争锋卷', '破碎卷'],
    '都市·异能暗流': ['觉醒卷', '暗战卷', '黎明卷'],
    '末世·废土求生': ['求生卷', '探索卷', '重建卷'],
    '诡异·复苏纪元': ['异变卷', '深渊卷', '封印卷'],
    '玄幻·诸天万界': ['初临卷', '争锋卷', '归一卷'],
    '无限·诸天穿梭': ['轮回卷', '试炼卷', '超越卷'],
    '克系·不可名状': ['低语卷', '深渊卷', '虚空卷']
  },

  /* ========================================
     节拍类型 (章内节奏)
     ======================================== */
  beatTypes: {
    4: ['introduce', 'build', 'climax', 'resolve'],
    5: ['introduce', 'build', 'twist', 'climax', 'resolve']
  },

  beatNames: {
    'introduce': '引入',
    'build': '展开',
    'twist': '转折',
    'climax': '高潮',
    'resolve': '收束'
  },

  beatGoals: {
    'introduce': '建立场景基调，展示环境与氛围，让玩家感知到当前世界的质感',
    'build': '深化冲突，收集信息，与场景中的元素互动，积累势能',
    'twist': '意外反转，引入新变量，颠覆玩家的预期',
    'climax': '冲突爆发，节奏达到最高点，关键抉择出现',
    'resolve': '问题解决，收束线索，提供过渡到下一场景的桥梁'
  },

  /* ========================================
     章名表 (每册内复用)
     ======================================== */
  genreChapterNames: {
    default: ['序幕', '初始之地', '暗流涌动', '转折之刻', '终局之前'],
    '仙侠·修真问道': ['序幕', '凡尘之始', '仙门试炼', '道心蒙尘', '飞升之劫'],
    '高武·破碎虚空': ['序幕', '初入江湖', '风波渐起', '武林暗流', '破碎虚空'],
    '都市·异能暗流': ['序幕', '平凡日常', '暗流涌动', '危机逼近', '黎明之前'],
    '末世·废土求生': ['序幕', '废土初醒', '危机四伏', '深渊裂隙', '新生之路'],
    '诡异·复苏纪元': ['序幕', '异变初现', '诡事频发', '迷雾重重', '黎明曙光'],
    '玄幻·诸天万界': ['序幕', '苏醒之地', '势力暗涌', '秘境深处', '混沌终章'],
    '无限·诸天穿梭': ['序幕', '新手世界', '规则初现', '幕后黑手', '突破轮回'],
    '克系·不可名状': ['序幕', '异常初显', '理智边缘', '低语渐强', '虚空彼岸']
  },

  /* ========================================
     初始化
     ======================================== */
  init(savedState, genre) {
    this.currentAct = 1;
    this.currentChapter = 1;
    this.currentBeat = 1;
    this.totalBeats = 4;
    this.turnInChapter = 0;
    this.totalTurns = 0;
    this.outline = null;
    this.genre = null;
    this.storyContract = null;
    this.currentVolume = 1;
    this.totalVolumes = 3;
    this.volumeOutline = null;
    this.persistentState = {
      characterGrowth: [],
      relationships: [],
      revealedTruths: [],
      hangingThreads: []
    };
    this.consequenceLedger = [];

    if (savedState) {
      this.currentAct = savedState.currentAct || 1;
      this.currentChapter = savedState.currentChapter || 1;
      this.currentBeat = savedState.currentBeat || 1;
      this.totalBeats = savedState.totalBeats || 4;
      this.turnInChapter = savedState.turnInChapter || 0;
      this.totalTurns = savedState.totalTurns || 0;
      this.outline = savedState.outline || null;
      this.genre = savedState.genre || null;
      this.storyContract = savedState.storyContract || null;
      this.currentVolume = savedState.currentVolume || 1;
      this.totalVolumes = savedState.totalVolumes || 3;
      this.volumeOutline = savedState.volumeOutline || null;
      this.persistentState = savedState.persistentState || this.persistentState;
      this.consequenceLedger = savedState.consequenceLedger || [];
    }
    if (genre) {
      this.genre = genre;
    }
  },

  getState() {
    return {
      currentAct: this.currentAct,
      currentChapter: this.currentChapter,
      currentBeat: this.currentBeat,
      totalBeats: this.totalBeats,
      turnInChapter: this.turnInChapter,
      totalTurns: this.totalTurns,
      outline: this.outline,
      genre: this.genre,
      storyContract: this.storyContract,
      currentVolume: this.currentVolume,
      totalVolumes: this.totalVolumes,
      volumeOutline: this.volumeOutline,
      persistentState: this.persistentState,
      consequenceLedger: this.consequenceLedger
    };
  },

  /* ========================================
     获取当前信息
     ======================================== */
  _genreNames(tables, fallbackIdx) {
    if (!this.genre) return tables.default[fallbackIdx] || `第${fallbackIdx}章`;
    return (tables[this.genre] || tables.default)[fallbackIdx] || `第${fallbackIdx}章`;
  },

  getChapterName() {
    const chInVolume = ((this.currentChapter - 1) % 4) + 1;
    return this._genreNames(this.genreChapterNames, chInVolume);
  },

  getVolumeName() {
    const table = this.genre ? (this.volumeNames[this.genre] || this.volumeNames.default) : this.volumeNames.default;
    return table[this.currentVolume - 1] || `第${this.currentVolume}册`;
  },

  getActName() {
    return this.getVolumeName();
  },

  getBeatType() {
    const types = this.beatTypes[this.totalBeats] || this.beatTypes[4];
    return types[this.currentBeat - 1] || 'build';
  },

  getBeatName() {
    return this.beatNames[this.getBeatType()] || '展开';
  },

  getBeatGoal() {
    if (this.volumeOutline) {
      const chInVolume = ((this.currentChapter - 1) % 4);
      const ch = this.volumeOutline.chapters[chInVolume];
      if (ch && ch.beats) {
        const beat = ch.beats[this.currentBeat - 1];
        if (beat && beat.intent) return beat.intent;
      }
    }
    return this.beatGoals[this.getBeatType()] || '推进剧情';
  },

  /* ========================================
     XML 输出 (注入 prompt)
     ======================================== */
  getPacingXml() {
    return `<pacing>
  <volume>第${this.currentVolume}册 · ${this.getVolumeName()} (${this.currentVolume}/${this.totalVolumes})</volume>
  <chapter>第${this.currentChapter}章 · ${this.getChapterName()}</chapter>
  <beat number="${this.currentBeat}/${this.totalBeats}" type="${this.getBeatType()}">${this.getBeatName()}</beat>
  <beat_goal>${this.getBeatGoal()}</beat_goal>
  <chapter_progress>第${this.turnInChapter}轮，预期5-8轮完成本章</chapter_progress>
  <genre>${this.genre || '通用'}</genre>
</pacing>`;
  },

  getStoryContractXml() {
    if (!this.storyContract) return '';
    const c = this.storyContract;
    let chars = '';
    if (c.coreCharacters) {
      chars = '\n  <core_characters>\n' +
        c.coreCharacters.map(ch =>
          `    <character name="${ch.name}" role="${ch.role}" relationship="${ch.relationship}" arc="${ch.arcDirection}" />`
        ).join('\n') + '\n  </core_characters>';
    }
    return `<story_contract>
  <central_question>${c.centralQuestion}</central_question>
  <core_conflict>${c.coreConflict}</core_conflict>
  <character_arc start="${c.characterArc.start}" end="${c.characterArc.end}" />${chars}
</story_contract>`;
  },

  getVolumeXml() {
    if (!this.volumeOutline) return '';
    const v = this.volumeOutline;
    let chXml = '';
    if (v.chapters) {
      chXml = '\n  <chapters>\n' +
        v.chapters.map(ch =>
          `    <chapter num="${ch.number}" theme="${ch.theme || ''}" />`
        ).join('\n') + '\n  </chapters>';
    }
    return `<volume number="${this.currentVolume}/${this.totalVolumes}" name="${v.name || this.getVolumeName()}">
  <conflict>${v.conflict}</conflict>
  <character_arc_stage>${v.characterArcStage}</character_arc_stage>
  <sandbox>${v.sandbox || ''}</sandbox>${chXml}
</volume>`;
  },

  getPersistentXml() {
    if (!this.persistentState) return '';
    const p = this.persistentState;
    let xml = '<persistent_state>';
    if (p.characterGrowth && p.characterGrowth.length > 0) {
      xml += '\n  <growth>\n' +
        p.characterGrowth.map(g => `    <item>${g}</item>`).join('\n') + '\n  </growth>';
    }
    if (p.relationships && p.relationships.length > 0) {
      xml += '\n  <relationships>\n' +
        p.relationships.map(r =>
          `    <relation name="${r.name}" type="${r.type}" attitude="${r.attitude}" />`
        ).join('\n') + '\n  </relationships>';
    }
    if (p.revealedTruths && p.revealedTruths.length > 0) {
      xml += '\n  <truths>\n' +
        p.revealedTruths.map(t => `    <truth>${t}</truth>`).join('\n') + '\n  </truths>';
    }
    if (p.hangingThreads && p.hangingThreads.length > 0) {
      xml += '\n  <hanging_threads>\n' +
        p.hangingThreads.map(h => `    <thread>${h}</thread>`).join('\n') + '\n  </hanging_threads>';
    }
    xml += '\n</persistent_state>';
    return xml;
  },

  getConsequenceXml() {
    if (!this.consequenceLedger || this.consequenceLedger.length === 0) return '';
    const recent = this.consequenceLedger.slice(-10);
    return '<consequences>\n' +
      recent.map(c => `  <event turn="${c.turn}">${c.event} → ${c.consequence}</event>`).join('\n') +
      '\n</consequences>';
  },

  /* ========================================
     推进逻辑
     ======================================== */
  recordTurn() {
    this.turnInChapter++;
    this.totalTurns++;
  },

  advanceBeat() {
    this.currentBeat++;
    if (this.currentBeat > this.totalBeats) {
      return 'chapter_complete';
    }
    return 'beat_advanced';
  },

  advanceChapter() {
    this.currentChapter++;
    this.currentBeat = 1;
    this.turnInChapter = 0;
    this.totalBeats = this.currentChapter === 7 ? 5 : 4;

    const chaptersPerVolume = this.volumeOutline?.chapters?.length || 4;
    const totalChapters = this.currentVolume * chaptersPerVolume;
    if (this.currentChapter > totalChapters) {
      return 'volume_complete';
    }

    if (this.currentVolume === this.totalVolumes &&
        this.currentChapter > this.totalVolumes * chaptersPerVolume) {
      return 'game_complete';
    }

    return 'continue';
  },

  advanceVolume() {
    this.consequenceLedger = [];
    this.currentVolume++;
    this.currentBeat = 1;
    this.turnInChapter = 0;
    if (this.currentVolume > this.totalVolumes) {
      return 'game_complete';
    }
    return 'continue';
  },

  addConsequence(event, consequence) {
    this.consequenceLedger.push({
      turn: this.totalTurns,
      event: event,
      consequence: consequence
    });
  },

  addCharacterGrowth(item) {
    if (!this.persistentState.characterGrowth) this.persistentState.characterGrowth = [];
    this.persistentState.characterGrowth.push(item);
  },

  addRelationship(name, type, attitude) {
    if (!this.persistentState.relationships) this.persistentState.relationships = [];
    const existing = this.persistentState.relationships.find(r => r.name === name);
    if (existing) {
      existing.attitude = attitude;
    } else {
      this.persistentState.relationships.push({ name, type, attitude });
    }
  },

  addRevealedTruth(truth) {
    if (!this.persistentState.revealedTruths) this.persistentState.revealedTruths = [];
    this.persistentState.revealedTruths.push(truth);
  },

  addHangingThread(thread) {
    if (!this.persistentState.hangingThreads) this.persistentState.hangingThreads = [];
    this.persistentState.hangingThreads.push(thread);
  },

  /* ========================================
     旧版兼容方法 (buildStoryPrompt)
     ======================================== */
  _getPersonalityFromBible(summary) {
    const match = summary.match(/性格[：:]?\s*(.+?)(?:\s*\||$)/);
    return match ? match[1].trim() : '冷静';
  }
};
