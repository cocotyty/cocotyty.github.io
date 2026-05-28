/* =============================================
   星穹编年史 · 节奏控制 (Pacing Manager)
   ============================================= */

const Pacing = {
  outline: null,
  currentAct: 1,
  currentChapter: 1,
  currentBeat: 1,
  totalBeats: 4,
  turnInChapter: 0,
  totalTurns: 0,

  /* ---- 节拍类型轮换 ---- */
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

  chapterNames: [
    '序幕',
    '铁棺苏醒',
    '碎星镇',
    '暗流涌动',
    '寂静边境',
    '血祭星穹',
    '镜面彼方',
    '超越之价'
  ],

  actNames: [
    '',
    '失忆者的漂流',    // Act 1: Ch 1-3
    '通往深渊之路',    // Act 2: Ch 4-6
    '门之两侧'         // Act 3: Ch 7
  ],

  /* ---- 初始化 ---- */
  init(savedState) {
    if (savedState) {
      this.currentAct = savedState.currentAct || 1;
      this.currentChapter = savedState.currentChapter || 1;
      this.currentBeat = savedState.currentBeat || 1;
      this.totalBeats = savedState.totalBeats || 4;
      this.turnInChapter = savedState.turnInChapter || 0;
      this.totalTurns = savedState.totalTurns || 0;
      this.outline = savedState.outline || null;
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
      outline: this.outline
    };
  },

  /* ---- 获取当前信息 ---- */
  getChapterName() {
    return this.chapterNames[this.currentChapter] || `第${this.currentChapter}章`;
  },

  getActName() {
    if (this.currentChapter <= 3) return this.actNames[1];
    if (this.currentChapter <= 6) return this.actNames[2];
    return this.actNames[3];
  },

  getBeatType() {
    const types = this.beatTypes[this.totalBeats] || this.beatTypes[4];
    return types[this.currentBeat - 1] || 'build';
  },

  getBeatName() {
    return this.beatNames[this.getBeatType()] || '展开';
  },

  getBeatGoal() {
    return this.beatGoals[this.getBeatType()] || '推进剧情';
  },

  getPacingXml() {
    return `<pacing>
  <act>第${this.currentAct}幕 · ${this.getActName()}</act>
  <chapter>第${this.currentChapter}章 · ${this.getChapterName()}</chapter>
  <beat number="${this.currentBeat}/${this.totalBeats}" type="${this.getBeatType()}">${this.getBeatName()}</beat>
  <beat_goal>${this.getBeatGoal()}</beat_goal>
  <chapter_progress>第${this.turnInChapter}轮，预期5-8轮完成本章</chapter_progress>
</pacing>`;
  },

  /* ---- 推进 ---- */
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
    if (this.currentChapter === 4) this.currentAct = 2;
    if (this.currentChapter === 7) this.currentAct = 3;
    return this.currentChapter <= 7 ? 'continue' : 'game_complete';
  },

  /* ---- 生成故事大纲提示 ---- */
  getOutlinePrompt(worldBibleSummary) {
    return `<system>
你是《星穹编年史》的游戏大纲设计师。
根据以下世界设定，生成一个3幕7章的故事大纲。
每章包含4-5个节拍（introduce/build/climax/resolve或introduce/build/twist/climax/resolve）。
用XML格式输出。
</system>

<world_setting>
${worldBibleSummary}
</world_setting>

<task>
输出格式：
<story_outline>
  <act number="1" name="..." expected_turns="15-20">
    <chapter number="1" name="..." theme="..." turns="5-8" beat_count="4">
      <beat number="1" type="introduce" intent="..." />
      <beat number="2" type="build" intent="..." />
      <beat number="3" type="climax" intent="..." />
      <beat number="4" type="resolve" intent="..." />
    </chapter>
    <!-- 第2章、第3章 -->
  </act>
  <!-- 第2幕、第3幕 -->
</story_outline>

注意：只输出XML，不要其他内容。
</task>`;
  },

  parseOutline(xmlText) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const acts = [];
      doc.querySelectorAll('act').forEach(actEl => {
        const act = {
          number: parseInt(actEl.getAttribute('number')),
          name: actEl.getAttribute('name'),
          expectedTurns: actEl.getAttribute('expected_turns'),
          chapters: []
        };
        actEl.querySelectorAll('chapter').forEach(chEl => {
          const ch = {
            number: parseInt(chEl.getAttribute('number')),
            name: chEl.getAttribute('name'),
            theme: chEl.getAttribute('theme'),
            turns: chEl.getAttribute('turns'),
            beatCount: parseInt(chEl.getAttribute('beat_count') || '4'),
            beats: []
          };
          chEl.querySelectorAll('beat').forEach(bEl => {
            ch.beats.push({
              number: parseInt(bEl.getAttribute('number')),
              type: bEl.getAttribute('type'),
              intent: bEl.textContent.trim()
            });
          });
          act.chapters.push(ch);
        });
        acts.push(act);
      });
      this.outline = acts;
      return acts;
    } catch (e) {
      console.warn('Failed to parse outline:', e);
      this.outline = null;
      return null;
    }
  },

  /* ---- 获取历史摘要 ---- */
  getHistorySummary(history) {
    if (!history || history.length === 0) return '尚无历史记录。';
    const recent = history.slice(-5);
    const lines = recent.map((h, i) => `[第${h.turn}轮] ${h.content.substring(0, 150)}...`);
    return lines.join('\n');
  },

  /* ---- 构建主循环prompt ---- */
  buildStoryPrompt(worldBibleSummary, history, playerChoiceText, tropeHint) {
    const historySummary = this.getHistorySummary(history);
    const pacXml = this.getPacingXml();

    let tropeXml = '';
    if (tropeHint) {
      tropeXml = `<trope_hint>${tropeHint}</trope_hint>`;
    }

    return `<system>
你是《星穹编年史》的游戏主持人。

规则：
1. 用第三人称有限视角（跟随主角，不写他人内心）
2. 根据玩家的选择推进剧情，每次回应必须让故事有明显的实质推进
3. 每次输出4-8段叙事，充分展开场景、对话和动作
4. 主角性格底色是${this._getPersonalityFromBible(worldBibleSummary)}，保持性格一致
5. 语言有文学感，善用感官描写，注重环境氛围和细节刻画
6. 不要替主角做决定，不要写主角的内心结论
7. 用中文写作
8. 每次叙事应包含：场景转换或新信息揭示、至少一段对话或互动、明确的事件进展
9. 避免原地踏步，玩家做出选择后必须看到选择的后果和新局面
</system>

<world_bible_summary>
${worldBibleSummary}
</world_bible_summary>

${pacXml}

${tropeXml}

<recent_history>
${historySummary}
</recent_history>

<player_action>
${playerChoiceText}
</player_action>

<task>
续写故事。然后提供3个不同的选项，让玩家选择下一步行动。
每个选项应当是不同的方向（探索/战斗/社交/智取等），不要三个选项都类似。

输出格式（只输出XML，不要其他内容）：
<response>
  <narrative>
故事正文，支持markdown格式
  </narrative>
  <choices>
    <choice>第一个选项，以动词开头</choice>
    <choice>第二个选项，以动词开头</choice>
    <choice>第三个选项，以动词开头</choice>
  </choices>
</response>
</task>`;
  },

  _getPersonalityFromBible(summary) {
    const match = summary.match(/性格:?\s*(\S+)/);
    return match ? match[1] : '冷静';
  }
};
