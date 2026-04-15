# Wall Jump Implementation Guide — RoofScoutScene.ts

## Overview

This guide documents exactly how wall jumping is implemented in `RoofScoutScene.ts`, explains the design decisions behind each value, and provides concrete tuning guidance for modifying the system. All line references are to the live file at `https://github.com/JacobStephens2/clowder-and-crest/blob/main/src/scenes/RoofScoutScene.ts`.

The wall jump system in RoofScoutScene is already fully implemented and working. This guide exists to explain the code clearly so future changes, difficulty tuning, or animation additions can be made with confidence.

***

## How It Works — The Full Pipeline

A wall jump requires four things to cooperate: wall detection, cling (slowed fall), jump eligibility, and directional kick. Here's how each piece works in the scene.

### 1. Wall Detection

Wall contact is detected in `update()` using Phaser's Arcade physics body flags:

```typescript
const wallTouchLeft  = body.blocked.left  || body.touching.left;
const wallTouchRight = body.blocked.right || body.touching.right;
```

Both `blocked` and `touching` are checked because they behave differently. `body.blocked` is set by the physics engine when the body is resting against a static body. `body.touching` is set during the current frame's collision resolution. Checking both ensures wall detection fires on the same frame as first contact, not one frame late.

### 2. Wall Cling (Slowed Fall)

If the player is touching a wall, is airborne, and is moving downward (`velocity.y >= 0`), `isWallClinging` is set to `true`:

```typescript
this.isWallClinging = (touchingLeft || touchingRight) && !onGround && body.velocity.y >= 0;
if (this.isWallClinging && body.velocity.y > this.wallFallCap) {
  this.player.setVelocityY(this.wallFallCap);
}
```

The condition `velocity.y >= 0` is important: cling only activates while falling or hovering, not while the player is still ascending through the wall. If cling fired during ascent, wall contacts on the way up would slow the jump and frustrate the player.

`wallFallCap` defaults to `WALL_FALL_CAP = 80` px/s and is modified by the cat's agility stat:

```typescript
this.wallFallCap = Math.max(40, WALL_FALL_CAP - (agility - 5) * 6);
```

At agility 1: cap = 80 + 24 = 104 px/s (faster fall, harder to use)
At agility 5: cap = 80 px/s (baseline)
At agility 10: cap = 80 − 30 = 50 px/s (much slower fall, easier cling window)

The `Math.max(40, ...)` floor prevents a zero or negative cap on max-agility cats.

### 3. Jump Eligibility — `attemptJump()`

The wall jump uses the same `attemptJump()` entry point as ground jumps and coyote jumps:

```typescript
private attemptJump(direction: 'left' | 'right'): void {
  if (this.finished || this.tutorialShowing) return;
  const body = this.player.body as Phaser.Physics.Arcade.Body;
  const onGround = body.blocked.down || body.touching.down;
  const coyoteOk = (this.time.now - this.lastGroundedTime) < COYOTE_MS;
  const canJump = onGround || coyoteOk || this.isWallClinging;

  if (canJump) {
    this.doJump(direction);
    this.lastGroundedTime = -Infinity;  // consume coyote window
  } else {
    this.jumpBufferTime = this.time.now;
    this.jumpBufferDirection = direction;
  }
}
```

`this.isWallClinging` is one of the three conditions that unlock `doJump()`. Critically, coyote time (`coyoteOk`) is also valid during a wall cling — if the player clung a moment ago and just separated from the wall, they still get a brief grace window to wall-jump. This overlap is intentional and makes wall jumps feel more forgiving on touch input.

### 4. The Wall Jump Kick — `doJump()`

This is where a wall jump differs from a ground jump:

```typescript
private doJump(direction: 'left' | 'right'): void {
  const body = this.player.body as Phaser.Physics.Arcade.Body;
  const wallLeft  = body.blocked.left  || body.touching.left;
  const wallRight = body.blocked.right || body.touching.right;
  const onGround  = body.blocked.down  || body.touching.down;

  if (!onGround && this.isWallClinging) {
    // Wall jump — kick away from the wall
    const pushDir = wallRight ? -1 : wallLeft ? 1 : (direction === 'left' ? -1 : 1);
    this.player.setVelocityY(this.jumpVelocity);
    this.player.setVelocityX(pushDir * WALL_KICK_X);
    this.isWallClinging = false;
    playSfx('block_slide', 0.08);
    haptic.tap();
  } else {
    // Ground / coyote jump
    this.player.setVelocityY(this.jumpVelocity);
    const leanX = direction === 'left' ? -LEAN_X : LEAN_X;
    this.player.setVelocityX(leanX);
    haptic.tap();
  }
  this.playJumpStretch();
}
```

