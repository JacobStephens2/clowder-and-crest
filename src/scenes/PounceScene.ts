import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { getGameState } from '../main';
import { getJob } from '../systems/JobBoard';
import { playSfx } from '../systems/SfxManager';
import { haptic } from '../systems/NativeFeatures';
import { showMinigameTutorial } from '../ui/sceneHelpers';
import { isPracticeRun } from '../systems/PracticeMode';

// Layout
const GROUND_Y = 650;
const LAUNCH_X = 60;
const LAUNCH_Y = GROUND_Y - 30;
const TARGET_X_MIN = 200;
const TARGET_X_MAX = 340;

// ── Breed-specific abilities ──
//
// Per the doc's biggest direct call-out: "giving each cat breed a distinct
// mid-flight power... immediately multiplies strategic depth without
// adding control complexity". The Angry Birds tap-mid-flight model:
// during a projectile's flight, tap the screen once to activate the
// active cat's ability. Each breed has a different effect.
export type BreedAbility = 'power_shot' | 'heavy_drop' | 'redirect' | 'split' | 'explosion' | 'speed_dash';

export interface BreedAbilityInfo {
  ability: BreedAbility;
  name: string;
  description: string;
}

export const BREED_ABILITIES: Record<string, BreedAbilityInfo> = {
  wildcat:      { ability: 'power_shot',  name: 'Power Shot',     description: 'Surge forward at impact speed.' },
  maine_coon:   { ability: 'heavy_drop',  name: 'Heavy Drop',     description: 'Plummet straight down for a crushing blow.' },
  siamese:      { ability: 'redirect',    name: 'Redirect',       description: 'Steer toward where you tap.' },
  russian_blue: { ability: 'split',       name: 'Triple Split',   description: 'Split into three projectiles.' },
  tuxedo:       { ability: 'explosion',   name: 'Whirlwind',      description: 'Detonate, knocking back nearby objects.' },
  bengal:       { ability: 'speed_dash',  name: 'Speed Dash',     description: 'A burst of forward speed.' },
};

// ── Materials ──
//
// Per the doc's "structure variety matters": wood, stone, and glass each
// have different break thresholds and destruction animations. Stone is
// heavy and stable; glass is fragile and bursts dramatically; wood is the
// baseline.
export type Material = 'wood' | 'stone' | 'glass';

export interface MaterialInfo {
  color: number;
  borderColor: number;
  density: number;
  restitution: number;
  friction: number;
  /** Force threshold above which a glass block "shatters" with extra
      visual feedback. Wood/stone don't shatter visually. */
  shatterThreshold: number;
}

export const MATERIALS: Record<Material, MaterialInfo> = {
  wood:  { color: 0x4a3a28, borderColor: 0x3a2a18, density: 0.005, restitution: 0.2, friction: 0.8, shatterThreshold: Infinity },
  stone: { color: 0x6a6a6a, borderColor: 0x4a4a4a, density: 0.012, restitution: 0.1, friction: 0.95, shatterThreshold: Infinity },
  glass: { color: 0x88aacc, borderColor: 0x6688aa, density: 0.003, restitution: 0.5, friction: 0.4, shatterThreshold: 0.5 },
};

// ── Structure templates ──
//
// Hand-designed cascade structures per the doc's "authored chaos" pillar.
// Each template is a list of (relative x, relative y, material, size)
// blocks plus the rat positions on top. Picked randomly at scene init so
// players see variety without losing the engineered cascades.
export interface StructureBlock {
  dx: number;        // offset from stack center
  dy: number;        // offset from ground (negative = above)
  size: number;
  material: Material;
}

export interface StructureTemplate {
  name: string;
  blocks: StructureBlock[];
  /** Y offsets for the rats on top (relative to the stack's top). */
  ratPositions: { dx: number; dy: number }[];
}

