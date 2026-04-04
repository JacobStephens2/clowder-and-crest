import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // No external assets to load for MVP — using generated graphics
    // Show a loading bar
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

    // Load a placeholder 1x1 pixel so the loader runs
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    this.textures.addCanvas('pixel', canvas);
  }

  create(): void {
    this.scene.start('TitleScene');
  }
}
