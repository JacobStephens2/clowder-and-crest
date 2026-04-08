# Building a Great Phaser.js Mobile Joystick
## Overview
A good virtual joystick in Phaser.js lives or dies by one principle: **the control must feel like an extension of the thumb, not a UI element the player has to aim at.** The best mobile joystick implementations — typified by games like Brawl Stars — share a cluster of specific design decisions around placement, physics, input normalization, and visual feedback that together eliminate friction between intent and action.[^1]

***
## 1. Fixed vs. Floating: Choose Floating (Dynamic Repositioning)
This is the single most impactful design decision. A **fixed joystick** stays at one position on screen at all times, which builds muscle memory but punishes players who shift their grip or play on different screen sizes. A **floating joystick** appears wherever the player first touches, which means the thumb never has to hunt for the control.[^1][^2]

The modern best practice — used by virtually every successful mobile action game — is a **floating joystick restricted to a screen zone**, typically the left half of the screen for movement. This gives all the ergonomic benefit of floating placement while preventing the joystick from conflicting with action buttons on the right side.[^1]

```js
// Spawn joystick at touch origin, restricted to left half
this.input.on('pointerdown', (pointer) => {
  if (pointer.x < this.scale.width / 2) {
    joystick.setPosition(pointer.x, pointer.y);
    joystick.setVisible(true);
  }
});

this.input.on('pointerup', () => {
  joystick.setVisible(false);
  joystick.forceX = 0;
  joystick.forceY = 0;
});
```

The joystick should become invisible when the finger lifts, and reappear exactly where the next touch begins — no hunting, no repositioning.

***
## 2. Analog Input: Normalize to [-1, 1] on Both Axes
A joystick that only understands "left/right/up/down" feels like a D-pad and produces jerky, unresponsive movement. True analog behavior calculates both the **angle** (direction) and the **distance** (force magnitude) from the base center to the touch point.[^1][^3]

The correct math:

```js
const dx = pointer.x - base.x;
const dy = pointer.y - base.y;
const distance = Math.sqrt(dx * dx + dy * dy);
const clampedDist = Math.min(distance, maxRadius);
const angle = Math.atan2(dy, dx);

// Normalized [-1, 1] output
const forceX = Math.cos(angle) * (clampedDist / maxRadius);
const forceY = Math.sin(angle) * (clampedDist / maxRadius);
```

Both axes map to a standard `[-1, 1]` range. In your game's `update()` loop, multiply `forceX` and `forceY` by your character's speed to get smooth, variable-speed movement. Pushing the thumb to the edge of the joystick radius produces max speed; a light nudge produces a slow walk.[^1]

***
## 3. Thumb Clamping: Keep the Knob Inside the Base
The thumb graphic (the inner circle) must be **clamped to the joystick's radius** — it should never fly off to follow the raw pointer position. Without clamping, the visual feedback disconnects from the actual force being applied, which is immediately disorienting.[^4][^3]

```js
// Clamp the thumb visual to the radius boundary
const clamped = Math.min(distance, maxRadius);
thumb.x = base.x + Math.cos(angle) * clamped;
thumb.y = base.y + Math.sin(angle) * clamped;
```

Once the player's finger is outside the radius, the force stays at maximum (1.0) but the thumb stays on the edge — the visual and the logic stay coherent.[^3]

***
## 4. Dead Zone: Filter Out Accidental Micro-Movements
Without a dead zone, even resting your thumb near the joystick base causes small, unintended inputs. A dead zone is a minimum threshold — typically 10–20% of the joystick radius — below which the input is treated as zero.[^5][^6]

The **scaled radial dead zone** is the best approach for analog sticks: inputs inside the dead zone radius snap to zero, but once outside, the remaining input range is rescaled to fill the full `[0, 1]` range so there's no sudden jump when crossing the threshold.[^5]

```js
const rawForce = clampedDist / maxRadius; // 0.0 to 1.0
const deadZone = 0.1;

const scaledForce = rawForce < deadZone
  ? 0
  : (rawForce - deadZone) / (1 - deadZone);
```

