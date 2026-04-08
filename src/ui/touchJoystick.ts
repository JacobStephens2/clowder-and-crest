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
 * What this helper provides over the previous inline implementations:
 *
 * 1. **Floating** — touch in the activation zone relocates the joystick
 *    to the touch point. Same as before.
 * 2. **Hide at rest** — the base and knob are HIDDEN when no pointer is
 *    active, then appear under the player's thumb on touchdown. The
 *    previous always-visible variant left a distracting empty stick.
 * 3. **Scaled radial dead zone** — instead of a binary "if dist > 8 then
 *    move", inputs inside the dead zone snap to zero and inputs outside
 *    rescale to the full [0..1] range. This eliminates the abrupt
 *    threshold feel.
 * 4. **Bigger radius** — 56px (was 36px). Apple HIG recommends 44pt min;
 *    game controls need more breathing room, especially for the thumb.
 * 5. **Active brightening** — the base + knob brighten when held so the
 *    player has clear visual confirmation the input is registered.
 * 6. **Single source of truth** — chase, town, room, and any future
 *    grid scene share one implementation. No more drift between scenes.
 *
 * Each scene provides a callback `onMoveTick(dr, dc)` that fires once
 * per cooldown interval while the joystick is held outside the dead zone.
 * The (dr, dc) values are -1, 0, or +1 (clamped to 4-directional grid
 * movement); the dominant axis wins on diagonals.
 */

import Phaser from 'phaser';

export interface TouchJoystickConfig {
  /** Resting position of the joystick (used for the "hide here when
   *  inactive" anchor — the actual touch point determines where the
   *  visible joystick spawns when active). */
  homeX: number;
  homeY: number;
  /** Radius of the base circle in pixels. Recommended: 50-60. */
  radius?: number;
  /** Activation zone — touches BELOW this y coordinate spawn the
   *  joystick at the touch point. Anything above is ignored (the
   *  parent scene can use that area for its own input). */
  activationMinY: number;
  /** Cooldown between moveTick callbacks (ms). Must be ≥ the scene's
   *  per-tile movement duration so moveTick doesn't fire while the
   *  cat is still tweening to the previous tile. */
  cooldownMs: number;
  /** Called once per cooldown while the joystick is active and the
   *  thumb is outside the dead zone. (dr, dc) are 4-directional steps
   *  (-1/0/+1) with the dominant axis winning on diagonals. */
  onMoveTick: (dr: number, dc: number) => void;
}

const DEAD_ZONE_FRACTION = 0.18; // 18% of radius — per the doc's recommendation

export class TouchJoystick {
  private scene: Phaser.Scene;
  private config: Required<Omit<TouchJoystickConfig, 'onMoveTick'>> & Pick<TouchJoystickConfig, 'onMoveTick'>;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private centerX: number;
  private centerY: number;
  private pointerId = -1;
  private moveTimer: Phaser.Time.TimerEvent | null = null;
  private pollTimer: Phaser.Time.TimerEvent;

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
    this.centerX = this.config.homeX;
    this.centerY = this.config.homeY;

    // Base + knob start hidden — only appear when the player touches.
    this.base = scene.add.circle(this.centerX, this.centerY, this.config.radius, 0x2a2520, 0.55)
      .setStrokeStyle(1.5, 0x6b5b3e)
      .setVisible(false);
    this.knob = scene.add.circle(this.centerX, this.centerY, 18, 0x6b5b3e, 0.85)
      .setVisible(false);

    scene.input.addPointer(1);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointerup', this.onPointerUp, this);

    // Poll the pointer once per frame (16ms). Cheaper than a Phaser
    // tween and avoids drift from RAF throttling.
    this.pollTimer = scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: this.poll,
      callbackScope: this,
    });

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
    this.pollTimer?.destroy();
    this.moveTimer?.destroy();
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.base.destroy();
    this.knob.destroy();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.worldY <= this.config.activationMinY) return;
    this.centerX = pointer.worldX;
    this.centerY = pointer.worldY;
    this.base.setPosition(this.centerX, this.centerY);
    this.knob.setPosition(this.centerX, this.centerY);
    this.base.setVisible(true);
    this.knob.setVisible(true);
    // Brighten the active state — confirms touch registration even
    // before the player drags the thumb anywhere.
    this.base.setFillStyle(0x3a3025, 0.7);
    this.knob.setFillStyle(0xc4956a, 1);
    this.pointerId = pointer.id;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = -1;
    this.base.setVisible(false);
    this.knob.setVisible(false);
    // Reset the dim state for next activation
    this.base.setFillStyle(0x2a2520, 0.55);
    this.knob.setFillStyle(0x6b5b3e, 0.85);
    this.moveTimer?.destroy();
    this.moveTimer = null;
  }

  private poll(): void {
    if (this.pointerId < 0) return;
    const pointers = [this.scene.input.pointer1, this.scene.input.pointer2];
    for (const p of pointers) {
      if (!p || p.id !== this.pointerId || !p.isDown) continue;

      const dx = p.worldX - this.centerX;
      const dy = p.worldY - this.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = this.config.radius;
      const clampDist = Math.min(dist, radius);

      // Update knob visual — clamped to the radius (the doc's "thumb
      // clamping" rule: visual stays inside even when the finger drags
      // far beyond).
      if (dist > 0.001) {
        this.knob.setPosition(
          this.centerX + (dx / dist) * clampDist,
          this.centerY + (dy / dist) * clampDist,
        );
      }

      // Scaled radial dead zone — inputs inside DEAD_ZONE_FRACTION of
      // the radius snap to zero, inputs outside rescale to fill [0..1].
      // Smoother edge feel than a binary `if dist > 8` check.
      const rawForce = clampDist / radius;
      const scaledForce = rawForce < DEAD_ZONE_FRACTION
        ? 0
        : (rawForce - DEAD_ZONE_FRACTION) / (1 - DEAD_ZONE_FRACTION);

      if (scaledForce > 0 && !this.moveTimer) {
        // Pick the dominant axis for grid movement. Vertical wins on
        // ties (since |dy| >= |dx| when equal). Horizontal needs strict
        // greater-than to override.
        const dr = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 1 : -1) : 0;
        const dc = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0;
        this.config.onMoveTick(dr, dc);
        this.moveTimer = this.scene.time.delayedCall(this.config.cooldownMs, () => {
          this.moveTimer = null;
        });
      }
      return;
    }
  }
}
