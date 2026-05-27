/* =============================================
   星穹编年史 · LLM 桥接 + Prompt 管理
   ============================================= */

const LLM = {
  /* ---- 核心 API 调用 ---- */
  async call(messages, config) {
    if (!config.apiKey) {
      throw new Error('未配置 API Key，请先在设置中填写');
    }

    const endpoint = config.apiEndpoint || 'https://api.deepseek.com/v1/chat/completions';
    const model = config.model || 'deepseek-v4-flash';

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: config.temperature || 0.9,
        max_tokens: 2048,
        stream: false
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '未知错误');
      throw new Error(`API 调用失败 (${resp.status}): ${errText.substring(0, 200)}`);
    }

    const data = await resp.json();
    return data.choices[0].message.content;
  },

  /* ---- 生成序幕 ---- */
  async generatePrologue(worldBibleXml, summary, config) {
    const genre = this._extract(summary, '流派');
    const theme = this._extract(summary, '叙事主题');
    const personality = this._extract(summary, '性格');

    const systemPrompt = `你是《星穹编年史》的游戏主持人。这是一个第三人称叙事冒险游戏。

流派: ${genre}
主题: ${theme}
叙事基调：根据流派和主题调整风格——讽刺题材则犀利荒诞，热血题材则激昂向上，人性题材则深沉思辨，悬疑题材则层层递进。

用第三人称有限视角（跟随主角，不写他人内心）写出开篇故事。
主角当前失忆，性格底色${personality}。
主角的缺陷是：${this._extract(summary, '缺陷')}。
语言有文学感，精炼不啰嗦，善用感官描写（视觉/听觉/触觉）。
不要在此揭示核心真相，只埋线索。
开篇场景：${this._extract(summary, '开场')}
开场状态：${this._extract(summary, '状态')}
携带物品：${this._extract(summary, '物品')}`;

    const userPrompt = `<world_setting>
${summary}
</world_setting>

<task>
请根据以上世界设定，写出游戏的开篇故事。

要求：
- 从主角在"${this._extract(summary, '开场')}"中苏醒开始写
- 展示失忆状态、环境氛围、紧迫感
- 约5-8段，用中文，第三人称"他"
- 保持悬疑感，不要揭示核心真相

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

    const result = await this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], config);

    return this.parseResponse(result);
  },

  /* ---- 生成故事推进 ---- */
  async generateStory(pacingXml, worldBibleSummary, history, playerChoiceText, config, tropeHint) {
    const personality = this._extract(worldBibleSummary, '性格');
    const genre = this._extract(worldBibleSummary, '流派');
    const theme = this._extract(worldBibleSummary, '叙事主题');

    const toneGuide = {
      '讽刺现实': '用荒诞和反讽的笔法，揭露社会现实与人性的荒诞。对话犀利，情节暗藏机锋。',
      '黑色幽默': '以幽默对抗绝望，笑中带泪。世界是荒诞的，但主角在其中寻找意义。',
      '人性拷问': '将角色置于道德困境中，逼问「如果是你，会怎么选」。没有简单的对错。',
      '道德困境': '每一个选择都有代价。善与恶的界限模糊不清。',
      '黑暗丛林': '世界残酷而真实。善不一定有善报，但主角有自己的底线。',
      '热血王道': '积极向上，永不言弃。用努力和信念打破宿命。友情、努力、胜利。',
      '轻松日常': '温馨治愈，节奏舒缓。即使身处绝境，也能找到微小的美好。',
      '治愈人心': '聚焦人与人之间的温暖联结。希望是暗夜中的星光。'
    };

    const tone = toneGuide[theme] || '根据世界设定和剧情推进自然写作。如果涉及社会议题，可以用温和的讽刺和思辨，但不要让说教压过故事。';

    const systemPrompt = `你是《星穹编年史》的游戏主持人。

叙事风格参考：
- 核心流派: ${genre}
- 主题: ${theme}
- 叙事指南: ${tone}

规则：
1. 用第三人称有限视角（跟随主角，不写他人内心）
2. 根据玩家的选择推进剧情
3. 每次输出2-5段叙事，篇幅精炼
4. 主角性格底色是${personality}，保持性格一致
5. 语言有文学感，善用感官描写
6. 不要替主角做决定，不要写主角的内心结论
7. 用中文写作`;

    let tropeSection = '';
    if (tropeHint) {
      tropeSection = `<trope_hint>当前章节适合触发桥段: ${tropeHint}</trope_hint>`;
    }

    const historySummary = this._getHistorySummary(history);

    const userPrompt = `<world_bible_summary>
${worldBibleSummary}
</world_bible_summary>

${pacingXml}

${tropeSection}

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

    const result = await this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], config);

    return this.parseResponse(result);
  },

  /* ---- 响应解析 ---- */
  parseResponse(text) {
    let narrative = '';
    let choices = [];

    // Try to parse as XML
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');

      // Check for parser errors
      const parseError = doc.querySelector('parsererror');
      if (!parseError) {
        // Find <response> (with or without namespace)
        const respEl = doc.querySelector('response');
        if (respEl) {
          const narrEl = respEl.querySelector('narrative');
          if (narrEl) {
            narrative = narrEl.textContent.trim();
          }
          const choicesEl = respEl.querySelector('choices');
          if (choicesEl) {
            choices = Array.from(choicesEl.querySelectorAll('choice'))
              .map(c => c.textContent.trim())
              .filter(c => c.length > 0);
          }
        }
      }
    } catch (e) {
      // XML parsing failed, try text fallback
    }

    // Fallback: if XML parsing failed or no results, parse the raw text
    if (!narrative) {
      // Try to extract content between <narrative> tags
      const narrMatch = text.match(/<narrative>([\s\S]*?)<\/narrative>/);
      if (narrMatch) {
        narrative = narrMatch[1].trim();
      }

      // Try to extract choices
      const choiceMatches = text.matchAll(/<choice>([\s\S]*?)<\/choice>/g);
      choices = Array.from(choiceMatches, m => m[1].trim()).filter(c => c.length > 0);

      // If still nothing, use the whole response as narrative
      if (!narrative) {
        narrative = this._stripXmlTags(text);
      }
    }

    // Clean up narrative
    narrative = narrative.replace(/^[\s\n]+|[\s\n]+$/g, '');

    return { narrative, choices };
  },

  /* ---- 工具函数 ---- */
  _extract(summary, field) {
    if (!summary || typeof summary !== 'string') return '未知';
    const map = {
      '性格': ['性格', '性格底色'],
      '缺陷': ['缺陷'],
      '开场': ['开场', '开场地点'],
      '状态': ['状态', '开场状态'],
      '物品': ['物品', '携带物品']
    };

    const keys = map[field] || [field];
    for (const key of keys) {
      const regex = new RegExp(`${key}[：:](.+?)(?:\\n|$)`);
      const match = summary.match(regex);
      if (match) return match[1].trim();
    }
    return '未知';
  },

  _getHistorySummary(history) {
    if (!history || history.length === 0) return '尚无历史记录。';
    const recent = history.slice(-3);
    return recent.map((h, i) =>
      `[第${h.turn}轮]\n${this._stripXmlTags(h.content).substring(0, 150)}`
    ).join('\n\n');
  },

  _stripXmlTags(text) {
    return text.replace(/<[^>]*>/g, '').trim();
  }
};
