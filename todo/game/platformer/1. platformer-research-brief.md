# Clowder & Crest Platformer Research Brief

## What Clowder & Crest Is

Clowder & Crest is a medieval-fantasy cat guild management game. The player runs a struggling guild of cats, recruits distinct feline characters, assigns them to jobs, improves the guildhall, builds bonds between guild members, and progresses through a larger story about survival, belonging, status, and building a real home.

The tone is warm, storybook, grounded, and a little melancholy rather than wacky or chaotic. The emotional core is that "riches" means not just money, but security, fellowship, reputation, and a place that feels like home.

The game is built in Phaser with TypeScript and ships both as a web game and as an Android APK via Capacitor.

## Current Structure

Clowder & Crest is not a pure action game. Its main loop is:

1. Manage the guild and choose jobs.
2. Play a short job-specific minigame.
3. Earn fish, reputation, progression, and story outcomes.
4. Return to the guild/town layer and make strategic decisions.

The game already contains multiple short minigames tied to job types and chapters. These are meant to feel like parts of a larger guild-management and story game, not like isolated arcade toys.

The minigames currently include things like:

- top-down combat / brawl
- chase / pursuit
- stealth
- fishing
- sokoban-style puzzle play
- nonogram / logic play
- courier run / lane-switching runner
- heist / route-planning play

So the question is not "should this game become a platformer-focused game?" It is "would a platformer-style minigame fit this game's structure, and if so, what form of platformer would fit best?"

## Platform and UX Constraints

Any advice should assume these constraints:

- Primary platforms are portrait mobile web and Android phone play.
- Touch controls matter a lot.
- Sessions are often short.
- Minigames need to teach quickly and resolve cleanly.
- Fairness and readability are more important than raw difficulty.
- The game should feel good for returning players, not just expert action players.
- The platformer, if added, should work as one minigame/job type inside a broader game, not demand that the whole game bend around it.

## Design Values for a New Minigame

Any platformer recommendation should be judged against these values:

- It should feel good on mobile touch controls.
- It should be readable in short bursts.
- It should connect naturally to a job fantasy in a medieval cat guild.
- It should create a distinct flavor not already covered by the current minigames.
- It should have room for mastery, but not require extreme precision platforming.
- It should integrate with guild strategy, cat stats, reputation, story, or rewards in a meaningful way.
- It should avoid feeling like a random genre detour.

## What Kind of Answer Is Wanted

Please research whether adding a platformer minigame to Clowder & Crest is a good idea, and if so, what specific kind of platformer would fit best.

Please focus on:

- whether platforming is a good fit at all for this game
- which platformer subgenres are best suited to portrait mobile play
- which platformer subgenres are a bad fit and why
- examples of successful mobile-friendly platformers or platformer-adjacent games with excellent touch controls
- ways to adapt platforming for short job-based runs instead of long standalone levels
- ways to make platforming feel like a medieval cat guild job rather than a generic action segment
- control schemes that would work well on touch
- how a platformer could tie into guild systems like stats, cat roles, rewards, reputation paths, or story progression
- whether the better answer is a "true platformer," a lighter platformer-adjacent format, or no platformer at all

## Questions To Answer

1. Is a platformer a strong fit, a weak fit, or only a conditional fit for Clowder & Crest?
2. If it is a fit, what exact format is best?
3. What job fantasy or narrative context would justify it?
4. What control scheme and camera/orientation approach would best suit portrait mobile play?
5. What are the biggest design risks?
6. How can those risks be reduced?
7. Are there better alternatives that capture some of the appeal of platforming without the downsides?

## Useful Context for Recommendations

- The game already blends management, story, and varied minigames.
- The project benefits more from strong thematic fit than from adding genre breadth for its own sake.
- The game is cat-themed, so movement fantasy matters: agility, climbing, pouncing, rooftop travel, narrow ledges, verticality, and graceful movement are all potentially relevant.
- The game should feel cohesive, not like a random mobile minigame collection.

## Recommended Inputs To Pair With This Brief

If possible, also review:

- Repo: `https://github.com/JacobStephens2/clowder-and-crest`
- Live game: `https://clowder.stephens.page`

The goal is not just to get generic platformer advice, but advice specifically tailored to Clowder & Crest as it already exists.
