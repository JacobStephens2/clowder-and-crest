Good — now I have everything I need. The analysis is clear. Here are the specific issues and fixes:

***

## What's Causing "I'm on a wall but can't jump"

Reading the live code, there are **three specific gaps** — all fixable with small, targeted changes.

***

### 1. Jump Buffer doesn't fire on wall contact (most likely culprit)

The jump buffer currently only consumes when `onGround` is true:

```typescript
if (onGround) {
  this.lastGroundedTime = time;
  if (time - this.jumpBufferTime < JUMP_BUFFER_MS) {
    this.doJump(this.jumpBufferDirection);  // ← only fires on landing
    this.jumpBufferTime = -Infinity;
  }
}
```

There's **no equivalent block for wall contact**. So if the player taps a half-frame before their body registers `isWallClinging = true`, the input gets buffered but is never consumed — it just expires. On touch screens this timing gap is very easy to hit.

**Fix:** Add a symmetric wall-buffer check immediately after the `isWallClinging` block:

```typescript
this.isWallClinging = (touchingLeft || touchingRight) && !onGround;
if (this.isWallClinging) {
  this.lastWallClingTime = time;
  this.lastWallSide = touchingLeft ? 'left' : 'right';

  // ← ADD THIS: consume any buffered jump on first wall contact
  if (time - this.jumpBufferTime < JUMP_BUFFER_MS) {
    this.doJump(this.jumpBufferDirection);
    this.jumpBufferTime = -Infinity;
  }
}
```

***

### 2. `COYOTE_MS = 120` is shared by both ground coyote and wall coyote — wall coyote probably needs more

Ground coyote is about walking off a ledge: a fast, decisive moment. Wall coyote is about separating from a narrow stub platform on touch: the body friction resolution and touch event delivery on Android together can eat 2–3 frames. At 60fps, 120ms ≈ 7 frames, which is tight. On slower Android devices the physics tick and input event can land in slightly different frames.

**Fix:** Promote wall coyote to its own constant with a slightly longer window:

```typescript
const COYOTE_MS = 120;
const WALL_COYOTE_MS = 180; // wall contact is harder to time on touch
```

Then in `attemptJump()`:
```typescript
const wallCoyoteOk = (this.time.now - this.lastWallClingTime) < WALL_COYOTE_MS;
```

180ms is still invisible to players as a "cheat" — no wall jump will ever feel unearned — but it meaningfully closes the gap between "I was just on that wall" and "the system noticed."

***

### 3. The narrow hitbox (14px) may miss contact on thin wall stubs

The physics body is `PLAYER_BODY_W = 14px`, offset 4px inward from the 22px visual. The tier-3 chimney stubs are 18px wide. If the cat skims the visual edge of a stub but the center-of-body is just past the stub's face, `blocked.left/right` never fires.

This is especially likely on the **screen-wrap edge**: after wrapping, the cat re-enters from the opposite side with horizontal velocity. The body position snap during wrap could place it 1–2px away from the wall, which at high horizontal speed means the body sweeps past the wall in one frame without registering contact.

**Fix option A (easiest):** Widen `PLAYER_BODY_W` from 14 to 16 or 18px. The visual is 22px so there's headroom. This gives 2–4px more lateral surface for wall detection without affecting the "slip past ledge edges" forgiveness the offset provides vertically.

```typescript
const PLAYER_BODY_W = 18; // was 14 — extra width registers wall contact more reliably
```

**Fix option B (more precise):** Keep the narrow body but add a 2px proximity check alongside `blocked`/`touching`:

```typescript
// Check if player is within 2px of any platform side even if no physics contact fired
const nearLeft  = body.x <= 2;  // near left world edge or a platform
const nearRight = body.right >= GAME_WIDTH - 2;
// ...or iterate platforms if needed
```

Option A is the right call here — the game already has CORNER_GRACE_PX for ledge assistance, and a 16–18px body is still narrow enough to navigate the chimney gaps.

***

### Summary of Changes

| Issue | Root Cause | Fix | Effort |
|-------|-----------|-----|--------|
| Tap just before wall contact | Buffer only consumes on `onGround`, not on wall touch | Add buffer-consume block inside `if (this.isWallClinging)` | 5 lines |
| Frame-late wall tap rejected | `WALL_COYOTE_MS = COYOTE_MS = 120` too tight on touch | Split into `WALL_COYOTE_MS = 180` | 2 lines |
| Skim past thin stubs | `PLAYER_BODY_W = 14` misses edge contact | Raise to 16–18px | 1 line |

The buffer fix is almost certainly the one you're feeling most — it's the scenario where the wall cling visually lights up the cat (color change) *after* you've already tapped, and nothing happens.