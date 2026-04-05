The design document is the primary source here, so the answer is clear and grounded — this is a design recommendation question, not just a lookup.

The design document currently specifies that **the player picks from all 4 minigames freely, except Chase Rat which is restricted to pest control/detection jobs**. So in practice: 4 choices for pest control/detection, 3 for everything else. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)

## The Right Answer: 2, Contextually Chosen

Offering all 4 minigames on every job is too many, and the current constraint (only Chase restricted) doesn't go far enough. Here's the reasoning:

**The core problem with 4 open choices.** When every job offers the same menu, the player simply always picks their personally preferred minigame — whoever is best at Rush Hour just plays Rush Hour forever. The choice becomes a preference setting, not a decision. The 4 minigames stop feeling like different tools and become interchangeable difficulty skins. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)

**The design intent already points toward constraint.** The document explicitly says "each requires different skills — strategic choice, not random". That intent only works if the choices are meaningfully limited per job. A strategic choice requires tradeoffs; a 4-way free pick has none. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)

## The Recommended System: 2 Choices Per Job

Each job should offer exactly **2 minigames**, selected based on the job's thematic identity and key stats:

| Job Category | Choice A | Choice B | Rationale |
|---|---|---|---|
| **Pest Control** | Chase Rat | Rush Hour | Chase = hunting instinct; Rush Hour = planning the route through the granary |
| **Courier** | Fishing | Sokoban | Fishing = patience/timing of a delivery wait; Sokoban = navigating packed market alleys |
| **Guard** | Rush Hour | Sokoban | Both reward deliberate, methodical play — suits the guard temperament |
| **Sacred** | Fishing | Rush Hour | Fishing's meditative hold/release rhythm fits contemplative sacred work |
| **Detection** | Chase Rat | Sokoban | Chase = pursuit; Sokoban = spatial reasoning to reconstruct a crime scene |

This system creates two meaningful tensions per job:

1. **Cat fit vs. minigame preference** — do you pick the minigame your cat is statistically stronger in, or the one you personally play better?
2. **Risk vs. reward** — one option could be harder but yield better stars if you're skilled, while the other is safer.

## Why Not 1 or 3+?

- **1 choice (fixed minigame per job)** removes player expression entirely and makes the game feel rigid, especially on a 3-minute day timer. It also punishes players who dislike a specific minigame type.
- **3 choices** still trends toward a dominant preferred pick and doesn't tighten the thematic identity of each job category enough.
- **2 is the minimum for a genuine decision** and the maximum for keeping each job category feeling distinct.

The 2-choice model also creates a natural space for the **cat stat integration** gap identified previously — each of the two offered minigames could be tuned to a different cat stat (e.g., Pest Control Chase uses `Hunting`, Pest Control Rush Hour uses `Intelligence`), making the job assignment screen and minigame selection a connected two-step decision rather than two independent ones. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)