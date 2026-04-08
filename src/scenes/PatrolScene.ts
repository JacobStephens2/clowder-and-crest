import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial, showTutorialOverlay } from '../ui/sceneHelpers';

const LANTERN_RADIUS = 18;

interface Lantern {
  x: number;
  y: number;
  brightness: number; // 0 (dark) to 1 (lit)
  /** Per-lantern base dim rate. The actual rate scales with the global
      escalation multiplier so the threat ramps over the watch. */
  baseDimRate: number;
  glow: Phaser.GameObjects.Arc;
  flame: Phaser.GameObjects.Arc;
  zone: Phaser.GameObjects.Zone;
  isTrap: boolean;
  /** True when the lantern is fully extinguished and counted as lost. */
  failed: boolean;
}

/**
 * Prowler intruders — the second type of upkeep introduced per the
 * "layered cognitive load" pillar. They spawn at a random screen edge,
 * walk slowly toward a target lantern, and instantly extinguish it on
 * contact. Tap them to dispatch before they arrive.
 *
 * The point isn't pure danger — it's that the player now has to split
 * attention between (a) lantern brightness and (b) prowler positions.
 * The doc's #2 cross-genre principle: "different types of attention
 * required" forces context switching.
 */
interface Prowler {
  x: number;
  y: number;
  targetLantern: Lantern;
  speed: number;
  gfx: Phaser.GameObjects.Container;
  zone: Phaser.GameObjects.Zone;
  alive: boolean;
}

