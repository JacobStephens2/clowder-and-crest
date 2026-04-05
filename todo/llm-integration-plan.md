# LLM Integration Plan for Clowder & Crest

## What We'd Need

### 1. API Access
- **Claude API** (recommended for quality + structured output)
- API key stored server-side (never in the client bundle)
- A thin proxy endpoint to relay requests from the game client

### 2. Server-Side Proxy
Simplest option: a single serverless function (Cloudflare Worker, Vercel Edge Function, or a simple Express endpoint on the existing Apache server).

```
Client → POST /api/generate → Proxy adds API key → Claude API → Response → Client
```

**Why a proxy?** API keys can't be in client-side JavaScript. The proxy also lets you:
- Rate-limit per player (prevent abuse)
- Cache responses (same inputs → same outputs, save API calls)
- Add a fallback if the API is down

### 3. Estimated Setup
| Component | Effort | Cost |
|---|---|---|
| Claude API key | 5 min | Pay-per-use (~$0.001-0.01 per generation) |
| Proxy endpoint | 1-2 hours | Free (Cloudflare Workers free tier) |
| Client integration | 2-3 hours | Free |
| Fallback content | Already exists | Static content is the fallback |

### 4. Client Integration Pattern

```typescript
// src/systems/LlmContent.ts
const API_URL = '/api/generate'; // proxied to Claude

interface GenerateRequest {
  type: 'job_description' | 'journal_entry' | 'cat_wish' | 'conversation_line';
  context: Record<string, any>; // game state relevant to the generation
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

2. **Job flavor text** — Already have procedural variants (4 per category). LLM could generate unlimited unique ones.
   - Input: job name, category, difficulty, day number
   - Output: "The baker's flour stores are under siege again — bold rats this time, chewing through the sacks in broad daylight."

3. **Cat wish text** — Currently 5 fixed wishes. LLM could generate wishes based on mood, level, recent events.
   - Input: cat name, breed, mood, level, furniture owned
   - Output: "Whiskers eyes the scratching post wistfully. 'I haven't had a good scratch in days.'"

### 6. What NOT to Use LLM For
- **Game mechanics** — Never let an LLM decide stat numbers, rewards, or difficulty
- **Core narrative** — The chapter story beats should stay authored (they're the game's soul)
- **Real-time gameplay** — No LLM calls during minigames (latency would ruin flow)

### 7. Privacy/Cost Considerations
- Don't send player names or personal data to the API
- Cache aggressively — generate content in batches during day transitions, not on every screen render
- Set a daily API call budget cap (e.g., 50 calls/day per player)
- Gracefully degrade if API is unavailable — the game is fully playable without LLM content
