# Nia Indexed Sources

Track sources indexed via Nia so future sessions skip discovery.

## Plan: Startup (upgraded 2026-04-06)

Generous quotas — most practical workloads won't hit limits. See **Quota Budget** at bottom.

## Indexed Docs

- **docs.phaser.io** — Phaser 3 API reference
  - Local ID: `c8ef5086-088c-4e78-84e4-9b06503de323`
  - Global source ID: `e3ec7516256ea634`
  - Query: `nia search query "..." --docs "Phaser 3 Docs" --search-mode sources --fast`
  - Status: serving queries even while initial crawl finishes

- **capacitorjs.com/docs** — Capacitor core docs
  - Local ID: `7eee1668-4d54-45f2-9f7c-ab9cff6c62d1`
  - Global source ID: `681721dd117e4c5f`
  - Query: `nia search query "..." --docs "Capacitor Docs" --search-mode sources --fast`
  - Use for: Android build issues, plugin API questions, iOS prep

## Indexed GitHub Repos

- **JacobStephens2/clowder-and-crest** — this game's own source
  - Local ID: `73036b5c-d77d-4da3-b13c-c46cf6feb1e8`
  - Global source ID: `e4bada6a0bf6a263`
  - Status: indexed
  - Query: `nia search query "..." --repos "JacobStephens2/clowder-and-crest" --search-mode repositories --fast`
  - **Best for:** semantic questions ("where is X handled", "how does Y relate to Z")
  - **Not best for:** literal keyword lookups — Grep is free and faster

## New capabilities unlocked by Startup plan

- **`nia search deep <query>`** — multi-step research (200/month). ⚠ **Not for repo-specific questions.** Confirmed via testing: this tool is web-search-based, does NOT query indexed private sources, and will hallucinate plausible-sounding but fictional files/bugs. Use only for external research (papers, blog posts, open web).
- **`nia oracle`** — autonomous AI research jobs (200/month). Not yet tested. Probably same caveat as `search deep`.
- **Unlimited `nia packages`** — semantic/keyword search over any npm, PyPI, crates.io, Go package source without using a quota.

## ⚠ Nia results require verification

Tested on 2026-04-06: `nia search query --repos ours` returned a chapter-progression soft-lock analysis that looked authoritative but was **mixed quality**:

- Some findings were real but **overstated in severity** (e.g. called a visible gate a "silent soft-lock")
- Some were **factually wrong about mechanics** (e.g. claimed "30% random influence gain" when the actual code is deterministic)
- Some were **real but minor** edge cases

**Before acting on any Nia finding**, verify against the actual code via Grep/Read. Do not let Nia's confident tone substitute for grounding. The LLM layer editorializes and extrapolates from the retrieved snippets — treat findings as hypotheses to verify, not conclusions.

`nia search deep` is WORSE than this — tested on the same question, it invented file names (`chapterSystem.ts`, `gateSystem.ts`) and bugs that don't exist anywhere in the repo. The citations were just the top-level GitHub URL plus an unrelated project. **Never trust `search deep` for private repo analysis.**

## When to use Nia vs direct tools

| Task | Best tool | Why |
|---|---|---|
| Find a specific function/class by name | `Grep` | Free, instant |
| Read a known file | `Read` | Free, instant |
| "How does X relate to Y" across files | `nia search query --repos ours` | Semantic, surfaces cross-file relationships |
| "Where is X handled" when you don't know the file | `nia search query --repos ours` | Semantic, finds indirect implementations |
| Phaser API question | `nia search query --docs "Phaser 3 Docs"` | Authoritative, structured |
| Capacitor / Android question | `nia search query --docs "Capacitor Docs"` | Authoritative |
| External repo code lookup | `nia github search` | Unmetered |
| npm/PyPI package source lookup | `nia packages hybrid` | Unmetered on startup plan |
| Open-ended "figure out X" | `nia oracle` or `nia search deep` | Multi-step autonomous research |
| Explore codebase structure | `Agent` (Explore) | Multi-step, saves main context |

## Candidates to index (if we hit them repeatedly)

- `liabru/matter-js` — Matter.js physics; only if PounceScene gets deeper
- `vitejs/vite` docs — if Vite config questions arise
- `microsoft/TypeScript` — if weird type errors need deep lookup

Free plan note: **indexing is no longer scarce** — index any doc or repo we'll touch more than twice.

## Current Quota Budget (resets 2026-05-01)

- queries: 4/5000 used
- indexing: 3/500 used (capacitor added as a subscribe-under-the-hood, didn't count toward my quota)
- deep_research: 0/200
- oracle: 0/200
- web_search: 0/1000
- tracer: 0/200
- package_search: unlimited
- GitHub live search: unmetered
