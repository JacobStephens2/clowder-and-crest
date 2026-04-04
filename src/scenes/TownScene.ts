import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

export class TownScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TownScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');

    // Townscape background (Phaser canvas)
    this.drawTownscape();

    // Town UI is rendered as HTML overlay
    eventBus.emit('show-town-overlay');
  }

  private drawTownscape(): void {
    const gfx = this.add.graphics();

    // Sky gradient (very dark)
    gfx.fillStyle(0x1a1918);
    gfx.fillRect(0, 0, GAME_WIDTH, 250);

    // Stars
    for (let i = 0; i < 15; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = 10 + Math.random() * 100;
      gfx.fillStyle(0xccccaa, 0.2 + Math.random() * 0.3);
      gfx.fillCircle(sx, sy, 1);
    }

    // Moon
    gfx.fillStyle(0xddd8c0, 0.15);
    gfx.fillCircle(320, 40, 18);
    gfx.fillStyle(0xddd8c0, 0.08);
    gfx.fillCircle(320, 40, 28);

    // Ground
    gfx.fillStyle(0x222018);
    gfx.fillRect(0, 195, GAME_WIDTH, 55);
    // Cobblestones hint
    gfx.lineStyle(1, 0x2a2820, 0.4);
    for (let x = 0; x < GAME_WIDTH; x += 20) {
      gfx.lineBetween(x, 195, x + 10, 250);
    }

    // Church
    gfx.fillStyle(0x282622);
    gfx.fillRect(15, 110, 55, 140);
    gfx.fillTriangle(15, 110, 42, 65, 70, 110);
    // Steeple
    gfx.fillRect(38, 50, 8, 20);
    // Cross
    gfx.fillStyle(0x6b5b3e, 0.7);
    gfx.fillRect(40, 40, 4, 14);
    gfx.fillRect(35, 46, 14, 3);
    // Window
    gfx.fillStyle(0x6b5b3e, 0.15);
    gfx.fillRect(32, 130, 16, 25);
    gfx.fillStyle(0x6b5b3e, 0.08);
    gfx.fillRect(33, 130, 14, 2);
    gfx.fillRect(39, 130, 2, 25);

    // Grain Market
    gfx.fillStyle(0x2a2620);
    gfx.fillRect(95, 140, 80, 110);
    // Awning
    gfx.fillStyle(0x3a2e28);
    gfx.fillRect(90, 130, 90, 14);
    // Sign
    gfx.fillStyle(0x3a3530);
    gfx.fillRect(115, 120, 40, 12);
    gfx.fillStyle(0x6b5b3e, 0.4);
    this.add.text(135, 124, 'GRAIN', {
      fontFamily: 'Georgia, serif',
      fontSize: '7px',
      color: '#6b5b3e',
    }).setOrigin(0.5);
    // Door
    gfx.fillStyle(0x1a1818);
    gfx.fillRect(120, 195, 22, 30);
    // Crates
    gfx.fillStyle(0x4a3a28);
    gfx.fillRect(150, 205, 15, 12);
    gfx.fillRect(148, 215, 18, 10);

    // Tavern
    gfx.fillStyle(0x2a2420);
    gfx.fillRect(205, 130, 70, 120);
    // Roof
    gfx.fillStyle(0x3a2a22);
    gfx.fillTriangle(200, 130, 240, 105, 280, 130);
    // Windows with warm glow
    gfx.fillStyle(0x8a6a3a, 0.2);
    gfx.fillRect(218, 150, 14, 14);
    gfx.fillRect(248, 150, 14, 14);
    // Window glow
    gfx.fillStyle(0xdda055, 0.06);
    gfx.fillCircle(225, 157, 20);
    gfx.fillCircle(255, 157, 20);
    // Door
    gfx.fillStyle(0x1a1818);
    gfx.fillRect(232, 195, 18, 30);

    // Tower / Granary
    gfx.fillStyle(0x262420);
    gfx.fillRect(305, 150, 45, 100);
    gfx.fillTriangle(305, 150, 327, 125, 350, 150);

    // Mist layer
    for (let i = 0; i < 6; i++) {
      const mx = i * 70 + Math.random() * 30;
      gfx.fillStyle(0x1c1b19, 0.3);
      gfx.fillEllipse(mx, 200 + Math.random() * 20, 60 + Math.random() * 30, 10);
    }
  }
}
