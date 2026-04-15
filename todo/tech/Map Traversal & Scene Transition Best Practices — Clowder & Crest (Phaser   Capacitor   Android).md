# Map Traversal & Scene Transition Best Practices — Clowder & Crest (Phaser / Capacitor / Android)

## Executive Summary

`TownMapScene.ts` already implements the core patterns correctly — BFS pathfinding, a door-proximity check, and the `walkPathThenEnter` chain — but several subtle state-leak and race-condition pitfalls surround the guildhall transition specifically. This report covers (1) how the code works today, (2) the exact bugs that previously caused the character to get stuck, (3) Phaser scene lifecycle best practices, and (4) actionable improvements you can apply.

***

## How the Current Code Works

### Grid, Walkability, and BFS

The town map is an 8×10 grid of 44-pixel tiles. Tiles are one of three types: `PATH` (0), `GRASS` (1), or `BUILDING` (2). Building footprints mark tiles as `BUILDING`, but each building's `doorCol/doorRow` tile is explicitly reset to `PATH` so the player can reach it.

Pathfinding uses a clean BFS (breadth-first search) over the four cardinal neighbors. This is the correct algorithm for a tile grid: it guarantees the shortest path and handles U-shaped obstacles that greedy single-axis stepping cannot navigate. The BFS returns the full path excluding the starting tile; the player's position is updated one tile per `delayedCall` at a fixed 220ms cadence inside `walkPathThenEnter`.[^1]

### The Door Proximity Check (`checkDoorProximity`)

After every tile step, `movePlayer` calls `checkDoorProximity`. This function iterates all buildings and sets `this.activeDoor` to the nearest building within Manhattan distance ≤ 1. For the guildhall and job board, if the player is *exactly* on the door tile, it calls `enterBuilding` immediately (auto-enter) — no confirm tap needed.

### The `walkingToBuilding` Guard

A critical guard was added to prevent door hijacking: if `this.walkingToBuilding` is set to a different building while the player is walking, `checkDoorProximity` suppresses auto-enter for buildings that are *not* the intended destination. For example, the path from the spawn tile `(col:4, row:8)` to the guildhall door `(col:3, row:2)` passes through or near the jobs door tile at `(col:4, row:4)` — without the guard, that tile would fire the job board overlay instead of continuing the walk to the guildhall.

***

## Historical Bugs and Their Fixes

### Bug 1 — Stuck on the Guildhall Door Tile

**Root cause:** `walkingToBuilding` was not reset in `create()`. A directed walk that ended via the auto-enter path (inside `checkDoorProximity`) never cleared `walkingToBuilding` from the previous walk. On the next `TownMapScene` load, the stale pointer was still set to the guildhall, which then blocked auto-enter for *other* buildings on subsequent visits.

**Fix applied:** Both `walkingToBuilding` and `playerPos` are now explicitly reset at the top of `create()`:

```typescript
this.walkingToBuilding = null;
this.playerPos = { col: 4, row: 8 };
```

### Bug 2 — Spawning on the Door Tile

**Root cause:** `playerPos` was a class property that persisted across scene restarts. If the player reached the guildhall door before a scene transition, the next `TownMapScene.create()` call spawned the player on `(col:3, row:2)` — the guildhall door — and `checkDoorProximity` would fire on the first step, immediately re-entering the guildhall.

**Fix applied:** `this.playerPos = { col: 4, row: 8 }` in `create()` ensures the player always spawns at the bottom-center path tile, away from all door tiles.

### Bug 3 — Old Greedy Pathing Missing U-Shaped Obstacles

The original pathfinding used a single-axis greedy step (move more in whichever axis has the larger delta), which could not route around building footprints that form an L or U shape. The regression was: tapping the Castle from inside the Market door caused the cat to collide with the Market's tile edge and stop.

**Fix applied:** Full BFS via `findPath()` replaced the greedy approach.[^1]

***

## Phaser Scene Lifecycle Best Practices

### `start()` vs. `sleep()` / `wake()`

Phaser's Scene Manager distinguishes between two key transition strategies:[^2]

| Strategy | When to Use | State |
|---|---|---|
| `stop()` → `start()` | New play session, clean slate (used in Clowder & Crest) | Destroyed and rebuilt |
| `sleep()` → `wake()` | Resuming same state (HUD overlay, pause screen) | Preserved in memory |

`TownMapScene` uses the `stop`/`start` pattern via `switchScene()` in `main.ts`. This is correct for a town map that should always reset on re-entry. The `shutdown` event in `create()` cleans up timers and tweens to prevent memory leaks.[^3][^2]

### Cleanup in `shutdown`

Phaser automatically destroys game objects on the scene's display list when it stops. Objects *not* on the display list (timers from `this.time.addEvent`, tweens from `this.tweens.add`) must be cleaned up manually. The current code correctly handles this:[^3]

```typescript
this.events.once('shutdown', () => {
  this.time.removeAllEvents();
  this.tweens.killAll();
  this.input.keyboard?.removeAllListeners();
});
```

