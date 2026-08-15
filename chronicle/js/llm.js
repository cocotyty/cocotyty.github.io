/* =============================================
   星穹编年史 · LLM 桥接 + Prompt 管理
   ============================================= */

const LLM = {
  _isDeepSeek(model) {
    return model && model.startsWith('deepseek');
  },

  /* ---- 流式 API 调用 ---- */
  async call(messages, config, onChunk) {
    if (!config.apiKey) {
      throw new Error('未配置 API Key，请先在设置中填写');
    }

    const endpoint = config.apiEndpoint || 'https://api.deepseek.com/v1/chat/completions';
    const model = config.model || 'deepseek-chat';

    const body = {
      model: model,
      messages: messages,
      max_tokens: 32768,
      stream: true,
      stream_options: { include_usage: true }
    };

    if (this._isDeepSeek(model)) {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = 'high';
    } else {
      body.temperature = config.temperature || 0.9;
    }

    console.log('[LLM] → endpoint:', endpoint);
    console.log('[LLM] → model:', model);
    console.log('[LLM] → messages:', JSON.stringify(messages.map(m => ({ role: m.role, length: m.content?.length || 0 })), null, 2));

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '未知错误');
      throw new Error(`API 调用失败 (${resp.status}): ${errText.substring(0, 200)}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    let content = '';
    let reasoning = '';
    let buffer = '';
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (delta) {
            if (delta.reasoning_content) {
              reasoning += delta.reasoning_content;
            }
            if (delta.content) {
              content += delta.content;
              if (onChunk) onChunk(delta.content);
            }
          }
          if (json.usage) {
            usage = json.usage;
          }
        } catch (e) {
          // skip malformed JSON
        }
      }
    }

    if (!usage) {
      usage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    }
    if (!usage.prompt_cache_hit_tokens) usage.prompt_cache_hit_tokens = 0;
    if (!usage.prompt_cache_miss_tokens) usage.prompt_cache_miss_tokens = 0;

    const assistantMessage = {
      role: 'assistant',
      content: content,
      reasoning_content: reasoning,
      timestamp: Date.now()
    };

    console.log('[LLM] ← response:', JSON.stringify({
      content_length: content.length,
      reasoning_length: reasoning.length,
      content_preview: content.substring(0, 200),
      usage: usage
    }));

    return { content, reasoning, usage, message: assistantMessage };
  },

  /* ---- 生成故事契约 ---- */
  async generateStoryContract(worldBibleXml, summary, config) {
    const genre = this._extract(summary, '流派');
    const personality = this._extract(summary, '性格');
    const flaw = this._extract(summary, '缺陷');
    const desire = this._extract(summary, '欲望') || this._extract(summary, '核心欲望');
    const origin = this._extract(summary, '出身');

    const prompt = `你是《星穹编年史》的故事架构师。

<world_setting>
${summary}
</world_setting>

根据以上世界设定，生成这个故事的核心叙事框架。

要求：
- 流派: ${genre}
- 主角出身: ${origin}
- 主角性格: ${personality}
- 主角缺陷: ${flaw}
- 主角核心欲望: ${desire}

输出格式（只输出XML，不要其他内容）：
<story_contract>
  <central_question>主角能否___？这个故事的核心悬念</central_question>
  <core_conflict>核心矛盾：___ vs ___</core_conflict>
  <character_arc start="主角开始时的状态" end="主角最终应该变成什么样">弧光核心变化</character_arc>
  <core_characters>
    <character name="角色名" role="师尊/挚友/宿敌/恋人" relationship="与主角的关系" arcDirection="这个角色的发展方向" />
    <character name="角色名" role="..." relationship="..." arcDirection="..." />
    <character name="角色名" role="..." relationship="..." arcDirection="..." />
  </core_characters>
</story_contract>

注意：
- central_question 要具体，不要笼统
- core_conflict 要有张力（比如"个人自由 vs 天命宿命"、"生存本能 vs 人性底线"）
- character_arc 要体现成长，从缺陷出发到克服或接受缺陷
- core_characters 生成2-3个，覆盖不同关系类型（导师型/伙伴型/对手型）
- 角色名要符合${genre}流派的命名风格`;

    const userMessage = { role: 'user', content: prompt };
    const result = await this.call([userMessage], config);

    MessageStore.push(userMessage);
    MessageStore.push(result.message);
    MessageStore.pushUsage(result.usage);

    return { contract: this.parseStoryContract(result.content), usage: result.usage };
  },

  parseStoryContract(text) {
    try {
      const getTag = (tag) => {
        const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? m[1].trim() : '';
      };
      const getAttr = (tag, attr) => {
        const m = text.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`));
        return m ? m[1].trim() : '';
      };

      const characters = [];
      const charRegex = /<character\s+name="([^"]*)"\s+role="([^"]*)"\s+relationship="([^"]*)"\s+arcDirection="([^"]*)"/g;
      let m;
      while ((m = charRegex.exec(text)) !== null) {
        characters.push({
          name: m[1], role: m[2], relationship: m[3], arcDirection: m[4]
        });
      }

      return {
        centralQuestion: getTag('central_question'),
        coreConflict: getTag('core_conflict'),
        characterArc: {
          start: getAttr('character_arc', 'start'),
          end: getAttr('character_arc', 'end'),
          core: getTag('character_arc')
        },
        coreCharacters: characters
      };
    } catch (e) {
      console.warn('Failed to parse story contract:', e);
      return {
        centralQuestion: '主角能否在这个世界中找到自己的道路？',
        coreConflict: '命运 vs 自由意志',
        characterArc: { start: '懵懂', end: '觉醒', core: '从迷茫到坚定' },
        coreCharacters: []
      };
    }
  },

  /* ---- 生成册大纲 ---- */
  async generateVolumeOutline(worldBibleXml, summary, storyContract, volumeNumber, totalVolumes, persistentState, config) {
    const genre = this._extract(summary, '流派');
    const prevVolumes = volumeNumber > 1 ?
      `\n这是第${volumeNumber}册（共${totalVolumes}册），前面已完成${volumeNumber - 1}册。` : '';

    let persistentXml = '';
    if (persistentState) {
      const p = persistentState;
      if (p.characterGrowth?.length) persistentXml += `\n<growth>${p.characterGrowth.join('；')}</growth>`;
      if (p.relationships?.length) persistentXml += '\n<relationships>' + p.relationships.map(r => `${r.name}(${r.type})：${r.attitude}`).join('；') + '</relationships>';
      if (p.revealedTruths?.length) persistentXml += `\n<truths>${p.revealedTruths.join('；')}</truths>`;
      if (p.hangingThreads?.length) persistentXml += `\n<hanging>${p.hangingThreads.join('；')}</hanging>`;
    }

    const prompt = `你是《星穹编年史》的故事大纲设计师。

<world_setting>
${summary}
</world_setting>

<story_contract>
  <central_question>${storyContract.centralQuestion}</central_question>
  <core_conflict>${storyContract.coreConflict}</core_conflict>
  <character_arc start="${storyContract.characterArc.start}" end="${storyContract.characterArc.end}">${storyContract.characterArc.core}</character_arc>
</story_contract>
${prevVolumes}
${persistentXml ? `<persistent_state>${persistentXml}\n</persistent_state>` : ''}

根据以上信息，为第${volumeNumber}册生成大纲。
${volumeNumber === totalVolumes ? '这是最后一册，必须有决定性的结局。' : `后面还有${totalVolumes - volumeNumber}册，本册结尾要留下悬念。`}

要求：
- 本册包含4章
- 每章有明确的主题和子冲突，服务于核心矛盾
- 本册的角色弧光阶段从整体弧光中合理切分
- 沙箱设定：本册的主要场景、势力、NPC圈子
- 流派: ${genre}

输出格式（只输出XML，不要其他内容）：
<volume_outline>
  <name>本册名称</name>
  <conflict>本册核心冲突</conflict>
  <character_arc_stage>本册角色弧光阶段（从___到___）</character_arc_stage>
  <sandbox>本册沙箱：主要场景、势力、NPC圈子</sandbox>
  <chapters>
    <chapter number="1" theme="本章主题">
      <sub_conflict>本章小冲突</sub_conflict>
      <beats>
        <beat number="1" type="introduce" intent="本节拍意图" />
        <beat number="2" type="build" intent="..." />
        <beat number="3" type="climax" intent="..." />
        <beat number="4" type="resolve" intent="..." />
      </beats>
    </chapter>
    <chapter number="2" theme="...">...</chapter>
    <chapter number="3" theme="...">...</chapter>
    <chapter number="4" theme="...">...</chapter>
  </chapters>
</volume_outline>`;

    const userMessage = { role: 'user', content: prompt };
    const result = await this.call([userMessage], config);

    MessageStore.push(userMessage);
    MessageStore.push(result.message);
    MessageStore.pushUsage(result.usage);

    return { outline: this.parseVolumeOutline(result.content), usage: result.usage };
  },

  parseVolumeOutline(text) {
    try {
      const getTag = (tag, parent) => {
        const ctx = parent || text;
        const m = ctx.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? m[1].trim() : '';
      };

      const name = getTag('name');
      const conflict = getTag('conflict');
      const arcStage = getTag('character_arc_stage');
      const sandbox = getTag('sandbox');

      const chapters = [];
      const chRegex = /<chapter\s+number="(\d+)"\s+theme="([^"]*)">([\s\S]*?)<\/chapter>/g;
      let chMatch;
      while ((chMatch = chRegex.exec(text)) !== null) {
        const chBody = chMatch[3];
        const beats = [];
        const bRegex = /<beat\s+number="(\d+)"\s+type="([^"]*)"\s+intent="([^"]*)"/g;
        let bMatch;
        while ((bMatch = bRegex.exec(chBody)) !== null) {
          beats.push({ number: parseInt(bMatch[1]), type: bMatch[2], intent: bMatch[3] });
        }
        chapters.push({
          number: parseInt(chMatch[1]),
          theme: chMatch[2],
          subConflict: getTag('sub_conflict', chBody),
          beats
        });
      }

      return { name, conflict, characterArcStage: arcStage, sandbox, chapters };
    } catch (e) {
      console.warn('Failed to parse volume outline:', e);
      return { name: '未命名卷', conflict: '未知冲突', characterArcStage: '成长', sandbox: '', chapters: [] };
    }
  },

  /* ---- 生成序幕 ---- */
  async generatePrologue(worldBibleXml, summary, config, onChunk, writingStyleId) {
    const genre = this._extract(summary, '流派');
    const theme = this._extract(summary, '叙事主题');
    const personality = this._extract(summary, '性格');

    const contractXml = Pacing.getStoryContractXml();
    const volumeXml = Pacing.getVolumeXml();

    const styleBlock = writingStyleId && writingStyleId !== 'default'
      ? '\n\n' + WritingStyles.buildStylePrompt(writingStyleId)
      : '';

    const systemPrompt = `你是这个世界的游戏主持人。这是一个第三人称叙事冒险游戏。

流派: ${genre}
主题: ${theme}
叙事基调：根据流派和主题调整风格。
用第三人称有限视角（跟随主角，不写他人内心）写出开篇故事。
主角当前失忆，性格底色${personality}。
主角的缺陷是：${this._extract(summary, '缺陷')}。
语言有文学感，善用感官描写。
不要在此揭示核心真相，只埋线索。
开篇场景：${this._extract(summary, '开场')}
开场状态：${this._extract(summary, '状态')}
携带物品：${this._extract(summary, '物品')}
${styleBlock}`;

    const userPrompt = `<world_setting>
${summary}
</world_setting>

${contractXml}

${volumeXml}

<task>
写出游戏的开篇故事。从主角在"${this._extract(summary, '开场')}"中苏醒开始写。
约8-12段，用中文，第三人称"他"。展示失忆状态、环境氛围、紧迫感。
至少引入一个NPC或关键物品的线索。保持悬疑感。

输出格式（只输出XML）：
<response><narrative>故事正文（markdown）</narrative></response>
</task>`;

    const systemMessage = { role: 'system', content: systemPrompt };
    const userMessage = { role: 'user', content: userPrompt };

    MessageStore.reset();
    MessageStore.push(systemMessage);

    const result = await this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], config, onChunk);

    MessageStore.push(userMessage);
    MessageStore.push(result.message);
    MessageStore.pushUsage(result.usage);

    return {
      narrative: this._extractNarrative(result.content),
      rawContent: result.content,
      reasoning: result.reasoning,
      usage: result.usage
    };
  },

  /* ---- 生成故事推进 ---- */
  async generateStory(systemPrompt, staticWorldPart, history, playerAction, config, onChunk) {
    if (MessageStore._messages.length === 0) {
      MessageStore.reset();
      MessageStore.push({ role: 'system', content: systemPrompt });
      MessageStore.push({ role: 'user', content: staticWorldPart });

      const recentTurns = history.slice(-4);
      for (const entry of recentTurns) {
        const raw = entry.assistantRaw || entry.content || '';
        MessageStore.push({ role: 'assistant', content: raw, reasoning_content: entry.reasoning || '' });
        if (entry.playerAction) {
          MessageStore.push({ role: 'user', content: entry.playerAction });
        }
      }
    }

    MessageStore.push({ role: 'user', content: playerAction });

    const apiMessages = MessageStore.buildApiMessages();

    console.log('[LLM] → message chain:', apiMessages.map(m => ({ role: m.role, len: m.content?.length || 0 })));

    const result = await this.call(apiMessages, config, onChunk);

    MessageStore.push(result.message);
    MessageStore.pushUsage(result.usage);

    return {
      narrative: this._extractNarrative(result.content),
      rawContent: result.content,
      reasoning: result.reasoning,
      usage: result.usage
    };
  },

  _extractNarrative(text) {
    const narrMatch = text.match(/<narrative>([\s\S]*?)<\/narrative>/);
    if (narrMatch) return narrMatch[1].trim();

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const narrEl = doc.querySelector('narrative');
      if (narrEl) return narrEl.textContent.trim();
    } catch (e) {}

    const stripped = text.replace(/<response>|<\/response>/g, '').trim();
    return stripped || text;
  },

  /* ---- 构建故事推进的 prompt 部分 ---- */
  buildSystemPrompt(worldBibleSummary, writingStyleId) {
    const personality = this._extract(worldBibleSummary, '性格');
    const genre = this._extract(worldBibleSummary, '流派');
    const theme = this._extract(worldBibleSummary, '叙事主题');

    const styleBlock = writingStyleId && writingStyleId !== 'default'
      ? '\n\n' + WritingStyles.buildStylePrompt(writingStyleId)
      : '';

    return `你是这个世界的游戏主持人。第三人称叙事冒险游戏。

核心流派: ${genre}
主题: ${theme}
主角性格底色: ${personality}
${styleBlock}

规则：
1. 第三人称有限视角，不写他人内心
2. 根据玩家行动推进剧情，每次有明显推进，不能原地踏步
3. 4-8段叙事，充分展开场景、对话和动作
4. 语言有文学感，善用感官描写
5. 不要替主角做决定
6. 用中文写作
7. 每次叙事包含：场景推进、对话互动、事件进展
8. 玩家行动后必须展示后果和新局面
9. 严格遵循 pacing XML 中的节拍类型和目标
10. 每次回复至少让故事时间线推进一个节拍`;
  },

  buildStaticWorld(worldBibleSummary, storyContractXml, volumeXml) {
    return `<world_bible>
${worldBibleSummary}
</world_bible>

${storyContractXml || ''}

${volumeXml || ''}`;
  },

  buildDynamicTurn(pacingXml, persistentXml, consequenceXml, tropeHint, playerAction) {
    let parts = [pacingXml];
    if (persistentXml) parts.push(persistentXml);
    if (consequenceXml) parts.push(consequenceXml);
    if (tropeHint) parts.push(`<trope_hint>${tropeHint}</trope_hint>`);
    parts.push(`<player_action>\n${playerAction}\n</player_action>`);
    parts.push(`<task>
续写故事。严格按照 <beat> 的类型和 <beat_goal> 的方向推进。

关键规则：
- 当前节拍类型决定叙事重点，必须执行 beat_goal
- introduce：建立场景、引入新元素
- build：深化冲突、积累张力
- twist：意外反转、颠覆预期
- climax：冲突爆发、关键抉择
- resolve：收束线索、过渡到下一阶段
- 每次叙事必须有明确的剧情推进，不能原地打转
- 回应玩家的行动，展示直接后果
- 包含对话或NPC互动
- 感官描写营造氛围
- 4-8段

输出格式（只输出XML）：
<response><narrative>故事正文（markdown）</narrative></response>
</task>`);

    return parts.join('\n\n');
  },

  /* ---- 工具函数 ---- */
  _extract(summary, field) {
    if (!summary || typeof summary !== 'string') return '未知';
    const map = {
      '性格': ['性格', '性格底色'],
      '缺陷': ['缺陷'],
      '欲望': ['欲望', '核心欲望'],
      '开场': ['开场', '开场地点'],
      '状态': ['状态', '开场状态'],
      '物品': ['物品', '携带物品'],
      '出身': ['出身'],
      '流派': ['流派'],
      '叙事主题': ['叙事主题']
    };

    const keys = map[field] || [field];
    for (const key of keys) {
      const regex = new RegExp(`${key}[：:]\\s*(.+?)(?:\\s*\\||\\n|$)`);
      const match = summary.match(regex);
      if (match) return match[1].trim();
    }
    return '未知';
  },

  _stripXmlTags(text) {
    return text.replace(/<[^>]*>/g, '').trim();
  }
};
