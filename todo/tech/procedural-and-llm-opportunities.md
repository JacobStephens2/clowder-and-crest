# Procedural Generation & LLM Content Opportunities

## Current Procedural Generation

| System | What's Generated | Method |
|---|---|---|
| Rush Hour puzzles | Block layouts per difficulty | BFS-validated random placement (PuzzleGenerator.ts) |
| Sokoban levels | Crate/target positions | Reverse-play with deadlock detection + 8 fallback levels |
| Chase mazes | 13x13 maze walls | Recursive backtracker maze generation |
| Nonogram puzzles | Grid patterns with clues | Random fill + rejection of trivial patterns |
| Hunt rat spawns | Which holes rats pop from, timing | Random hole selection with occupancy check |
| Brawl waves | Rat count, spawn positions, HP scaling | Wave-based escalation with edge spawning |
| Fishing | Fish zone position, current surges | Oscillating zone with random surge timing |
| Daily jobs | Which 4-6 jobs appear each day | Seeded shuffle filtered by chapter/difficulty |
| Cat creation | Individual stat variance, traits | +/-1 on base stats, random trait selection |
| Daily wishes | Which cat, which wish | Seeded by day number |
| Festivals | Which bonus event | 7-day rotation |
| Random expenses | Event type, cost | 15% daily chance from chapter 2+ |
| Station events | Crisis type per stationed cat | 10% daily chance |
| NPC cat wandering | Movement paths in rooms/town | Random adjacent tile selection |

## Where LLM Content Could Add Value

### High Impact, Low Risk

1. **Dynamic conversation flavor text** — Instead of 48 fixed conversations, an LLM could generate unique dialogue lines for bond interactions while keeping the same themes/structure. Feed it: breed pair, rank (C/B/A), bond theme, cat names. Output: 4-6 dialogue lines.

2. **Job descriptions** — Currently 35 fixed job descriptions. An LLM could generate varied flavor text for the same job template each day: "The mill rats are back — bolder this time" vs "A merchant reports gnawing sounds in the flour stores."

3. **Day-end journal entries** — The journal currently logs fixed phrases. An LLM could write a brief narrative summary of each day: "Day 14: Whiskers took on the cathedral mousing while Belle rested. The guild earned 12 fish and the tavern keeper left a gift at the door."

4. **Cat wish text** — Currently 5 fixed wishes. An LLM could generate contextual wishes based on the cat's mood, recent jobs, furniture owned, and relationships.

### Medium Impact

5. **Narrative scene variations** — The plague, inquisition, and rival guild scenes are fixed text. An LLM could generate slight variations based on reputation, cat roster, and player history.

6. **Merchant item descriptions** — Dynamic flavor text for the traveling merchant's wares.

7. **Achievement flavor text** — Personalized celebration messages when milestones are hit.

### Lower Priority (More Complex)

8. **Procedural Sokoban level narratives** — Frame each puzzle with a story: "The mill floor is cluttered with flour sacks. Clear a path to the rat nest in the corner."

9. **Cat personality evolution** — LLM generates trait descriptions that evolve as bonds deepen and events occur.

10. **Town gossip system** — NPCs in the town map could share LLM-generated rumors about upcoming events, job tips, or lore.

## Implementation Notes

- LLM calls should be **async and cached** — generate content during idle moments, not blocking gameplay
- **Fallback to static content** if API is unavailable or slow
- **Content moderation** — filter outputs for inappropriate content since this is a cozy game
- Best API choice: Claude API with structured outputs for consistent formatting
- Cache strategy: generate a batch of content per game day, store in save data
