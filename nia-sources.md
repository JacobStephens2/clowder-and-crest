# Nia Indexed Sources

Track sources indexed via Nia so future sessions skip discovery.

## Indexed Docs

- **docs.phaser.io** — Phaser 3 API reference
  - Source ID: `c8ef5086-088c-4e78-84e4-9b06503de323` (local reference)
  - Global source ID: `e3ec7516256ea634` (shared across all Nia users)
  - Query via: `nia search query "..." --docs "Phaser 3 Docs" --search-mode sources --fast`
  - Status: processing (indexing can take 30+ min for large docs sites)

## Indexed GitHub Repos

_(none — use `nia github search/tree/read` for live search without indexing)_

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

- queries: 2/50 used
- indexing: 2/3 used — **only 1 slot left this month, spend carefully**
- Everything else: 0 used
- GitHub live search: unmetered