**The `pushDir` logic is the key design decision.** Wall direction is derived from physics (which wall is actually touching), not from which side of the screen the player tapped. This means the player can tap *either side* to wall-jump, and the cat will always kick away from the wall it's actually touching. This is critical for touch input — requiring the player to identify and tap "the correct side" on a 375px portrait screen while clinging is too cognitively expensive.

The fallback `(direction === 'left' ? -1 : 1)` fires only when `wallLeft` and `wallRight` are both false but `isWallClinging` is still `true` — a narrow race condition that can occur for one frame after the coyote window activates.

`this.isWallClinging = false` is set immediately so the cling state doesn't persist into the next frame and accidentally allow a second wall jump mid-air.

**Constants:**

```typescript
const BASE_JUMP_VELOCITY = -600;  // upward velocity (negative = up)
const WALL_KICK_X = 220;          // horizontal push away from wall
const LEAN_X = 170;               // horizontal lean on a ground jump
```

The wall kick (`220`) is deliberately stronger than the ground lean (`170`) so wall jumps travel noticeably further horizontally. This makes the wall-jump arc visually distinct and lets the player clear wider gaps than a ground jump can.

***

## Physics Tuning Log

The comments in the source document a deliberate second-pass tuning on 2026-04-08:

> *"The first version had drag=400 and lean=110 which combined to kill the horizontal lean velocity after ~15px of travel. The player couldn't reach the side platforms in the first chunk because the lateral distance was 35-100px and the lean momentum died too quickly."*

The current values after that pass:

| Constant | First Pass | Current | Effect |
|----------|-----------|---------|--------|
| `LEAN_X` | 110 | 170 | More horizontal carry on ground jumps |
| `WALL_KICK_X` | ~180 | 220 | Wall jumps clear wider gaps |
| `PLAYER_DRAG_X` | 400 | 120 | Momentum persists through arc instead of dying immediately |
| `BASE_JUMP_VELOCITY` | ~-560 | -600 | Slightly higher arc |

`PLAYER_DRAG_X = 120` is the most important tuning outcome. Drag is applied every frame, so at 400 the horizontal velocity was decaying to near-zero within a fraction of a second. At 120, momentum carries through a full jump arc and the cat actually reaches the platforms it's aimed at.

***

## Corner Correction (Related System)

A wall-adjacent system in `update()` handles a common platformer frustration: jumping upward into the side of a platform when the player's head is "almost" above the ledge. Without correction, this kills horizontal momentum and the cat falls back down past the edge.

```typescript
if ((wallTouchLeft || wallTouchRight) && body.velocity.y < 0) {
  const playerTop = this.player.y - PLAYER_H / 2;
  const platforms = this.platforms.getChildren();
  for (const p of platforms) {
    const plat = p as Phaser.GameObjects.Rectangle;
    const platBody = plat.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!platBody) continue;
    const platTop = platBody.y;
    const horizClose = Math.abs(this.player.x - plat.x) < (PLAYER_W + plat.width) / 2 + 4;
    const verticalGap = platTop - playerTop;
    if (horizClose && verticalGap > 0 && verticalGap < CORNER_GRACE_PX) {
      this.player.setY(platTop - PLAYER_H / 2);
      this.player.setVelocityY(0);
      break;
    }
  }
}
```

`CORNER_GRACE_PX = 10` means if the player's head is within 10px of clearing a platform, they get snapped onto it. The condition `body.velocity.y < 0` ensures this only fires on the way up — this is not a "stick to wall" effect, it's a ledge-grab assist.

This interacts with wall jumping: a wall jump aimed at a platform whose edge is within 10px of the cat's head trajectory will snap onto that platform rather than bouncing off it. This is intentional and feels correct.

***

## Level Design That Teaches Wall Jumping

The chunk system introduces wall jumping progressively across difficulty tiers.

### Easy Mode: Side Walls as Training Wheels

On easy difficulty, full-height pillars are placed along both screen edges:

```typescript
if (this.difficulty === 'easy') {
  this.makePlatform(10, WORLD_HEIGHT / 2, 20, WORLD_HEIGHT);   // left pillar
  this.makePlatform(GAME_WIDTH - 10, WORLD_HEIGHT / 2, 20, WORLD_HEIGHT); // right pillar
}
```

These pillars give beginners guaranteed wall surfaces to cling at any height, turning easy mode into an implicit wall-jump tutorial. A player who tries jumping toward the screen edge will naturally discover the cling and kick.

### Tier 2: Explicit Cling Anchors

