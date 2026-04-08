/**
 * Touch joystick helper for grid-based movement scenes.
 *
 * Built per the principles in `todo/tech/Building a Great Phaser.js Mobile
 * Joystick.md` and the rex virtual joystick plugin's design notes — but
 * scoped to OUR specific use case (grid-based puzzle scenes that consume
 * direction as discrete tile steps, not analog velocity).
 *
 * Why not the rex plugin: rex's phaser3-rex-plugins virtual joystick is
 * the gold-standard analog stick for Phaser, but its analog features
 * (`forceX`, `forceY`, `angle`) are designed for arcade-physics velocity
 * control. Our scenes (Chase, TownMap, Room, Brawl) all consume direction
 * as a single tile step — analog force is wasted. A 200-line custom
 * helper that fits our discrete model is better than a 30KB dependency
 * we'd only use 20% of.
 *
 * Design notes:
 *
 * 1. **Floating** — touch in the activation zone relocates the joystick
 *    to the touch point.
 * 2. **Hide at rest** — the base and knob are HIDDEN when no pointer is
 *    active, then appear under the player's thumb on touchdown.
 * 3. **Scaled radial dead zone** — inputs inside the dead zone snap to
 *    zero and inputs outside rescale to the full [0..1] range.
 * 4. **Bigger radius** — 56px (was 36px). Apple HIG recommends 44pt min;
 *    game controls need more breathing room, especially for the thumb.
 * 5. **Active brightening** — the base + knob brighten when held so the
 *    player has clear visual confirmation the input is registered.
 * 6. **Single source of truth** — chase, town, room, and any future
 *    grid scene share one implementation.
 *
 * 2026-04-08 rewrite — fixes the "joystick stays pointing down" bug:
 *
 * - **Screen-space math, not world coords.** The previous version used
 *   `pointer.worldX/worldY` which Phaser computes lazily off the camera.
 *   Reading worldX from a polling loop between touch events returned
 *   stale values, and on scenes with any camera offset/scroll the math
 *   biased systematically. Now uses `pointer.x/pointer.y` (canvas pixel
 *   coordinates from the touch event itself) — fresh, camera-independent.
 * - **Event-driven, not polling.** `pointermove` updates direction and
 *   knob position immediately, so the rendered thumb follows the finger
 *   in real time. The 16ms poll loop is gone.
 * - **Angle-based 90° wedges.** The previous dominant-axis comparison
 *   (`|dy| >= |dx| → vertical`) gave vertical 100° of input space and
 *   horizontal only 80° — a 25% bias toward up/down. Combined with the
 *   natural thumb tendency to extend further down than up on a phone,
 *   this presented as "the joystick mostly points down". Now uses
 *   `atan2` with four equal 90° wedges, each centered on a cardinal.
 * - **Public `currentDir` field.** Scenes can read the live direction
 *   outside the moveTick callback — used for pac-man-style wall-slide
 *   fallbacks where the cat continues in the last open direction when
 *   the player holds against a wall.
 *
 * Each scene provides a callback `onMoveTick(dr, dc)` that fires once
 * per cooldown interval while the joystick is held outside the dead zone.
 * The (dr, dc) values are -1, 0, or +1 (4-directional grid movement).
 */

import Phaser from 'phaser';
import { DPR } from '../utils/constants';

export interface TouchJoystickConfig {
  /** Resting position of the joystick in WORLD coords (used as the
   *  initial visual anchor before the player touches). */
  homeX: number;
  homeY: number;
  /** Radius of the base circle in WORLD-coord pixels. Recommended: 50-60. */
  radius?: number;
  /** Activation zone — touches BELOW this y coordinate (in WORLD coords)
   *  spawn the joystick at the touch point. Anything above is ignored
   *  (the parent scene can use that area for its own input). */
  activationMinY: number;
  /** Cooldown between moveTick callbacks (ms). Must be ≥ the scene's
   *  per-tile movement duration so moveTick doesn't fire while the
   *  cat is still tweening to the previous tile. */
  cooldownMs: number;
  /** Called once per cooldown while the joystick is active and the
   *  thumb is outside the dead zone. (dr, dc) are 4-directional steps
   *  (-1/0/+1) chosen by 90° angle wedges around the cardinal axes. */
  onMoveTick: (dr: number, dc: number) => void;
}

const DEAD_ZONE_FRACTION = 0.18;

export class TouchJoystick {
  private scene: Phaser.Scene;
  private config: Required<Omit<TouchJoystickConfig, 'onMoveTick'>> & Pick<TouchJoystickConfig, 'onMoveTick'>;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  /** Joystick spawn point in CANVAS pixel coords (pointer.x/y). All
   *  direction math is done in this coordinate system. */
  private centerCanvasX: number;
  private centerCanvasY: number;
  /** Same as above but in WORLD coords (for positioning the visual
   *  GameObjects, which Phaser places in world space). */
  private centerWorldX: number;
  private centerWorldY: number;
  /** Radius in CANVAS pixel coords (= radius * DPR), used for the
   *  dead-zone math which compares against canvas-pixel distances. */
  private radiusCanvas: number;
  private pointerId = -1;
  private moveTimer: Phaser.Time.TimerEvent | null = null;
  /** The last 4-direction (dr, dc) the joystick computed. Public so the
   *  scene can read the live direction outside the moveTick callback —
   *  used by ChaseScene's pac-man wall-slide fallback. */
  currentDir: { dr: number; dc: number } = { dr: 0, dc: 0 };
  /** True while the player is holding the joystick outside the dead zone. */
  isActive = false;

