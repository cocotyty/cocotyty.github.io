/* =============================================
   星穹编年史 · Token Stats
   Token 使用统计 + 费用计算 (DeepSeek V4 Flash 定价)
   ============================================= */

const TokenStats = {
  PRICING: {
    'deepseek-v4-flash': {
      input_per_million: 0.15,
      output_per_million: 0.60,
      cache_hit_per_million: 0.015
    },
    'deepseek-chat': {
      input_per_million: 0.27,
      output_per_million: 1.10,
      cache_hit_per_million: 0.07
    },
    'deepseek-reasoner': {
      input_per_million: 0.55,
      output_per_million: 2.19,
      cache_hit_per_million: 0.14
    }
  },

  USD_TO_CNY: 7.25,

  getPricing(model) {
    return this.PRICING[model] || this.PRICING['deepseek-v4-flash'];
  },

  calculateCost(usage, model) {
    if (!usage) return { input_cost_cny: 0, output_cost_cny: 0, cache_saving_cny: 0, total_cost_cny: 0 };

    const pricing = this.getPricing(model);
    const promptTokens = (usage.prompt_tokens || 0) - (usage.prompt_cache_hit_tokens || 0);
    const cacheHitTokens = usage.prompt_cache_hit_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;

    const inputCost = (promptTokens / 1_000_000) * pricing.input_per_million * this.USD_TO_CNY;
    const cacheCost = (cacheHitTokens / 1_000_000) * pricing.cache_hit_per_million * this.USD_TO_CNY;
    const outputCost = (completionTokens / 1_000_000) * pricing.output_per_million * this.USD_TO_CNY;
    const cacheSaving = ((cacheHitTokens / 1_000_000) * (pricing.input_per_million - pricing.cache_hit_per_million) * this.USD_TO_CNY);

    return {
      input_cost_cny: Math.round(inputCost * 10000) / 10000,
      output_cost_cny: Math.round(outputCost * 10000) / 10000,
      cache_cost_cny: Math.round(cacheCost * 10000) / 10000,
      cache_saving_cny: Math.round(cacheSaving * 10000) / 10000,
      total_cost_cny: Math.round((inputCost + cacheCost + outputCost) * 10000) / 10000
    };
  },

  formatCost(cny) {
    if (cny < 0.0001) return '¥0';
    if (cny < 0.01) return '¥' + cny.toFixed(4);
    if (cny < 1) return '¥' + cny.toFixed(3);
    return '¥' + cny.toFixed(2);
  },

  formatTokens(n) {
    if (n < 1000) return n.toString();
    if (n < 1_000_000) return (n / 1000).toFixed(1) + 'K';
    return (n / 1_000_000).toFixed(2) + 'M';
  },

  buildReport(usage, model) {
    const total = usage || { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    const cost = this.calculateCost(total, model);
    return {
      input: total.prompt_tokens || 0,
      output: total.completion_tokens || 0,
      cache_hit: total.prompt_cache_hit_tokens || 0,
      cache_miss: total.prompt_cache_miss_tokens || 0,
      ...cost
    };
  },

  formatReportHTML(usage, model) {
    const r = this.buildReport(usage, model);
    return `输入 ${this.formatTokens(r.input)} · 输出 ${this.formatTokens(r.output)} · 缓存 ${this.formatTokens(r.cache_hit)} | ${this.formatCost(r.total_cost_cny)}`;
  }
};
