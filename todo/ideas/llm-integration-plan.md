# LLM Integration Plan for Clowder & Crest

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
