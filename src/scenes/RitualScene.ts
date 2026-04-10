import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial } from '../ui/sceneHelpers';

const CANDLE_COLORS = [0xcc4444, 0x44aa44, 0x4488cc, 0xddaa33, 0xaa44cc, 0xcc8844];

// Per-candle tones — pentatonic scale (C major pentatonic) so any combination
// sounds consonant. The doc's biggest direct call-out: "each candle has a
// distinct tone or musical note... activates dual-channel encoding". With a
// pentatonic scale, sequences become melodic phrases the player's brain can
// chunk into musical motifs rather than discrete steps.
const CANDLE_FREQUENCIES = [
  261.63, // C4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  659.25, // E5
];

// Per-candle SFX layered UNDER the synth tone. Per user feedback
// (2026-04-08): "add a different sound effect for each candle tap and
// light flash." The pentatonic tones were already distinct but the
// user wasn't reading them as different sounds — adding a tactile mp3
// per candle gives an unmistakable ear-cue that doesn't depend on
// pitch perception.
const CANDLE_SFX = [
  'bell_chime',  // C4 — clear bell
  'sparkle',     // E4 — bright sparkle
  'lock_click',  // G4 — crisp click
  'match_strike',// A4 — flame
  'tap',         // C5 — UI tap
  'crate_push',  // E5 — wooden thud
];

// Base flash duration at round 1, shrinking each round per Simon's "fixed
// speed ramp" pillar. Ramps from BASE down toward MIN linearly across the
// target rounds — late rounds genuinely run faster than early ones.
const BASE_FLASH_MS = 700;
const MIN_FLASH_MS = 280;
const BASE_GAP_MS = 400;
const MIN_GAP_MS = 160;

