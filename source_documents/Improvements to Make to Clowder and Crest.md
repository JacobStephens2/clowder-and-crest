<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# What room for improvement does the Clowder \& Crest have? Feel free to be critical and even harsh in the interest of making it better.

Here's my honest critique of Clowder \& Crest. There's a lot of love in this design, but several structural weaknesses could undermine it.

## The God File Problem

`main.ts` is doing *way* too much. It handles game state, HTML overlay wiring, the day timer, music, and all event handlers in a single file. This is a maintenance nightmare waiting to happen. As you add deferred features (reputation system, new job categories, more puzzles), this file will become unmanageable. You need to decompose it — a `DayTimerSystem`, a `MusicManager`, a `UIController` — before it calcifies.[^1_1]

## Content Is Dangerously Thin

- **5 puzzles.** That's it. A player who does 2 jobs per day will exhaust unique puzzles by day 3. Rush Hour puzzles are already a niche taste; repeating the same 5 will feel like a chore fast. Procedural generation is deferred, but it shouldn't be — it's existential for replayability.[^1_1]
- **8 job templates** across only 2 categories. The job board will feel repetitive within a single play session.[^1_1]
- **9 conversation scripts** total. With only 3 bond pairings, most cat-to-cat relationships have zero dialogue. The remaining 7 possible pairings (out of 10 total for 5 cats) are silent, which undermines the bond system's purpose.[^1_1]


## The Economy Has No Sink

Fish comes in from jobs and stationed cats, but the sinks are finite: 3 rooms (~150 fish total) and 15 furniture items. Once a player buys everything, fish becomes meaningless. Stationed jobs then generate wealth with no purpose. There's no upkeep, no recurring cost, no reason to keep earning. The late game is economically dead.[^1_1]

## Stationed Jobs Break the Core Loop

The stationed job system is a trap. A rational player will station their best-matched cats at the highest-paying jobs immediately, then... what? They can't use those cats for puzzles. With 5 cats and limited jobs, stationing 2-3 cats means the remaining roster is too thin for interesting daily choices. The passive income also accelerates the "nothing left to buy" problem above.[^1_1]

## Progression Triggers Are Grindy and Opaque

Chapter 4 requires 15 completed jobs; Chapter 5 requires 30. At one job per cat per day (with some cats stationed), and only 5-minute days, this is a lot of repetitive cycling through the same 8 job templates and 5 puzzles. The triggers also combine multiple conditions (fish + cats + jobs) but the document doesn't describe how these are communicated to the player. If the player doesn't know what's gating them, it just feels like nothing is happening.[^1_1]

## 4 of 5 Breeds Are Invisible

Only the Wildcat has pixel art sprites. The other 4 breeds render as "colored silhouettes" via Phaser primitives. For a game whose entire emotional hook is *cats*, shipping with placeholder art for 80% of your roster is a serious problem. The Russian Blue, Tuxedo, Maine Coon, and Siamese are the cats players are *paying fish to recruit*, and they look like debug shapes.[^1_1]

## Mood and Traits Are Decorative

The document lists mood states (Happy/Content/Tired/Unhappy) and 10 traits, but never describes what they *do* mechanically. If Lazy doesn't reduce work output and Brave doesn't affect job success rates, they're flavor text the player will ignore after reading once. Systems that exist but don't matter are worse than absent systems — they create the expectation of depth without delivering it.[^1_1]

## No Fail State or Tension

Nothing bad ever happens. Jobs can be auto-resolved for guaranteed (lower) income. There's no food upkeep, no cat illness, no rival guild, no consequence for ignoring the Rat Plague timeline. The "cozy-but-somber" tone promises weight, but the mechanics are pure comfort. The Rags to Riches arc needs actual risk of failure to feel earned.[^1_1]

## localStorage Is a Liability

Saving exclusively to `localStorage` with no cloud sync means a cleared browser cache or an app reinstall wipes all progress. For a progression-heavy game where reaching Chapter 5 takes hours, this is unacceptable. At minimum, an export/import save feature would be trivial to add as a stopgap.[^1_1]

## The Hybrid UI Architecture Will Fight You

Splitting rendering between Phaser canvas and HTML/CSS overlays connected by an event bus is pragmatic for an MVP, but it creates a two-world problem. Every new feature has to decide which layer it lives in, and cross-layer interactions (e.g., clicking an HTML card to trigger a Phaser animation) add latency and debugging complexity. This won't scale cleanly as you add town exploration, more room types, or richer animations.[^1_1]

## What I'd Prioritize

1. **Procedural puzzle generation** — this is survival-critical for retention
2. **Finish breed sprites** — you can't sell a cat game with silhouettes
3. **Add a fish sink** — upkeep costs, room degradation, cat food, *something*
4. **Make traits and mood mechanical** — they should affect job outcomes
5. **Save export/import** — one afternoon of work, saves enormous player frustration
6. **Break up main.ts** — before it becomes archaeological

