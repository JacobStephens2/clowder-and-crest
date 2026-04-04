import Phaser from 'phaser';
import { hasSave, loadGame } from '../systems/SaveManager';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Rain particles (subtle lines falling)
    const rainGfx = this.add.graphics();
    const rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
    for (let i = 0; i < 40; i++) {
      rainDrops.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        speed: 2 + Math.random() * 3,
        len: 6 + Math.random() * 10,
      });
    }

    this.events.on('update', () => {
      rainGfx.clear();
      rainGfx.lineStyle(1, 0x4a4a4a, 0.15);
      for (const drop of rainDrops) {
        drop.y += drop.speed;
        if (drop.y > GAME_HEIGHT) {
          drop.y = -drop.len;
          drop.x = Math.random() * GAME_WIDTH;
        }
        rainGfx.lineBetween(drop.x, drop.y, drop.x - 1, drop.y + drop.len);
      }
    });

    // Vignette overlay
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.3);
    vignette.fillRect(0, 0, GAME_WIDTH, 60);
    vignette.fillRect(0, GAME_HEIGHT - 60, GAME_WIDTH, 60);

    // Title
    const title1 = this.add.text(cx, 175, 'Clowder', {
      fontFamily: 'Georgia, serif',
      fontSize: '48px',
      color: '#c4956a',
    }).setOrigin(0.5).setAlpha(0);

    const title2 = this.add.text(cx, 230, '& Crest', {
      fontFamily: 'Georgia, serif',
      fontSize: '32px',
      color: '#8b7355',
    }).setOrigin(0.5).setAlpha(0);

    // Fade in titles
    this.tweens.add({ targets: title1, alpha: 1, duration: 1200, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: title2, alpha: 1, duration: 1200, delay: 400, ease: 'Sine.easeIn' });

    // Decorative line
    const line = this.add.graphics();
    line.lineStyle(1, 0x6b5b3e, 0.6);
    line.lineBetween(cx - 80, 260, cx + 80, 260);

    this.add.text(cx, 278, 'A Cat Guild Management Game', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#6b5b3e',
    }).setOrigin(0.5);

    this.add.text(cx, 305, 'Recruit cats. Take jobs. Solve puzzles.\nBuild your guild from rags to riches.', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#555',
      align: 'center',
    }).setOrigin(0.5);

    // Stone wall
    const wallGfx = this.add.graphics();
    wallGfx.fillStyle(0x2a2620, 0.8);
    wallGfx.fillRect(cx - 60, 405, 120, 20);
    wallGfx.lineStyle(1, 0x3a3530, 0.5);
    wallGfx.lineBetween(cx - 60, 405, cx + 60, 405);

    // Pixel art cat sitting on wall
    const catSprite = this.add.sprite(cx, 382, 'wildcat_idle_south');
    catSprite.setScale(3);
    // Crisp pixel scaling
    catSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Gentle idle bob
    this.tweens.add({
      targets: catSprite,
      y: catSprite.y - 2,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Buttons
    const btnY = 480;
    const hasExisting = hasSave();

    if (hasExisting) {
      this.createButton(cx, btnY, 'Continue', () => {
        const save = loadGame()!;
        eventBus.emit('game-loaded', save);
        eventBus.emit('navigate', 'GuildhallScene');
      });
      this.createButton(cx, btnY + 60, 'New Game', () => {
        eventBus.emit('show-name-prompt');
      });
    } else {
      this.createButton(cx, btnY, 'New Game', () => {
        eventBus.emit('show-name-prompt');
      });
    }

    // Credits
    this.add.text(cx, GAME_HEIGHT - 85, 'A game about cats, saints, and rats', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#444',
    }).setOrigin(0.5);

    // Hide overlays on title
    eventBus.emit('hide-ui');
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 200, 44, 0x2a2520, 0.9);
    bg.setStrokeStyle(1, 0x6b5b3e);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#c4956a',
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x3a3530, 0.9);
      text.setColor('#ddb87a');
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x2a2520, 0.9);
      text.setColor('#c4956a');
    });
    bg.on('pointerdown', onClick);
  }
}