const SIZE = 24;

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
    name: 'Tower',
    // 6 wooden crates stacked classic-style. The original layout —
    // straightforward but fragile if hit at the bottom.
    blocks: [
      { dx: -SIZE, dy: -SIZE / 2, size: SIZE, material: 'wood' },
      { dx: 0,     dy: -SIZE / 2, size: SIZE, material: 'wood' },
      { dx: SIZE,  dy: -SIZE / 2, size: SIZE, material: 'wood' },
      { dx: -SIZE / 2, dy: -SIZE * 1.5, size: SIZE, material: 'wood' },
      { dx: SIZE / 2,  dy: -SIZE * 1.5, size: SIZE, material: 'wood' },
      { dx: 0,         dy: -SIZE * 2.5, size: SIZE, material: 'wood' },
    ],
    ratPositions: [
      { dx: -20, dy: -SIZE * 3 - 8 },
      { dx: 0,   dy: -SIZE * 3 - 8 },
      { dx: 20,  dy: -SIZE * 3 - 8 },
    ],
  },
  {
    name: 'Glass House',
    // Wooden frame with a glass center — knock the glass and the whole
    // thing buckles. High-cascade potential.
    blocks: [
      { dx: -SIZE, dy: -SIZE / 2, size: SIZE, material: 'wood' },
      { dx: SIZE,  dy: -SIZE / 2, size: SIZE, material: 'wood' },
      { dx: 0,     dy: -SIZE / 2, size: SIZE, material: 'glass' },
      { dx: -SIZE, dy: -SIZE * 1.5, size: SIZE, material: 'glass' },
      { dx: 0,     dy: -SIZE * 1.5, size: SIZE, material: 'wood' },
      { dx: SIZE,  dy: -SIZE * 1.5, size: SIZE, material: 'glass' },
    ],
    ratPositions: [
      { dx: -20, dy: -SIZE * 2.5 - 8 },
      { dx: 0,   dy: -SIZE * 2.5 - 8 },
      { dx: 20,  dy: -SIZE * 2.5 - 8 },
    ],
  },
  {
    name: 'Stone Fortress',
    // Heavy stone base with wooden top — only the top of the structure
    // is realistically toppled. Forces the player to aim high.
    blocks: [
      { dx: -SIZE, dy: -SIZE / 2, size: SIZE, material: 'stone' },
      { dx: 0,     dy: -SIZE / 2, size: SIZE, material: 'stone' },
      { dx: SIZE,  dy: -SIZE / 2, size: SIZE, material: 'stone' },
      { dx: -SIZE / 2, dy: -SIZE * 1.5, size: SIZE, material: 'wood' },
      { dx: SIZE / 2,  dy: -SIZE * 1.5, size: SIZE, material: 'wood' },
    ],
    ratPositions: [
      { dx: -16, dy: -SIZE * 2.5 - 8 },
      { dx: 16,  dy: -SIZE * 2.5 - 8 },
    ],
  },
  {
    name: 'Bridge',
    // Two stone pillars with a wooden plank across — a single strong
    // hit on either pillar collapses the bridge.
    blocks: [
      { dx: -SIZE * 1.5, dy: -SIZE / 2,    size: SIZE, material: 'stone' },
      { dx: -SIZE * 1.5, dy: -SIZE * 1.5,  size: SIZE, material: 'stone' },
      { dx: SIZE * 1.5,  dy: -SIZE / 2,    size: SIZE, material: 'stone' },
      { dx: SIZE * 1.5,  dy: -SIZE * 1.5,  size: SIZE, material: 'stone' },
      { dx: -SIZE,       dy: -SIZE * 2.5,  size: SIZE, material: 'wood' },
      { dx: 0,           dy: -SIZE * 2.5,  size: SIZE, material: 'wood' },
      { dx: SIZE,        dy: -SIZE * 2.5,  size: SIZE, material: 'wood' },
    ],
    ratPositions: [
      { dx: -SIZE,  dy: -SIZE * 3.5 - 8 },
      { dx: 0,      dy: -SIZE * 3.5 - 8 },
      { dx: SIZE,   dy: -SIZE * 3.5 - 8 },
    ],
  },
];

