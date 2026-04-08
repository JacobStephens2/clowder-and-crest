# Product & Design Analysis: Adding a "Minigame Mode" to Clowder & Crest

This document evaluates the proposed addition of a direct minigame-select mode ("Practice" or "Arcade") from the perspective of game and product design, keeping in mind the game's warm, grounded, and slightly melancholy tone, as well as its core focus on narrative and guild management.

## 1. Is this mode a good idea at all?
**As a utility for you and reviewers: Yes. As a front-facing player feature: No.**

The core conflict here is utility vs. immersion. You have two distinct audiences with opposing needs:
*   **Players:** Need carefully paced onboarding, narrative context, and stakes to care about the mechanics.
*   **Reviewers/Devs:** Need immediate, frictionless access to mechanics to evaluate technical skill, polish, and variety.

Trying to serve both audiences with a single "Arcade Mode" button on the title screen will compromise the player experience. However, the *utility* of the feature is absolutely necessary for your portfolio and testing. The solution isn't to scrap the idea, but to decouple the utility from the main player journey.

## 2. Public, hidden, unlockable, or de-emphasized?
**It should be completely hidden for testing/portfolios, and strictly unlockable if adapted for players.**

If this mode is publicly visible to a new player upon first boot:
1.  It signals that the game is a "minigame collection" (like *WarioWare* or *Mario Party*).
2.  It breaks the 4th wall, pulling them out of the "medieval guild" fantasy before it even begins.
3.  It allows them to spoil mechanics that your campaign carefully staggers to maintain a sense of discovery.

If you want players to access it, it must be **unlockable**—only allowing them to play minigames they have already encountered in the story. 

## 3. Title screen framing (to keep the campaign primary)
If you decide you *must* have a public-facing button on the title screen for players, it must not use arcade terminology ("Practice", "Minigames", "Arcade"). These words shatter your storybook, melancholy tone. 

Instead, frame it in-universe as a retrospective activity.
*   **Names:** "Chronicles", "Guild Archives", "Tavern Tales", or "Memories".
*   **Visuals:** De-emphasize it. "Continue" and "New Journey" should be large, ornate buttons. "Memories" should be a smaller, secondary text link tucked in the bottom corner or inside a "Settings/Extras" submenu.
*   **Framing:** When clicked, it should present the games as stories being retold (e.g., "Recall the great rat hunt of Chapter 2" rather than "Hunt: Hard Mode").

## 4. Risks to player experience, pacing, and perception
*   **Tone Clash:** The biggest risk. A grounded, emotional story about a stray cat trying to survive a plague and a church inquisition does not mesh with "Select Level: Sokoban." 
*   **Mechanic Burnout:** Minigames are often enjoyable *because* they are broken up by narrative, economy management, and progression. Stripped of the guild management context, players might grind the mechanics, burn out, and find the campaign tedious when they return to it.
*   **Eroding Stakes:** In the campaign, losing a minigame means lost fish, wounded pride, or narrative consequences. In a practice mode, there are no stakes. If players practice a minigame until they master it without stakes, the campaign loses its tension. 

## 5. What the best version of this feature would look like
The "best version" for the **player** isn't a title screen menu at all. It is an in-universe space *inside* the Guildhall.
Imagine unlocking a "Training Yard" or "Archive Desk" room in the guildhall. The player clicks it, and a veteran cat offers to "run drills" or "recount past jobs." This keeps the player inside the game loop, maintains immersion, and naturally restricts them to games they've already unlocked.

## 6. Better alternatives for testing and replay
You actually already have the perfect alternative for player replayability: **The Dungeon Run (Chapter 5+).**
Your design docs note that the Dungeon Run is a roguelike meta-loop that chains minigames with upgrades and persistent HP. This *is* your endgame replay sink. You do not need a separate Arcade Mode for players when you already have a highly contextualized, mechanically rich way to grind minigames.

For the **testing and portfolio problem**, the alternatives are much simpler:

*   **For Web Portfolio Reviewers:** Use a URL parameter. If the game is loaded via `clowderandcrest.com/?showcase=true`, the game bypasses the title screen and opens a custom, brutally utilitarian "Reviewer Menu" listing all 14 minigames. You can hyperlink directly to this from your portfolio site.
*   **For Mobile/Native Dev Testing:** Implement a hidden "Konami Code" on the title screen. (e.g., tap the game's Crest logo 5 times rapidly). This slides open a hidden Debug Menu allowing you to instantly launch any scene.

## 7. Final Recommendation: What I would do
If I were shipping Clowder & Crest, I would **not** put an Arcade/Minigame mode on the title screen for players. 

Here is exactly what I would implement:

1.  **Rely on the "Dungeon Run" for players:** Let the campaign be the campaign. Let the Dungeon Run be the ultimate test of their mechanical mastery. Trust your pacing.
2.  **Build a hidden "Showcase/Debug Menu":** Build a simple HTML overlay menu that lists all 14 minigames with difficulty toggles. 
3.  **Gate it via URL & Taps:** 
    *   On web, check `new URLSearchParams(window.location.search).get('showcase')`. If true, show this menu instead of the Title Scene. Put this link on your resume/portfolio.
    *   On Android, add a hidden click counter to the title screen logo. 5 quick taps opens the Showcase Menu.
4.  **Add a "Return to Showcase" button:** When a minigame finishes (or is quit) while in Showcase Mode, route the player back to the Showcase Menu instead of the Town Map.

**Why?** This solves 100% of your problems while introducing 0% risk. Reviewers get instant access without you having to compromise your artistic vision. You get a fast testing environment. And actual players get a pure, untainted, immersive narrative experience.