export class RitualScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private difficulty = 'easy';
  candleCount = 4;
  sequence: number[] = [];
  playerInput: number[] = [];
  round = 0;
  targetRounds = 6;
  lives = 3;
  phase: 'showing' | 'input' | 'done' = 'showing';
  private candles: { glow: Phaser.GameObjects.Arc; zone: Phaser.GameObjects.Zone; color: number }[] = [];
  private showIdx = 0;
  finished = false;
  private tutorialShowing = false;
  private roundText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  /** Lazily-initialized Web Audio context for per-candle tones. Created on
      first tone play to satisfy browser autoplay policies (audio contexts
      must be created or resumed in response to a user gesture). */
  private audioCtx: AudioContext | null = null;
  /** Tracks how many rounds the player completed without ANY failures.
      Used for tiered mastery star scoring per Rhythm Heaven's model. */
  perfectRounds = 0;
  /** Replay slowdown multiplier — 1.0 normally, 1.4 after a failure to
      give the player a 30% slower retry. The doc's adaptive-speed-on-
      failure recommendation. Resets to 1.0 on success. */
  replaySpeedMult = 1.0;
  /** True for the current round if the player has not failed yet. Resets
      each new round; flips to false on the first wrong tap. */
  currentRoundPerfect = true;

  constructor() { super({ key: 'RitualScene' }); }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.difficulty = data?.difficulty ?? 'easy';
    this.finished = false;
    this.sequence = [];
    this.playerInput = [];
    this.round = 0;
    this.showIdx = 0;
    this.candles = [];
    this.phase = 'showing';
    this.perfectRounds = 0;
    this.replaySpeedMult = 1.0;
    this.currentRoundPerfect = true;

    this.candleCount = this.difficulty === 'hard' ? 6 : this.difficulty === 'medium' ? 5 : 4;
    this.targetRounds = this.difficulty === 'hard' ? 8 : this.difficulty === 'medium' ? 7 : 6;
    this.lives = this.difficulty === 'hard' ? 2 : this.difficulty === 'medium' ? 2 : 3;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    const charm = cat?.stats?.charm ?? 5;
    if (charm >= 7) this.lives++; // Grace from charm
  }

  /** Get the per-candle frequency for the given index, wrapping if needed.
      Each candle gets a distinct pentatonic note so sequences read as
      melodic phrases. */
  getCandleFrequency(idx: number): number {
    return CANDLE_FREQUENCIES[idx % CANDLE_FREQUENCIES.length];
  }

  /** Compute the current round's flash duration. Linear interpolation from
      BASE_FLASH_MS at round 1 down to MIN_FLASH_MS at the final round.
      The replaySpeedMult (1.4 after a failure) extends durations
      proportionally on the immediate retry. */
  getCurrentFlashMs(): number {
    if (this.targetRounds <= 1) return BASE_FLASH_MS;
    const t = (this.round - 1) / (this.targetRounds - 1);
    const base = BASE_FLASH_MS - (BASE_FLASH_MS - MIN_FLASH_MS) * Math.max(0, Math.min(1, t));
    return Math.round(base * this.replaySpeedMult);
  }

  /** Same curve for the inter-flash gap. */
  getCurrentGapMs(): number {
    if (this.targetRounds <= 1) return BASE_GAP_MS;
    const t = (this.round - 1) / (this.targetRounds - 1);
    const base = BASE_GAP_MS - (BASE_GAP_MS - MIN_GAP_MS) * Math.max(0, Math.min(1, t));
    return Math.round(base * this.replaySpeedMult);
  }

  /** Synthesize a tone at the given frequency. Used for both showing the
      sequence and for player taps so the player hears the same note when
      the candle lights up and when they tap it back — reinforcing the
      audio-visual pairing through symmetric playback. */
  playTone(frequency: number, duration = 0.32, volume = 0.18): void {
    try {
      if (!this.audioCtx) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        this.audioCtx = new Ctx();
      }
      const ctx = this.audioCtx!;
      // Resume the context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch {}
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = frequency;
      // Envelope: fast attack, slow exponential decay — bell-like
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch {
      // Audio context may fail to construct under some browsers; degrade
      // gracefully — the visual sequence still works without sound.
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0908');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v2 — distinct candle tones, speed escalation,
    // and adaptive replay are new mechanics returning players should know.
    if (showMinigameTutorial(this, 'clowder_ritual_tutorial_v2', 'Sacred Ritual',
      `Watch the candles light up in sequence — and <strong>listen to their tones</strong>.<br><br>
      Then tap them back <strong>in the same order</strong>.<br><br>
      Each round adds one more step and the ritual <strong>quickens</strong>.<br><br>
      Fail and the next replay slows down — you'll get another shot.`,
      () => { this.tutorialShowing = false; }
    )) { this.tutorialShowing = true; }

    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Ritual'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    this.roundText = this.add.text(GAME_WIDTH / 2, 55, `Round: 0/${this.targetRounds}`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

    // Progress bar
    this.add.rectangle(GAME_WIDTH / 2, 72, 200, 6, 0x2a2520).setStrokeStyle(1, 0x3a3530).setName('progressBg');
    this.add.rectangle(GAME_WIDTH / 2 - 100, 72, 0, 6, 0x4a8a4a).setOrigin(0, 0.5).setName('progressFill');

    this.livesText = this.add.text(20, 55, `Lives: ${this.lives}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#cc6666',
    });

    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Altar background — use pixel art altar sprite when available.
    const altarY = 320;
    if (this.textures.exists('altar_sprite')) {
      const altarSpr = this.add.sprite(GAME_WIDTH / 2, altarY + 60, 'altar_sprite');
      altarSpr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      altarSpr.setDisplaySize(300, 40);
    } else {
      this.add.rectangle(GAME_WIDTH / 2, altarY + 60, 300, 40, 0x2a2520).setStrokeStyle(1, 0x3a3530);
    }

    // Create candles in an arc
    const arcCx = GAME_WIDTH / 2;
    const arcCy = altarY;
    const arcR = 100;
    for (let i = 0; i < this.candleCount; i++) {
      const angle = Math.PI + (i / (this.candleCount - 1)) * Math.PI;
      const cx = arcCx + Math.cos(angle) * arcR;
      const cy = arcCy + Math.sin(angle) * arcR * 0.5;
      const color = CANDLE_COLORS[i % CANDLE_COLORS.length];

      // Candle body — use pixel art candle sprite when available.
      if (this.textures.exists('candle_sprite')) {
        const candleSpr = this.add.sprite(cx, cy + 6, 'candle_sprite');
        candleSpr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        candleSpr.setScale(0.7);
      } else {
        this.add.rectangle(cx, cy + 12, 10, 24, 0xd4c5a9).setStrokeStyle(1, 0x8b7355);
      }

      // Flame/glow
      const glow = this.add.circle(cx, cy, 14, color, 0.15);
      const flame = this.add.circle(cx, cy, 6, color, 0.3);

      const zone = this.add.zone(cx, cy, 50, 60);
      zone.setInteractive({ useHandCursor: true });
      const idx = i;
      zone.on('pointerdown', () => this.onCandleTap(idx));

      this.candles.push({ glow, zone, color });

      // Idle flicker
      this.tweens.add({
        targets: flame, alpha: 0.15, duration: 1000 + Math.random() * 500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // Status text
    this.add.text(GAME_WIDTH / 2, altarY + 120, 'Watch carefully...', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#6b5b3e',
    }).setOrigin(0.5).setName('statusText');

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');

    // Start first round after a delay
    this.time.delayedCall(this.tutorialShowing ? 100 : 1000, () => this.nextRound());
  }

  nextRound(): void {
    if (this.finished || this.tutorialShowing) {
      this.time.delayedCall(500, () => this.nextRound());
      return;
    }
    this.round++;
    this.roundText.setText(`Round: ${this.round}/${this.targetRounds}`);
    const fill = this.children.getByName('progressFill') as Phaser.GameObjects.Rectangle;
    if (fill) fill.width = 200 * (this.round / this.targetRounds);
    this.playerInput = [];
    this.phase = 'showing';
    // Each new round starts perfect; flips to false on the first wrong tap.
    // Reset any post-failure slowdown — fresh round runs at base speed.
    this.currentRoundPerfect = true;
    this.replaySpeedMult = 1.0;

    // Add one new step to the sequence
    this.sequence.push(Math.floor(Math.random() * this.candleCount));
    this.showIdx = 0;

    const statusText = this.children.getByName('statusText') as Phaser.GameObjects.Text;
    if (statusText) statusText.setText('Watch carefully...');

    // Play the sequence
    this.showNextInSequence();
  }

  private showNextInSequence(): void {
    if (this.showIdx >= this.sequence.length) {
      this.phase = 'input';
      const statusText = this.children.getByName('statusText') as Phaser.GameObjects.Text;
      if (statusText) statusText.setText('Your turn — tap the candles!');
      return;
    }

    const idx = this.sequence[this.showIdx];
    const candle = this.candles[idx];
    const flashMs = this.getCurrentFlashMs();
    const gapMs = this.getCurrentGapMs();

    // Flash the candle — duration scales with the round (Simon's tempo
    // ramp). Per-candle pentatonic tone is the dual-channel signal,
    // layered with a distinct mp3 SFX so the ear-cue is unmistakable
    // even on speakers that don't reproduce the synth pitch well.
    candle.glow.setAlpha(0.9);
    candle.glow.setScale(1.3);
    this.playTone(this.getCandleFrequency(idx), flashMs / 1000 * 0.85, 0.28);
    playSfx(CANDLE_SFX[idx % CANDLE_SFX.length], 0.18);
    this.time.delayedCall(flashMs, () => {
      candle.glow.setAlpha(0.15);
      candle.glow.setScale(1);
      this.showIdx++;
      this.time.delayedCall(gapMs, () => this.showNextInSequence());
    });
  }

  onCandleTap(idx: number): void {
    if (this.phase !== 'input' || this.finished || this.tutorialShowing) return;

    const candle = this.candles[idx];
    candle.glow.setAlpha(0.6);
    this.time.delayedCall(200, () => candle.glow.setAlpha(0.15));

    // Same tone + same per-candle mp3 cue for tap as for show — keeps
    // the audio symmetric so the player learns "this candle = this
    // sound" reliably across both phases.
    this.playTone(this.getCandleFrequency(idx), 0.22, 0.28);
    playSfx(CANDLE_SFX[idx % CANDLE_SFX.length], 0.16);
    haptic.light();

    this.playerInput.push(idx);
    const step = this.playerInput.length - 1;

    if (this.sequence[step] !== idx) {
      // Wrong!
      this.lives--;
      this.livesText.setText(`Lives: ${this.lives}`);
      this.currentRoundPerfect = false;
      playSfx('fail', 0.4);
      haptic.error();
      this.cameras.main.flash(100, 80, 30, 30);
      // Apply adaptive slowdown — the replay runs at ~70% speed so the
      // immediate retry is reachable. Doc's "near-fail mechanics" pillar.
      this.replaySpeedMult = 1.4;
      this.playerInput = [];
      this.phase = 'showing';

      if (this.lives <= 0) {
        this.endGame(false);
      } else {
        // Near-fail message vs early-fail message — when the player got far
        // into a long sequence, frame the failure as "almost there" to
        // exploit the dopaminergic near-miss effect.
        const fraction = step / Math.max(1, this.sequence.length);
        const isNearFail = fraction >= 0.6 && this.sequence.length >= 4;
        const statusText = this.children.getByName('statusText') as Phaser.GameObjects.Text;
        if (statusText) {
          statusText.setText(isNearFail
            ? `Almost! You made it to step ${step + 1}. Try again, slower...`
            : 'Wrong! Watch again...');
        }
        // Replay current sequence
        this.showIdx = 0;
        this.time.delayedCall(1000, () => this.showNextInSequence());
      }
      return;
    }

    // Correct — check if sequence complete
    if (this.playerInput.length === this.sequence.length) {
      playSfx('sparkle', 0.4);
      haptic.success();
      // Round complete without failure → tally as perfect
      if (this.currentRoundPerfect) {
        this.perfectRounds++;
      }
      if (this.round >= this.targetRounds) {
        this.endGame(true);
      } else {
        this.time.delayedCall(800, () => this.nextRound());
      }
    }
  }

  private endGame(won: boolean): void {
    if (this.finished) return;
    this.finished = true;

    if (won) {
      playSfx('victory');
      haptic.success();
      // Tiered mastery scoring per Rhythm Heaven's model: perfect rounds,
      // not remaining lives, drive the star count. A run completed without
      // ever failing is the 3-star prize; failing once or twice still earns
      // 2 stars; getting through with frequent retries is 1 star.
      const perfectRatio = this.perfectRounds / this.targetRounds;
      const stars = perfectRatio === 1 ? 3 : perfectRatio >= 0.6 ? 2 : 1;
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Ritual Complete!', {
        fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, `${this.perfectRounds}/${this.targetRounds} perfect rounds`, {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#dda055',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-complete', {
          puzzleId: `ritual_${this.difficulty}`, moves: this.round, minMoves: this.targetRounds, stars,
          jobId: this.jobId, catId: this.catId,
          perfectRounds: this.perfectRounds,
        });
      });
    } else {
      playSfx('fail');
      haptic.error();
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'The ritual failed...', {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
      }).setOrigin(0.5);
      this.time.delayedCall(1500, () => {
        eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
        eventBus.emit('navigate', 'TownMapScene');
      });
    }
  }
}