In the **rex virtual joystick plugin**, this is configured via `forceMin`: cursor key simulation only triggers when the joystick's force distance exceeds `forceMin` pixels, which acts as the dead zone.[^7]

***
## 5. Using the Rex Virtual Joystick Plugin
The **rexVirtualJoystick** plugin from phaser3-rex-plugins is the most feature-complete, actively maintained joystick solution for Phaser 3. It handles thumb clamping, cursor key simulation, force/angle output, and scrollFactor fixing automatically.[^7][^8][^9]

**Installation:**
```js
// npm
npm i phaser3-rex-plugins

// or via CDN in preload
scene.load.plugin(
  'rexvirtualjoystickplugin',
  'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js',
  true
);
```

**Creating the joystick:**
```js
var joystick = scene.plugins.get('rexVirtualJoystick').add(scene, {
  x: 160,
  y: 500,
  radius: 80,           // Size of the hit zone
  base: baseSprite,     // Your base circle image
  thumb: thumbSprite,   // Your thumb/knob image
  dir: '8dir',          // Full 360° analog, or '4dir' for compass-only
  forceMin: 16,         // Dead zone in pixels
  fixed: true,          // Fix to camera (HUD layer)
  enable: true
});
```

**Reading output in `update()`:**
```js
// Analog (smooth movement)
player.setVelocityX(joystick.forceX * playerSpeed);
player.setVelocityY(joystick.forceY * playerSpeed);

// Or digital (D-pad style)
var cursors = joystick.createCursorKeys();
if (cursors.left.isDown)  { /* move left */ }
if (cursors.right.isDown) { /* move right */ }
```

The plugin also exposes `joystick.angle` (degrees, -180 to 180) and `joystick.rotation` (radians) for rotating a character sprite to face the direction of travel.[^7]

***
## 6. Visual Design & Feedback
| Principle | Recommendation | Why It Matters |
|---|---|---|
| Touch target size | Base circle ≥ 80px radius; thumb ≥ 40px radius | Apple guideline is 44px min; game controls need more[^3] |
| Opacity at rest | ~30–50% when idle, 80–100% when active | Doesn't obscure game world; confirms engagement[^10] |
| Opacity when hidden | 0% (invisible until touched) | Floating joystick should be invisible between touches[^1] |
| Base color | Semi-transparent dark circle | Contrast without blocking gameplay[^3] |
| Screen zone | Left ~40% of screen | Prevents conflicts with action buttons[^1] |
| Pointer capture | Yes — track `pointermove` globally, not just inside base | Allows fast swipes past the radius edge without losing input[^11] |

Visual feedback is not optional: when the character is held still intentionally (i.e. full deflection in a direction with no movement), the joystick graphic confirms the input is registered even if the game character isn't visibly reacting.[^10]

***
## 7. Multi-Touch: Register Extra Pointers
By default, Phaser tracks only one pointer. For a dual-stick or joystick-plus-button layout, you must register additional pointers:

```js
// In create()
this.input.addPointer(2); // Now tracks 3 total (default 1 + 2 added)
```

Assign each touch pointer to its own zone. The left-half pointer drives movement; the right-half pointer drives aiming or action. The rex plugin handles multi-pointer scenarios gracefully since each joystick instance binds to its own pointer within its defined zone.[^3][^12]

***
## 8. Common Pitfalls to Avoid
- **Don't listen only inside the base circle.** Once a drag starts, continue tracking `pointermove` on the whole scene so fast swipes don't orphan the joystick.[^11]
- **Don't use integer-only direction modes for character movement.** `'4dir'` feels like a D-pad — use `'8dir'` or raw `forceX/forceY` for smooth steering.[^7][^13]
- **Don't forget `scrollFactor(0)`** if the world camera scrolls. Joystick UI must be fixed to the camera, not the world.[^7]
- **Don't place the base at a fixed position on a floating joystick** — re-anchor it on each `pointerdown` so the thumb always starts centered under the finger.[^1]
- **Test on a real device.** Emulators do not reproduce the feel of thumb pressure, finger size, or palm rejection behavior.[^3]

