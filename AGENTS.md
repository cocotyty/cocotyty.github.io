# 星穹编年史 · Agent Guide

## Project

Pure client-side SPA (vanilla JS, no build tool, no npm). Served from any static HTTP server.

## Architecture

Script load order (index.html:259-267): `marked` CDN → `starfield.js` → `store.js` → `dice.js` → `pacing.js` → `message-store.js` → `token-stats.js` → `writing-styles.js` → `llm.js` → `app.js`. This is the dependency order and must be preserved.

Data flow: `DiceSystem.rollAll()` → `generateWorldBibleXml()` + `generateLlmSummary()` → `LLM.generatePrologue()` / `LLM.generateStory()` → `App._submitAction()` (renders markdown via `marked.parse`). `App._displayStory()` exists but is unused dead code.

### Message Store
`MessageStore` is an append-only store for LLM conversation messages. It persists alongside game saves in `game.messageStore`. The first message pushed is always the system prompt. All `reasoning_content` from DeepSeek thinking mode is preserved in each assistant message. `MessageStore.buildApiMessages()` strips reasoning for API calls (only `role` + `content`). Usage stats from each SSE response are stored via `MessageStore.pushUsage()`.

### Token Stats
`TokenStats` calculates costs from usage data using DeepSeek V4 Flash pricing (input: $0.15/M, output: $0.60/M, cache hit: $0.015/M, USD→CNY at 7.25). Costs are computed on-the-fly, never stored. Stats are shown in the status bar (`_updateStatsDisplay`) and a detail panel accessible from the menu.

## Key Patterns

### KV Cache (DeepSeek)
`generateStory` sends **3 messages**: `[system][user: staticWorld][user: dynamicContent]`. The world bible is in its own `user` message so the prefix `[system + staticWorld]` stays constant across turns and hits DeepSeek's disk KV cache (confirmed: ~50% prompt tokens cached from call 2 onward). **Do not merge these messages.**

### Thinking Mode
DeepSeek models get `thinking: {type: "enabled"}` + `reasoning_effort: "high"` (llm.js:27-30). `temperature` has no effect in thinking mode and is omitted. Non-DeepSeek models get `temperature` but no thinking params.

`reasoning_content` from the response is preserved in `MessageStore` and `game.history[].reasoning`. It is stripped by `MessageStore.buildApiMessages()` for API calls. If UI wants to show chain-of-thought, read from `MessageStore.assistantMessages()[i].reasoning_content`.

### Genre-Aware Dice
`cosmology-dice.json` dice can have a `genre_faces` map keyed by genre name (e.g., `"仙侠·修真问道"`). When `DiceSystem.rollAll()` runs, it extracts the genre from layer `tags` / die `genre`, then:
1. Reverts all dice with `genre_faces` to original `faces[faceIndex]`
2. If current genre has a matching entry, replaces with `genre_faces[genre][faceIndex]`

This runs on every `rollAll()` and `rerollDie()`. When the genre die itself is re-rolled, `App._rerollPill()` detects the genre change and refreshes all pill UI values. Adding new genre faces requires: new entries in `genre_faces` for each die, entries in `genreChapterNames` / `genreActNames` in `pacing.js`, entries in `genreTropes` in `app.js._getCurrentTrope()`, and a genre section in `app.js._showThinkingIndicator()`.

### Debug Mode
Set `debugMode: true` in localStorage `ss_config` to skip API calls and load the preset world from `Store.getDebugPreset()`. Useful for UI iteration without a real API key. Debug preset lacks `pacing` and `diceResults` — `Pacing.init(undefined)` resets to defaults, genre is extracted from `worldSummary` via regex.

### Persistence
All data in `localStorage`. Keys: `ss_config`, `ss_save_index`, `ss_slot_*`. Each world save is a full snapshot of `game` object (history, dice results, pacing state).

## Non-Obvious

- No package.json, no build step. Edit JS/HTML/CSS directly.
- No test framework. Testing: `AGENTS.md` tests in `/tmp/opencode/test-*.mjs` with Node 25+ (global fetch available).
- **Browser testing**: `python3 -m http.server 8080` + Playwright MCP. Must clear browser cache via CDP (`Network.clearBrowserCache` + `Network.setCacheDisabled`) before reloading after code changes — Playwright aggressively caches JS. `node -c js/*.js` for syntax check.
- API key for real testing: `DEEPSEEK_API_KEY` env var. Set in localStorage via `Store.getConfig().apiKey = process.env.DEEPSEEK_API_KEY`.
- `DiceSystem._getGenre(results)` is called from `App._loadSaveAndPlay()` (`app.js`) for old saves that lack genre in pacing state.
- Chapter index in `genreChapterNames` is 0-based (0=序幕, 1=第1章...). `currentChapter` starts at 1.
- Frontend is designed for mobile-first dark theme. All CSS in one file.
- `Pacing.init()` resets all fields to defaults first, then applies `savedState` / `genre`. This prevents state leaking between different save slots.
- `_isProcessing` flag is cleared inside the typewriter callback (not in a `finally` block), so users can't double-submit during typewriter animation.
- `_addPageMarker()` uses `history.length` (not `+1`) since it runs after `history.push()`.
- `Store.hasSavedGames()` (note the plural 's') — the method name includes 's'.
- Choice buttons use event delegation on `choices-container`; there are no per-button static bindings.
