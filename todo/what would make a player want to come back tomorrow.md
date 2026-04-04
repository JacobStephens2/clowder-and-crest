Based on a close reading of your design document, story, and README, here's my assessment of what would—and wouldn't—bring a player back tomorrow.

## What You Already Have That Creates Return Motivation

**Daily cat wishes** are your single strongest "come back tomorrow" hook right now. One random cat per day has a specific desire, and fulfilling it yields mood/bond/stat rewards. This is personal and varied enough to generate curiosity about what tomorrow's wish will be. [github](https://github.com/JacobStephens2/clowder-and-crest)

**Bond conversation unlocks** function as a slow-drip narrative reward. Players working toward the next threshold (10/25/50 bond points) have a reason to keep pairing cats on jobs. The 33 total scripts across all pairings give real depth here.

**The traveling merchant every 3rd day** creates a calendar rhythm—players know something special is coming and may want to have fish saved for it. [github](https://github.com/JacobStephens2/clowder-and-crest)

**Stationed job events** (10-20% daily chance) mean something unpredictable could happen overnight that requires your attention. [github](https://github.com/JacobStephens2/clowder-and-crest)

## The Core Retention Problem

Your game currently lacks **state that changes while the player is away**. The 3-minute day timer is real-time but only runs while playing. There's no offline progression, no "your cats did something while you were gone" beyond the welcome-back message. This means closing the game freezes everything—there's nothing pulling you back because nothing happened without you. [github](https://github.com/JacobStephens2/clowder-and-crest)

Compare to the games you reference: Stardew Valley has crops growing, seasons turning. Kingdom Two Crowns has threats advancing. Your game pauses completely.

## Specific Recommendations, Ranked by Impact

**1. Offline stationed earnings + events.** When the player returns, stationed cats should have accumulated fish (capped) and possibly triggered events that need resolution. This is the single highest-impact change for retention because it makes time away feel productive and return feel urgent. The infrastructure is already there—you have stationed jobs with diminishing returns and station events. [github](https://github.com/JacobStephens2/clowder-and-crest)

**2. Multi-day job contracts.** Currently every job is a one-day affair. A 3-day or 5-day contract (e.g., "Cathedral Rat Siege — 3 days, escalating difficulty, big payout") would create an in-progress commitment that pulls players back to see it through. This also makes the chapter 3 Rat Plague feel more like an actual siege rather than a sequence of discrete jobs.

**3. Mood decay that matters on return.** Right now, unfed cats lose mood tiers, and after 2 broke days a cat can leave. But this only triggers during active play. If mood decayed slightly during absence (simulating missed meals), returning to check on your cats becomes emotionally motivated—not just economically. The "fish crisis" mechanic already exists; extend it to offline time. [github](https://github.com/JacobStephens2/clowder-and-crest)

**4. Seasonal/cyclical events tied to the Catholic calendar.** Your mythlore references St. Gertrude (March 17), St. Rosalia (September 4), and St. Francis (October 4). Limited-time jobs, special merchant inventory, or unique bond conversations on these dates would create real-world calendar hooks that no generic daily quest system can match. This is thematically unique to your game.

**5. Tomorrow's job board preview.** At end-of-day, show a teaser of one job appearing tomorrow (e.g., "A sealed letter from the monastery arrives at dawn"). This is low-effort to implement and creates specific anticipation. The job board already refreshes daily; just surface one upcoming entry. [github](https://github.com/JacobStephens2/clowder-and-crest)

**6. Bond conversation cliffhangers.** Your C→B→A conversation arcs currently unlock at fixed thresholds. If rank C conversations ended with a narrative hook ("I need to tell you something... but not tonight"), players would grind bond points specifically to unlock the next rank. The writing in your story doc already has this quality—the Wildcat/Russian Blue "trust and vulnerability" arc naturally lends itself to cliffhangers. [github](https://github.com/JacobStephens2/clowder-and-crest)

## What Won't Work for Retention (That Might Seem Tempting)

- **More minigames alone** won't help. Players return for *state changes and narrative progress*, not for another sliding block puzzle. The minigames are a means to an end.
- **Higher fish rewards** won't help. Inflation makes the economy feel meaningless faster, which *reduces* retention.
- **More cats/breeds** won't help until the existing 5 feel deeply differentiated in personality through bonds and wishes. Breadth without depth doesn't create attachment.

## The One-Sentence Answer

Players come back tomorrow when **something happened while they were gone** and **something specific is waiting for them**—you need offline progression (stationed earnings + events) and forward-looking hooks (job previews, conversation cliffhangers, calendar events) to bridge the gap between sessions.