***
## Quick-Reference: Anatomy of a Good Phaser.js Joystick
```
┌────────────────────────────────────┐
│  Left Zone (touch spawns here)     │
│                                    │
│    ┌──────────────────┐            │
│    │   Base Circle    │            │
│    │    (80px r)      │            │
│    │       ╭──╮       │            │
│    │       │ ● │ ← thumb (40px r)  │
│    │       ╰──╯       │            │
│    └──────────────────┘            │
│                                    │
│  forceX, forceY → [-1, 1]          │
│  angle → character heading         │
└────────────────────────────────────┘
```

The thumb position within the base provides directional and speed information simultaneously. The base spawns at first touch, disappears on release, and never fights with the player's natural thumb placement.

---

## References

1. [I built the best virtual joystick for PhaserJS](https://phaser.io/news/2025/12/i-built-the-best-virtual-joystick-for-phaserjs) - Renato Cassino tackled this challenge by creating a responsive virtual joystick for PhaserJS, inspir...

2. [Which is Better Fixed Joystick or Not in eFootball (2025) - YouTube](https://www.youtube.com/watch?v=Se_iTRQ8CmI) - Want to know which joystick setting — Fixed or Floating — is better in eFootball 2026 Mobile? In thi...

3. [Can You Make Mobile Games with Phaser? Complete Guide (2025)](https://generalistprogrammer.com/tutorials/phaser-mobile-games-guide) - This guide covers everything you need to know about building Phaser games specifically for mobile: t...

4. [Virtual Gamepad Plugin for Phaser - Shawn Hymel](https://shawnhymel.com/1135/virtual-gamepad-plugin-for-phaser/) - I found a few existing options in Phaser. The first is the beautiful and well-designed Virtual Joyst...

5. [Minimuino/thumbstick-deadzones: Techniques for ... - GitHub](https://github.com/Minimuino/thumbstick-deadzones) - Here I'll go through different approaches for implementing deadzones, along with a playable demo. I ...

6. [Controller Deadzone Explained: What It Is and How to Test It Free](https://mygamepadtester.com/blog/controller-deadzone-explained/) - The goal is to find the minimum threshold where drift disappears from gameplay without making the st...

7. [Virtual joystick - Notes of Phaser 3 - GitHub Pages](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/virtualjoystick/) - Virtual joystick Introduction Simulate cursor keys according to touch events. Live demos Usage Sampl...

8. [A Phaser 3 virtual joystick implementation with phaser3-rex ... - GitHub](https://github.com/leandrocurioso/phaser3-virtual-joystick) - A Phaser 3 virtual joystick implementation with phaser3-rex-notes plugin. This project is already co...

9. [[Phaser 3] rexVirtualJoyStick plugin - Showcase - Discourse](https://phaser.discourse.group/t/phaser-3-rexvirtualjoystick-plugin/385) - Virtual joystick plugin of phaser 3. 6 Likes Mobile controls plugin is there in phaser 3.? like joys...

10. [what's the best type of virtual onscreen joystick type / directional input](https://www.reddit.com/r/gamedev/comments/1gmlemv/mobile_whats_the_best_type_of_virtual_onscreen/) - Mobile game joystick interface design tips. Best practices for mobile game HUD design. Mobile game c...

11. [How to: Create a virtual joystick for a mobile UI - Coherent Labs](http://coherent-labs.com/blog/uitutorials/virtual-joystick/) - In this blog post, we'll explore how to create a virtual joystick for your mobile games, enhancing g...

12. [Phaser Virtual Joystick Plugin Released - HTML5 Game Devs Forum](https://www.html5gamedevs.com/topic/13551-phaser-virtual-joystick-plugin-released/) - The Phaser Virtual Joystick Plugin allows you to easily add mobile friendly joysticks, d-pads and bu...

13. [8 direction - Notes of Phaser 3 - GitHub Pages](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/eightdirection/) - Move game object by cursor keys, with a constant speed. Author: Rex; Arcade behavior of game object....

