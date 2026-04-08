import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { createSceneButton, showMinigameTutorial } from '../ui/sceneHelpers';

// ── Layout ──
const FIELD_TOP = 160;
const FIELD_BOTTOM = 680;
const FIELD_LEFT = 30;
const FIELD_RIGHT = GAME_WIDTH - 30;
const HOLE_RADIUS = 20;

// Hole positions (3x3 grid)
const HOLES: { x: number; y: number }[] = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    HOLES.push({
      x: FIELD_LEFT + (col + 0.5) * ((FIELD_RIGHT - FIELD_LEFT) / 3),
      y: FIELD_TOP + (row + 0.5) * ((FIELD_BOTTOM - FIELD_TOP) / 3),
    });
  }
}

type RatType = 'normal' | 'golden' | 'poison' | 'peek' | 'doublepop';

interface ActiveRat {
  holeIndex: number;
  gfx: Phaser.GameObjects.Graphics | Phaser.GameObjects.Sprite;
  hitZone: Phaser.GameObjects.Zone;
  timer: Phaser.Time.TimerEvent;
  caught: boolean;
  type: RatType;
  /** Wall-clock spawn time so the safety sweep can force-clean rats that
   *  outlive their expected window (defends against any cleanup-failure
   *  path leaving a rat visible at a hole forever). */
  spawnedAt: number;
}

/** Hard cap on rat lifetime — anything older than this gets force-cleaned
 *  by the safety sweep regardless of which spawn path created it. The
 *  longest legitimate lifetime is the doublepop chain (~1700ms), so 4000ms
 *  is comfortably above any expected case. */
const RAT_MAX_LIFETIME_MS = 4000;

/** Per-location field style for the hunt scene. Each job in jobs.json has
 *  a `puzzleSkin` ('mill', 'docks', 'cathedral', etc.) — this maps the
 *  skin to a base color, accent color, accent count, and a label so the
 *  same minigame feels different at different town locations. The user's
 *  ask: "if the cat went to the dock to start a hunt, make the art of
 *  the scene more like a ship or dock for example than its default
 *  grassy field type look".
 *
 *  Intentionally lightweight (color tinting + label only — no new art
 *  assets). Other minigame scenes can adopt the same pattern for their
 *  own location flavor. */
interface HuntFieldStyle {
  baseColor: number;
  accentColor: number;
  accentCount: number;
  label: string | null;
}
function getHuntFieldStyle(skin: string | undefined): HuntFieldStyle {
  switch (skin) {
    case 'docks':
    case 'ship':
      // Wet boards over dark water — fewer accents, cool blue glints
      return { baseColor: 0x1f2a30, accentColor: 0x4a6680, accentCount: 12, label: 'The Docks' };
    case 'cathedral':
      // Stone tile floor — warm tan, sparse stone flecks
      return { baseColor: 0x2a2620, accentColor: 0x6a5a40, accentCount: 18, label: 'The Cathedral' };
    case 'monastery':
    case 'tower':
      // Cloister stone — slightly cooler than the cathedral
      return { baseColor: 0x252420, accentColor: 0x6a6650, accentCount: 18, label: 'The Monastery' };
    case 'castle':
    case 'manor':
      // Polished hall — dark stone, almost no accent
      return { baseColor: 0x22201c, accentColor: 0x4a4036, accentCount: 8, label: 'The Castle' };
    case 'tavern':
      // Sawdust floor — warm brown, dense flecks
      return { baseColor: 0x2c241a, accentColor: 0x6a4a2a, accentCount: 30, label: 'The Tavern' };
    case 'market':
      // Cobblestone square — neutral grey
      return { baseColor: 0x282520, accentColor: 0x554840, accentCount: 22, label: 'The Market' };
    case 'mill':
    case 'granary':
    case 'bakery':
      // Wheat-strewn floor — gold accents over warm brown
      return { baseColor: 0x2a2618, accentColor: 0x7a6028, accentCount: 35, label: 'The Granary' };
    case 'garden':
      // Garden plot — green over rich brown, dense grass
      return { baseColor: 0x252820, accentColor: 0x3a4a2a, accentCount: 35, label: 'The Garden' };
    case 'warehouse':
      // Crate-stacked storage — cool grey-brown, sparse
      return { baseColor: 0x252220, accentColor: 0x4a4030, accentCount: 12, label: 'The Warehouse' };
    case 'night':
      // Night patrol — darker base, sparse moonlit accents
      return { baseColor: 0x18181a, accentColor: 0x3a4258, accentCount: 10, label: 'The Night Watch' };
    default:
      // Generic grass field — the original look
      return { baseColor: 0x2a2820, accentColor: 0x3a4a2a, accentCount: 30, label: null };
  }
}

