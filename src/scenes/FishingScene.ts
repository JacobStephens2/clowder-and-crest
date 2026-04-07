import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { attachStandardCleanup } from '../ui/sceneHelpers';

// ── Layout constants ──
const BAR_HEIGHT = 360;
const BAR_WIDTH = 28;
const BAR_X_RIGHT = GAME_WIDTH - 50;       // fish zone bar (right side)
const BAR_X_LEFT = 50;                      // catch meter (left side)
const BAR_Y = 260;

const HOOK_WIDTH = BAR_WIDTH - 4;
const HOOK_HEIGHT = 8;

// ── Colors ──
const BG_COLOR = 0x1c1b19;
const WATER_COLOR = 0x2a3a4a;
const DOCK_COLOR = 0x5a4a3a;
const DOCK_PLANK = 0x6b5b4a;
const FISH_ZONE_COLOR = 0x4a8a4a;
const HOOK_COLOR = 0xc4956a;
const BAR_BG_COLOR = 0x1a1918;
const BAR_BORDER_COLOR = 0x3a3530;
const CATCH_FULL_COLOR = 0x4a8a4a;
const CATCH_EMPTY_COLOR = 0x8a4a4a;
const LINE_COLOR = 0x8b7355;

// ── Difficulty settings ──
interface DifficultyConfig {
  zoneSize: number;       // fraction of bar height (smaller = harder)
  bounceSpeed: number;    // pixels per second the zone moves
  hookRiseSpeed: number;  // pixels per second hook rises when held
  hookFallSpeed: number;  // pixels per second hook falls when released
  catchRate: number;      // catch meter fill per second (inside zone)
  drainRate: number;      // catch meter drain per second (outside zone)
  timeLimit: number;      // seconds before auto-fail
}

const DIFFICULTY_MAP: Record<string, DifficultyConfig> = {
  easy: {
    zoneSize: 0.30,
    bounceSpeed: 90,
    hookRiseSpeed: 200,
    hookFallSpeed: 140,
    catchRate: 0.25,
    drainRate: 0.15,
    timeLimit: 30,
  },
  medium: {
    zoneSize: 0.22,
    bounceSpeed: 130,
    hookRiseSpeed: 220,
    hookFallSpeed: 160,
    catchRate: 0.20,
    drainRate: 0.18,
    timeLimit: 35,
  },
  hard: {
    zoneSize: 0.15,
    bounceSpeed: 180,
    hookRiseSpeed: 250,
    hookFallSpeed: 180,
    catchRate: 0.15,
    drainRate: 0.22,
    timeLimit: 45,
  },
};

// ── Fish behaviors ──
//
// Per the doc's #1 implication: "different species feel different to catch
// at a motor level, not just a stat level". Each fish has a behavior that
// changes how its zone moves during the catch phase. The same push-pull
// mechanic produces distinct sensations because the zone motion patterns
// are fundamentally different.
type FishBehavior = 'steady' | 'darting' | 'diver' | 'runner' | 'lazy';

type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

interface FishProfile {
  name: string;
  behavior: FishBehavior;
  rarity: Rarity;
}

// Fish library by difficulty. Mix of behaviors per difficulty so the player
// encounters variety even within a single tier. Rarity weighting is rolled
// separately at scene init.
const FISH_LIBRARY: Record<string, FishProfile[]> = {
  easy: [
    { name: 'Perch',    behavior: 'steady',  rarity: 'common'   },
    { name: 'Minnow',   behavior: 'darting', rarity: 'common'   },
    { name: 'Gudgeon',  behavior: 'lazy',    rarity: 'common'   },
    { name: 'Dace',     behavior: 'runner',  rarity: 'uncommon' },
    { name: 'Sunfish',  behavior: 'diver',   rarity: 'uncommon' },
    { name: 'Crystal Perch', behavior: 'steady', rarity: 'rare' },
  ],
  medium: [
    { name: 'Trout',    behavior: 'runner',  rarity: 'common'   },
    { name: 'Carp',     behavior: 'lazy',    rarity: 'common'   },
    { name: 'Bream',    behavior: 'steady',  rarity: 'common'   },
    { name: 'Tench',    behavior: 'diver',   rarity: 'uncommon' },
    { name: 'River Eel', behavior: 'darting', rarity: 'uncommon' },
    { name: 'Moonfin Carp', behavior: 'lazy', rarity: 'rare' },
  ],
  hard: [
    { name: 'Pike',     behavior: 'darting', rarity: 'common'   },
    { name: 'Salmon',   behavior: 'runner',  rarity: 'common'   },
    { name: 'Eel',      behavior: 'diver',   rarity: 'common'   },
    { name: 'Sturgeon', behavior: 'lazy',    rarity: 'uncommon' },
    { name: 'Pike King', behavior: 'darting', rarity: 'rare'    },
    { name: 'Greatfin Salmon', behavior: 'runner', rarity: 'legendary' },
  ],
};

