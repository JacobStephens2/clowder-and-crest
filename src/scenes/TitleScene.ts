import Phaser from 'phaser';
import { hasSave, loadGame, saveGame, getSlotSummary, loadFromSlot, saveToSlot, deleteSlot, pruneExpiredBackups, getRecentBackup, restoreBackup, validateAndSanitizeSave } from '../systems/SaveManager';
import { switchToTrackset } from '../systems/MusicManager';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';
import { esc } from '../utils/helpers';
import { isNative, readAutoSnapshot } from '../systems/NativeFeatures';
import { enterShowcase, isShowcaseUrlRequested, showTitleScreenDayOfRest, consumePendingTitleDayOfRestReopen } from '../systems/Showcase';
import { showDayOfRestPanel } from '../ui/DayOfRestPanel';
import { showToast as renderToast } from '../ui/feedback';

export class TitleScene extends Phaser.Scene {
  private rainGfx: Phaser.GameObjects.Graphics | null = null;
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];

  constructor() {
    super({ key: 'TitleScene' });
  }

  update(): void {
    if (!this.rainGfx) return;
    this.rainGfx.clear();
    this.rainGfx.lineStyle(1, 0x4a4a4a, 0.15);
    for (const drop of this.rainDrops) {
      drop.y += drop.speed;
      if (drop.y > GAME_HEIGHT) {
        drop.y = -drop.len;
        drop.x = Math.random() * GAME_WIDTH;
      }
      this.rainGfx.lineBetween(drop.x, drop.y, drop.x - 1, drop.y + drop.len);
    }
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    // Showcase entry via `?showcase=1` URL parameter — used by portfolio
    // reviewers visiting the web build. Bypass the title screen entirely
    // and drop the user straight into the demo save. Native APK launches
    // can't easily pass URL params so the equivalent there is the 5-tap
    // crest gesture wired up below.
    if (isShowcaseUrlRequested()) {
      const overlayLayer = document.getElementById('overlay-layer');
      const toast = (msg: string) => { if (overlayLayer) renderToast(overlayLayer, msg); };
      enterShowcase(toast);
      return;
    }

    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Switch to the title screen's dedicated trackset (Title Screen 1/2 —
    // "Guild Motif"). The shared-leitmotif music identifies the title
    // screen as a distinct moment from the gameplay ambient pool.
    switchToTrackset('title');

    // Rain particles (subtle lines falling). Animated in update() — using
    // events.on('update') leaks listeners past scene shutdown.
    this.rainGfx = this.add.graphics();
    this.rainDrops = [];
    for (let i = 0; i < 40; i++) {
      this.rainDrops.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        speed: 2 + Math.random() * 3,
        len: 6 + Math.random() * 10,
      });
    }

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

      // Hidden showcase gesture: five quick taps on the crest loads the
      // bundled demo save. Mirrors the URL parameter path above for the
      // native APK, which has no convenient way to pass URL parameters.
      // Reset the counter if the player pauses for more than 1.2s
      // between taps so accidental brushing of the logo never trips it.
      let crestTapCount = 0;
      let crestTapResetTimer: Phaser.Time.TimerEvent | null = null;
      crest.setInteractive({ useHandCursor: false });
      crest.on('pointerdown', () => {
        crestTapCount++;
        crestTapResetTimer?.remove();
        crestTapResetTimer = this.time.delayedCall(1200, () => {
          crestTapCount = 0;
        });
        if (crestTapCount >= 5) {
          crestTapCount = 0;
          crestTapResetTimer?.remove();
          crestTapResetTimer = null;
          const overlayLayer = document.getElementById('overlay-layer');
          const toast = (msg: string) => { if (overlayLayer) renderToast(overlayLayer, msg); };
          enterShowcase(toast);
        }
      });
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

    // Pixel art cat sitting on wall — only show breeds the player has
    // actually recruited across their saves (per user feedback
    // 2026-04-08: "Only show cats on the main title screen that have
    // been recruited in saves. If there are no save, show the wildcat
    // only."). The wildcat is always available since the player IS one.
    const recruitedBreeds = new Set<string>(['wildcat']);
    for (const slot of [1, 2, 3] as const) {
      try {
        const save = loadFromSlot(slot);
        if (!save) continue;
        for (const cat of save.cats) recruitedBreeds.add(cat.breed);
      } catch {
        // Ignore corrupt slot — wildcat fallback covers it
      }
    }
    const breeds = Array.from(recruitedBreeds);
    const dirs = ['south', 'east', 'west'];
    const titleBreed = breeds[Math.floor(Math.random() * breeds.length)];
    const titleDir = dirs[Math.floor(Math.random() * dirs.length)];
    const titleKey = `${titleBreed}_idle_${titleDir}`;
    const catKey = this.textures.exists(titleKey) ? titleKey : 'wildcat_idle_south';
    const catSprite = this.add.sprite(cx, 382, catKey);
    catSprite.setScale(3);
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

    // Occasionally switch to a walk animation then back to idle
    this.time.addEvent({
      delay: 5000 + Math.random() * 5000,
      callback: () => {
        if (!catSprite.active) return;
        const walkDir = dirs[Math.floor(Math.random() * dirs.length)];
        const walkKey = `${titleBreed}_walk_${walkDir}`;
        if (this.anims.exists(walkKey)) {
          catSprite.play(walkKey);
          this.time.delayedCall(1500, () => {
            if (!catSprite.active) return;
            const idleDir = `${titleBreed}_idle_${walkDir}`;
            if (this.textures.exists(idleDir)) {
              catSprite.stop();
              catSprite.setTexture(idleDir);
            }
          });
        }
      },
      loop: true,
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

    // Day of Rest button is always shown — pre-save activity that
    // browses the full minigame catalogue without committing to a
    // campaign run. Spoiler-warned. Per user feedback (2026-04-09):
    // moved here from the in-game menu.
    const dayOfRestY = anySlotUsed ? btnY + 100 : btnY + 50;
    const showToastFn = (msg: string) => {
      const overlayLayer = document.getElementById('overlay-layer');
      if (overlayLayer) renderToast(overlayLayer, msg);
    };

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

      // Post-reinstall recovery: if no localStorage saves exist but a
      // Capacitor Filesystem auto-snapshot is sitting in Documents, offer
      // to restore it. Async — the check resolves a few hundred ms after
      // the title finishes painting and a "Restore from Backup" button
      // appears above New Game when the snapshot is found.
      if (isNative()) {
        readAutoSnapshot().then((snapshot) => {
          if (!snapshot) return;
          let parsed: ReturnType<typeof validateAndSanitizeSave>;
          try {
            parsed = validateAndSanitizeSave(JSON.parse(snapshot));
          } catch {
            return;
          }
          if (!parsed) return;
          // Render a green "restore" button above the New Game button.
          // Phaser createButton handles the styling.
          this.createButton(cx, btnY - 60, `\u21BA Restore Save (Day ${parsed.day}, Ch.${parsed.chapter})`, () => {
            saveToSlot(1, parsed!);
            saveGame(parsed!);
            eventBus.emit('game-loaded', parsed);
            eventBus.emit('active-slot', 1);
            eventBus.emit('navigate', 'GuildhallScene');
          });
        });
      }
    }

    // Day of Rest entry — sits below the save buttons. Tinted purple
    // to match the in-game "rest day" entry. Tap → spoiler warning →
    // confirm → loads transient demo save + opens the catalogue.
    this.createButton(cx, dayOfRestY, 'Day of Rest', () => {
      showTitleScreenDayOfRest(showToastFn);
    }, { tint: 'purple' });

    // Credits
    this.add.text(cx, GAME_HEIGHT - 85, 'A game about cats, saints, and rats', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#444',
    }).setOrigin(0.5);

    // Hide overlays on title
    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.rainGfx = null;
      this.rainDrops = [];
    });

    eventBus.emit('hide-ui');

    // If the player just finished a title-screen Day of Rest practice
    // run, the puzzle-complete handler in main.ts set this flag and
    // re-stubbed gameState before navigating here. Re-open the
    // catalogue immediately. This bypasses the setTimeout race that
    // previously left the player on a blank screen — particularly
    // after Pounce, where Matter physics teardown takes longer than
    // an Arcade scene shutdown. Per user feedback (2026-04-10).
    if (consumePendingTitleDayOfRestReopen()) {
      // One animation frame so TitleScene's first paint completes
      // before the panel slides on top of it.
      this.time.delayedCall(50, () => {
        showDayOfRestPanel(true);
      });
    }
  }

  private showSlotPicker(mode: 'load' | 'new'): void {
    const overlay = document.createElement('div');
    // Near-solid backdrop + blur so the title scene behind doesn't bleed through.
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(12,10,8,0.97);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

    const title = mode === 'load' ? 'Choose a Save' : 'Choose a Slot';
    let html = `<div style="color:#c4956a;font-family:Georgia,serif;font-size:22px;margin-bottom:20px">${title}</div>`;

    // Prune any backups older than the 48h retention window before we
    // surface the recovery option below.
    pruneExpiredBackups();

    for (let slot = 1; slot <= 3; slot++) {
      const summary = getSlotSummary(slot);
      if (summary) {
        const label = `Slot ${slot}: ${esc(summary.name)} — Day ${summary.day}, Ch.${summary.chapter}, ${summary.cats} cats`;
        html += `<button class="slot-btn" data-slot="${slot}" style="display:block;width:300px;padding:12px;margin:6px 0;background:#2a2520;border:1px solid #6b5b3e;border-radius:6px;color:#c4956a;font-family:Georgia,serif;font-size:13px;cursor:pointer;text-align:left">${label}</button>`;
        if (mode === 'new') {
          html += `<button class="slot-del" data-slot="${slot}" style="display:block;width:300px;padding:4px;margin:0 0 8px 0;background:none;border:none;color:#8b4444;font-family:Georgia,serif;font-size:10px;cursor:pointer;text-align:center">Delete this save</button>`;
        }
      } else {
        if (mode === 'new') {
          html += `<button class="slot-btn" data-slot="${slot}" style="display:block;width:300px;padding:12px;margin:6px 0;background:#1a1614;border:1px dashed #3a3530;border-radius:6px;color:#6b5b3e;font-family:Georgia,serif;font-size:13px;cursor:pointer;text-align:left">Slot ${slot}: Empty</button>`;
        } else {
          html += `<div style="width:300px;padding:12px;margin:6px 0;background:#15110f;border:1px dashed #2a2520;border-radius:6px;color:#4a4034;font-family:Georgia,serif;font-size:13px;text-align:left">Slot ${slot}: Empty</div>`;
        }

        // If a recent backup exists for this empty slot, surface a
        // Recover button so the player can undo an accidental delete
        // within the 48h retention window.
        const backup = getRecentBackup(slot);
        if (backup) {
          const ageHours = Math.max(1, Math.floor(backup.ageMs / (60 * 60 * 1000)));
          const recoverLabel = `\u21BA Recover "${esc(backup.summary.name)}" — Day ${backup.summary.day}, Ch.${backup.summary.chapter} (${ageHours}h ago)`;
          html += `<button class="slot-recover" data-slot="${slot}" data-bak="${esc(backup.key)}" style="display:block;width:300px;padding:6px;margin:0 0 8px 0;background:#1a2018;border:1px solid #4a8a4a;border-radius:4px;color:#88dd88;font-family:Georgia,serif;font-size:11px;cursor:pointer;text-align:center">${recoverLabel}</button>`;
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
        if (summary && confirm(`Delete "${summary.name}"'s save?\n\nThe save will be backed up for 48 hours and can be recovered from the title screen during that window.`)) {
          deleteSlot(slot);
          overlay.remove();
          this.showSlotPicker(mode);
        }
      });
    });

    overlay.querySelectorAll('.slot-recover').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = parseInt((btn as HTMLElement).dataset.slot!, 10);
        const bakKey = (btn as HTMLElement).dataset.bak!;
        const ok = restoreBackup(slot, bakKey);
        if (ok) {
          overlay.remove();
          this.showSlotPicker(mode);
        }
      });
    });

    document.getElementById('slot-cancel')!.addEventListener('click', () => overlay.remove());
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    opts?: { tint?: 'purple' }
  ): void {
    const isPurple = opts?.tint === 'purple';
    const baseFill = isPurple ? 0x2a2030 : 0x2a2520;
    const hoverFill = isPurple ? 0x3a2c46 : 0x3a3530;
    const stroke = isPurple ? 0x5a4a6a : 0x6b5b3e;
    const baseColor = isPurple ? '#bfa8d8' : '#c4956a';
    const hoverColor = isPurple ? '#dac6f0' : '#ddb87a';

    const bg = this.add.rectangle(x, y, 200, 44, baseFill, 0.9);
    bg.setStrokeStyle(1, stroke);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: baseColor,
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(hoverFill, 0.9);
      text.setColor(hoverColor);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(baseFill, 0.9);
      text.setColor(baseColor);
    });
    bg.on('pointerdown', onClick);
  }
}