If orphaned tweens or `delayedCall` timers survive a `stop()`, they can fire callbacks on a destroyed scene and cause null-reference errors on Android — a common source of hard-to-reproduce crashes in Capacitor builds.

### Passing Data Between Scenes

Phaser's `start(key, data)` passes a plain object as the second argument, available in the receiving scene's `init(data)` method. Clowder & Crest currently uses `switchScene('GuildhallScene')` with no data payload, which is fine since game state flows through the `getGameState()` singleton. If future scenes need a spawn position or context (e.g., "entered from town map, position player near the exit"), pass it here rather than using a module-level global.[^4][^2]

### Camera Fade Transitions

The town map already uses `this.cameras.main.fadeIn(250, 10, 9, 8)` on `create()`. For the guildhall transition specifically, consider adding a short fade-out before `eventBus.emit('navigate', 'GuildhallScene')` so the cut feels intentional rather than abrupt:[^5][^6]

```typescript
private enterBuilding(b: BuildingDef): void {
  playSfx('tap', 0.3);
  if (b.id === 'guildhall') {
    // Fade out, then navigate — prevents a hard cut on Android
    this.cameras.main.fadeOut(200, 10, 9, 8);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      eventBus.emit('navigate', 'GuildhallScene');
    });
    return;
  }
  // ... rest of buildings
}
```

On Capacitor/Android, `fadeOut` → `once('camerafadeoutcomplete')` → `scene.start()` is the standard pattern. The key detail: listen with `.once()` (not `.on()`), so the callback doesn't fire repeatedly on the next scene load.[^7][^8][^9][^5]

***

## The `isMoving` Flag Race Condition

The `isMoving` boolean guard in `movePlayer` prevents queuing a second step before the current tween completes (160ms duration). This is the correct approach for tile-grid games. However, two edge cases can leave `isMoving` stuck at `true`:

1. **Tween completion callback not fired.** If the player sprite is `null` (e.g., the breed texture failed to load), the tween is never created, so `isMoving` is set to `true` and never reset. Guard by resetting in a fallback:

```typescript
if (this.playerSprite) {
  this.tweens.add({
    targets: this.playerSprite,
    // ...
    onComplete: () => {
      this.isMoving = false;
      // ...
    },
  });
} else {
  // No sprite — advance grid position directly
  this.isMoving = false;
  this.checkDoorProximity();
}
```

2. **Scene stop while tween is mid-flight.** If `switchScene` is called while a 160ms tween is running (e.g., a `navigate` event fires while the player is mid-step), the tween's `onComplete` never runs because the scene was stopped. On the *next* `TownMapScene` load, `isMoving` is already `false` because `create()` resets it — but if a `delayedCall` from `walkPathThenEnter` was mid-chain, it may fire one more step after the scene stops. The shutdown cleanup (`this.time.removeAllEvents()`) prevents this.

***

## `walkPathThenEnter` — How and Where to Fire `enterBuilding`

The core pattern is:

```
tap building → walkToThenEnter(b)
  → findPath(doorCol, doorRow)  [BFS]
  → walkPathThenEnter(path, b)  [recursive delayedCall chain]
    → movePlayer (one step)
    → 220ms later: recurse with path.slice(1)
    → path empty → enterBuilding(b)  [fire transition]
```

The transition fires only when `path.length === 0` — meaning the player has walked every step to the door tile. This is safe because the guildhall's door tile is `(col:3, row:2)`, which is always `PATH` (the grid builder explicitly sets door tiles walkable).

One subtle issue: `walkPathThenEnter` clears `this.walkingToBuilding = null` only at the path-empty branch (success path). If the player is interrupted by a joystick mid-walk, the replan branch recurs but never clears `walkingToBuilding` if replanning returns `null`. Add a null-guard:

```typescript
private walkPathThenEnter(path: Array<{ col: number; row: number }>, b: BuildingDef): void {
  if (path.length === 0) {
    this.walkingToBuilding = null;
    this.enterBuilding(b);
    return;
  }
  const next = path;
  const stepDc = next.col - this.playerPos.col;
  const stepDr = next.row - this.playerPos.row;
  this.movePlayer(stepDc, stepDr);
  this.time.delayedCall(220, () => {
    if (this.playerPos.col === next.col && this.playerPos.row === next.row) {
      this.walkPathThenEnter(path.slice(1), b);
    } else {
      const replan = this.findPath(b.doorCol, b.doorRow);
      if (replan) {
        this.walkPathThenEnter(replan, b);
      } else {
        this.walkingToBuilding = null; // ← add this guard
      }
    }
  });
}
```

***

## Capacitor / Android–Specific Considerations

### Touch Input Coordinate Mapping

The `pointerdown` handler converts `pointer.worldX / worldY` to grid coordinates. On Android with `Phaser.Scale.FIT`, the pointer world coordinates are already in unscaled game units — the Camera zoom and scale mode handle the conversion — so no manual DPR scaling is needed here. The existing `DPR` usage is limited to canvas size and `cameras.main.setZoom(DPR)`, which is correct.

### TouchJoystick + `walkPathThenEnter` Interaction