export class PatrolScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  private lanterns: Lantern[] = [];
  private prowlers: Prowler[] = [];
  private lives = 4;
  private timeLeft = 40;
  private startingTimeLeft = 40;
  private finished = false;
  private tutorialShowing = false;
  private livesText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private threatText!: Phaser.GameObjects.Text;
  /** Number of lanterns that fully went dark over the course of the
      round. Surfaced via puzzle-complete so main.ts can attach a real
      consequence (fish lost, reputation hit) — the doc's "consequence
      propagation" pillar in infrastructure form. */
  private lanternsLost = 0;
  /** Brief lockout after a tap (relight, trap, or prowler) — the doc's
      "cost of looking away" pillar. Forces real triage when multiple
      threats are pressing simultaneously. */
  private relightCooldownUntil = 0;
  /** Spawn cadence for prowlers — accelerates with the threat curve. */
  private nextProwlerAt = 0;

  constructor() { super({ key: 'PatrolScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.lanterns = [];
    this.prowlers = [];
    this.finished = false;
    this.lanternsLost = 0;
    this.relightCooldownUntil = 0;
    this.nextProwlerAt = 0;
    this.lives = this.difficulty === 'hard' ? 2 : this.difficulty === 'medium' ? 3 : 4;
    this.timeLeft = this.difficulty === 'hard' ? 30 : this.difficulty === 'medium' ? 35 : 40;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const endurance = cat?.stats?.endurance ?? 5;
    // Endurance slows dim rate
    this.timeLeft += Math.floor(endurance / 3);
    this.startingTimeLeft = this.timeLeft;
  }

  /** Global threat multiplier — the doc's "predictable but uncontrollable
      escalation" pillar. Linear ramp from 1.0 at the start of the watch to
      ~1.8 at the end. The player KNOWS the threat is rising but can't
      predict exactly when, which is the entire point. Public so the
      playtest can sample the curve. */
  getThreatLevel(): number {
    if (this.startingTimeLeft <= 0) return 1;
    const t = 1 - this.timeLeft / this.startingTimeLeft;
    return 1 + 0.8 * Math.max(0, Math.min(1, t));
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0a14');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial body — extracted to a const so the in-scene "?" help
    // button can re-show the same content. Bumped to v2 when prowlers
    // and the relight cooldown were added; returning players see the
    // new rules on next launch.
    const TUTORIAL_TITLE = 'Night Patrol';
    const TUTORIAL_BODY = `Keep the lanterns lit until dawn!<br><br>
      <strong>Tap a lantern</strong> to relight it before it goes dark.<br><br>
      <strong style="color:#cc6666">Red-flickering</strong> lanterns are traps — don't tap them!<br><br>
      <strong style="color:#aa44aa">Prowlers</strong> creep in from the edges. Tap them before they reach a lantern!<br><br>
      The night gets <strong>steadily worse</strong> — triage carefully.`;
    if (showMinigameTutorial(this, 'clowder_patrol_tutorial_v2', TUTORIAL_TITLE, TUTORIAL_BODY,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    // Help button — re-shows the tutorial unconditionally. Per user
    // report: "I didn't catch how to play the patrol game, and after
    // losing it again I still don't understand." First scene to adopt
    // the pattern; other scenes can copy this 5-line block.
    const helpBtn = this.add.text(GAME_WIDTH - 24, 30, '?', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#dda055',
      backgroundColor: '#2a2520', padding: { x: 8, y: 2 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    helpBtn.on('pointerdown', () => {
      this.tutorialShowing = true;
      showTutorialOverlay(this, TUTORIAL_TITLE, TUTORIAL_BODY,
        () => { this.tutorialShowing = false; },
        { pauseScene: true });
    });

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Patrol'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // Renamed from "Time" to "Until dawn" — soft framing change so the
    // counter feels like an oncoming event rather than a "you're winning"
    // signal. The doc's "maintenance over accomplishment" pillar.
    this.timerText = this.add.text(GAME_WIDTH / 2, 55, `Until dawn: ${this.timeLeft}s`, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);

    this.livesText = this.add.text(20, 55, `Lives: ${this.lives}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    });

    // Threat-level indicator on the HUD — shows the player the escalation
    // curve directly so they can see "the night getting worse" without
    // surprise. Mini Metro-style: predictable but uncontrollable.
    this.threatText = this.add.text(GAME_WIDTH - 20, 55, 'Threat 1.0x', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#aa44aa',
    }).setOrigin(1, 0);

    // Quit — moved below the threat indicator so it doesn't overlap
    this.add.text(GAME_WIDTH - 20, 75, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#8b7355',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Create lanterns in a ring
    const count = this.difficulty === 'hard' ? 9 : this.difficulty === 'medium' ? 7 : 5;
    const cx = GAME_WIDTH / 2;
    const cy = 350;
    const ringRadius = 130;
    const trapChance = this.difficulty === 'hard' ? 0.2 : this.difficulty === 'medium' ? 0.1 : 0;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const lx = cx + Math.cos(angle) * ringRadius;
      const ly = cy + Math.sin(angle) * ringRadius;
      const isTrap = Math.random() < trapChance;
      const baseDim = this.difficulty === 'hard' ? 0.025 : this.difficulty === 'medium' ? 0.018 : 0.012;
      // Each lantern gets a slightly different base rate so the player has
      // to decide which is dimming faster — variance creates triage decisions.
      const baseDimRate = baseDim + Math.random() * 0.01;

      const glow = this.add.circle(lx, ly, LANTERN_RADIUS + 10, 0xdda055, 0.3);
      const flame = this.add.circle(lx, ly, LANTERN_RADIUS, isTrap ? 0xcc4444 : 0xdda055, 1);

      // Post
      this.add.rectangle(lx, ly + LANTERN_RADIUS + 8, 4, 16, 0x6b5b3e);

      const zone = this.add.zone(lx, ly, LANTERN_RADIUS * 3, LANTERN_RADIUS * 3);
      zone.setInteractive({ useHandCursor: true });

      const lantern: Lantern = { x: lx, y: ly, brightness: 1, baseDimRate, glow, flame, zone, isTrap, failed: false };
      this.lanterns.push(lantern);

      // Trap lanterns flicker red
      if (isTrap) {
        this.tweens.add({
          targets: flame, alpha: 0.3, duration: 400, yoyo: true, repeat: -1,
        });
      }

      zone.on('pointerdown', () => this.tapLantern(lantern));
    }

    // Dim timer — applies the global threat multiplier
    this.time.addEvent({
      delay: 100, loop: true,
      callback: () => this.tickDim(),
    });

    // Prowler spawn/update timer
    this.time.addEvent({
      delay: 100, loop: true,
      callback: () => this.tickProwlers(),
    });

    // Countdown
    this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        if (this.finished || this.tutorialShowing) return;
        this.timeLeft--;
        this.timerText.setText(`Until dawn: ${this.timeLeft}s`);
        this.threatText.setText(`Threat ${this.getThreatLevel().toFixed(1)}x`);
        if (this.timeLeft <= 0) this.gameOver(true);
      },
    });

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  /** Tap-to-relight handler. Per user feedback (2026-04-08): "I want
   *  to be able to light the lanterns faster. I feel like there's a
   *  time lag arbitrary limiting how fast I relight them." Removed the
   *  per-tap relight cooldown — fast thumbing is now always responsive.
   *  Trap taps still cost a life and disable the trap so spamming a
   *  trap can't cascade lives away in one frame. The triage pressure
   *  comes from the global threat curve and prowler spawn rate, not
   *  from input throttling. */
  tapLantern(lantern: Lantern): void {
    if (this.finished || this.tutorialShowing) return;

    if (lantern.isTrap) {
      this.lives--;
      this.livesText.setText(`Lives: ${this.lives}`);
      playSfx('fail', 0.4);
      haptic.warning();
      this.cameras.main.flash(100, 80, 30, 30);
      lantern.brightness = 0;
      lantern.flame.setAlpha(0);
      lantern.glow.setAlpha(0);
      lantern.zone.disableInteractive();
      if (this.lives <= 0) this.gameOver(false);
      return;
    }

    // Reignite a failed lantern: costs nothing extra but resets it
    lantern.brightness = 1;
    lantern.failed = false;
    playSfx('match_strike', 0.35);
    haptic.light();
    // Flash bright on relight
    lantern.flame.setScale(1.4);
    lantern.glow.setAlpha(0.6);
    this.time.delayedCall(150, () => {
      lantern.flame.setScale(1);
      lantern.glow.setAlpha(0.3);
    });
  }

  /** Per-tick dim update. Applies the global threat multiplier so the
      escalation curve is smooth and predictable from the player's POV. */
  tickDim(): void {
    if (this.finished || this.tutorialShowing) return;
    const threat = this.getThreatLevel();
    for (const l of this.lanterns) {
      if (l.isTrap || l.failed) continue;
      l.brightness = Math.max(0, l.brightness - l.baseDimRate * threat);
      l.flame.setAlpha(l.brightness);
      l.glow.setAlpha(l.brightness * 0.3);
      // Flash warning when low
      if (l.brightness < 0.3 && l.brightness > 0) {
        l.flame.setScale(0.8 + Math.sin(Date.now() * 0.01) * 0.2);
      } else {
        l.flame.setScale(1);
      }
      // Lantern went dark — count as lost (consequence propagation), lose
      // a life, and partially relight to give the player one more shot
      if (l.brightness <= 0) {
        this.failLantern(l);
        if (this.finished) return;
      }
    }
  }

  /** Mark a lantern as failed. Centralized so prowler-extinguish and
      time-extinguish go through the same path: increment the lost counter
      and lose a life. */
  private failLantern(l: Lantern): void {
    if (l.failed) return;
    l.failed = true;
    this.lanternsLost++;
    this.lives--;
    this.livesText.setText(`Lives: ${this.lives}`);
    playSfx('hiss', 0.3);
    // Partial relight so the round can continue
    l.brightness = 0.5;
    l.failed = false;
    if (this.lives <= 0) this.gameOver(false);
  }

  /** Per-tick prowler spawn + update. Spawn cadence shrinks as the threat
      curve climbs, so the late watch genuinely feels overrun. */
  tickProwlers(): void {
    if (this.finished || this.tutorialShowing) return;

    // Spawn cadence: starts at ~6s, shrinks to ~2s as threat ramps
    if (Date.now() >= this.nextProwlerAt) {
      const threat = this.getThreatLevel();
      const baseGap = 6000;
      const gap = baseGap / threat + Math.random() * 1500;
      this.nextProwlerAt = Date.now() + gap;
      // Don't spawn if no lit lanterns to target
      const litLanterns = this.lanterns.filter((l) => !l.isTrap && l.brightness > 0.1);
      if (litLanterns.length > 0) this.spawnProwler(litLanterns);
    }

    // Move existing prowlers toward their target
    for (const p of this.prowlers) {
      if (!p.alive) continue;
      const dx = p.targetLantern.x - p.x;
      const dy = p.targetLantern.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Reached the lantern → extinguish + remove prowler
      if (dist < LANTERN_RADIUS + 6) {
        if (!p.targetLantern.isTrap && p.targetLantern.brightness > 0) {
          p.targetLantern.brightness = 0;
          this.failLantern(p.targetLantern);
        }
        this.killProwler(p);
        if (this.finished) return;
        continue;
      }
      const move = p.speed * 0.1; // 100ms tick
      p.x += (dx / dist) * move;
      p.y += (dy / dist) * move;
      p.gfx.setPosition(p.x, p.y);
      // Critical: keep the tap zone glued to the visual. The previous
      // version only moved the container; the zone stayed at the spawn
      // point on the screen edge, so taps that visually landed on the
      // prowler missed the actual hit-test target and the player
      // couldn't dispatch any intruders. Reported as a game-breaking
      // bug in todo/claude-todo.md.
      p.zone.setPosition(p.x, p.y);
    }
    // Garbage-collect dead prowlers
    this.prowlers = this.prowlers.filter((p) => p.alive);
  }

  /** Spawn a single prowler at a random screen edge, targeting one of the
      currently-lit lanterns. */
  spawnProwler(litLanterns: Lantern[]): void {
    const target = litLanterns[Math.floor(Math.random() * litLanterns.length)];
    // Pick a random edge
    const edge = Math.floor(Math.random() * 4);
    let px = 0, py = 0;
    const margin = 20;
    switch (edge) {
      case 0: px = margin; py = 200 + Math.random() * 300; break;
      case 1: px = GAME_WIDTH - margin; py = 200 + Math.random() * 300; break;
      case 2: px = Math.random() * GAME_WIDTH; py = 200; break;
      default: px = Math.random() * GAME_WIDTH; py = 540; break;
    }

    const container = this.add.container(px, py);
    // Dark figure with glowing eyes — readable at a glance from across the
    // arena. Purple tone matches the threat HUD color.
    const body = this.add.circle(0, 0, 8, 0x1a1020).setStrokeStyle(2, 0xaa44aa);
    container.add(body);
    const eye1 = this.add.circle(-3, -2, 1.5, 0xaa44aa);
    const eye2 = this.add.circle(3, -2, 1.5, 0xaa44aa);
    container.add([eye1, eye2]);
    container.setDepth(10);

    // Tap zone — slightly larger than the visual so they're easy to hit
    const zone = this.add.zone(px, py, 28, 28);
    zone.setInteractive({ useHandCursor: true });

    const prowler: Prowler = { x: px, y: py, targetLantern: target, speed: 22, gfx: container, zone, alive: true };
    this.prowlers.push(prowler);

    zone.on('pointerdown', () => this.tapProwler(prowler));
  }

  /** Tap-to-dispatch handler for prowlers. Cooldown removed alongside
   *  the lantern cooldown so the player can swat several prowlers in
   *  quick succession during a heavy wave. */
  tapProwler(prowler: Prowler): void {
    if (this.finished || this.tutorialShowing) return;
    if (!prowler.alive) return;
    playSfx('tap', 0.4);
    this.killProwler(prowler);
  }

  private killProwler(p: Prowler): void {
    if (!p.alive) return;
    p.alive = false;
    try { p.zone.destroy(); } catch {}
    try { p.gfx.destroy(); } catch {}
  }

  private gameOver(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('victory');
      haptic.success();
      // Star scoring now factors in lanternsLost — a flawless watch is
      // 3 stars; lost a couple is 2; messy is 1. Failure propagates into
      // the player's score even on a "win".
      const stars = this.lives >= 3 && this.lanternsLost === 0 ? 3
        : this.lives >= 2 && this.lanternsLost <= 2 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Patrol Complete!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);
      if (this.lanternsLost > 0) {
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, `${this.lanternsLost} lanterns went dark`, {
          fontFamily: 'Georgia, serif', fontSize: '12px', color: '#aa44aa',
        }).setOrigin(0.5);
      }
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `patrol_${this.difficulty}`, moves: 0, minMoves: 0, stars,
          jobId: this.jobId, catId: this.catId,
          // Surfaced so main.ts can attach a real consequence later
          lanternsLost: this.lanternsLost,
        });
      });
    } else {
      playSfx('fail');
      haptic.error();
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Intruders got through!', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
