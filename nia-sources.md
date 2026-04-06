# Nia Indexed Sources

Track sources indexed via Nia so future sessions skip discovery.

## Indexed Docs

- **docs.phaser.io** — Phaser 3 API reference
  - Source ID: `c8ef5086-088c-4e78-84e4-9b06503de323` (local reference)
  - Global source ID: `e3ec7516256ea634` (shared across all Nia users)
  - Query via: `nia search query "..." --docs "Phaser 3 Docs" --search-mode sources --fast`
  - Status: processing (indexing can take 30+ min for large docs sites)

## Indexed GitHub Repos

- **JacobStephens2/clowder-and-crest** — this game's own source
  - Repository ID: `69d3307b87a12793570a2d42`
  - Global source ID: `e4bada6a0bf6a263`
  - Status: indexed (ready)
  - Query via: `nia search query "..." --repos "JacobStephens2/clowder-and-crest" --search-mode repositories --fast`
  - **Best for:** semantic questions about the codebase ("where is X handled", "how does Y relate to Z", cross-file concerns)
  - **Not best for:** literal keyword lookups — use Grep/Read directly, they're free and faster

## Lessons Learned (April 2026)

**Subscribe before index for public sources.** docs.phaser.io is a globally shared source. Nia's architecture:

- A source with `is_global: true` is a single shared index across all users.
- `nia sources index <url>` → **costs 1/3 indexing slot**, creates a local reference that can be targeted in queries via `--docs "<name>"`.
- `nia sources subscribe <url>` → **free**, but does NOT create a resolvable local reference — queries that specify `--docs` won't find it.
- Deleting a source does NOT refund the indexing slot (it's a monthly tally of kickoffs, not a current-state count).

**I spent 2/3 slots on docs.phaser.io this month due to:**
1. Running `sources index` instead of checking for public availability first
2. Deleting and re-indexing to test behavior (didn't refund)

**Rule going forward for known-public docs:**
```
# Option A — free, no targeting:
nia sources subscribe <url>
# Then query without --docs and hope the semantic search picks the right source.

# Option B — paid (1 slot), targetable:
nia sources index <url> --name "<Display Name>"
# Can then query with --docs "<Display Name>".
```
Option B is worth the slot cost if we'll target the source frequently, which is the case for Phaser docs.

## Candidates (only if we start consulting them frequently)

- `capacitor.dev` docs — if Android build issues recur; **subscribe first, then only index if needed**
- `liabru/matter-js` GitHub repo — only if PounceScene physics gets deeper; use `nia github search` (free)

## Current Quota Budget (resets 2026-05-01)

- queries: 4/50 used
- indexing: 3/3 used — **no more indexing slots this month**
- Everything else: 0 used
- GitHub live search: unmetered

## When to use Nia vs direct tools

| Task | Best tool | Why |
|---|---|---|
| Find a specific function/class by name | `Grep` | Free, instant |
| Read a known file | `Read` | Free, instant |
| "How does X relate to Y" across files | `nia search query --repos ours` | Semantic, surfaces cross-file relationships |
| "Where is X handled" when you don't know the file | `nia search query --repos ours` | Semantic, may find indirect implementations |
| Phaser API question | `nia search query --docs "Phaser 3 Docs"` | Authoritative, structured |
| External repo code lookup | `nia github search` | Free, unmetered |
| Explore codebase structure | `Agent` (Explore) | Multi-step, saves main context |