/** Get the breed ability info for a given breed, or a default fallback. */
export function getBreedAbility(breed: string): BreedAbilityInfo {
  return BREED_ABILITIES[breed] ?? BREED_ABILITIES.wildcat;
}

export class PounceScene extends Phaser.Scene {
  jobId = '';
  catId = '';
  catBreed = 'wildcat';
  difficulty = 'easy';
  launches = 0;
  maxLaunches = 5;
  ratsKnocked = 0;
  totalRats = 0;
  finished = false;
  private tutorialShowing = false;
  canLaunch = true;
  private aimLine: Phaser.GameObjects.Graphics | null = null;
  private launchText!: Phaser.GameObjects.Text;
  private abilityHintText!: Phaser.GameObjects.Text;
  ratBodies: MatterJS.BodyType[] = [];
  // Sprite-body pairs synced each frame in update() for smooth rendering
  bodySprites: { body: MatterJS.BodyType; sprite: Phaser.GameObjects.GameObject & { setPosition: (x: number, y: number) => void; setRotation?: (r: number) => void } }[] = [];

  /** The current projectile in flight — null when no shot is active. The
      breed ability fires once on the next tap while this is set. */
  activeProjectile: MatterJS.BodyType | null = null;
  /** True until the breed ability has been triggered for the current shot.
      Each launch gets exactly one ability activation. */
  abilityAvailable = false;
  /** The chosen structure template for this round (set during init). */
  currentStructure!: StructureTemplate;

  constructor() {
    super({
      key: 'PounceScene',
      physics: {
        default: 'matter',
        matter: { gravity: { x: 0, y: 1 }, debug: false },
      },
    });
  }

  init(data: any): void {
    this.jobId = data?.jobId ?? '';
    this.catId = data?.catId ?? '';
    this.catBreed = data?.catBreed ?? 'wildcat';
    this.difficulty = data?.difficulty ?? 'easy';
    this.launches = 0;
    this.ratsKnocked = 0;
    this.finished = false;
    this.canLaunch = true;
    this.ratBodies = [];
    this.bodySprites = [];
    this.activeProjectile = null;
    this.abilityAvailable = false;
    this.maxLaunches = this.difficulty === 'hard' ? 3 : this.difficulty === 'medium' ? 4 : 5;

    const state = getGameState();
    const cat = state?.cats.find((c) => c.id === this.catId);
    // Hunting stat adds trajectory preview
    const hunting = cat?.stats?.hunting ?? 5;
    if (hunting >= 6) this.maxLaunches++;

    // Pick a random structure template — the doc's "authored variety"
    // pillar. Same engineered cascade behavior, different visual identity.
    this.currentStructure = STRUCTURE_TEMPLATES[Math.floor(Math.random() * STRUCTURE_TEMPLATES.length)];
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Tutorial bumped to v2 — breed abilities, materials, and structure
    // templates are all new mechanics returning players should learn.
    const ability = getBreedAbility(this.catBreed);
    if (showMinigameTutorial(this, 'clowder_pounce_tutorial_v2', 'Pounce!',
      `Drag to aim, release to launch!<br><br>
      <strong>Tap mid-flight</strong> to trigger <strong style="color:#dda055">${ability.name}</strong>: ${ability.description}<br><br>
      Knock all the <strong style="color:#cc6666">rats</strong> off their perch — fewer launches = more stars!`,
      () => { this.tutorialShowing = false; }
    )) {
      this.tutorialShowing = true;
    }

    // Job name
    const job = getJob(this.jobId);
    this.add.text(GAME_WIDTH / 2, 30, `${job?.name ?? 'Pounce'} (${this.difficulty})`, {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
    }).setOrigin(0.5);

    // HUD
    this.launchText = this.add.text(20, 55, `Shots: ${this.launches}/${this.maxLaunches}`, {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    });
    // Ability + structure name on the right side of the HUD so the player
    // always knows which power they have and which board they're playing
    this.abilityHintText = this.add.text(GAME_WIDTH - 20, 55, `${this.currentStructure.name} · ${ability.name}`, {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
    }).setOrigin(1, 0);

    // Ground
    const ground = this.matter.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 20, GAME_WIDTH, 40, { isStatic: true });