Tier 2 chunks (`t2-cling-left`, `t2-cling-right`) place narrow 24px-wide platforms against the screen edges at mid-height, clearly inviting the player to cling and redirect:

```typescript
// t2-cling-left
{ x: 0, y: -90, width: 24 },  // left wall anchor

// t2-cling-right
{ x: GAME_WIDTH - 24, y: -100, width: 24 },  // right wall anchor
```

### Tier 3: Mandatory Wall Jumps

Tier 3 chunks (`t3-chimney`, `t3-final`) make wall jumps structurally required:

```typescript
// t3-chimney: narrow alternating wall stubs — must bounce wall to wall
{ x: 0,             y: -60,  width: 18 },
{ x: GAME_WIDTH-18, y: -100, width: 18 },
{ x: 0,             y: -150, width: 18 },
{ x: GAME_WIDTH-18, y: -190, width: 18 },
```

The 18px stub width is just enough to cling but not enough to land on — the player must wall-jump, not platform-hop.

### Screen Wrap Interaction

The scene uses Pac-Man-style screen wrap:

```typescript
if (this.player.x < -PLAYER_W / 2) {
  this.player.setX(GAME_WIDTH + PLAYER_W / 2);
} else if (this.player.x > GAME_WIDTH + PLAYER_W / 2) {
  this.player.setX(-PLAYER_W / 2);
}
```

This means a wall jump off the right edge re-enters from the left side. The physics world bounds are extended to `GAME_WIDTH * 3` wide to prevent Arcade physics from stopping the player at the visible edge before the wrap teleport fires.

***

## Tuning Reference

All wall-jump physics are controlled by constants at the top of the file. Here's what each one does and the safe range for adjustment:

| Constant | Current Value | Effect | Safe Tuning Range |
|----------|--------------|--------|-------------------|
| `WALL_KICK_X` | 220 | Horizontal distance of wall jump | 160–280 |
| `BASE_JUMP_VELOCITY` | -600 | Vertical height of all jumps | -540 to -680 |
| `WALL_FALL_CAP` | 80 px/s | Max fall speed while clinging (baseline) | 50–120 |
| `PLAYER_DRAG_X` | 120 | How quickly horizontal velocity bleeds off | 80–200 |
| `COYOTE_MS` | 120ms | Grace window after leaving a wall | 80–180ms |
| `CORNER_GRACE_PX` | 10 | Snap distance for ledge-grab assist | 6–16 |

**Wall kick vs. lean asymmetry** (`WALL_KICK_X=220` vs. `LEAN_X=170`): keep the wall kick at least 30–40px stronger than the lean so wall jumps feel meaningfully different. If they become equal, players won't notice they're executing a different move.

**Drag and kick interaction**: if `PLAYER_DRAG_X` is raised above ~200, the horizontal kick from a wall jump decays too quickly and the cat won't clear the gap before the next wall. If drag drops below ~80, the cat slides sideways across platforms after landing, which feels slippery.

***

## Stat Scaling Summary

Two cat stats affect wall jump behavior at runtime:

| Stat | Property Modified | Formula | Range |
|------|-----------------|---------|-------|
| `stealth` (agility) | `jumpVelocity` | `-600 - (agility - 5) * 8` | -632 to -560 |
| `stealth` (agility) | `wallFallCap` | `max(40, 80 - (agility - 5) * 6)` | 40–104 px/s |

A high-agility cat jumps higher and clings longer, giving a larger window to time the wall jump. A low-agility cat has a fast fall speed while clinging, making the cling window tighter and the wall jump harder to execute.

***

## Adding a Cling Visual State

The scene currently uses a single colored rectangle (`0xc4956a`) for the player at all times. When sprite animations are added, the wall cling state is already tracked in `this.isWallClinging` and can be used directly to swap animation frames:

```typescript
// In update(), after the wall cling detection block:
if (this.isWallClinging) {
  this.player.anims.play('cat-cling-left',  !body.blocked.right);
  this.player.anims.play('cat-cling-right', !body.blocked.left);
} else if (!onGround) {
  const rising = body.velocity.y < 0;
  this.player.anims.play(rising ? 'cat-jump-rise' : 'cat-jump-fall', true);
} else {
  // ground animations...
}
```

The cling animation should show the cat gripping stone — flattened ears, extended claws, slightly squashed body. Two variants are needed: `cling-left` (body faces right, clinging to a left wall) and `cling-right`.

A wall-jump-specific launch animation (distinct from a ground jump) would reinforce to the player that a different move fired. A single frame of the cat pushing off with its hind legs before the stretch animation is enough.