The vision is genuinely compelling — the tone, the lore, the Booker structure, the saint references. But right now the design document describes a game with more *systems* than *content*, and more *flavor* than *mechanics*. The bones are good; the meat needs work.

<div align="center">⁂</div>

[^1_1]: Clowder-and-Crest-MVP-Design-Document-v3.md


---

# What management games implement stationed jobs / passive income well? And what inspiration could I take from that for Clowder \& Crest?

Several games handle stationed workers and passive income really well, each with lessons directly applicable to Clowder \& Crest.

## Majesty: The Fantasy Kingdom Sim

This is probably the single most relevant reference. In Majesty, you don't control heroes directly — they have autonomous AI and you incentivize them with bounty flags. Heroes decide *whether* to take a job based on their personality stats (including a Greed attribute that multiplies how attractive a bounty looks). The key insight: **stationed/autonomous units should have agency and unpredictability.** Your cats currently just silently earn fish. Instead, stationed cats could occasionally refuse work (Lazy trait), bring back bonus items (Curious trait), or get into trouble requiring rescue. The indirect control model makes passive income *dramatic* rather than a spreadsheet.[^2_1][^2_2][^2_3]

## Assassin's Creed Brotherhood

Brotherhood's shop renovation system is the classic passive income loop: buy properties → they generate income every 20 minutes → collect from banks. But players and critics noted its fatal flaw — **the income quickly outpaces all available sinks**, creating a tidal wave of money with nothing to spend it on. Your stationed jobs have exactly this problem. Brotherhood tried to address it in later iterations by adding investment risk and popularity mechanics — shops had risk factors and diminishing returns based on popularity. Takeaway: **passive income needs decay, risk, or scaling costs** to stay interesting. Stationed cats could face events (the job location gets raided by rats, reducing earnings until you intervene) or diminishing returns the longer they stay without rotation.[^2_4][^2_5]

## Frostpunk