  constructor(scene: Phaser.Scene, config: TouchJoystickConfig) {
    this.scene = scene;
    this.config = {
      homeX: config.homeX,
      homeY: config.homeY,
      radius: config.radius ?? 56,
      activationMinY: config.activationMinY,
      cooldownMs: config.cooldownMs,
      onMoveTick: config.onMoveTick,
    };
    this.centerWorldX = this.config.homeX;
    this.centerWorldY = this.config.homeY;
    this.centerCanvasX = this.config.homeX * DPR;
    this.centerCanvasY = this.config.homeY * DPR;
    this.radiusCanvas = this.config.radius * DPR;

    // Base + knob start hidden — only appear when the player touches.
    this.base = scene.add.circle(this.centerWorldX, this.centerWorldY, this.config.radius, 0x2a2520, 0.55)
      .setStrokeStyle(1.5, 0x6b5b3e)
      .setVisible(false);
    this.knob = scene.add.circle(this.centerWorldX, this.centerWorldY, 18, 0x6b5b3e, 0.85)
      .setVisible(false);

    scene.input.addPointer(1);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  /** Set the joystick to a higher z-order. Phaser scenes that add
   *  graphics after the joystick is created will end up on top of it
   *  by default; calling this in create() after all other setup keeps
   *  the joystick visible. */
  bringToTop(): void {
    this.base.setDepth(1000);
    this.knob.setDepth(1001);
  }

  destroy(): void {
    this.moveTimer?.destroy();
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.base.destroy();
    this.knob.destroy();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Activation zone check uses world coords (the natural way for
    // scenes to specify "below the maze" or "below the playfield").
    if (pointer.worldY <= this.config.activationMinY) return;

    // All movement math from here lives in canvas pixel space.
    this.centerCanvasX = pointer.x;
    this.centerCanvasY = pointer.y;
    // World coords for the visual GameObjects (Phaser positions them
    // in world space; the camera zoom converts back to canvas pixels
    // when rendering).
    this.centerWorldX = pointer.worldX;
    this.centerWorldY = pointer.worldY;

    this.base.setPosition(this.centerWorldX, this.centerWorldY);
    this.knob.setPosition(this.centerWorldX, this.centerWorldY);
    this.base.setVisible(true);
    this.knob.setVisible(true);
    // Brighten the active state — confirms touch registration even
    // before the player drags the thumb anywhere.
    this.base.setFillStyle(0x3a3025, 0.7);
    this.knob.setFillStyle(0xc4956a, 1);
    this.pointerId = pointer.id;
    this.currentDir = { dr: 0, dc: 0 };
    this.isActive = false;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId || !pointer.isDown) return;

    // Screen/canvas-space delta. NEVER use pointer.worldX/Y here —
    // those are camera-derived getters that can drift, and they were
    // the root cause of the "stays pointing down" bug.
    const dx = pointer.x - this.centerCanvasX;
    const dy = pointer.y - this.centerCanvasY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampDist = Math.min(dist, this.radiusCanvas);

    // Visual knob — clamped to the base radius (thumb-clamping rule:
    // the visual stays inside the base even when the finger drags
    // far beyond, so the player gets honest feedback).
    if (dist > 0.001) {
      // Knob position is in WORLD coords; canvas-space delta divides
      // by DPR to convert back. (centerWorld + (clampDist / DPR) * unit)
      const ux = dx / dist;
      const uy = dy / dist;
      this.knob.setPosition(
        this.centerWorldX + ux * (clampDist / DPR),
        this.centerWorldY + uy * (clampDist / DPR),
      );
    }

    // Scaled radial dead zone — small movements snap to zero, inputs
    // outside rescale to fill [0..1].
    const rawForce = clampDist / this.radiusCanvas;
    const scaledForce = rawForce < DEAD_ZONE_FRACTION
      ? 0
      : (rawForce - DEAD_ZONE_FRACTION) / (1 - DEAD_ZONE_FRACTION);

    if (scaledForce > 0) {
      // Angle-based 4-direction snap with 90° equal-area wedges. atan2
      // returns -π to π in screen coords (y-down): right=0, down=π/2,
      // left=±π, up=-π/2. Each cardinal gets a 90° wedge centered on
      // its axis — no bias toward vertical or horizontal.
      const angle = Math.atan2(dy, dx);
      const PI4 = Math.PI / 4;
      let dr = 0;
      let dc = 0;
      if (angle >= -PI4 && angle < PI4) {
        dc = 1; // right
      } else if (angle >= PI4 && angle < 3 * PI4) {
        dr = 1; // down
      } else if (angle >= 3 * PI4 || angle < -3 * PI4) {
        dc = -1; // left
      } else {
        dr = -1; // up
      }
      this.currentDir = { dr, dc };
      this.isActive = true;

      // Fire an immediate moveTick the first time the player crosses
      // the dead zone, then let the cooldown gate further ticks.
      if (!this.moveTimer) {
        this.config.onMoveTick(dr, dc);
        this.moveTimer = this.scene.time.addEvent({
          delay: this.config.cooldownMs,
          loop: true,
          callback: () => {
            // Always read the LATEST direction at tick time, not the
            // direction captured when the cooldown started. This is
            // what makes the joystick respond fluidly to mid-hold
            // direction changes.
            if (this.isActive) {
              this.config.onMoveTick(this.currentDir.dr, this.currentDir.dc);
            }
          },
        });
      }
    } else {
      // Inside the dead zone — stop firing moves but keep the pointer
      // tracked so the next outward drag picks up where we left off.
      this.isActive = false;
      this.currentDir = { dr: 0, dc: 0 };
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = -1;
    this.isActive = false;
    this.currentDir = { dr: 0, dc: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
    // Reset the dim state for next activation
    this.base.setFillStyle(0x2a2520, 0.55);
    this.knob.setFillStyle(0x6b5b3e, 0.85);
    this.moveTimer?.destroy();
    this.moveTimer = null;
  }
}
