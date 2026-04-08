import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { playSfx } from '../systems/SfxManager';

// Building interior scene — a single scene that renders the inside
// of any town-map building based on the buildingId passed in init
// data. Per user feedback (2026-04-08): "make each building on the
// map a place the player can enter to view a new scene that is
// inside that building." This is the v1 implementation: themed
// background tint, building name, short prose description, optional
// "Start accepted job" affordance, and an Exit button that walks
// the player back to the town map.
//
// Future iterations can expand any single building into its own
// dedicated scene class — the routing in TownMapScene.enterBuilding
// can dispatch to the more specific scene before falling through to
// this generic one.

interface BuildingDescription {
  title: string;
  prose: string;
  bgColor: number;
  accentColor: number;
}

const BUILDING_INTERIORS: Record<string, BuildingDescription> = {
  cathedral: {
    title: 'The Cathedral',
    prose: 'Stone arches lift toward shadow. Candles gutter in iron sconces. The pews are cool, the air is older than memory, and a cat could nap behind the altar for a week before anyone noticed.',
    bgColor: 0x1a1820,
    accentColor: 0xbfa8d8,
  },
  castle: {
    title: 'The Castle Hall',
    prose: 'Tapestries hang heavy along the walls. Footsteps ring on slate. Guards nod as you slip past — most of them know whose hall this really is, even if the lord doesn\u2019t.',
    bgColor: 0x1c1a18,
    accentColor: 0xc4956a,
  },
  tavern: {
    title: 'The Tavern',
    prose: 'Hearth-smoke and stew. A bard fingers a cittern in the corner. Travelers leave fish scraps on the floor and gossip leaks from every booth — the kind of place where a watchful cat learns the shape of the town.',
    bgColor: 0x201810,
    accentColor: 0xdda055,
  },
  market: {
    title: 'The Market Stalls',
    prose: 'Crates of spice, sacks of grain, baskets of fish on ice. Merchants haggle in three languages. Climb a roof beam and the whole town opens up below you.',
    bgColor: 0x1a1c14,
    accentColor: 0xddc878,
  },
  docks: {
    title: 'The Docks',
    prose: 'Salt air. Nets drying on weathered posts. Gulls argue over scraps the fishermen toss aside. The patient cat eats well here — and learns which boats come back light, and which come back heavy.',
    bgColor: 0x141a20,
    accentColor: 0x8bb3d8,
  },
  mill: {
    title: 'The Mill',
    prose: 'The great wheel grinds slow against the stream. Flour dust hangs in the slanting light. Mice live in the walls and know — every one of them — to fear the patrol cats who hunt this floor.',
    bgColor: 0x1a1814,
    accentColor: 0xc4a878,
  },
};

export class BuildingInteriorScene extends Phaser.Scene {
  private buildingId = '';

  constructor() {
    super({ key: 'BuildingInteriorScene' });
  }

  init(data: { buildingId?: string }): void {
    this.buildingId = data?.buildingId ?? 'cathedral';
  }

  create(): void {
    const interior = BUILDING_INTERIORS[this.buildingId] ?? BUILDING_INTERIORS.cathedral;

    this.cameras.main.setBackgroundColor(interior.bgColor);
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.cameras.main.fadeIn(280, 10, 9, 8);

    // Soft vignette via concentric translucent ovals — sells the
    // "you are inside a stone room" feel without needing per-building
    // sprite art. Future iterations can replace this with a real
    // background image per building.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.ellipse(cx, cy, GAME_WIDTH * 1.4, GAME_HEIGHT * 1.4, 0x000000, 0.35);
    this.add.ellipse(cx, cy, GAME_WIDTH * 0.85, GAME_HEIGHT * 0.85, interior.bgColor, 0.4);

    // Drifting dust motes — same atmosphere trick the guildhall and
    // room scenes use, scaled to the interior color palette.
    for (let i = 0; i < 8; i++) {
      const mote = this.add.circle(
        Math.random() * GAME_WIDTH,
        100 + Math.random() * 500,
        1 + Math.random(),
        interior.accentColor,
        0.12 + Math.random() * 0.08,
      );
      this.tweens.add({
        targets: mote,
        x: mote.x + 20 + Math.random() * 40,
        y: mote.y - 8 + Math.random() * 18,
        alpha: 0,
        duration: 4000 + Math.random() * 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Title
    this.add.text(cx, 110, interior.title, {
      fontFamily: 'Georgia, serif',
      fontSize: '24px',
      color: '#c4956a',
    }).setOrigin(0.5);
    this.add.rectangle(cx, 138, 200, 1, 0x6b5b3e, 0.6);

    // Prose body — wrapped, italic, accent-tinted to match the room.
    this.add.text(cx, 230, interior.prose, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#bfa688',
      align: 'center',
      wordWrap: { width: GAME_WIDTH - 60 },
      lineSpacing: 4,
    }).setOrigin(0.5, 0);

    // Exit button — returns to the town map. Tap-anywhere also exits
    // so the player has a low-friction escape from any spot on screen.
    const exitY = GAME_HEIGHT - 90;
    const exitBg = this.add.rectangle(cx, exitY, 180, 44, 0x2a2520, 0.95)
      .setStrokeStyle(2, 0x6b5b3e);
    this.add.text(cx, exitY, 'Step back outside', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#c4956a',
    }).setOrigin(0.5);
    exitBg.setInteractive({ useHandCursor: true });
    exitBg.on('pointerdown', () => this.exit());

    // Tap anywhere on the upper portion of the screen also exits —
    // for players who don't think to look for a button. Excludes the
    // text area so they can read without dismissing.
    const tapZone = this.add.zone(cx, GAME_HEIGHT - 30, GAME_WIDTH, 60).setOrigin(0.5);
    tapZone.setInteractive();
    tapZone.on('pointerdown', () => this.exit());

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');

    this.events.once('shutdown', () => {
      this.tweens.killAll();
      this.input.removeAllListeners();
    });
  }

  private exit(): void {
    playSfx('tap', 0.3);
    eventBus.emit('navigate', 'TownMapScene');
  }
}
