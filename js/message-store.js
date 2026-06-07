/* =============================================
   星穹编年史 · Message Store (Append-Only)
   存储 LLM 对话消息，用于持久化和恢复
   ============================================= */

const MessageStore = {
  _messages: [],
  _usage: [],

  init(messages, usage) {
    this._messages = Array.isArray(messages) ? messages.slice() : [];
    this._usage = Array.isArray(usage) ? usage.slice() : [];
  },

  reset() {
    this._messages = [];
    this._usage = [];
  },

  getMessages() {
    return this._messages.slice();
  },

  getUsage() {
    return this._usage.slice();
  },

  push(message) {
    this._messages.push({
      role: message.role,
      content: message.content || '',
      reasoning_content: message.reasoning_content || '',
      timestamp: message.timestamp || Date.now()
    });
  },

  pushUsage(usage) {
    this._usage.push({
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      prompt_cache_hit_tokens: usage.prompt_cache_hit_tokens || 0,
      prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens || 0,
      timestamp: usage.timestamp || Date.now()
    });
  },

  lastAssistantMessage() {
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (this._messages[i].role === 'assistant') {
        return this._messages[i];
      }
    }
    return null;
  },

  assistantMessages() {
    return this._messages.filter(m => m.role === 'assistant');
  },

  toState() {
    return {
      messages: this._messages.slice(),
      usage: this._usage.slice()
    };
  },

  fromState(state) {
    if (!state) return;
    this._messages = Array.isArray(state.messages) ? state.messages.slice() : [];
    this._usage = Array.isArray(state.usage) ? state.usage.slice() : [];
  },

  buildApiMessages() {
    const result = [];
    for (const msg of this._messages) {
      result.push({ role: msg.role, content: msg.content });
    }
    return result;
  },

  totalUsage() {
    let prompt = 0, completion = 0, cacheHit = 0, cacheMiss = 0;
    for (const u of this._usage) {
      prompt += u.prompt_tokens;
      completion += u.completion_tokens;
      cacheHit += u.prompt_cache_hit_tokens;
      cacheMiss += u.prompt_cache_miss_tokens;
    }
    return { prompt_tokens: prompt, completion_tokens: completion, prompt_cache_hit_tokens: cacheHit, prompt_cache_miss_tokens: cacheMiss };
  }
};
