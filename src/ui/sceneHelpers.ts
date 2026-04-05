/**
 * Shared helpers for Phaser scenes — buttons, d-pads, tutorials.
 * Eliminates duplication across minigame scenes.
 */
import Phaser from 'phaser';

// ── Styled Button ──

export function createSceneButton(
  scene: Phaser.Scene,
  x: number, y: number,
  label: string,
  onClick: () => void,
  width = 120, height = 36,
): void {
  const bg = scene.add.rectangle(x, y, width, height, 0x2a2520);
  bg.setStrokeStyle(1, 0x6b5b3e);
  bg.setInteractive({ useHandCursor: true });
  const text = scene.add.text(x, y, label, {
    fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c4956a',
  }).setOrigin(0.5);
  bg.on('pointerover', () => { bg.setFillStyle(0x3a3530); text.setColor('#ddb87a'); });
  bg.on('pointerout', () => { bg.setFillStyle(0x2a2520); text.setColor('#c4956a'); });
  bg.on('pointerdown', onClick);
}

// ── D-Pad ──

export interface DpadConfig {
  x: number;
  y: number;
  size?: number;
  gap?: number;
  onDirection: (dx: number, dy: number) => void;
  /** If true, holding a direction repeats the callback */
  holdRepeat?: boolean;
  /** Repeat interval in ms (default 180) */
  repeatInterval?: number;
}

export function createDpad(scene: Phaser.Scene, config: DpadConfig): void {
  const { x, y, onDirection, holdRepeat = false, repeatInterval = 180 } = config;
  const size = config.size ?? 40;
  const gap = config.gap ?? 4;

  let holdTimer: Phaser.Time.TimerEvent | null = null;

  const makeArrow = (ax: number, ay: number, dx: number, dy: number, label: string) => {
    const btn = scene.add.rectangle(ax, ay, size, size, 0x2a2520, 0.8);
    btn.setStrokeStyle(1, 0x6b5b3e);
    btn.setInteractive({ useHandCursor: true });
    scene.add.text(ax, ay, label, { fontSize: '18px', color: '#c4956a' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      onDirection(dx, dy);
      if (holdRepeat) {
        holdTimer?.destroy();
        holdTimer = scene.time.addEvent({
          delay: repeatInterval,
          callback: () => onDirection(dx, dy),
          loop: true,
        });
      }
    });
    if (holdRepeat) {
      btn.on('pointerup', () => holdTimer?.destroy());
      btn.on('pointerout', () => holdTimer?.destroy());
    }
  };

  makeArrow(x, y - size - gap, 0, -1, '\u25B2'); // Up
  makeArrow(x, y + size + gap, 0, 1, '\u25BC');   // Down
  makeArrow(x - size - gap, y, -1, 0, '\u25C0');   // Left
  makeArrow(x + size + gap, y, 1, 0, '\u25B6');    // Right
}

// ── Tutorial Overlay ──

export function showMinigameTutorial(
  scene: Phaser.Scene,
  storageKey: string,
  title: string,
  body: string,
  onDismiss?: () => void,
): boolean {
  if (localStorage.getItem(storageKey)) return false;
  localStorage.setItem(storageKey, '1');

  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
  t.innerHTML = `
    <div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:12px">${title}</div>
    <div style="color:#8b7355;font-family:Georgia,serif;font-size:14px;text-align:center;max-width:300px;line-height:1.6">${body}</div>
    <div style="color:#6b5b3e;font-family:Georgia,serif;font-size:12px;margin-top:20px">Tap to start</div>
  `;
  t.addEventListener('click', () => {
    t.remove();
    onDismiss?.();
  });
  document.body.appendChild(t);
  return true;
}