const RARITY_BONUS: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 3,
  legendary: 8,
};

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c4956a',
  uncommon: '#88dd88',
  rare: '#88aaff',
  legendary: '#ffd700',
};

export class FishingScene extends Phaser.Scene {
  private jobId = '';
  private catId = '';
  private catBreed = 'wildcat';
  private difficulty = 'easy';
  private diffConfig!: DifficultyConfig;

  // ── State machine ──
  // The doc's three-phase structure: approach (waiting for a bite, builds
  // anticipation), bite (reaction window, the surprise spike), catch (the
  // active push-pull fight). Each phase delivers a different emotional
  // texture; jumping straight to catch sacrifices anticipation entirely.
  phase: 'approach' | 'bite' | 'catch' | 'done' = 'approach';
  /** When the current phase started (scene-relative seconds). */
  phaseStart = 0;
  /** How long the approach phase will last for this fish (randomized). */
  approachDuration = 2;
  /** Fixed window during which the player can react to a bite. Missing the
      window means the fish escapes. */
  biteWindow = 1.4;

  isReeling = false;
  hookY = 0;           // 0 = bottom of bar, BAR_HEIGHT = top
  zoneY = 0;           // bottom edge of zone in bar-local coords (0..BAR_HEIGHT)
  zoneDir = 1;         // 1 = moving up, -1 = moving down
  catchMeter = 0;      // 0..1
  elapsed = 0;         // seconds since start
  finished = false;
  private tutorialShowing = false;

  // Per-fish behavior state — driven by the active fish profile
  fishProfile!: FishProfile;
  /** Behavior-specific timer for runner sprint/pause cadences. */
  private behaviorPhaseTimer = 0;
  /** True during a runner's sprint phase (fast movement). */
  private runnerSprinting = true;
  /** Last time a darting fish flipped direction. */
  private dartLastFlip = 0;
  /** Last time a lazy fish "jumped". */
  private lazyLastJump = 0;

  // Graphics objects
  private hookRect!: Phaser.GameObjects.Rectangle;
  private zoneRect!: Phaser.GameObjects.Rectangle;
  private catchFillRect!: Phaser.GameObjects.Rectangle;
  private catchBorderRect!: Phaser.GameObjects.Rectangle;
  private timerText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private fishLine!: Phaser.GameObjects.Graphics;
  /** Bobber circle in the water — visible during the approach + bite
      phases. Twitches when a bite happens. */
  private bobber!: Phaser.GameObjects.Arc;
  private bobberHomeY = 0;

