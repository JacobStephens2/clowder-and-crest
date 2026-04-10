import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial } from '../ui/sceneHelpers';

interface Ring {
  notches: number;
  gapPos: number; // which notch is the gap
  rotation: number; // current rotation offset
  linkedTo: number; // -1 = none, else index of linked ring (rotates opposite)
  radius: number;
  /** Original rotation at scene init — used to reset on a trap-notch trigger. */
  startRotation: number;
  /** True when the gap is currently aligned to the top (effective gap === 0).
      Tracked explicitly so the scene can fire visual/audio "set" feedback
      and so the player gets a clear progress signal. */
  isSet: boolean;
  /** Notch indices that are TRAP notches. Rotating the ring such that a
      trap notch reaches the top position resets the ring to its starting
      rotation. Empty on easy/medium; populated on hard. The doc's
      "harder locks require different strategies" pillar in concrete form. */
  trapNotches: number[];
}

export class HeistScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  difficulty = 'easy';
  rings: Ring[] = [];
  private timeLeft = 30;
  finished = false;
  private tutorialShowing = false;
  private timerText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private setText!: Phaser.GameObjects.Text;
  private noiseText!: Phaser.GameObjects.Text;
  private noiseBar!: Phaser.GameObjects.Rectangle;
  private noiseBarBg!: Phaser.GameObjects.Rectangle;
  private moveCount = 0;
  private ringGfx!: Phaser.GameObjects.Graphics;
  /** Noise meter — every rotation adds 1, every trap-notch slip adds 4.
   *  When it crosses noiseBudget the heist fails (caught). Per the
   *  genre-pillar doc's "world embeddedness" + "failure as teacher"
   *  principles: gives the player a real cost for naive over-spinning,
   *  and forces them to plan the shorter rotation path instead of
   *  spam-clicking. Easy mode has a generous budget; hard mode is tight. */
  private noise = 0;
  private noiseBudget = 30;
  /** Tracks which noise thresholds have already triggered an audio
   *  warning so they don't repeat on every drawRings call. */
  private noiseWarned60 = false;
  private noiseWarned85 = false;

  constructor() { super({ key: 'HeistScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.finished = false;
    this.rings = [];

    const ringCount = this.difficulty === 'hard' ? 5 : this.difficulty === 'medium' ? 4 : 3;
    const notches = this.difficulty === 'hard' ? 16 : this.difficulty === 'medium' ? 16 : 12;
    this.timeLeft = this.difficulty === 'hard' ? 20 : this.difficulty === 'medium' ? 25 : 30;

    // Noise budget — total rotations the cat can perform before being
    // heard. Easy gives breathing room; hard demands almost-perfect
    // pathing. Stealth stat extends the budget so a sneaky cat has
    // an actual edge in this scene.
    this.noise = 0;
    this.noiseWarned60 = false;
    this.noiseWarned85 = false;
    this.noiseBudget = this.difficulty === 'hard' ? 22 : this.difficulty === 'medium' ? 32 : 42;
    this.moveCount = 0;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const stealth = cat?.stats?.stealth ?? 5;
    this.timeLeft += Math.floor(stealth * 0.5);
    this.noiseBudget += Math.floor((stealth - 5) * 1.5);

    // Generate rings
    for (let i = 0; i < ringCount; i++) {
      const n = notches - (i % 2 === 0 ? 0 : 2); // slight variation
      const gapPos = Math.floor(Math.random() * n);
      let rot = Math.floor(Math.random() * n);
      // Avoid spawning a ring already in the set position — would confuse
      // the "you set a tumbler" feedback if it fires before any input.
      if ((gapPos + rot) % n === 0) rot = (rot + 1) % n;
      this.rings.push({
        notches: n,
        gapPos,
        rotation: rot,
        startRotation: rot,
        linkedTo: -1,
        radius: 50 + i * 28,
        isSet: false,
        trapNotches: [],
      });
    }

    // Add links on medium/hard
    if (this.difficulty === 'medium' || this.difficulty === 'hard') {
      this.rings[0].linkedTo = 1;
      if (this.difficulty === 'hard' && ringCount >= 4) {
        this.rings[2].linkedTo = 3;
      }
    }

    // Trap notches on every difficulty. Per user feedback (2026-04-08):
    // "the heist game doesn't feel like it has a failure condition. It
    // feels like I just click a ring until it locks into place... no
    // thinking required." Easy used to have ZERO trap notches which
    // made it pure spam-clicking. Now every difficulty has them, with
    // counts scaled to keep easy still beginner-friendly:
    //   easy:   1 trap notch per ring (or 0 on linked rings)
    //   medium: 1-2
    //   hard:   2-3
    const trapCountByDiff = this.difficulty === 'hard' ? [2, 3]
      : this.difficulty === 'medium' ? [1, 2]
      : [1, 1];
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      // Skip linked rings (the linking is already a strategic complication)
      if (ring.linkedTo >= 0) continue;
      // Pick trap notches that are NOT the gap and NOT the starting
      // position (so the player can read the situation before stepping
      // into a trap on their first move)
      const candidates: number[] = [];
      for (let n = 0; n < ring.notches; n++) {
        if (n === ring.gapPos) continue;
        const effective = (n + ring.rotation) % ring.notches;
        if (effective === 0) continue;
        candidates.push(n);
      }
      // Shuffle
      for (let j = candidates.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [candidates[j], candidates[k]] = [candidates[k], candidates[j]];
      }
      const trapCount = trapCountByDiff[Math.floor(Math.random() * trapCountByDiff.length)];
      ring.trapNotches = candidates.slice(0, trapCount);
    }

    // Initial set-state pass — usually all false because of the avoidance
    // above, but compute it for safety.
    for (const ring of this.rings) {
      ring.isSet = ((ring.gapPos + ring.rotation) % ring.notches) === 0;
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v3 — noise meter is the new tension mechanic.
    if (showMinigameTutorial(this, 'clowder_heist_tutorial_v3', 'Pick the Lock',
      `Rotate the rings to align all gaps at the top.<br><br>
      Tap the <strong>right side</strong> of a ring to rotate clockwise, or the <strong>left side</strong> for counter-clockwise.<br><br>
      A satisfying click means a tumbler is <strong style="color:#dda055">set</strong>.<br><br>
      <strong style="color:#cc6666">Red trap notches</strong> reset the ring if you cross them. Plan your path!<br><br>
      Every rotation adds to the <strong style="color:#aa44aa">noise meter</strong> — fill it and a guard hears you. Pick the shorter path.`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Heist'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.timerText = this.add.text(GAME_WIDTH / 2, 55, `Time: ${this.timeLeft}s`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    this.movesText = this.add.text(20, 55, 'Moves: 0', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    });

    // Tumbler progress text — shows how many rings are currently set so
    // the player has a clear progress signal without having to count rings.
    this.setText = this.add.text(GAME_WIDTH / 2, 75, `Set: 0/${this.rings.length}`, {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
    }).setOrigin(0.5);

    // Noise meter — fills with each rotation. Visible always so the
    // player can pace their movement. Overflow = caught.
    this.noiseText = this.add.text(GAME_WIDTH / 2, 95, `Noise: 0/${this.noiseBudget}`, {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#aa44aa',
    }).setOrigin(0.5);
    const barW = 220;
    this.noiseBarBg = this.add.rectangle(GAME_WIDTH / 2, 110, barW, 6, 0x2a2520).setStrokeStyle(1, 0x3a3530);
    this.noiseBar = this.add.rectangle(GAME_WIDTH / 2 - barW / 2, 110, 0, 6, 0xaa44aa).setOrigin(0, 0.5);

    // Alignment indicator at top
    this.add.text(GAME_WIDTH / 2, 122, '\u25BC', {
      fontSize: '18px', color: '#dda055',
    }).setOrigin(0.5);

    // Lock body pixel art sprite behind the ring graphics, centered
    // on the lock. Purely decorative — the rings are still drawn as
    // graphics arcs on top (they rotate and change state dynamically).
    if (this.textures.exists('lock_body')) {
      const lockSpr = this.add.sprite(GAME_WIDTH / 2, 330, 'lock_body');
      lockSpr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      lockSpr.setAlpha(0.35);
      lockSpr.setDepth(0);
    }

    // Lock graphics
    this.ringGfx = this.add.graphics();
    this.ringGfx.setDepth(1);
    this.drawRings();

    // Touch input — detect which ring was tapped, and which side (left =
    // counter-clockwise, right = clockwise). Per the doc's "skill expression"
    // pillar: lets the player choose the shorter rotation path.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.finished || this.tutorialShowing) return;
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      const cx = GAME_WIDTH / 2;
      const cy = 330;
      const dist = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);

      // Find which ring was tapped (outermost first)
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        if (Math.abs(dist - r.radius) < 20) {
          // Direction from tap position relative to ring center: tap on
          // the right side (wx > cx) → clockwise (+1), left → counter-
          // clockwise (-1).
          const dir = wx >= cx ? 1 : -1;
          this.rotateRing(i, dir);
          // Flash the tapped ring
          this.ringGfx.lineStyle(10, 0xdda055, 0.4);
          this.ringGfx.beginPath();
          this.ringGfx.arc(cx, cy, r.radius, 0, Math.PI * 2);
          this.ringGfx.strokePath();
          this.time.delayedCall(100, () => this.drawRings());
          break;
        }
      }
    });

    // Timer
    this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        this.timeLeft--;
        this.timerText.setText(`Time: ${this.timeLeft}s`);
        if (this.timeLeft <= 0) this.endGame(false);
      },
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  rotateRing(idx: number, dir: number): void {
    const ring = this.rings[idx];
    const oldSet = ring.isSet;
    ring.rotation = (ring.rotation + dir + ring.notches) % ring.notches;
    this.moveCount++;
    this.movesText.setText(`Moves: ${this.moveCount}`);
    // Every rotation adds 1 noise. Spam-clicking has a real cost now.
    this.addNoise(1);

    // Trap-notch check: if a trap notch landed at the top position after
    // rotation, this ring resets to its starting rotation. The doc's
    // "trap mechanics that punish naive extension" pillar.
    let trapTriggered = false;
    for (const trap of ring.trapNotches) {
      const effective = (trap + ring.rotation) % ring.notches;
      if (effective === 0) {
        trapTriggered = true;
        break;
      }
    }
    if (trapTriggered) {
      ring.rotation = ring.startRotation;
      ring.isSet = ((ring.gapPos + ring.rotation) % ring.notches) === 0;
      playSfx('fail', 0.6);
      haptic.error();
      // Stronger feedback per user feedback (2026-04-08): "I didn't
      // notice a penalty in the heist scene when I moved a ring over
      // a red spot." A 120ms flash and a quiet hiss were too subtle —
      // the player needs to know unmistakably that the trap fired.
      this.cameras.main.flash(220, 180, 40, 40);
      this.cameras.main.shake(220, 0.012);
      // Big red "TRAP!" callout floating up from the lock
      const callout = this.add.text(GAME_WIDTH / 2, 290, 'TRAP! Ring reset \u2014 +4 noise', {
        fontFamily: 'Georgia, serif', fontSize: '16px', color: '#cc6666',
        backgroundColor: '#1a1010', padding: { x: 10, y: 4 },
      }).setOrigin(0.5).setDepth(50);
      this.tweens.add({
        targets: callout,
        y: 250,
        alpha: 0,
        duration: 1100,
        ease: 'Sine.easeOut',
        onComplete: () => callout.destroy(),
      });
      // Slip is loud — adds extra noise on top of the per-rotation cost.
      this.addNoise(4);
    } else {
      // Update set state and play context-appropriate audio. The doc's
      // "audio is primary" pillar: distinct sounds for set vs nudge.
      ring.isSet = ((ring.gapPos + ring.rotation) % ring.notches) === 0;
      if (!oldSet && ring.isSet) {
        // Just clicked into place — high-pitched satisfying sound
        playSfx('sparkle', 0.5);
        haptic.medium();
      } else if (oldSet && !ring.isSet) {
        // Slipped out of place — soft "uh" feedback
        playSfx('lock_click', 0.6);
        haptic.warning();
      } else {
        // Normal nudge — standard click
        playSfx('lock_click', 0.35);
        haptic.light();
      }
    }

    // Rotate linked ring in opposite direction
    if (ring.linkedTo >= 0 && ring.linkedTo < this.rings.length) {
      const linked = this.rings[ring.linkedTo];
      const linkedOldSet = linked.isSet;
      linked.rotation = (linked.rotation - dir + linked.notches) % linked.notches;
      linked.isSet = ((linked.gapPos + linked.rotation) % linked.notches) === 0;
      // Audio cue when the linked ring's set state flips
      if (!linkedOldSet && linked.isSet) {
        playSfx('sparkle', 0.4);
      }
    }

    this.updateSetText();
    this.drawRings();
    this.checkWin();
  }

  /** Helper for the playtest: returns the count of currently-set rings. */
  countSetRings(): number {
    return this.rings.filter((r) => r.isSet).length;
  }

  private updateSetText(): void {
    const setCount = this.countSetRings();
    this.setText.setText(`Set: ${setCount}/${this.rings.length}`);
  }

  /** Add to the noise meter and refresh the HUD. If the meter
   *  overflows the budget, the heist fails (caught) — the doc's
   *  "world embeddedness" + "failure as teacher" combo. */
  private addNoise(amount: number): void {
    if (this.finished) return;
    this.noise += amount;
    const pct = Math.min(1, this.noise / this.noiseBudget);
    if (this.noiseBar) {
      this.noiseBar.width = 220 * pct;
      // Bar reddens as we approach overflow
      const color = pct > 0.85 ? 0xcc4444 : pct > 0.6 ? 0xdda055 : 0xaa44aa;
      this.noiseBar.setFillStyle(color);
      // Audio warning at 60% and 85% thresholds (fires once each)
      if (pct > 0.6 && !this.noiseWarned60) {
        this.noiseWarned60 = true;
        playSfx('alarm', 0.08);
      }
      if (pct > 0.85 && !this.noiseWarned85) {
        this.noiseWarned85 = true;
        playSfx('alarm', 0.18);
        haptic.medium();
      }
    }
    if (this.noiseText) {
      this.noiseText.setText(`Noise: ${Math.min(this.noise, this.noiseBudget)}/${this.noiseBudget}`);
      this.noiseText.setColor(pct > 0.85 ? '#cc6666' : pct > 0.6 ? '#dda055' : '#aa44aa');
    }
    if (this.noise >= this.noiseBudget) {
      // Caught — triggered by overflow rather than the timer running out.
      this.cameras.main.shake(200, 0.012);
      this.endGame(false);
    }
  }

  private drawRings(): void {
    this.ringGfx.clear();
    const cx = GAME_WIDTH / 2;
    const cy = 330;

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const segmentAngle = (Math.PI * 2) / ring.notches;

      // Color depends on state: set rings get a gold tint to make progress
      // visible at a glance, linked rings get purple, otherwise tan.
      const isLinked = ring.linkedTo >= 0;
      const baseColor = ring.isSet ? 0xdda055 : (isLinked ? 0x8b6ea6 : 0x6b5b3e);
      const baseAlpha = ring.isSet ? 0.95 : 0.7;

      // Pre-compute rotated trap positions so the red trap segments
      // visually move WITH the ring as the player rotates it. Per
      // user feedback (2026-04-10): "no penalty seems to happen when
      // i move the ring onto a red spot" — the traps LOOKED fixed
      // but the trigger check used the rotated position, so the
      // player couldn't tell when they were about to hit one.
      const rotatedTraps = new Set(ring.trapNotches.map(
        t => ((t + ring.rotation) % ring.notches + ring.notches) % ring.notches
      ));
      for (let n = 0; n < ring.notches; n++) {
        const startAngle = n * segmentAngle - Math.PI / 2 + 0.03;
        const endAngle = (n + 1) * segmentAngle - Math.PI / 2 - 0.03;
        const effective = (ring.gapPos + ring.rotation) % ring.notches;
        const isGap = effective === n;
        const isTrap = rotatedTraps.has(n);

        if (isGap) {
          // Gap indicator — bright when set, dim when not
          this.ringGfx.lineStyle(8, 0xdda055, ring.isSet ? 0.85 : 0.4);
        } else if (isTrap) {
          // Trap notch — red so the player can spot the danger
          this.ringGfx.lineStyle(8, 0xcc4444, 0.85);
        } else {
          this.ringGfx.lineStyle(8, baseColor, baseAlpha);
        }
        this.ringGfx.beginPath();
        this.ringGfx.arc(cx, cy, ring.radius, startAngle, endAngle, false);
        this.ringGfx.strokePath();
      }
    }

    // Center keyhole
    this.ringGfx.fillStyle(0x1a1a1a);
    this.ringGfx.fillCircle(cx, cy, 20);
    this.ringGfx.fillStyle(0x2a2a2a);
    this.ringGfx.fillRect(cx - 4, cy - 15, 8, 20);
    this.ringGfx.fillCircle(cx, cy - 15, 6);
  }

  checkWin(): void {
    // Win when every ring is set (gap at the top). The set state is now
    // the source of truth — set transitions are tracked when rotations
    // happen so this is just a final tally.
    if (this.countSetRings() === this.rings.length) {
      this.endGame(true);
    }
  }

  private endGame(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('lock_open', 0.6);
      haptic.success();
      this.time.delayedCall(500, () => playSfx('victory'));
      const stars = this.timeLeft > 15 ? 3 : this.timeLeft > 8 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, 'Lock Picked!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `heist_${this.difficulty}`, moves: 30 - this.timeLeft, minMoves: 5, stars,
          jobId: this.jobId, catId: this.catId,
        });
      });
    } else {
      playSfx('fail');
      haptic.error();
      const failMsg = this.noise >= this.noiseBudget ? 'Caught!' : 'Time\u2019s up!';
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, failMsg, {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
