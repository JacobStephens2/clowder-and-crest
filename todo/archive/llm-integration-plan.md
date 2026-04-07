# LLM Integration Plan for Clowder & Crest

## Status: held off (2026-04-07)

**Decision: don't implement this yet.** The plan below is well-designed and the analysis stands as written, but on review the cost/benefit isn't there for the game's current state.

### Why hold off

1. **The static content is fine, not a bottleneck.** The three integration points the plan targets already have substantial procedural content:
   - `src/systems/JobBoard.ts:151` `getJobFlavor()` returns procedural variants (4 per category × 6 categories = 24 unique strings)
   - `src/systems/GameSystems.ts:23` `getDailyWish()` has 5 fixed wishes selected based on cat mood/level/furniture
   - `src/systems/SaveManager.ts:227` `addJournalEntry()` is called from ~15 sites in `main.ts` with hand-authored templates that already include cat names, level numbers, and event context

   Players would have to play *a lot* to feel repetition fatigue at this density. The game isn't at the scale where this matters yet.

2. **It requires standing up infrastructure that doesn't exist.** Today the deployment is dead-simple — Vite builds to `dist/`, Apache serves it. Adding a proxy means a Node/PHP/Worker process, secret management, rate limiting per-IP (no user accounts to limit by), a cache layer, budget cap enforcement, monitoring + alerting for cost runaway, CORS / Apache reverse-proxy config, and a new failure mode (network down → degraded gameplay). That's real ongoing operational surface for a game that currently has zero ops surface.

3. **It compromises the Capacitor offline experience.** The v2.2.0 APK is a clean offline-capable native app. Adding LLM-powered flavor either degrades on Android (network required) or requires complex sync logic to pre-generate batches client-side. The "whole game works offline" property is a real positive that adding this would give up.

4. **Real cost risk for an unscoped audience.** Even with rate limits, a misconfigured endpoint or a bot crawling the proxy can rack up charges fast. The plan's $0.001-0.006 per generation × 50/day/player assumption is sane for one player, alarming if the game gets a Reddit thread on a weekend.

5. **Higher-impact items are already in flight.** Each of these would be felt by every player; LLM-generated journal text would be felt by a small subset of players who play 30+ days:
   - 18 dialogue portrait images to generate (Midjourney prompts file ready)
   - 12 pending Suno music tracks
   - 6 new cat breeds (3 big cats + 3 domestic) with art
   - More conversation scripts as the cast grows

6. **AI budget has competing uses.** Personal AI tokens (Claude / Gemini for development work) are more valuable to the author than the same dollar generating "Day 14: Whiskers cleared the cathedral cellar."

### When to revisit

The plan becomes interesting when *one* of these is true:

