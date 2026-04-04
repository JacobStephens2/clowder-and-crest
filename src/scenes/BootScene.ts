import Phaser from 'phaser';

const BREEDS_WITH_SPRITES = ['wildcat', 'russian_blue', 'tuxedo', 'maine_coon', 'siamese'];
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

    const bg = this.add.rectangle(barX + barW / 2, barY, barW, barH, 0x333333);
    const fill = this.add.rectangle(barX, barY, 0, barH, 0xc4956a);
    fill.setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      fill.width = barW * value;
    });

    this.load.on('complete', () => {
      bg.destroy();
      fill.destroy();
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

    this.scene.start('TitleScene');
  }
}