  // Water ripple
  private waterRippleTimer = 0;
  fishName = 'Fish';
  fishRarity: Rarity = 'common';
  private ripples: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super({ key: 'FishingScene' });
  }

  init(data: { difficulty?: string; jobId?: string; catId?: string }): void {
    this.difficulty = data.difficulty ?? 'easy';
    this.jobId = data.jobId ?? '';
    this.catId = data.catId ?? '';
    const save = getGameState();
    const cat = save?.cats.find((c) => c.id === this.catId);
    this.catBreed = cat?.breed ?? 'wildcat';
    this.diffConfig = { ...(DIFFICULTY_MAP[this.difficulty] ?? DIFFICULTY_MAP.easy) };

    // Cat stat bonuses: Endurance slows drain, Senses enlarges zone
    if (cat) {
      const endBonus = cat.stats.endurance * 0.008; // up to -0.08 drain at 10
      const sensBonus = cat.stats.senses * 0.012;   // up to +0.12 zone at 10
      this.diffConfig.drainRate = Math.max(0.05, this.diffConfig.drainRate - endBonus);
      this.diffConfig.zoneSize = Math.min(0.5, this.diffConfig.zoneSize + sensBonus);
    }

    this.isReeling = false;
    this.hookY = 0;
    this.zoneY = BAR_HEIGHT * 0.3;
    this.zoneDir = 1;
    this.catchMeter = 0.35;
    this.elapsed = 0;
    this.finished = false;
    this.ripples = [];
    this.waterRippleTimer = 0;
    this.phase = 'approach';
    this.phaseStart = 0;
    this.approachDuration = 1.2 + Math.random() * 2.5; // 1.2 - 3.7s wait
    this.behaviorPhaseTimer = 0;
    this.runnerSprinting = true;
    this.dartLastFlip = 0;
    this.lazyLastJump = 0;

    // Pick a fish profile + roll rarity. The doc's "variable interval
    // reinforcement" pillar: rarity is a separate roll, so even a common
    // species can occasionally surface as a rare specimen.
    this.fishProfile = this.pickFishProfile();
    this.fishRarity = this.rollRarity();
    this.fishName = this.fishRarity === 'legendary' && !this.fishProfile.name.includes('Legendary')
      ? `Legendary ${this.fishProfile.name}`
      : this.fishRarity === 'rare' && this.fishProfile.rarity === 'common'
        ? `Golden ${this.fishProfile.name}`
        : this.fishProfile.name;
  }

  /** Pick a random fish from the difficulty's library. Public so tests can
      verify the library has the expected behaviors. */
  pickFishProfile(): FishProfile {
    const list = FISH_LIBRARY[this.difficulty] ?? FISH_LIBRARY.easy;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Roll a rarity tier independent of the fish profile. Tier weights:
      common 60%, uncommon 25%, rare 12%, legendary 3%. The roll never
      drops a fish BELOW its profile's intrinsic rarity — a "Pike King"
      rated rare can never roll common. */
  rollRarity(): Rarity {
    const r = Math.random();
    const baseRoll: Rarity = r < 0.03 ? 'legendary'
      : r < 0.15 ? 'rare'
      : r < 0.40 ? 'uncommon'
      : 'common';
    // Floor at the profile's intrinsic rarity
    const tiers: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];
    const profileIdx = tiers.indexOf(this.fishProfile.rarity);
    const rollIdx = tiers.indexOf(baseRoll);
    return tiers[Math.max(profileIdx, rollIdx)];
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Show tutorial on first play — bumped to v2 for the three-phase
    // structure and behavioral fish variety so returning players see the
    // updated rules.
    if (!localStorage.getItem('clowder_fishing_tutorial_v2')) {
      localStorage.setItem('clowder_fishing_tutorial_v2', '1');
      this.tutorialShowing = true;
      const tutorial = document.createElement('div');
      tutorial.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
      tutorial.innerHTML = `
        <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">Fishing</div>
        <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:290px;line-height:1.6">
          Watch the bobber. When you see <strong style="color:#dda055">BITE!</strong>, hold to set the hook fast.<br><br>
          Then keep the gold hook inside the green fish zone to fill the catch meter.<br><br>
          Different fish move differently — <strong style="color:#88dd88">runners sprint</strong>, <strong style="color:#88aaff">divers pull down</strong>, <strong style="color:#ff8888">darters flip</strong>.
        </div>
        <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
      `;
      tutorial.addEventListener('click', () => {
        tutorial.remove();
        this.tutorialShowing = false;
      });
      document.body.appendChild(tutorial);
    }

    // ── Water background ──
    const waterTop = 180;
    this.add.rectangle(GAME_WIDTH / 2, waterTop + (GAME_HEIGHT - waterTop) / 2,
      GAME_WIDTH, GAME_HEIGHT - waterTop, WATER_COLOR);

    // Water surface shimmer lines
    const waterGfx = this.add.graphics();
    waterGfx.lineStyle(1, 0x3a4a5a, 0.3);
    for (let i = 0; i < 8; i++) {
      const wy = waterTop + 10 + i * 25;
      waterGfx.beginPath();
      waterGfx.moveTo(0, wy);
      for (let x = 0; x < GAME_WIDTH; x += 20) {
        waterGfx.lineTo(x + 10, wy + Math.sin(x * 0.1 + i) * 3);
      }
      waterGfx.strokePath();
    }

    // ── Dock ──
    const dockX = 30;
    const dockW = 160;
    const dockY = waterTop - 10;
    // Dock supports (posts)
    this.add.rectangle(dockX + 20, dockY + 30, 8, 50, 0x4a3a2a);
    this.add.rectangle(dockX + dockW - 20, dockY + 30, 8, 50, 0x4a3a2a);
    // Main platform
    this.add.rectangle(dockX + dockW / 2, dockY, dockW, 16, DOCK_COLOR);
    // Planks
    for (let p = 0; p < 5; p++) {
      const px = dockX + 16 + p * 32;
      this.add.rectangle(px, dockY, 30, 14, DOCK_PLANK).setStrokeStyle(1, 0x4a3a2a, 0.5);
    }

    // ── Cat sprite on dock ──
    const catX = dockX + dockW - 40;
    const catY = dockY - 20;
    const idleKey = `${this.catBreed}_idle_east`;
    if (this.textures.exists(idleKey)) {
      const sprite = this.add.sprite(catX, catY, idleKey);
      sprite.setScale(1.2);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    } else {
      // Fallback circle
      this.add.circle(catX, catY, 12, 0xc4956a);
      this.add.circle(catX - 5, catY - 6, 4, 0xc4956a); // ear
      this.add.circle(catX + 5, catY - 6, 4, 0xc4956a); // ear
    }

    // ── Fishing line (will be redrawn every frame) ──
    this.fishLine = this.add.graphics();

    // ── Bobber on the water ──
    // Visible during the approach + bite phases. Per the doc's three-phase
    // structure: a visible bobber gives the player something to watch
    // during the anticipation period. It twitches when a bite happens.
    const bobberX = GAME_WIDTH / 2 + 30;
    this.bobberHomeY = waterTop + 80;
    this.bobber = this.add.circle(bobberX, this.bobberHomeY, 6, 0xdda055)
      .setStrokeStyle(2, 0x6b5b3e);
    this.bobber.setDepth(5);
    // Gentle idle bob — small Y oscillation while we wait for a bite
    this.tweens.add({
      targets: this.bobber,
      y: this.bobberHomeY - 2,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Job name ──
    const job = getJob(this.jobId);
    if (job) {
      this.add.text(GAME_WIDTH / 2, 30, `${job.name} (${this.difficulty})`, {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
      }).setOrigin(0.5);
    }

    // Stat bonuses display
    const gameSave = getGameState();
    const catData = gameSave?.cats.find((c: any) => c.id === this.catId);
    const endurance = catData?.stats?.endurance ?? 0;
    const senses = catData?.stats?.senses ?? 0;
    const bonuses: string[] = [];
    if (endurance >= 5) bonuses.push(`Endurance: slower drain`);
    if (senses >= 5) bonuses.push(`Senses: wider zone`);
    const bonusText = bonuses.length > 0 ? ` (${bonuses.join(', ')})` : '';

    // Fish identity stays generic until the bite — preserves the surprise
    // about WHICH fish you'll be hooking. Hint at the difficulty pool only.
    this.add.text(GAME_WIDTH / 2, 48, `Casting in${bonusText}`, {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Timer ──
    this.timerText = this.add.text(GAME_WIDTH / 2, 68, `Time: ${this.diffConfig.timeLimit}s`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // ── Fish zone bar (right side) ──
    // Background
    this.add.rectangle(BAR_X_RIGHT, BAR_Y + BAR_HEIGHT / 2, BAR_WIDTH + 4, BAR_HEIGHT + 4, BAR_BG_COLOR)
      .setStrokeStyle(1, BAR_BORDER_COLOR);

    // Fish zone (green area that bounces)
    const zonePxHeight = BAR_HEIGHT * this.diffConfig.zoneSize;
    this.zoneRect = this.add.rectangle(
      BAR_X_RIGHT, BAR_Y + BAR_HEIGHT - this.zoneY - zonePxHeight / 2,
      BAR_WIDTH, zonePxHeight, FISH_ZONE_COLOR, 0.5
    );

    // Hook indicator
    this.hookRect = this.add.rectangle(
      BAR_X_RIGHT, BAR_Y + BAR_HEIGHT,
      HOOK_WIDTH, HOOK_HEIGHT, HOOK_COLOR
    );
    this.hookRect.setStrokeStyle(1, 0xffffff, 0.3);

    // Labels
    this.add.text(BAR_X_RIGHT, BAR_Y - 12, 'Fish', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Catch meter (left side) ──
    this.add.rectangle(BAR_X_LEFT, BAR_Y + BAR_HEIGHT / 2, BAR_WIDTH + 4, BAR_HEIGHT + 4, BAR_BG_COLOR)
      .setStrokeStyle(1, BAR_BORDER_COLOR);

    this.catchFillRect = this.add.rectangle(
      BAR_X_LEFT, BAR_Y + BAR_HEIGHT, BAR_WIDTH, 0, CATCH_FULL_COLOR, 0.7
    );
    this.catchFillRect.setOrigin(0.5, 1);

    this.catchBorderRect = this.add.rectangle(
      BAR_X_LEFT, BAR_Y + BAR_HEIGHT / 2, BAR_WIDTH + 4, BAR_HEIGHT + 4
    );
    this.catchBorderRect.setStrokeStyle(1, BAR_BORDER_COLOR);
    this.catchBorderRect.setFillStyle(0x000000, 0);

    this.add.text(BAR_X_LEFT, BAR_Y - 12, 'Catch', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Instruction text ──
    this.instructionText = this.add.text(GAME_WIDTH / 2, BAR_Y + BAR_HEIGHT + 30,
      'Hold to reel in!', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#6b5b3e',
    }).setOrigin(0.5);

    // ── Quit button ──
    this.createButton(GAME_WIDTH / 2, BAR_Y + BAR_HEIGHT + 65, 'Quit', () => {
      this.finished = true;
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // ── Input: pointer (click/tap) ──
    this.input.on('pointerdown', () => {
      if (!this.finished) this.isReeling = true;
    });
    this.input.on('pointerup', () => {
      this.isReeling = false;
    });

    // ── Input: space bar ──
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.finished) this.isReeling = true;
    });
    this.input.keyboard?.on('keyup-SPACE', () => {
      this.isReeling = false;
    });

    attachStandardCleanup(this);
    eventBus.emit('show-ui');
  }

  update(_time: number, delta: number): void {
    if (this.finished || this.tutorialShowing) return;

    const dt = delta / 1000; // seconds
    this.elapsed += dt;

    // Phase dispatch — each phase delivers a different emotional texture
    // per the doc's three-phase structure.
    if (this.phase === 'approach') {
      this.tickApproach();
      return;
    }
    if (this.phase === 'bite') {
      this.tickBite();
      return;
    }
    if (this.phase === 'catch') {
      this.tickCatch(dt);
      return;
    }
  }

  /** Approach phase: serene wait for a bite. The bobber idles, the bars
      are hidden. After a randomized delay we transition to the bite phase. */
  private tickApproach(): void {
    // Hide the catch UI during approach
    this.zoneRect?.setVisible(false);
    this.hookRect?.setVisible(false);
    this.catchFillRect?.setVisible(false);
    this.bobber?.setVisible(true);

    if (this.instructionText) {
      this.instructionText.setText('Waiting for a bite...');
      this.instructionText.setColor('#6b5b3e');
    }
    this.timerText?.setText('');

    if (this.elapsed - this.phaseStart >= this.approachDuration) {
      this.beginBite();
    }
  }

  /** Bite phase: the line twitches, "BITE!" prompt flashes. The player has
      a fixed window to react with a tap/hold or the fish escapes. */
  private tickBite(): void {
    if (this.instructionText) {
      this.instructionText.setText('BITE! Hold to set the hook!');
      this.instructionText.setColor('#dda055');
    }
    if (this.bobber) {
      // Twitch — pulse scale to draw the eye
      const t = this.elapsed - this.phaseStart;
      const wobble = Math.sin(t * 30) * 4;
      this.bobber.x = GAME_WIDTH / 2 + 30 + wobble;
      this.bobber.setScale(1 + Math.abs(Math.sin(t * 20)) * 0.4);
    }
    // Player reacted in time → catch phase
    if (this.isReeling) {
      this.beginCatch();
      return;
    }
    // Window expired → escape
    if (this.elapsed - this.phaseStart >= this.biteWindow) {
      this.onFailure('The fish stole your bait...');
    }
  }

  /** Transition into the bite phase: play a sound, set the timer reference. */
  beginBite(): void {
    this.phase = 'bite';
    this.phaseStart = this.elapsed;
    playSfx('tap', 0.4);
    // The bite is the most important read in fishing — give it a tactile thump.
    haptic.medium();
  }

  /** Transition into the catch phase: hide bobber, show bars, reveal fish
      identity, start the actual reel-in mechanic. */
  beginCatch(): void {
    this.phase = 'catch';
    this.phaseStart = this.elapsed;
    if (this.bobber) {
      this.bobber.setVisible(false);
      // Stop any pending tweens on the bobber so it doesn't rebob during catch
      this.tweens.killTweensOf(this.bobber);
    }
    this.zoneRect?.setVisible(true);
    this.hookRect?.setVisible(true);
    this.catchFillRect?.setVisible(true);
    if (this.instructionText) {
      // Reveal which fish was hooked, with rarity-coded color
      this.instructionText.setText(`${this.fishName}! (${this.fishProfile.behavior})`);
      this.instructionText.setColor(RARITY_COLOR[this.fishRarity]);
    }
    playSfx('splash', 0.5);
  }

  /** Apply the active fish's behavior to the zone motion. Each behavior
      computes a per-frame deltaY for the zone (and may flip direction
      mid-bounce). The doc's #1 implication: same UI, different motor feel. */
  applyFishBehavior(dt: number, speedMult: number, _zonePxHeight: number): void {
    const baseSpeed = this.diffConfig.bounceSpeed * speedMult;
    const behavior = this.fishProfile?.behavior ?? 'steady';

    if (behavior === 'steady') {
      // Constant linear bounce — the baseline.
      this.zoneY += this.zoneDir * baseSpeed * dt;
      return;
    }

    if (behavior === 'darting') {
      // Faster baseline + frequent random direction flips. Each flip is
      // unannounced so the player has to react. Tuned to fire ~3-4 flips
      // per second so the behavior is unambiguous.
      const speed = baseSpeed * 1.5;
      this.zoneY += this.zoneDir * speed * dt;
      if (this.elapsed - this.dartLastFlip > 0.25 + Math.random() * 0.25) {
        this.dartLastFlip = this.elapsed;
        if (Math.random() < 0.85) this.zoneDir *= -1;
      }
      return;
    }

    if (behavior === 'diver') {
      // Strongly biased downward — the zone climbs slowly but drops fast,
      // and a constant gravity term ensures it tends downward over any
      // window. Punishes players who try to overpower it.
      const upSpeed = baseSpeed * 0.45;
      const downSpeed = baseSpeed * 1.5;
      this.zoneY += this.zoneDir * (this.zoneDir > 0 ? upSpeed : downSpeed) * dt;
      // Constant gravity drift so net direction is always downward over time
      this.zoneY -= 40 * dt;
      return;
    }

    if (behavior === 'runner') {
      // Sprint-pause cadence: 0.6s sprint at 1.7x speed, then 0.5s pause.
      this.behaviorPhaseTimer += dt;
      const sprintDur = 0.6;
      const pauseDur = 0.5;
      if (this.runnerSprinting && this.behaviorPhaseTimer >= sprintDur) {
        this.runnerSprinting = false;
        this.behaviorPhaseTimer = 0;
      } else if (!this.runnerSprinting && this.behaviorPhaseTimer >= pauseDur) {
        this.runnerSprinting = true;
        this.behaviorPhaseTimer = 0;
        // Random direction flip on each new sprint — keeps the player honest
        if (Math.random() < 0.5) this.zoneDir *= -1;
      }
      const speed = this.runnerSprinting ? baseSpeed * 1.7 : 0;
      this.zoneY += this.zoneDir * speed * dt;
      return;
    }

    if (behavior === 'lazy') {
      // Slow baseline plus occasional sudden jumps — the player learns the
      // slow pattern and gets ambushed by the jump.
      this.zoneY += this.zoneDir * baseSpeed * 0.55 * dt;
      if (this.elapsed - this.lazyLastJump > 1.8 + Math.random() * 1.2) {
        this.lazyLastJump = this.elapsed;
        const jumpDist = 60 + Math.random() * 40;
        this.zoneY += (Math.random() < 0.5 ? -1 : 1) * jumpDist;
      }
      return;
    }
  }

  /** Catch phase: the active reel-in. Same push-pull mechanic as before,
      but the zone motion is now driven by the fish's behavior profile. */
  private tickCatch(dt: number): void {
    // Catch-phase elapsed time, used for time limit
    const catchElapsed = this.elapsed - this.phaseStart;

    // ── Update timer ──
    const remaining = Math.max(0, this.diffConfig.timeLimit - catchElapsed);
    this.timerText.setText(`Time: ${Math.ceil(remaining)}s`);

    if (remaining <= 0) {
      this.onFailure();
      return;
    }

    // ── Current surge — periodic speed boost that adds challenge ──
    const surgeInterval = 6;
    const surgeDuration = 1.5;
    const timeSinceLastSurge = catchElapsed % surgeInterval;
    const isSurging = timeSinceLastSurge < surgeDuration && catchElapsed > 3;
    const speedMult = isSurging ? 2.0 : 1.0;

    // ── Move fish zone — driven by the active behavior ──
    const zonePxHeight = BAR_HEIGHT * this.diffConfig.zoneSize;
    this.applyFishBehavior(dt, speedMult, zonePxHeight);

    // Bounce at top/bottom
    if (this.zoneY + zonePxHeight > BAR_HEIGHT) {
      this.zoneY = BAR_HEIGHT - zonePxHeight;
      this.zoneDir = -1;
    } else if (this.zoneY < 0) {
      this.zoneY = 0;
      this.zoneDir = 1;
    }

    // Update zone rect position (convert bar-local to world)
    this.zoneRect.y = BAR_Y + BAR_HEIGHT - this.zoneY - zonePxHeight / 2;
    // Flash zone during surge
    this.zoneRect.setAlpha(isSurging ? 0.5 + Math.sin(catchElapsed * 10) * 0.3 : 0.6);

    // ── Move hook ──
    if (this.isReeling) {
      this.hookY += this.diffConfig.hookRiseSpeed * dt;
    } else {
      this.hookY -= this.diffConfig.hookFallSpeed * dt;
    }
    this.hookY = Phaser.Math.Clamp(this.hookY, 0, BAR_HEIGHT);

    // Update hook rect position
    this.hookRect.y = BAR_Y + BAR_HEIGHT - this.hookY;

    // ── Check if hook is inside fish zone ──
    const hookInZone = this.hookY >= this.zoneY && this.hookY <= this.zoneY + zonePxHeight;

    if (hookInZone) {
      this.catchMeter += this.diffConfig.catchRate * dt;
      this.hookRect.setFillStyle(0x6aba6a); // bright green when in zone
    } else {
      this.catchMeter -= this.diffConfig.drainRate * dt;
      this.hookRect.setFillStyle(HOOK_COLOR);
    }
    this.catchMeter = Phaser.Math.Clamp(this.catchMeter, 0, 1);

    // ── Update catch meter visual ──
    const fillHeight = this.catchMeter * BAR_HEIGHT;
    this.catchFillRect.height = fillHeight;
    this.catchFillRect.y = BAR_Y + BAR_HEIGHT;

    // Color shifts from red (empty) to green (full)
    const r = Math.floor(0x8a - (0x8a - 0x4a) * this.catchMeter);
    const g = Math.floor(0x4a + (0x8a - 0x4a) * this.catchMeter);
    const b = 0x4a;
    this.catchFillRect.setFillStyle((r << 16) | (g << 8) | b, 0.7);

    // ── Update fishing line ──
    this.fishLine.clear();
    this.fishLine.lineStyle(1.5, LINE_COLOR, 0.6);
    // Line from cat (rod tip) down to hook position on the right bar
    const rodTipX = 150;
    const rodTipY = 155;
    const hookWorldX = BAR_X_RIGHT;
    const hookWorldY = BAR_Y + BAR_HEIGHT - this.hookY;
    this.fishLine.beginPath();
    this.fishLine.moveTo(rodTipX, rodTipY);
    // Slight curve via control points
    const midX = (rodTipX + hookWorldX) / 2;
    const midY = Math.min(rodTipY, hookWorldY) + 40;
    this.fishLine.lineTo(midX, midY);
    this.fishLine.lineTo(hookWorldX, hookWorldY);
    this.fishLine.strokePath();

    // ── Water ripples ──
    this.waterRippleTimer += dt;
    if (this.waterRippleTimer > 1.5) {
      this.waterRippleTimer = 0;
      const rx = 80 + Math.random() * (GAME_WIDTH - 160);
      const ry = 200 + Math.random() * 100;
      const ripple = this.add.circle(rx, ry, 2, 0x4a5a6a, 0.4);
      this.ripples.push(ripple);
      this.tweens.add({
        targets: ripple,
        scaleX: 8,
        scaleY: 4,
        alpha: 0,
        duration: 2000,
        onComplete: () => {
          ripple.destroy();
          const idx = this.ripples.indexOf(ripple);
          if (idx >= 0) this.ripples.splice(idx, 1);
        },
      });
    }

    // ── Update instruction text ──
    if (hookInZone) {
      this.instructionText.setText('Reeling in...');
      this.instructionText.setColor('#4a8a4a');
    } else if (this.isReeling) {
      this.instructionText.setText('Find the fish zone!');
      this.instructionText.setColor('#c4956a');
    } else {
      this.instructionText.setText('Hold to reel in!');
      this.instructionText.setColor('#6b5b3e');
    }

    // ── Win/lose checks ──
    if (this.catchMeter >= 1) {
      this.onSuccess();
    } else if (this.catchMeter <= 0 && this.elapsed > 3) {
      // Grace period of 3 seconds before drain can cause failure
      this.onFailure();
    }
  }

  onSuccess(): void {
    this.finished = true;
    this.isReeling = false;
    this.phase = 'done';

    // Stars based on how quickly the catch was filled (catch-phase only)
    const catchElapsed = this.elapsed - this.phaseStart;
    const timeFraction = catchElapsed / this.diffConfig.timeLimit;
    let stars: number;
    if (timeFraction <= 0.4) {
      stars = 3;
    } else if (timeFraction <= 0.7) {
      stars = 2;
    } else {
      stars = 1;
    }

    // Rarity-driven success styling. Per the doc's "layered reward tiers"
    // pillar: each tier deserves its own visual treatment so the surprise
    // of pulling a legendary fish lands at full force.
    const rarityColor = RARITY_COLOR[this.fishRarity];
    const isLegendary = this.fishRarity === 'legendary';
    const isRare = this.fishRarity === 'rare';
    playSfx(isLegendary || isRare ? 'sparkle' : 'splash');
    if (isLegendary || isRare) haptic.success();
    else haptic.medium();

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, `${this.fishName} Caught!`, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: rarityColor,
    }).setOrigin(0.5);

    if (this.fishRarity !== 'common') {
      const tierLabel = this.fishRarity.charAt(0).toUpperCase() + this.fishRarity.slice(1);
      const bonus = RARITY_BONUS[this.fishRarity];
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, `${tierLabel}! +${bonus} bonus fish`, {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: rarityColor,
      }).setOrigin(0.5);
    }

    const starLabel = stars === 3 ? '★★★' : stars === 2 ? '★★' : '★';
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, starLabel, {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#dda055',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `fishing_${this.difficulty}`,
        moves: Math.floor(catchElapsed),
        minMoves: Math.floor(this.diffConfig.timeLimit * 0.3),
        stars,
        jobId: this.jobId,
        catId: this.catId,
        bonusFish: RARITY_BONUS[this.fishRarity],
        // Surfaced for downstream consumers (codex, journal, etc.)
        fishName: this.fishName,
        fishRarity: this.fishRarity,
      });
    });
  }

  onFailure(message = 'The fish escaped!'): void {
    this.finished = true;
    this.isReeling = false;
    this.phase = 'done';
    haptic.warning();

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'It got away...', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#aa4444',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, message, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5);

    this.time.delayedCall(2000, () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 120, 36, 0x2a2520);
    bg.setStrokeStyle(1, 0x6b5b3e);
    bg.setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
    }).setOrigin(0.5);
    bg.on('pointerover', () => { bg.setFillStyle(0x3a3530); text.setColor('#ddb87a'); });
    bg.on('pointerout', () => { bg.setFillStyle(0x2a2520); text.setColor('#c4956a'); });
    bg.on('pointerdown', onClick);
  }
}