- A recurring player base exists that's large enough that someone other than the author says "the daily flavor text gets repetitive"
- A new feature genuinely requires generation (e.g. "tell me about my guild's history" where there's no static answer that could exist)
- A server backend is being added for another reason (cloud save, leaderboards, social) and the LLM proxy becomes incremental rather than greenfield
- The game is in an event/showcase context where "uses AI to write flavor text" is a useful pitch — but that's marketing, not gameplay

### If implemented later, here's where it lands

| Plan component | Touchpoint in the codebase |
|---|---|
| `LlmContent.ts` client wrapper | New file: `src/systems/LlmContent.ts` |
| Daily journal summary hook | `src/main.ts` `advanceDay()` return path, after `checkChapterAdvance` and before the daily notification schedule — would call the proxy with the day's events and store the result via `addJournalEntry` |
| Job flavor text hook | `src/systems/JobBoard.ts:151` — `getJobFlavor()` becomes async, OR (better) a separate `getJobFlavorAsync()` that's preloaded into a cache by the day-start logic |
| Cat wish hook | `src/systems/GameSystems.ts:23` — same pattern as job flavor |
| Server proxy | **Option A (lowest friction):** PHP script on the existing Apache (PHP infrastructure already exists for Tourbot/ETA/Wedding/Exodus/Artifact). `clowderandcrest.com/api/generate.php` is the simplest possible deploy. **Option B:** Cloudflare Worker on a free tier subdomain — clean separation, no ops on Apache, requires DNS work. **Option C:** Node Express endpoint — needs a process supervisor (systemd) and Apache reverse-proxy config. |
| Secrets | `~/.env` or `/etc/clowder-llm-proxy/secrets.env`, never in repo |
| Apache config | One new `<Location /api/generate>` block reverse-proxying to the backend, plus a rate-limit module if used |

**Lowest-friction "later" path:** PHP script on the existing Apache. The language stack, deploy story, and SSL cert are already in place. ~50 lines of PHP for the proxy + ~80 lines of TypeScript for the client wrapper. ~3 hours total.

### Tiny prep work that could happen now (optional)

If you want to make this cheap to add later without committing to it:

- Refactor the three target functions (`getJobFlavor`, `getDailyWish`, journal entry generation) so they're already async-shaped, returning `Promise<string>` even though today they resolve synchronously. Then "add an LLM call here" later is a 1-line change rather than a propagating refactor through every caller.

That's ~30 minutes of work, no API keys, no infrastructure. Optional — the current sync API is fine and the refactor can happen the day you actually flip the switch.

---

## Original plan

The plan below is preserved as the reference for what would be built if/when the decision to hold off is reversed.

## Model Strategy

| Role | Model | Rationale |
|---|---|---|
| **Primary** | Claude Haiku 3.5 | Best tone/voice quality for cozy narrative flavor text; excellent structured output |
| **Fallback** | Gemini 2.5 Flash | ~60% cheaper per token; use when scaling costs become a concern |

The proxy layer handles model selection — the client always calls `/api/generate` and never knows which model responded.

## What We'd Need

### 1. API Access
- **Claude API key** (primary — Anthropic console)
- **Gemini API key** (fallback — Google AI Studio)
- Both keys stored server-side (never in the client bundle)
- A thin proxy endpoint to relay requests from the game client

### 2. Server-Side Proxy
Simplest option: a single serverless function (Cloudflare Worker, Vercel Edge Function, or a simple Express endpoint on the existing Apache server).

```
Client → POST /api/generate → Proxy selects model → Claude Haiku 3.5 (or Gemini Flash) → Response → Client
```

**Why a proxy?** API keys can't be in client-side JavaScript. The proxy also lets you:
- Route between primary (Claude) and fallback (Gemini) without touching client code
- Rate-limit per player (prevent abuse)
- Cache responses (same inputs → same outputs, save API calls)
- Add a fallback if the primary API is down

**Model routing logic (proxy pseudocode):**
```typescript
// Cloudflare Worker or Express handler
async function handleGenerate(req) {
  // Use Gemini if: cost flag is set, Claude is down, or request is marked low-priority
  const useFallback = env.USE_GEMINI_FALLBACK === 'true' || req.body.priority === 'low';

  if (useFallback) {
    return await callGeminiFlash(req.body);
  }
  return await callClaudeHaiku(req.body);
}
```

### 3. Estimated Setup
| Component | Effort | Cost |
|---|---|---|
| Claude Haiku 3.5 API key | 5 min | ~$1.25/1M output tokens (~$0.001–0.006 per generation) |
| Gemini 2.5 Flash API key | 5 min | ~$0.60/1M output tokens (~$0.0005–0.003 per generation) |
| Proxy endpoint (dual-model) | 2-3 hours | Free (Cloudflare Workers free tier) |
| Client integration | 2-3 hours | Free |
| Fallback content | Already exists | Static content is the last-resort fallback |

### 4. Client Integration Pattern

```typescript
// src/systems/LlmContent.ts
const API_URL = '/api/generate'; // proxied — client never calls Claude/Gemini directly

interface GenerateRequest {
  type: 'job_description' | 'journal_entry' | 'cat_wish' | 'conversation_line';
  context: Record<string, any>; // game state relevant to the generation
  priority?: 'normal' | 'low'; // 'low' hints the proxy to use Gemini fallback
}

let cache = new Map<string, string>();

export async function generateContent(req: GenerateRequest): Promise<string | null> {
  const cacheKey = JSON.stringify(req);
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) return null;
    const data = await res.json();
    cache.set(cacheKey, data.text);
    return data.text;
  } catch {
    return null; // fallback to static content
  }
}
```

### 5. Best First Use Cases (ranked by impact/effort)

1. **Daily journal summary** — Generate a 1-2 sentence narrative recap of each day. Low risk (player reads it once), high flavor.
   - Input: day number, jobs completed, fish earned/spent, events
   - Output: "Day 14: Whiskers cleared the cathedral cellar while Belle rested by the hearth. The guild earned 12 fish, but a roof leak cost 3."
   - *Model: Claude Haiku (primary) — voice quality matters most here*

2. **Job flavor text** — Already have procedural variants (4 per category). LLM could generate unlimited unique ones.
   - Input: job name, category, difficulty, day number
   - Output: "The baker's flour stores are under siege again — bold rats this time, chewing through the sacks in broad daylight."
   - *Model: Claude Haiku (primary) or Gemini Flash (acceptable at scale)*

3. **Cat wish text** — Currently 5 fixed wishes. LLM could generate wishes based on mood, level, recent events.
   - Input: cat name, breed, mood, level, furniture owned
   - Output: "Whiskers eyes the scratching post wistfully. 'I haven't had a good scratch in days.'"
   - *Model: Claude Haiku (primary) — character voice is critical*

### 6. What NOT to Use LLM For
- **Game mechanics** — Never let an LLM decide stat numbers, rewards, or difficulty
- **Core narrative** — The chapter story beats should stay authored (they're the game's soul)
- **Real-time gameplay** — No LLM calls during minigames (latency would ruin flow)

### 7. Privacy/Cost Considerations
- Don't send player names or personal data to either API
- Cache aggressively — generate content in batches during day transitions, not on every screen render
- Set a daily API call budget cap (e.g., 50 calls/day per player)
- Switch `USE_GEMINI_FALLBACK=true` in the proxy env to cut costs by ~60% if player counts scale
- Gracefully degrade if both APIs are unavailable — the game is fully playable with static content