export class HuntScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private score = 0;
  private missed = 0;
  private maxMisses = 5;
  private timeLeft = 40;
  private startTime = 40; // for escalation calculation
  private totalSpawned = 0;
  private finished = false;
  private timerText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private missText!: Phaser.GameObjects.Text;
  private comboText: Phaser.GameObjects.Text | null = null;
  private countdownTimer: Phaser.Time.TimerEvent | null = null;
  private nextSpawnTimer: Phaser.Time.TimerEvent | null = null;
  private activeRats: ActiveRat[] = [];
  private tutorialShowing = false;
  private lastCatchSfx = 0;
  // Combo state — consecutive catches without misses
  private combo = 0;
  private comboMaxBonus = 0;

  constructor() {
    super({ key: 'HuntScene' });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.score = 0;
    this.missed = 0;
    this.totalSpawned = 0;
    this.finished = false;
    this.activeRats = [];
    this.combo = 0;
    this.comboMaxBonus = 0;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    // Hunting stat gives more time
    const huntingBonus = Math.min(5, (cat?.stats?.hunting ?? 5) - 3);
    this.timeLeft = (this.difficulty === 'hard' ? 18 : this.difficulty === 'medium' ? 22 : 25) + huntingBonus;
    this.startTime = this.timeLeft;
    this.maxMisses = this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 4 : 5;
  }

  /**
   * Compute the delay until the next spawn based on how much of the round
   * has elapsed. Per the design doc Pillar 3 (Speed Escalation): start
   * generous, accelerate over time. The same skill is tested at progressively
   * higher demands — no new rules introduced.
   */
  private getNextSpawnDelay(): number {
    const elapsed = this.startTime - this.timeLeft;
    const progress = Math.min(1, elapsed / this.startTime);
    // Easy: 1100ms → 500ms over the round
    // Med:  900ms → 400ms
    // Hard: 700ms → 300ms
    const startDelay = this.difficulty === 'hard' ? 700 : this.difficulty === 'medium' ? 900 : 1100;
    const endDelay = this.difficulty === 'hard' ? 300 : this.difficulty === 'medium' ? 400 : 500;
    return startDelay + (endDelay - startDelay) * progress;
  }

  /**
   * Visibility window also shrinks as the round progresses — rats stay up
   * for less time, demanding faster reactions.
   */
  private getVisibleTime(type: RatType): number {
    const elapsed = this.startTime - this.timeLeft;
    const progress = Math.min(1, elapsed / this.startTime);
    if (type === 'peek') return 350; // peek rats are always brief
    if (type === 'doublepop') return 600; // first emergence is short
    const startWindow = this.difficulty === 'hard' ? 1200 : this.difficulty === 'medium' ? 1600 : 2000;
    const endWindow = this.difficulty === 'hard' ? 600 : this.difficulty === 'medium' ? 800 : 1000;
    return startWindow + (endWindow - startWindow) * progress;
  }

  /**
   * Pick which type of rat to spawn. Wave-1 spawns are pure normal/golden so
   * the player learns the basic loop. Poison appears around 25% elapsed.
   * Fake-out (peek/doublepop) rats appear after 50% elapsed.
   */
  private pickRatType(): RatType {
    const elapsed = this.startTime - this.timeLeft;
    const progress = Math.min(1, elapsed / this.startTime);
    const roll = Math.random();
    if (progress < 0.15) {
      // Pure tutorial period — no punishes, no fake-outs
      return roll < 0.18 ? 'golden' : 'normal';
    }
    if (progress < 0.5) {
      // Mid-round: introduce poison rats
      if (roll < 0.15) return 'golden';
      if (roll < 0.3) return 'poison';
      return 'normal';
    }
    // Late round: full mix including fake-outs
    if (roll < 0.15) return 'golden';
    if (roll < 0.32) return 'poison';
    if (roll < 0.42) return 'peek';
    if (roll < 0.50) return 'doublepop';
    return 'normal';
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial on first play.
    //
    // Deliberately minimal per todo/game/What Makes Games Fun.md (Koster):
    // gold rats, fake-outs, combos, and speed escalation are all noticed
    // through play. Only the red-rat warning needs surfacing because the
    // punishment is invisible until you trigger it the hard way.
    //
    // Bumped to v3 when the tutorial was cut from 4 explained mechanics
    // down to 1, so returning players see the new shorter version.
    if (showMinigameTutorial(this, 'clowder_hunt_tutorial_v3', 'Hunt the Rats!',
      `Tap the rats as they pop from their holes.<br><br>
      Skip the <strong style="color:#cc6666">red ones</strong> — they bite back.`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job name
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, (`${job?.name ?? 'Hunt'} (${this.difficulty})`), {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // HUD
    this.timerText = this.add.text(GAME_WIDTH / 2, 60, `Time: ${this.timeLeft}s`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);

    this.scoreText = this.add.text(60, 85, `Caught: ${this.score}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#4a8a4a',
    }).setOrigin(0, 0.5);

    this.missText = this.add.text(GAME_WIDTH - 60, 85, `Missed: ${this.missed}/${this.maxMisses}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    }).setOrigin(1, 0.5);

    // Draw field background — tint and accent vary by job location so a
    // hunt at the docks looks like the docks (blue-grey water, no grass),
    // not the same generic grass field as a hunt at the granary. The
    // location is read from the job's puzzleSkin metadata (already
    // resolved as `job` above for the title text).
    const style = getHuntFieldStyle(job?.puzzleSkin);
    const fieldGfx = this.add.graphics();
    fieldGfx.fillStyle(style.baseColor, 1);
    fieldGfx.fillRoundedRect(FIELD_LEFT - 10, FIELD_TOP - 10, FIELD_RIGHT - FIELD_LEFT + 20, FIELD_BOTTOM - FIELD_TOP + 20, 8);

    // Draw accent dots (grass tufts, stone flecks, water glints — depends on location)
    fieldGfx.fillStyle(style.accentColor, 0.5);
    for (let i = 0; i < style.accentCount; i++) {
      const gx = FIELD_LEFT + Math.random() * (FIELD_RIGHT - FIELD_LEFT);
      const gy = FIELD_TOP + Math.random() * (FIELD_BOTTOM - FIELD_TOP);
      fieldGfx.fillCircle(gx, gy, 2 + Math.random() * 4);
    }

    // Location label — small banner above the field so the player feels
    // the place change with the job, not just a different name in the
    // job board.
    if (style.label) {
      this.add.text(GAME_WIDTH / 2, FIELD_TOP - 24, `\u{1F4CD} ${style.label}`, {
        fontFamily: 'Georgia, serif', fontSize: '11px', color: '#8b7355',
      }).setOrigin(0.5);
    }

    // Draw holes
    for (const hole of HOLES) {
      const holeGfx = this.add.graphics();
      holeGfx.fillStyle(0x111111, 0.8);
      holeGfx.fillEllipse(hole.x, hole.y, HOLE_RADIUS * 2, HOLE_RADIUS * 1.2);
      holeGfx.fillStyle(0x1a1a1a, 0.5);
      holeGfx.fillEllipse(hole.x, hole.y - 2, HOLE_RADIUS * 1.6, HOLE_RADIUS * 0.8);
    }

    // Cat sprite in corner
    const catColor = BREED_COLORS[this.catBreed] ?? '#8b7355';
    const catKey = `${this.catBreed}_idle_south`;
    if (this.textures.exists(catKey)) {
      const cat = this.add.sprite(GAME_WIDTH / 2, FIELD_BOTTOM + 40, catKey);
      cat.setScale(0.8);
      cat.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Quit button
    createSceneButton(this, GAME_WIDTH / 2, FIELD_BOTTOM + 70, 'Quit', () => {
      this.cleanup();
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Countdown
    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        this.timeLeft--;
        this.timerText.setText(`Time: ${this.timeLeft}s`);
        if (this.timeLeft <= 0) {
          this.endGame();
        }
      },
      loop: true,
    });

    // Dynamic spawn schedule — accelerates as the round progresses.
    // See getNextSpawnDelay() for the curve.
    const scheduleNext = () => {
      if (this.finished) return;
      this.nextSpawnTimer = this.time.delayedCall(this.getNextSpawnDelay(), () => {
        if (this.finished) return;
        if (!this.tutorialShowing) this.spawnRat();
        scheduleNext();
      });
    };
    // First spawn after a brief grace so the player gets oriented
    this.time.delayedCall(600, scheduleNext);

    // Empty-tap detection — tapping inside the field but not on a rat counts
    // as a "wasted swing" and breaks the combo. Per Pillar 1 of the design
    // doc, every action needs feedback — silent misses are the worst case.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.finished || this.tutorialShowing) return;
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      // Inside playfield?
      if (wx < FIELD_LEFT || wx > FIELD_RIGHT || wy < FIELD_TOP || wy > FIELD_BOTTOM) return;
      // Did the click hit any active rat's hit zone?
      for (const rat of this.activeRats) {
        if (!rat.gfx.active) continue;
        const dx = wx - rat.gfx.x;
        const dy = wy - rat.gfx.y;
        if (dx * dx + dy * dy < (HOLE_RADIUS * 1.4) ** 2) {
          return; // hit something — let the per-rat handler deal with it
        }
      }
      // Empty tap — break combo, show puff
      this.onEmptyTap(wx, wy);
    });

    // Safety sweep — every second, force-clean any rat that's been alive
    // longer than RAT_MAX_LIFETIME_MS. This is a belt-and-suspenders defense
    // against any spawn path (especially the doublepop nested onComplete
    // chain) failing to clean up its own rat. Symptom this fixes: rats
    // visible at holes that can't be tapped and stay until end of game,
    // blocking those holes from spawning new rats.
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.finished) return;
        const now = Date.now();
        const stuck = this.activeRats.filter((r) => now - r.spawnedAt > RAT_MAX_LIFETIME_MS && !r.caught);
        for (const rat of stuck) {
          // Treat as an escape so the rat is removed from activeRats and
          // the hole becomes spawnable again. handleRatEscape applies the
          // miss penalty for non-poison rats, which is the correct behavior
          // — the player had their chance and the rat got away.
          this.handleRatEscape(rat);
        }
      },
    });

    // Clean up on scene stop (prevent timer/tween memory leaks)
    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.input.off('pointerdown');
    });
    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  /** Empty tap on the playfield — break combo, show a small dust puff. */
  private onEmptyTap(x: number, y: number): void {
    if (this.combo > 0) {
      this.combo = 0;
      if (this.comboText) this.comboText.setVisible(false);
    }
    playSfx('tap', 0.15);
    // Dust puff particle burst — neutral grey, low intensity
    if (this.textures.exists('particle_pixel')) {
      const burst = this.add.particles(x, y, 'particle_pixel', {
        speed: { min: 30, max: 80 },
        lifespan: { min: 200, max: 400 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.6, end: 0 },
        tint: 0x6b5b3e,
        blendMode: Phaser.BlendModes.NORMAL,
        emitting: false,
      });
      burst.explode(6);
      this.time.delayedCall(450, () => burst.destroy());
    }
    // Brief "miss" text
    const t = this.add.text(x, y - 12, 'miss', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#8b7355',
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 400, onComplete: () => t.destroy() });
  }

  private spawnRat(): void {
    // Find an unoccupied hole
    const occupied = new Set(this.activeRats.map((r) => r.holeIndex));
    const available = HOLES.map((_, i) => i).filter((i) => !occupied.has(i));
    if (available.length === 0) return;

    const holeIndex = available[Math.floor(Math.random() * available.length)];
    const hole = HOLES[holeIndex];
    this.totalSpawned++;

    // Stamp the spawn time so the safety sweep can force-clean rats whose
    // lifetime has run wildly past their visible window. Without this,
    // any failure in the doublepop's nested onComplete chain (or any other
    // edge case) leaves a rat visible at a hole forever, blocking that
    // hole from spawning new rats and frustrating the player.
    const spawnedAt = Date.now();

    const type = this.pickRatType();
    const isGolden = type === 'golden';
    const isPoison = type === 'poison';
    const isPeek = type === 'peek';
    const isDoublePop = type === 'doublepop';

    // Draw rat (sprite if available, otherwise graphics fallback). Distinct
    // tints per type — RED for poison so the danger reads instantly in
    // peripheral vision (per Pillar 4: visual clarity at speed).
    let gfx: Phaser.GameObjects.Graphics | Phaser.GameObjects.Sprite;
    if (this.textures.exists('rat')) {
      const ratSprite = this.add.sprite(hole.x, hole.y - 10, 'rat');
      ratSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      ratSprite.setScale(isGolden ? 1.2 : 1.0);
      if (isGolden) ratSprite.setTint(0xffd700);
      if (isPoison) ratSprite.setTint(0xcc3333);
      gfx = ratSprite;
    } else {
      const ratGfx = this.add.graphics();
      this.drawRat(ratGfx, hole.x, hole.y - 10);
      gfx = ratGfx;
    }

    // Per Fruit Ninja design wisdom: the punish hitbox is SMALLER than the
    // reward hitbox so accidental poison hits feel fair. Golden gets a slight
    // bonus on the other end — a bigger forgiving hitbox.
    const hitSize = isPoison ? HOLE_RADIUS * 1.6 : isGolden ? HOLE_RADIUS * 2.8 : HOLE_RADIUS * 2.5;
    const hitZone = this.add.zone(hole.x, hole.y - 10, hitSize, hitSize);
    hitZone.setInteractive({ useHandCursor: true });

    const rat: ActiveRat = {
      holeIndex,
      gfx,
      hitZone,
      caught: false,
      type,
      spawnedAt,
      timer: this.time.delayedCall(0, () => {}), // placeholder, set below
    };

    // Tap to catch
    hitZone.on('pointerdown', () => {
      if (rat.caught || this.finished) return;
      rat.caught = true;

      if (isPoison) {
        // Poison rat hit — distinct fail with red flash and combo break
        this.missed++;
        this.missText.setText(`Missed: ${this.missed}/${this.maxMisses}`);
        this.combo = 0;
        if (this.comboText) this.comboText.setVisible(false);
        playSfx('hiss', 0.5);
        haptic.warning();
        this.cameras.main.flash(120, 200, 50, 50);
        this.cameras.main.shake(100, 0.005);
        const warn = this.add.text(hole.x, hole.y - 30, 'POISON!', {
          fontFamily: 'Georgia, serif', fontSize: '13px', color: '#cc3333',
        }).setOrigin(0.5);
        this.tweens.add({ targets: warn, y: hole.y - 50, alpha: 0, duration: 700, onComplete: () => warn.destroy() });
        // Red particle burst — distinct from gold/copper for hits
        if (this.textures.exists('particle_pixel')) {
          const burst = this.add.particles(hole.x, hole.y, 'particle_pixel', {
            speed: { min: 60, max: 140 },
            lifespan: { min: 250, max: 500 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: 0xcc3333,
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          });
          burst.explode(14);
          this.time.delayedCall(600, () => burst.destroy());
        }
        if (this.missed >= this.maxMisses) {
          gfx.destroy(); hitZone.destroy();
          this.activeRats = this.activeRats.filter((r) => r !== rat);
          rat.timer.destroy();
          this.failGame();
          return;
        }
      } else {
        // Successful catch — increment combo and award points
        const points = isGolden ? 2 : 1;
        this.score += points;
        this.scoreText.setText(`Caught: ${this.score}`);
        this.combo++;
        // Combo bonus: every 5-chain awards +2 fish (recorded for results)
        if (this.combo > 0 && this.combo % 5 === 0) {
          this.comboMaxBonus += 2;
          playSfx('sparkle', 0.5);
          haptic.success();
          const cb = this.add.text(hole.x, hole.y - 36, `COMBO x${this.combo}!`, {
            fontFamily: 'Georgia, serif', fontSize: '14px', color: '#ffd700',
          }).setOrigin(0.5);
          this.tweens.add({ targets: cb, y: cb.y - 22, alpha: 0, duration: 900, onComplete: () => cb.destroy() });
        }
        if (this.combo >= 3) {
          if (!this.comboText) {
            this.comboText = this.add.text(GAME_WIDTH / 2, 105, '', {
              fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
            }).setOrigin(0.5);
          }
          this.comboText.setText(`Combo x${this.combo}`);
          this.comboText.setVisible(true);
        }
        // Throttle catch sound
        const now = Date.now();
        if (now - this.lastCatchSfx > 500) {
          playSfx(isGolden ? 'sparkle' : 'rat_caught', 0.4);
          this.lastCatchSfx = now;
        }
        // Light tap on every hit, throttled lightly so spammed hits aren't oppressive.
        if (isGolden) haptic.medium();
        else haptic.light();
      }

      // Pop effect + particle burst
      gfx.destroy();
      if (this.textures.exists('particle_pixel') && !isPoison) {
        const burst = this.add.particles(hole.x, hole.y, 'particle_pixel', {
          speed: { min: 60, max: 160 },
          lifespan: { min: 250, max: 500 },
          scale: { start: 0.9, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: isGolden ? 0xffd700 : 0xcc7744,
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        });
        burst.explode(isGolden ? 20 : 12);
        this.time.delayedCall(600, () => burst.destroy());
      }
      if (!isPoison) {
        const pointLabel = isGolden ? '+2!' : '+1';
        const pointColor = isGolden ? '#ffd700' : '#4a8a4a';
        const sparkle = this.add.text(hole.x, hole.y - 20, pointLabel, {
          fontFamily: 'Georgia, serif', fontSize: isGolden ? '20px' : '16px', color: pointColor,
        }).setOrigin(0.5);
        this.tweens.add({
          targets: sparkle, y: hole.y - 50, alpha: 0, duration: 600,
          onComplete: () => sparkle.destroy(),
        });
      }

      rat.timer.destroy();
      hitZone.destroy();
      this.activeRats = this.activeRats.filter((r) => r !== rat);
    });

    // Spawn animation: pop up
    gfx.setScale(0.3);
    this.tweens.add({ targets: gfx, scaleX: 1, scaleY: 1, duration: 150, ease: 'Back.easeOut' });

    if (isPeek) {
      // Peek rat: emerges briefly and retreats with no missed-penalty.
      // Untapped escape is silent — peek rats are about discrimination, not
      // forced reactions. Tapping one is always rewarded (+1).
      const visibleTime = this.getVisibleTime('peek');
      rat.timer = this.time.delayedCall(visibleTime, () => {
        if (rat.caught || this.finished) return;
        // Retreat animation — duck back into hole
        this.tweens.add({
          targets: gfx, scaleX: 0.3, scaleY: 0.3, alpha: 0, duration: 120,
          onComplete: () => {
            gfx.destroy();
            hitZone.destroy();
            this.activeRats = this.activeRats.filter((r) => r !== rat);
          },
        });
      });
    } else if (isDoublePop) {
      // Double-pop rat: emerges briefly, retreats, then re-emerges.
      // Players who tap the first emergence still hit (it's a real target),
      // but the fake-out is for missed first-emergences — the rat gives them
      // a second chance after the retreat animation, then escapes if missed.
      const firstWindow = this.getVisibleTime('doublepop');
      rat.timer = this.time.delayedCall(firstWindow, () => {
        if (rat.caught || this.finished) return;
        // Duck back briefly
        this.tweens.add({
          targets: gfx, scaleX: 0.3, scaleY: 0.3, duration: 100,
          onComplete: () => {
            if (rat.caught || this.finished) return;
            // Re-emerge after a short pause
            this.time.delayedCall(180, () => {
              if (rat.caught || this.finished) return;
              this.tweens.add({
                targets: gfx, scaleX: 1, scaleY: 1, duration: 120,
                ease: 'Back.easeOut',
              });
              // Second window — slightly longer than first
              rat.timer = this.time.delayedCall(700, () => {
                if (rat.caught || this.finished) return;
                this.handleRatEscape(rat);
              });
            });
          },
        });
      });
    } else {
      // Standard rat — disappears after the visibility window with miss penalty
      const visibleTime = this.getVisibleTime(type);
      rat.timer = this.time.delayedCall(visibleTime, () => {
        if (rat.caught || this.finished) return;
        this.handleRatEscape(rat);
      });
    }

    this.activeRats.push(rat);
  }

  /** A rat (normal/golden/poison/doublepop) escaped without being tapped.
      Counts as a miss, breaks combo, gives a small visual indication. */
  private handleRatEscape(rat: ActiveRat): void {
    // Poison rats that escape are GOOD — the player correctly avoided them.
    // No penalty.
    if (rat.type === 'poison') {
      rat.gfx.destroy();
      rat.hitZone.destroy();
      this.activeRats = this.activeRats.filter((r) => r !== rat);
      return;
    }

    this.missed++;
    this.missText.setText(`Missed: ${this.missed}/${this.maxMisses}`);
    this.combo = 0;
    if (this.comboText) this.comboText.setVisible(false);

    // Visual: small "..." text where the rat was
    const x = rat.gfx.x;
    const y = rat.gfx.y;
    const escTxt = this.add.text(x, y - 14, 'escaped', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#cc6666',
    }).setOrigin(0.5);
    this.tweens.add({ targets: escTxt, y: y - 26, alpha: 0, duration: 500, onComplete: () => escTxt.destroy() });

    rat.gfx.destroy();
    rat.hitZone.destroy();
    this.activeRats = this.activeRats.filter((r) => r !== rat);

    if (this.missed >= this.maxMisses) {
      this.failGame();
    }
  }

  private drawRat(gfx: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // Body
    gfx.fillStyle(0x8a5a4a);
    gfx.fillEllipse(x, y, 18, 12);
    // Head
    gfx.fillCircle(x, y - 8, 6);
    // Eyes
    gfx.fillStyle(0xffffff);
    gfx.fillCircle(x - 2, y - 9, 2);
    gfx.fillCircle(x + 2, y - 9, 2);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(x - 2, y - 9, 1);
    gfx.fillCircle(x + 2, y - 9, 1);
    // Ears
    gfx.fillStyle(0x9a6a5a);
    gfx.fillCircle(x - 5, y - 12, 3);
    gfx.fillCircle(x + 5, y - 12, 3);
    // Tail
    gfx.lineStyle(1.5, 0x7a4a3a, 0.8);
    gfx.beginPath();
    gfx.moveTo(x, y + 6);
    gfx.lineTo(x + 8, y + 12);
    gfx.lineTo(x + 14, y + 8);
    gfx.strokePath();
  }

  private endGame(): void {
    this.finished = true;
    this.cleanup();

    const stars = this.score >= 6 && this.missed <= 1 ? 3
      : this.score >= 4 && this.missed <= 2 ? 2 : 1;

    playSfx('victory');

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, `Hunt Complete!`, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#c4956a',
    }).setOrigin(0.5);

    const summary = this.comboMaxBonus > 0
      ? `Caught ${this.score} rat${this.score !== 1 ? 's' : ''} (+${this.comboMaxBonus} combo bonus)`
      : `Caught ${this.score} rat${this.score !== 1 ? 's' : ''}`;
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, summary, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `hunt_${this.difficulty}`,
        moves: this.totalSpawned,
        minMoves: Math.floor(this.totalSpawned * 0.7),
        stars,
        jobId: this.jobId,
        catId: this.catId,
        bonusFish: this.comboMaxBonus,
      });
    });
  }

  private failGame(): void {
    this.finished = true;
    this.cleanup();

    playSfx('fail');

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'Too many escaped!', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#cc6666',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, `Caught ${this.score}, missed ${this.missed}`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

    this.time.delayedCall(2000, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });
  }

  private cleanup(): void {
    this.countdownTimer?.destroy();
    this.nextSpawnTimer?.destroy();
    for (const rat of this.activeRats) {
      rat.timer.destroy();
      rat.gfx.destroy();
      rat.hitZone.destroy();
    }
    this.activeRats = [];
  }

}