Frostpunk treats worker assignment as a zero-sum resource allocation puzzle. Every worker assigned to coal production is one fewer worker available for construction or medical care. The tension comes from **opportunity cost under scarcity** — you never have enough workers for everything. Right now, Clowder \& Crest has this in theory (stationed cats can't do daily jobs), but with 5 cats and only a few meaningful daily decisions, the tradeoff isn't painful enough. Frostpunk also makes location and timing matter — workers have travel time, shift schedules, and priority conflicts. You could add similar friction: stationed cats take a day to travel back when recalled, or certain stations are only available during specific day phases.[^2_6]

## Idle Game Design Patterns

The idle/incremental genre has formalized passive income design extensively. The key framework:[^2_7]

- **Manual → Automated progression**: Players start doing everything manually, then unlock automation as a reward. Your cats should earn stationing as a *privilege* (e.g., only level 3+ cats can be stationed).
- **Offline progress with caps**: Earnings accumulate while away but hit a cap, requiring active collection. This prevents infinite AFK accumulation.[^2_7]
- **Reset/prestige mechanics**: When passive income trivializes the economy, a reset mechanic (like the Rat Plague wiping out stationed positions) forces rebuilding with bonuses.[^2_7]


## Viticulture (Board Game)

Viticulture's seasonal worker placement forces you to plan across time phases — spring workers and summer workers serve different purposes, and you can't do everything. Your day phases (Dawn through Night) are purely cosmetic right now. You could make stationed jobs phase-dependent: mousing jobs earn more at Night, courier jobs only during Morning/Midday. This turns stationing into a **scheduling puzzle** rather than a set-and-forget decision.[^2_8][^2_9]

## Concrete Recommendations for Clowder \& Crest

1. **Stationing should be earned, not immediate** — require level 2+ or a specific trait. This preserves early-game manual engagement.[^2_7]
2. **Add station events** — rats attack the granary, a courier route gets blocked, a cathedral cat gets spooked. Stationed cats occasionally need intervention, creating a "check your empire" loop inspired by Majesty's unpredictable heroes.[^2_1]
3. **Diminishing returns or rotation bonuses** — a cat stationed at the same job for 5+ days gets bored (mood drops), but rotating stations gives a freshness bonus. This prevents set-and-forget.
4. **Cap passive earnings** — fish accumulate up to a daily cap per station, requiring active collection. Uncollected fish beyond the cap are lost.[^2_7]
5. **Make the Rat Plague disrupt stations** — when Chapter 3 triggers, all pest control stations get overrun and must be re-established at higher difficulty. This is your "prestige reset" moment.[^2_7]
6. **Phase-sensitive earnings** — tie station productivity to time-of-day phases so players think about *when* and *where*, not just *who*.[^2_8]

The core problem right now is that stationing is a purely rational optimization with no friction, surprise, or ongoing engagement. The best implementations across these games all share one trait: **passive income should create new decisions, not eliminate them.**
<span style="display:none">[^2_10][^2_11][^2_12][^2_13][^2_14][^2_15][^2_16][^2_17][^2_18][^2_19][^2_20][^2_21][^2_22][^2_23][^2_24][^2_25][^2_26][^2_27][^2_28][^2_29][^2_30][^2_31][^2_32][^2_33][^2_34][^2_35][^2_36][^2_37][^2_38][^2_39][^2_40][^2_41][^2_42][^2_43][^2_44]</span>

<div align="center">⁂</div>

[^2_1]: https://www.youtube.com/watch?v=NfZE64KXTlM

[^2_2]: https://majesty.fandom.com/wiki/Attributes

[^2_3]: https://steamcommunity.com/app/1697870/discussions/0/530969757695895228/

[^2_4]: https://www.reddit.com/r/assassinscreed/comments/b8ccxd/the_passive_income_you_used_to_get_in_these_games/

[^2_5]: https://steamcommunity.com/app/48190/discussions/0/1457328392109559472/

[^2_6]: https://www.reddit.com/r/Frostpunk/comments/8l37in/advanced_guide_to_frostpunk_worker_mechanics/

[^2_7]: https://adriancrook.com/passive-resource-systems-in-idle-games/

[^2_8]: https://streamlinedgaming.com/worker-placement-games/

[^2_9]: https://stidjenplayssolo.wordpress.com/2020/02/03/favorite-mechanics-worker-placement/

[^2_10]: https://www.reddit.com/r/gamingsuggestions/comments/17fro9f/games_with_a_passive_income_mechanic/

[^2_11]: https://www.wired.com/gallery/best-management-city-building-games/

[^2_12]: https://www.whatboardgame.com/post/top-5-worker-placement-games

[^2_13]: https://www.youtube.com/watch?v=Elky8Bknl04

[^2_14]: https://www.gamespot.com/articles/build-a-japanese-vending-machine-empire-in-this-cute-management-sim/1100-6534565/

[^2_15]: https://www.leagueofgamemakers.com/how-to-design-a-worker-placement-game-part-1/

[^2_16]: https://games.themindstudios.com/post/idle-clicker-game-design-and-monetization/

[^2_17]: https://www.youtube.com/watch?v=IeCuT8295e8

[^2_18]: https://www.youtube.com/watch?v=oC_IYhqugI8

[^2_19]: https://www.reddit.com/r/IdleMinerTycoon/comments/ewhw8s/question_regarding_idle_cashmine_income_factor/

[^2_20]: https://www.facebook.com/groups/boardgamerevolution/posts/4034289530196288/

[^2_21]: https://make-more-idle-manager.fandom.com/wiki/Workers

[^2_22]: https://gamefaqs.gamespot.com/boards/996092-assassins-creed-brotherhood/57183702

[^2_23]: https://www.youtube.com/watch?v=UFBmtYateSU

[^2_24]: https://www.youtube.com/watch?v=6sFn9brtRt8

[^2_25]: https://www.reddit.com/r/darkestdungeon/comments/fz00jb/roster_management/

[^2_26]: https://www.facebook.com/groups/420065644049555/posts/872519905470791/

[^2_27]: https://assassinscreed.fandom.com/f/p/4400000000000123290

[^2_28]: https://screenrant.com/darkest-dungeon-manage-party-members-tips-strategies/

[^2_29]: https://steamcommunity.com/app/48190/discussions/0/619568793976333299/?l=german

[^2_30]: https://www.youtube.com/watch?v=Jgqiwus-yuw

[^2_31]: http://cdn.akamai.steamstatic.com/steam/apps/25990/manuals/Majesty_Manual_HD.pdf?t=1447352469

[^2_32]: https://www.youtube.com/watch?v=vlH-9D59vvE

[^2_33]: https://rusroleplayrants.com/tag/game-design/

[^2_34]: https://www.youtube.com/watch?v=Ai9Wyz0uxDs

[^2_35]: https://steamcommunity.com/app/73230/discussions/0/3076495389969813066/

[^2_36]: https://www.reddit.com/r/MajestyGold/comments/1kmqo25/tips_for_advanced_difficulty_in_majesty/

[^2_37]: https://www.reddit.com/r/Kairosoft/comments/4nskls/station_manager_cash_flow/

[^2_38]: https://frostpunk.fandom.com/wiki/Advanced_Tips

[^2_39]: https://www.scribd.com/document/420837690/Online-Games-Social-Narratives

[^2_40]: https://www.tech-gaming.com/lessaria/

[^2_41]: https://steamcommunity.com/app/323190/discussions/0/1696045708652653639/

[^2_42]: https://kairosoft.fandom.com/wiki/Structures_(Station_Manager)

[^2_43]: https://milkandhate.wordpress.com/2025/07/18/majesty-2-majesty-2-collection-steam/

[^2_44]: https://frostpunk.game-vault.net/wiki/Buildings