The joystick's `onMoveTick` calls `movePlayer(mdx, mdy)` directly, bypassing the BFS path. If the player is in the middle of a `walkPathThenEnter` chain and the joystick fires, `isMoving` will be `true`, so `movePlayer` returns immediately (safe). The next `delayedCall` will detect the position mismatch and trigger a replan. This is correct behavior, but it means joystick input during a tap-to-walk will cause a brief stutter (one replan step). For a cozy game this is acceptable.

### Memory and Lifecycle on Background/Foreground

The `registerAppLifecycle` hooks in `main.ts` pause timers when Android backgrounds the app. When the app is foregrounded mid-walk, `resumeDayTimer()` resumes the day clock, but any `delayedCall` timers inside `TownMapScene` are tied to the Phaser clock — they fire relative to elapsed game time, not wall time. Phaser's `TimePlugin` advances by the delta between frames, so a background/foreground cycle will cause pending `delayedCall` steps to fire rapidly on resume. This is generally harmless for the walk chain (the cat will snap to its destination tile) but can look jarring. Pausing the Phaser game clock during `onPause` (via `game.loop.stop()` or `this.scene.pause()`) would prevent this, at the cost of additional state management complexity.

***

## Quick-Reference: Scene Transition Checklist

| Concern | Current Status | Recommendation |
|---|---|---|
| `playerPos` reset in `create()` | ✅ Fixed | Keep |
| `walkingToBuilding` reset in `create()` | ✅ Fixed | Keep |
| `isMoving` reset in `create()` | ✅ (`this.isMoving = false`) | Keep |
| Sprite null guard for tween | ⚠️ Partial | Add `else { this.isMoving = false; }` fallback |
| `walkingToBuilding = null` on replan-fail | ⚠️ Missing | Add to else branch of `walkPathThenEnter` |
| Camera fade before guildhall transition | ⚠️ Missing | Add 200ms `fadeOut` → `camerafadeoutcomplete` → navigate |
| Shutdown cleanup (timers, tweens) | ✅ Present | Keep |
| `delayedCall` timing on app resume | ⚠️ Known gap | Acceptable for now; consider `game.loop.stop()` in `onPause` |
| BFS pathing for obstacles | ✅ Implemented | Keep |
| Door tile forced walkable | ✅ Implemented | Keep |

***

## Summary of Actionable Changes

1. **Add a 200ms camera fade-out before `navigate GuildhallScene`** in `enterBuilding` — gives the transition a polished feel and avoids a hard cut on Android.
2. **Guard the `isMoving` reset** when `playerSprite` is null so the player never gets permanently stuck if a sprite asset fails to load.
3. **Clear `walkingToBuilding`** in the `findPath` null-return branch of `walkPathThenEnter` so the auto-enter guard doesn't remain active indefinitely after a failed replan.
4. **Keep the existing `create()` resets** (`playerPos`, `walkingToBuilding`, `isMoving`, `activeDoor`) — they are the primary fix for the guildhall re-entry loop that was reported.

---

## References

1. [Point & Click Movement with Pathfinding using Tilemaps in Phaser 3](https://blog.ourcade.co/posts/2020/phaser-3-point-click-pathfinding-movement-tilemap/) - In this article, we'll show you how to add point & click movement using breadth-first search to disc...

2. [Scenes | Phaser Help](https://docs.phaser.io/phaser/concepts/scenes) - It's easier to reason about scenes that start only once. Scene control methods​. The simple methods​...

3. [Scene/GameObject destruction and Scene Children properties are ...](https://github.com/photonstorm/phaser/issues/6143) - Game objects on the scene display list or update list are destroyed automatically when the scene is ...

4. [Working with Scenes and Data in Phaser - DEV Community](https://dev.to/ceceliacreates/working-with-scenes-and-data-in-phaser-2pn4) - Phaser has a Scene Manager that contains built-in methods for managing the scenes in your game, incl...

5. [Scene Transition with Fade Out in Phaser 3 - Ourcade Blog](https://blog.ourcade.co/posts/2020/phaser-3-fade-out-scene-transition/) - You can also do a long fade-out to a quick fade-in by adjusting the millisecond values passed to fad...

6. [Phaser 3 Fade Camera In and Out Easy Example](https://www.stephengarside.co.uk/blog/phaser-3-fade-camera-in-and-out-easy-example/) - The method takes two arguments, a boolean (true = fade in, false = fade out) and a callback function...

7. [Scene transition with camera fade issue - Phaser 3 - Discourse](https://phaser.discourse.group/t/scene-transition-with-camera-fade-issue/2950) - Scene transition with camera fade issue ... any ideas why? Or how is the correct way to use camera f...

8. [Phaser 3: Why is my this.cameras.main.fadeOut effect not starting ...](https://stackoverflow.com/questions/57729055/phaser-3-why-is-my-this-cameras-main-fadeout-effect-not-starting-immediately) - Your scene fade-out isn't starting until the player leaves the goal because as long as the player an...

9. [Cameras | Phaser Help](https://docs.phaser.io/phaser/concepts/cameras) - fadeOut() is usually paired with fadeIn() . You can pass a callback or register an event handler (us...

