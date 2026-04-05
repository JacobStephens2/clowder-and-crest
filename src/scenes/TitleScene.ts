import Phaser from 'phaser';
import { hasSave, loadGame, saveGame, getSlotSummary, loadFromSlot, saveToSlot, deleteSlot } from '../systems/SaveManager';
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

    // Crest logo
    if (this.textures.exists('crest')) {
      const crest = this.add.sprite(cx, 115, 'crest');
      crest.setScale(0.7);
      crest.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      crest.setAlpha(0);
      this.tweens.add({ targets: crest, alpha: 0.9, duration: 1500, ease: 'Sine.easeIn' });
    }

    // Title
    const title1 = this.add.text(cx, 185, 'Clowder', {
      fontFamily: 'Georgia, serif',
      fontSize: '48px',
      color: '#c4956a',
    }).setOrigin(0.5).setAlpha(0);

    const title2 = this.add.text(cx, 240, '& Crest', {
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
    line.lineBetween(cx - 80, 270, cx + 80, 270);

    this.add.text(cx, 288, 'A Cat Guild Management Game', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#6b5b3e',
    }).setOrigin(0.5);

    this.add.text(cx, 315, 'Recruit cats. Take jobs. Solve puzzles.\nBuild your guild from rags to riches.', {
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

    // Save slots
    const btnY = 470;
    const hasLegacy = hasSave();

    // Migrate legacy save to slot 1 if needed
    if (hasLegacy && !getSlotSummary(1)) {
      const legacy = loadGame();
      if (legacy) saveToSlot(1, legacy);
    }

    const anySlotUsed = [1, 2, 3].some((s) => getSlotSummary(s) !== null);

    if (anySlotUsed) {
      this.createButton(cx, btnY, 'Continue', () => {
        this.showSlotPicker('load');
      });
      this.createButton(cx, btnY + 50, 'New Game', () => {
        this.showSlotPicker('new');
      });
    } else {
      this.createButton(cx, btnY, 'New Game', () => {
        eventBus.emit('show-name-prompt', { slot: 1 });
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

  private showSlotPicker(mode: 'load' | 'new'): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

    const title = mode === 'load' ? 'Choose a Save' : 'Choose a Slot';
    let html = `<div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:20px">${title}</div>`;

    for (let slot = 1; slot <= 3; slot++) {
      const summary = getSlotSummary(slot);
      if (summary) {
        const label = `Slot ${slot}: ${summary.name} — Day ${summary.day}, Ch.${summary.chapter}, ${summary.cats} cats`;
        html += `<button class="slot-btn" data-slot="${slot}" style="display:block;width:300px;padding:12px;margin:6px 0;background:#2a2520;border:1px solid #6b5b3e;border-radius:6px;color:#c4956a;font-family:Georgia,serif;font-size:13px;cursor:pointer;text-align:left">${label}</button>`;
        if (mode === 'new') {
          html += `<button class="slot-del" data-slot="${slot}" style="display:block;width:300px;padding:4px;margin:0 0 8px 0;background:none;border:none;color:#8b4444;font-family:Georgia,serif;font-size:10px;cursor:pointer;text-align:center">Delete this save</button>`;
        }
      } else {
        if (mode === 'new') {
          html += `<button class="slot-btn" data-slot="${slot}" style="display:block;width:300px;padding:12px;margin:6px 0;background:#2a2520;border:1px dashed #3a3530;border-radius:6px;color:#6b5b3e;font-family:Georgia,serif;font-size:13px;cursor:pointer;text-align:left">Slot ${slot}: Empty</button>`;
        } else {
          html += `<div style="width:300px;padding:12px;margin:6px 0;color:#3a3530;font-family:Georgia,serif;font-size:13px;text-align:left">Slot ${slot}: Empty</div>`;
        }
      }
    }

    html += `<button id="slot-cancel" style="margin-top:16px;padding:8px 24px;background:none;border:1px solid #3a3530;border-radius:4px;color:#6b5b3e;font-family:Georgia,serif;font-size:13px;cursor:pointer">Cancel</button>`;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = parseInt((btn as HTMLElement).dataset.slot!, 10);
        overlay.remove();
        if (mode === 'load') {
          const save = loadFromSlot(slot);
          if (save) {
            // Also write to default slot for auto-save compatibility
            saveGame(save);
            eventBus.emit('game-loaded', save);
            eventBus.emit('active-slot', slot);
            eventBus.emit('navigate', 'GuildhallScene');
          }
        } else {
          const existing = getSlotSummary(slot);
          if (existing) {
            if (!confirm(`Overwrite "${existing.name}"'s save?`)) return;
            deleteSlot(slot);
          }
          eventBus.emit('show-name-prompt', { slot });
        }
      });
    });

    overlay.querySelectorAll('.slot-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = parseInt((btn as HTMLElement).dataset.slot!, 10);
        const summary = getSlotSummary(slot);
        if (summary && confirm(`Delete "${summary.name}"'s save? This cannot be undone.`)) {
          deleteSlot(slot);
          overlay.remove();
          this.showSlotPicker(mode);
        }
      });
    });

    document.getElementById('slot-cancel')!.addEventListener('click', () => overlay.remove());
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