    // Visual ground
    this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 20, GAME_WIDTH, 40, 0x2a2520);

    // Left wall (so projectiles don't fly off-screen left)
    this.matter.add.rectangle(-10, GAME_HEIGHT / 2, 20, GAME_HEIGHT, { isStatic: true });
    // Right wall
    this.matter.add.rectangle(GAME_WIDTH + 10, GAME_HEIGHT / 2, 20, GAME_HEIGHT, { isStatic: true });

    // Build target structure
    this.buildTarget();

    // Aim line
    this.aimLine = this.add.graphics();

    // Launch cat sprite at launch position
    this.spawnProjectile();

    // Drag to aim
    let dragStart: { x: number; y: number } | null = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canLaunch || this.finished || this.tutorialShowing) return;
      dragStart = { x: pointer.worldX, y: pointer.worldY };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragStart || !this.aimLine || !this.canLaunch) return;
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      this.aimLine.clear();
      this.aimLine.lineStyle(2, 0xdda055, 0.5);
      this.aimLine.lineBetween(LAUNCH_X, LAUNCH_Y, LAUNCH_X + (dragStart.x - wx) * 0.5, LAUNCH_Y + (dragStart.y - wy) * 0.5);
      // Dotted trajectory preview
      const dx = (dragStart.x - wx) * 3;
      const dy = (dragStart.y - wy) * 3;
      this.aimLine.fillStyle(0xdda055, 0.3);
      for (let t = 0; t < 5; t++) {
        const px = LAUNCH_X + dx * t * 0.06;
        const py = LAUNCH_Y + dy * t * 0.06 + 0.5 * 1 * (t * 0.06) * (t * 0.06) * 200;
        this.aimLine.fillCircle(px, py, 2);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.finished || this.tutorialShowing) return;

      // Mid-flight ability tap — if a projectile is in the air and the
      // ability hasn't been used yet, this tap activates the breed power.
      // Doc's #1 implication: same control surface, branching strategy.
      if (this.abilityAvailable && this.activeProjectile && !dragStart) {
        const wx = pointer.worldX;
        const wy = pointer.worldY;
        this.triggerBreedAbility(wx, wy);
        return;
      }

      if (!dragStart || !this.canLaunch) return;
      const wx = pointer.worldX;
      const wy = pointer.worldY;
      const dx = (dragStart.x - wx) * 3;
      const dy = (dragStart.y - wy) * 3;
      dragStart = null;
      this.aimLine?.clear();

      if (Math.sqrt(dx * dx + dy * dy) < 20) return; // too small

      this.launchProjectile(dx, dy);
    });

    // Quit
    this.add.text(GAME_WIDTH - 30, 55, 'Quit', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#8b7355',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      eventBus.emit('navigate', 'TownMapScene');
    });

    // Check for fallen rats periodically
    this.time.addEvent({
      delay: 500,
      callback: () => this.checkFallenRats(),
      loop: true,
    });

    this.events.once('shutdown', () => {
      this.input.off('pointerdown');
      this.input.off('pointermove');
      this.input.off('pointerup');
      this.input.keyboard?.removeAllListeners();
      this.time.removeAllEvents();
      this.tweens.killAll();
      // Clean up Matter.js physics bodies — snapshot the array first because
      // matter.world.remove() mutates the live bodies list and would otherwise
      // skip entries as we iterate.
      const bodies = [...this.matter.world.getAllBodies()];
      for (const body of bodies) {
        this.matter.world.remove(body);
      }
      this.bodySprites = [];
    });

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');
  }

  update(): void {
    // Sync visual sprites to physics bodies every render frame
    for (const pair of this.bodySprites) {
      const pos = pair.body.position;
      if (pos) {
        pair.sprite.setPosition(pos.x, pos.y);
        if (pair.sprite.setRotation) pair.sprite.setRotation(pair.body.angle);
      }
    }

    // Cap velocities to prevent extreme speeds from stacking
    const MAX_VEL = 15;
    const bodies = this.matter.world.getAllBodies();
    for (const body of bodies) {
      if (body.isStatic) continue;
      const v = body.velocity;
      if (Math.abs(v.x) > MAX_VEL || Math.abs(v.y) > MAX_VEL) {
        const clampX = Math.max(-MAX_VEL, Math.min(MAX_VEL, v.x));
        const clampY = Math.max(-MAX_VEL, Math.min(MAX_VEL, v.y));
        this.matter.body.setVelocity(body, { x: clampX, y: clampY });
      }
    }
  }

  private buildTarget(): void {
    const template = this.currentStructure;
    // Cap rat count by structure capacity but respect difficulty as well
    const wantedRats = this.difficulty === 'hard' ? 5 : this.difficulty === 'medium' ? 4 : 3;
    const ratCount = Math.min(wantedRats, template.ratPositions.length);
    this.totalRats = ratCount;

    // Anchor the structure at a random X within the target band
    const stackX = TARGET_X_MIN + Math.random() * (TARGET_X_MAX - TARGET_X_MIN);
    const baseY = GROUND_Y;

    // Build the blocks per the template, with material-specific physics
    // and visuals. Each block stores its material on the Matter body so
    // collision handlers can read it later (e.g. glass shatter feedback).
    for (const block of template.blocks) {
      const mat = MATERIALS[block.material];
      const cx = stackX + block.dx;
      const cy = baseY + block.dy;
      const body = this.matter.add.rectangle(cx, cy, block.size - 2, block.size - 2, {
        restitution: mat.restitution,
        friction: mat.friction,
        density: mat.density,
        label: `block_${block.material}`,
      });
      const vis = this.add.rectangle(cx, cy, block.size - 2, block.size - 2, mat.color)
        .setStrokeStyle(1, mat.borderColor);
      this.bodySprites.push({ body, sprite: vis });
    }

    // Place rats per the template's rat positions, capped by ratCount
    for (let i = 0; i < ratCount; i++) {
      const pos = template.ratPositions[i];
      const rx = stackX + pos.dx;
      const ry = baseY + pos.dy;
      const ratBody = this.matter.add.circle(rx, ry, 8, {
        restitution: 0.3, friction: 0.5, density: 0.002,
        label: 'rat',
      });
      this.ratBodies.push(ratBody);

      // Rat visual — synced to physics body in update()
      if (this.textures.exists('rat')) {
        const ratSprite = this.add.sprite(rx, ry, 'rat');
        ratSprite.setScale(0.6);
        ratSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.bodySprites.push({ body: ratBody, sprite: ratSprite });
      }
    }
  }

  // Live launch-state indicators — set on first spawn, retained for the
  // whole round so the slingshot UI can switch between "ready" and
  // "reloading" without rebuilding the scene. Per user feedback
  // (2026-04-08): "make it more clear to the user when the slingshot
  // is reloaded and ready to fire again."
  private launchIndicator!: Phaser.GameObjects.Arc;
  private launchHaloTween: Phaser.Tweens.Tween | null = null;
  private reloadingText!: Phaser.GameObjects.Text;

  private spawnProjectile(): void {
    // Visual cat at launch position
    const idleKey = `${this.catBreed}_idle_east`;
    if (this.textures.exists(idleKey)) {
      const catVis = this.add.sprite(LAUNCH_X, LAUNCH_Y - 10, idleKey);
      catVis.setScale(0.7);
      catVis.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Launch indicator — pulses when ready, dims to a flat grey when
    // reloading. The pulse tween is killed/restarted by setLaunchReady.
    this.launchIndicator = this.add.circle(LAUNCH_X, LAUNCH_Y, 8, 0xdda055, 0.6)
      .setStrokeStyle(2, 0xc4956a);
    this.reloadingText = this.add.text(LAUNCH_X, LAUNCH_Y + 22, '', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#8b7355',
    }).setOrigin(0.5);
    this.setLaunchReady(true);
  }

  /** Single source of truth for the launch UI state. Toggles the pulse
   *  on the launch circle, sets the reloading label, and updates the
   *  canLaunch flag — kept together so future state changes can't
   *  desync the visual from the gating logic. */
  private setLaunchReady(ready: boolean): void {
    this.canLaunch = ready;
    if (!this.launchIndicator) return;
    if (ready) {
      this.launchIndicator.setFillStyle(0xdda055, 0.6);
      this.launchIndicator.setStrokeStyle(2, 0xc4956a);
      this.reloadingText?.setText('');
      this.launchHaloTween?.stop();
      this.launchIndicator.setScale(1);
      // Brief "ready!" pulse so the player gets a positive cue when
      // the slingshot re-arms — prevents the "I can't tell when it's
      // ready" frustration the user reported.
      this.tweens.add({
        targets: this.launchIndicator,
        scale: 1.4,
        duration: 180,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
      // Then start the slow idle pulse so a stationary slingshot
      // still reads as "live."
      this.launchHaloTween = this.tweens.add({
        targets: this.launchIndicator,
        scale: 1.15,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.launchHaloTween?.stop();
      this.launchHaloTween = null;
      this.launchIndicator.setScale(1);
      this.launchIndicator.setFillStyle(0x3a3530, 0.5);
      this.launchIndicator.setStrokeStyle(2, 0x6b5b3e);
      this.reloadingText?.setText('Reloading...');
    }
  }

  launchProjectile(vx: number, vy: number): void {
    this.setLaunchReady(false);
    this.launches++;
    this.launchText.setText(`Shots: ${this.launches}/${this.maxLaunches}`);

    playSfx('tap', 0.5);
    // Slingshot release — medium thump pairs with the visible launch impulse.
    haptic.medium();

    // Create physics projectile
    const proj = this.matter.add.circle(LAUNCH_X, LAUNCH_Y, 8, {
      restitution: 0.4, friction: 0.3, density: 0.01,
      label: 'cat_projectile',
    });
    this.matter.body.setVelocity(proj, { x: vx * 0.015, y: vy * 0.015 });

    // Track for mid-flight ability — one ability use per launch
    this.activeProjectile = proj;
    this.abilityAvailable = true;

    // Visual for projectile — synced in update()
    const projVis = this.add.circle(LAUNCH_X, LAUNCH_Y, 8, 0xc4956a);
    this.bodySprites.push({ body: proj, sprite: projVis });

    // Wait for physics to settle, then check result. Reload time
    // dropped from 2500 → 1100ms per user feedback (2026-04-10):
    // "make reload time shorter in pounce." The periodic 500ms
    // checkFallenRats already catches slow domino chains that finish
    // after this window, so the post-launch settle wait can be much
    // shorter without missing late wins.
    this.time.delayedCall(1100, () => {
      this.checkFallenRats();
      this.activeProjectile = null;
      this.abilityAvailable = false;

      if (this.ratsKnocked >= this.totalRats) {
        this.winGame();
      } else if (this.launches >= this.maxLaunches) {
        this.loseGame();
      } else {
        this.setLaunchReady(true);
      }
    });
  }

  /** Trigger the active cat's breed ability mid-flight. Each ability
      modifies the active projectile's physics state (velocity, position,
      or spawns satellites). Per the doc's "expressive projectile variety"
      pillar, this is what makes each cat feel meaningfully different.
      Public so the playtest can verify each breed's effect deterministically. */
  triggerBreedAbility(targetX: number, targetY: number): void {
    if (!this.activeProjectile || !this.abilityAvailable) return;
    this.abilityAvailable = false;
    // Every breed ability is a "burst" moment — heavy impact regardless of variant.
    haptic.heavy();
    const proj = this.activeProjectile;
    const ability = getBreedAbility(this.catBreed).ability;
    const v = proj.velocity;

    switch (ability) {
      case 'power_shot': {
        // Boost velocity in the current direction by 1.7x
        this.matter.body.setVelocity(proj, { x: v.x * 1.7, y: v.y * 1.7 });
        playSfx('hiss', 0.4);
        this.cameras.main.flash(80, 220, 170, 90);
        break;
      }
      case 'heavy_drop': {
        // Zero horizontal, instant downward thrust
        this.matter.body.setVelocity(proj, { x: 0, y: 14 });
        playSfx('crate_push', 0.5);
        this.cameras.main.shake(120, 0.008);
        break;
      }
      case 'redirect': {
        // Reorient toward the tap point at the current speed magnitude
        const speed = Math.max(6, Math.sqrt(v.x * v.x + v.y * v.y));
        const dx = targetX - proj.position.x;
        const dy = targetY - proj.position.y;
        const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        this.matter.body.setVelocity(proj, { x: (dx / len) * speed, y: (dy / len) * speed });
        playSfx('tap', 0.4);
        break;
      }
      case 'split': {
        // Spawn two extra projectiles flanking the original one
        for (const offset of [-1, 1]) {
          const sub = this.matter.add.circle(proj.position.x, proj.position.y + offset * 14, 7, {
            restitution: 0.4, friction: 0.3, density: 0.008,
            label: 'cat_projectile',
          });
          this.matter.body.setVelocity(sub, { x: v.x, y: v.y + offset * 1.2 });
          const subVis = this.add.circle(proj.position.x, proj.position.y, 7, 0xaabbcc);
          this.bodySprites.push({ body: sub, sprite: subVis });
        }
        playSfx('sparkle', 0.4);
        break;
      }
      case 'explosion': {
        // Push all nearby non-static bodies outward from the projectile
        const cx = proj.position.x;
        const cy = proj.position.y;
        const radius = 100;
        const force = 12;
        for (const other of this.matter.world.getAllBodies()) {
          if (other === proj || other.isStatic) continue;
          const dx = other.position.x - cx;
          const dy = other.position.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius || dist === 0) continue;
          const falloff = 1 - dist / radius;
          this.matter.body.setVelocity(other, {
            x: other.velocity.x + (dx / dist) * force * falloff,
            y: other.velocity.y + (dy / dist) * force * falloff,
          });
        }
        playSfx('hiss', 0.6);
        this.cameras.main.shake(160, 0.012);
        this.cameras.main.flash(120, 200, 80, 40);
        break;
      }
      case 'speed_dash': {
        // Speed Dash: same direction, larger boost than power_shot
        this.matter.body.setVelocity(proj, { x: v.x * 2.0, y: v.y * 2.0 });
        playSfx('tap', 0.5);
        break;
      }
    }
  }

  private checkFallenRats(): void {
    let knocked = 0;
    // Threshold fix per user feedback (2026-04-10, second pass): "all
    // the rats are on the ground, yet it doesnt register as complete."
    // Phaser/Matter Y increases downward. The static ground top is at
    // GROUND_Y (650). A rat is a circle with radius 8, so when it
    // rests ON TOP of the ground its CENTER is at GROUND_Y - 8 = 642
    // (above the ground top by the radius). The previous threshold
    // `> GROUND_Y - 5` (= 645) required the rat center to be BELOW
    // 645, but a resting rat center sits at 642 (ABOVE 645) — so the
    // check returned false for every successfully knocked rat. The
    // entire fix from the first pass (periodic win check) was correct
    // but the threshold it relied on never actually fired. Now using
    // `> GROUND_Y - 30` (= 620) which is well above any resting rat
    // center (642) but still well below the lowest in-place rat
    // starting position (~570 for the bridge template).
    for (const rat of this.ratBodies) {
      if (rat.position && rat.position.y > GROUND_Y - 30) {
        knocked++;
      }
    }
    this.ratsKnocked = knocked;
    // If every rat has settled on the floor, fire the win — even
    // outside the post-launch settling window. The periodic check
    // (every 500ms throughout the run) closes the gap where slow
    // domino chains finished after the post-launch settle window.
    if (!this.finished && this.totalRats > 0 && this.ratsKnocked >= this.totalRats) {
      this.winGame();
    }
  }

  private winGame(): void {
    if (this.finished) return;
    this.finished = true;
    playSfx('victory');
    haptic.success();

    const stars = this.launches <= 1 ? 3 : this.launches <= 2 ? 2 : 1;

    // Confetti explosion centered on the ground
    if (this.textures.exists('particle_pixel')) {
      const colors = [0xdda055, 0x6abe3f, 0x6b8ea6, 0xc4956a];
      for (let i = 0; i < colors.length; i++) {
        const burst = this.add.particles(GAME_WIDTH / 2, GROUND_Y - 60, 'particle_pixel', {
          speed: { min: 80, max: 260 },
          lifespan: { min: 400, max: 900 },
          scale: { start: 1, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: colors[i],
          angle: { min: -120, max: -60 }, // upward cone
          gravityY: 350,
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        });
        burst.explode(20);
        this.time.delayedCall(1000, () => burst.destroy());
      }
    }

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'All Rats Cleared!', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#c4956a',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      eventBus.emit('puzzle-complete', {
        puzzleId: `pounce_${this.difficulty}`,
        moves: this.launches,
        minMoves: 1,
        stars,
        jobId: this.jobId,
        catId: this.catId,
      });
    });
  }

  private loseGame(): void {
    if (this.finished) return;
    this.finished = true;
    playSfx('fail');
    haptic.error();

    // Out-of-shots banner with an explicit, always-visible "Continue"
    // affordance. Previously the scene only showed a text label and
    // relied on a 1500ms delayed call to navigate back — if anything
    // delayed or cancelled the call (paused scene, dropped event, slow
    // device) the player got stuck staring at "Out of shots!" with no
    // way out. Now any tap on the screen returns to the job flow, and
    // a visible Continue button gives the player a clear target.
    const banner = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 20,
      GAME_WIDTH - 40,
      150,
      0x1a1612,
      0.92,
    ).setStrokeStyle(2, 0x6b5b3e).setDepth(30);
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'Out of shots!', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#cc6666',
    }).setOrigin(0.5).setDepth(31);
    const sub = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, `${this.ratsKnocked}/${this.totalRats} rats knocked`, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
    }).setOrigin(0.5).setDepth(31);
    const continueBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 'Continue', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#c4956a',
      backgroundColor: '#2a2520', padding: { x: 18, y: 8 },
    }).setOrigin(0.5).setDepth(31).setInteractive({ useHandCursor: true });

    let exited = false;
    const exitNow = () => {
      if (exited) return;
      exited = true;
      // In practice mode (Day of Rest), the puzzle-quit handler in
      // main.ts routes back to GuildhallScene + showDayOfRestPanel
      // itself. Emitting 'navigate' to TownMapScene afterwards
      // overrode that route, leaving the player stranded on the town
      // map (or, if the redraw timing was off, on a blank screen).
      // Reported as a bug 2026-04-08. Snapshot isPracticeRun BEFORE
      // emitting puzzle-quit because the handler clears the practice
      // flag inside endPracticeRun() — checking it after the emit
      // would always report false. In normal job mode the navigate is
      // still required because the puzzle-quit handler doesn't switch
      // scenes for normal-mode quits.
      const wasPractice = isPracticeRun();
      eventBus.emit('puzzle-quit', { jobId: this.jobId, catId: this.catId });
      if (!wasPractice) {
        eventBus.emit('navigate', 'TownMapScene');
      }
    };
    continueBtn.on('pointerdown', exitNow);
    // Tap anywhere on the screen also continues — silent escape hatch
    // in case the button itself is hidden behind something the player
    // can't see.
    this.input.once('pointerdown', exitNow);

    // Keep the auto-timer as a backstop in case the player walks away.
    this.time.delayedCall(3000, exitNow);

    void banner; void title; void sub;
  }
}
