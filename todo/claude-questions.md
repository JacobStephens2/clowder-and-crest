# Claude Questions & Notes for Jacob

Notes, questions, and decisions made while working through the 2026-04-18 playtest feedback.

---

## Questions

1. **"add personality to the art of the lean to detail view"** — What kind of personality are you envisioning? The lean-to currently shows the room grid with cats and furniture. Should I add flavor text, weather effects, animated details, or something else?

2. **"make each cat's intro / recruitment scene unique"** — The current recruitment flow is a shared template with breed-specific flavor text. To make each truly unique, I'd need 5 different narrative scenes with different beats. Should I write the narrative scripts, or do you want to author those and I wire them in?

3. **"add guild scenes that can happen before all the cats are recruited"** — How many do you want? I can write 2-3 group conversations for partial rosters (e.g. wildcat+russian_blue+tuxedo after Ch.2). Do you want to approve the dialogue or should I draft it?

4. **"in the bengal intro scene, use portrait art to show discussion between wildcat and bengal"** — Should I use the existing pair dialogue portrait system to write a bengal-specific recruitment conversation?

5. **"add some game changing effect to opening each room"** — Ideas:
   - Operations Hall: unlocks a daily intel report (job preview for tomorrow)
   - Kitchen: passive fish income (+1 fish/day)
   - Sleeping Quarters: morale recovery bonus
   Which direction feels right?

6. **"there should be some more incentive to generally have some cats stationed in each different room"** — Room stationing could provide passive bonuses (e.g. cat in kitchen = +1 fish/day, cat in operations = +5% job reward). How deep should this system go?

7. **"add jobs that are shady / shadow aligned, but are more lucrative"** — Should I add new shadow-specific job templates, or boost the existing shadow category's rewards + add reputation cost?

8. **"limit the buildings jobs can be fulfilled at"** — Should ALL jobs be building-locked (dock jobs at docks, cathedral at cathedral), or just some categories?

## Decisions Made (no question needed, just FYI)

- **Ritual candles not lighting up**: My earlier change set candle glow idle alpha to 0 — correct, but the 250ms flash was too brief. Increasing to 400ms and boosting glow scale.
- **Ch.1 → 2 job types / 4 minigames**: Moving courier category to Ch.1 so the player starts with pest_control (chase, hunt) + courier (sokoban, courier_run) = 4 minigames on day 1.
- **Sprint colored squares → pixel art**: Wiring the existing obstacle sprites (cart, crate, flour_sack, pew) into CourierRunScene so each obstacle type has distinct pixel art.
- **Removing lecture text**: "Perfect clears snowball..." and "Keep repeating... specialization" lines removed from result overlay. Game teaches through play.
- **Auto-save**: Adding saveGame() at end of each day transition.
- **Easy Sokoban**: Adding wall obstacles to the first 2 easy levels so they require 4-5 moves instead of 2-3.
- **Plague progress**: Enabling guard + sacred job categories (patrol, brawl, ritual, etc.) to also count toward plague progress alongside pest_control.
- **No festivals during plague**: Suppressing market festivals when ratPlagueStarted && !ratPlagueResolved.
- **Long Winter trigger**: Adding a clear hint in the chapter-advance hint text so the player knows what triggers the Long Winter.
- **Hard rooftop height**: Reducing WORLD_HEIGHT for hard difficulty to shorten the climb.
