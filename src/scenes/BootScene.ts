import Phaser from 'phaser';

import { ALL_BREED_IDS } from '../utils/constants';
const BREEDS_WITH_SPRITES = ALL_BREED_IDS as readonly string[];
const DIRECTIONS = ['south', 'north', 'east', 'west'];
const WALK_FRAMES = 6;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;
    const barW = width * 0.6;
    const barH = 20;
    const barX = (width - barW) / 2;
    const barY = height / 2;

    const title = this.add.text(width / 2, barY - 40, 'Clowder & Crest', {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#c4956a',
    }).setOrigin(0.5);
    const loadText = this.add.text(width / 2, barY + 24, 'Loading...', {
      fontFamily: 'Georgia, serif', fontSize: '12px', color: '#6b5b3e',
    }).setOrigin(0.5);
    const bg = this.add.rectangle(barX + barW / 2, barY, barW, barH, 0x333333);
    const fill = this.add.rectangle(barX, barY, 0, barH, 0xc4956a);
    fill.setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      fill.width = barW * value;
      loadText.setText(`Loading... ${Math.round(value * 100)}%`);
    });

    this.load.on('complete', () => {
      bg.destroy();
      fill.destroy();
      title.destroy();
      loadText.destroy();
    });

    // Handle load errors gracefully — skip missing assets
    let failCount = 0;
    this.load.on('loaderror', (file: { key: string }) => {
      failCount++;
      if (failCount <= 3) {
        loadText.setText(`Loading... (${failCount} asset${failCount > 1 ? 's' : ''} unavailable)`);
      }
    });

    // Load cat sprites
    for (const breed of BREEDS_WITH_SPRITES) {
      // Idle rotations
      for (const dir of DIRECTIONS) {
        this.load.image(`${breed}_idle_${dir}`, `assets/sprites/${breed}/${dir}.png`);
      }
      // Walk animations
      for (const dir of DIRECTIONS) {
        for (let f = 0; f < WALK_FRAMES; f++) {
          const frame = String(f).padStart(3, '0');
          this.load.image(`${breed}_walk_${dir}_${f}`, `assets/sprites/${breed}/walk/${dir}/frame_${frame}.png`);
        }
      }
    }

    // Load interaction animations (wildcat: scratch, sit, eat; all breeds: sleep)
    const wcInteractions = [
      { name: 'scratch', frames: 12 },
      { name: 'sit', frames: 8 },
      { name: 'eat', frames: 7 },
    ];
    for (const anim of wcInteractions) {
      for (let f = 0; f < anim.frames; f++) {
        const frame = String(f).padStart(3, '0');
        this.load.image(`wildcat_${anim.name}_${f}`, `assets/sprites/wildcat/interact/${anim.name}/frame_${frame}.png`);
      }
    }

    // Load sleep animation for all breeds (10 frames each)
    for (const breed of BREEDS_WITH_SPRITES) {
      for (let f = 0; f < 10; f++) {
        const frame = String(f).padStart(3, '0');
        this.load.image(`${breed}_sleep_${f}`, `assets/sprites/${breed}/interact/sleep/frame_${frame}.png`);
      }
    }

    // Load sound effects
    this.load.audio('wildcat_meow', 'assets/audio/wildcat_meow.mp3');
    this.load.audio('wildcat_chirp', 'assets/audio/wildcat_chirp.mp3');
    this.load.audio('sfx_fish_earn', 'assets/sfx/fish_earn.mp3');
    this.load.audio('sfx_block_slide', 'assets/sfx/block_slide.mp3');
    this.load.audio('sfx_purr', 'assets/sfx/purr.mp3');
    this.load.audio('sfx_day_bell', 'assets/sfx/day_bell.mp3');
    this.load.audio('sfx_job_accept', 'assets/sfx/job_accept.mp3');
    this.load.audio('sfx_chapter', 'assets/sfx/chapter_complete.mp3');
    this.load.audio('sfx_tap', 'assets/sfx/ui_tap.mp3');
    this.load.audio('sfx_hiss', 'assets/sfx/cat_hiss.mp3');

    // Load furniture sprites
    const furnitureIds = [
      'straw_bed', 'scratching_post', 'lantern', 'cushioned_basket',
      'bookshelf', 'potted_catnip', 'rug_wool', 'candle_stand',
      'woolen_blanket', 'fish_barrel', 'herb_rack', 'stone_hearth',
      'notice_board', 'saints_icon', 'fish_bone_mobile',
    ];
    for (const id of furnitureIds) {
      this.load.image(`furniture_${id}`, `assets/sprites/furniture/${id}.png`);
    }

    // Load dialogue scene art
    for (const scene of ['guildhall', 'rooftop', 'granary']) {
      this.load.image(`dialogue_${scene}`, `assets/sprites/dialogues/${scene}.png`);
    }

    // Load puzzle block sprites
    for (const block of ['crate', 'barrel', 'flour_sack', 'cart', 'pew']) {
      this.load.image(`block_${block}`, `assets/sprites/blocks/${block}.png`);
    }

    // Load crest logo
    this.load.image('crest', 'assets/sprites/crest.png');

    // Load scene art
    this.load.image('scene_guildhall', 'assets/sprites/scenes/guildhall.png');
    this.load.image('scene_town', 'assets/sprites/scenes/town.png');
    this.load.image('scene_town_day', 'assets/sprites/scenes/town_day.png');
    this.load.image('scene_town_dusk', 'assets/sprites/scenes/town_dusk.png');
    this.load.image('scene_town_plague', 'assets/sprites/scenes/town_plague.png');
    this.load.image('scene_room', 'assets/sprites/scenes/room.png');

    // Placeholder texture for non-sprite breeds
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    this.textures.addCanvas('pixel', canvas);
  }

  create(): void {
    // Create walk animations for each breed/direction
    for (const breed of BREEDS_WITH_SPRITES) {
      for (const dir of DIRECTIONS) {
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let f = 0; f < WALK_FRAMES; f++) {
          frames.push({ key: `${breed}_walk_${dir}_${f}` });
        }
        this.anims.create({
          key: `${breed}_walk_${dir}`,
          frames,
          frameRate: 8,
          repeat: -1,
        });
      }
    }

    // Create interaction animations
    for (const { name, frames } of [
      { name: 'scratch', frames: 12 },
      { name: 'sit', frames: 8 },
      { name: 'eat', frames: 7 },
    ]) {
      const animFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let f = 0; f < frames; f++) {
        animFrames.push({ key: `wildcat_${name}_${f}` });
      }
      this.anims.create({
        key: `wildcat_${name}`,
        frames: animFrames,
        frameRate: 6,
        repeat: 0,
      });
    }

    // Create sleep animations for all breeds
    for (const breed of BREEDS_WITH_SPRITES) {
      const sleepFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let f = 0; f < 10; f++) {
        sleepFrames.push({ key: `${breed}_sleep_${f}` });
      }
      this.anims.create({
        key: `${breed}_sleep`,
        frames: sleepFrames,
        frameRate: 4,
        repeat: -1, // loop — cat sleeps until disturbed
      });
    }

    this.scene.start('TitleScene');
  }
}
