**Matter.js** is the strongest candidate — it's a 2D rigid body physics engine for the web that would plug directly into your Phaser + TypeScript stack and unlock a minigame type none of the current four can offer. [brm](https://brm.io/matter-js/)

## Why Matter.js

Phaser 3 already has a built-in Matter.js integration (`Phaser.Physics.Matter`) — you don't even need to add a new dependency. You can enable it per-scene by setting `physics: { default: 'matter' }` in the scene config, leaving your other scenes untouched. This makes it the lowest-friction addition possible. [generalistprogrammer](https://generalistprogrammer.com/tutorials/phaser-vs-pixijs-renderer-comparison)

The current 4 minigames break down into two categories: **logic puzzles** (Rush Hour, Sokoban) and **action/timing** (Chase, Fishing). What's missing is a **physics-based** minigame, which would feel mechanically distinct from everything else. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)

## The Minigame: Catapult / Pounce

A physics-based minigame where the cat launches itself (or a projectile) to knock rats off a shelf, ledge, or tower — think a simplified Angry Birds mechanic reskinned for the medieval cat guild setting.

**How it works:**
- Player drags to aim and set launch power (touch-native, like the existing swipe controls in Chase) 
- Matter.js handles rigid body collisions, gravity, and object tumbling
- Rats sit on stacked crates/barrels that react physically when hit
- Stars based on rats cleared with fewest launches (1 shot = 3★, 2 shots = 2★, 3+ = 1★)

**Why it fits Clowder & Crest specifically:**

- **Thematic fit** — cats pouncing on things is the most cat behavior imaginable. It maps naturally to Pest Control and Guard categories. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)
- **Cat stat integration** — `Endurance` could increase launch power range, `Hunting` could add a trajectory preview line. This addresses the stat-disconnect gap that Fishing currently has. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)
- **Procedural generation** — Matter.js makes it trivial to randomly stack rigid bodies into different tower configurations per difficulty tier, consistent with how Rush Hour and Sokoban already generate procedurally. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)
- **Session length** — a single round takes 15–30 seconds, fitting the 1–3 minute job cycle. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md)

## Integration Effort

Since Phaser's Matter plugin is already bundled, the implementation is essentially one new scene file (`PounceScene.ts`) following the same pattern as your existing scenes  :

```typescript
// Scene config — just enable matter physics for this scene only
export class PounceScene extends Phaser.Scene {
  constructor() {
    super({
      key: 'PounceScene',
      physics: {
        default: 'matter',
        matter: { gravity: { y: 1 }, debug: false }
      }
    });
  }
}
```

No new npm packages, no build changes, no architectural modifications. It communicates results via the same `eventBus.emit('puzzle-complete', {...})` pattern your other scenes use  .

## Alternatives Considered

| Library | Verdict |
|---|---|
| **Planck.js** (Box2D port) | Better performance than Matter.js at scale, but overkill for a single minigame with <20 bodies  [daily](https://daily.dev/blog/top-9-open-source-2d-physics-engines-compared) |
| **LittleJS** | Full engine — conflicts with Phaser rather than complementing it  [github](https://github.com/KilledByAPixel/LittleJS) |
| **Pixi.js** | Rendering library; Phaser 3 replaced its Pixi dependency, running both wastes resources  [generalistprogrammer](https://generalistprogrammer.com/tutorials/phaser-vs-pixijs-renderer-comparison) |
| **Howler.js** | Audio only; you already use HTML5 Audio API which persists across scenes fine  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/130224663/ae792d8f-f654-413a-9eb1-62783e43f76c/Clowder-and-Crest-Design-Document-2.md) |

Matter.js via Phaser's built-in plugin is the clear winner: zero new dependencies, a genuinely new gameplay feel, and strong thematic alignment with the cat guild fantasy.