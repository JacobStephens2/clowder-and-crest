import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import type { SaveData } from '../systems/SaveManager';
import { getCurrentFestival, getDailyWish } from '../systems/GameSystems';
import { getChapterName, getNextChapterHint } from '../systems/ProgressionManager';

import { ALL_BREED_IDS } from '../utils/constants';
const BREEDS_WITH_SPRITES = new Set(ALL_BREED_IDS as readonly string[]);
const ROOM_WIDTH = 340;
const ROOM_HEIGHT = 180;
const ROOM_GAP = 16;
const ROOM_START_Y = 120;

interface RoomDef {
  id: string;
  name: string;
  description: string;
  floorColor: number;
  wallColor: number;
  cost: number;
}

function getRooms(chapter: number): RoomDef[] {
  const sleepingName = chapter < 2 ? 'The Lean-To' : 'Sleeping Quarters';
  const sleepingDesc = chapter < 2 ? 'A makeshift shelter behind the grain market' : 'Rest and recovery';
  return [
    { id: 'sleeping', name: sleepingName, description: sleepingDesc, floorColor: 0x2e2a25, wallColor: 0x3a3530, cost: 0 },
    { id: 'kitchen', name: 'Kitchen & Pantry', description: 'Meals for the guild', floorColor: 0x2e2822, wallColor: 0x3a2e28, cost: 50 },
    { id: 'operations', name: 'Operations Hall', description: 'Plan and dispatch', floorColor: 0x252e2a, wallColor: 0x2e3530, cost: 100 },
  ];
}

export class GuildhallScene extends Phaser.Scene {
  /** The currently-active daily wish, computed once in create() and
   *  passed to drawCats so the wishing cat gets a tappable thought
   *  bubble above its sprite. Null when no wish is active or when the
   *  wish has already been fulfilled. */
  private activeWish: ReturnType<typeof getDailyWish> | null = null;

  constructor() {
    super({ key: 'GuildhallScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    const save = getGameState();
    if (!save) {
      // Per playtest (2026-04-18): "I come back to a blank view."
      // If gameState is somehow null, show a recovery message instead
      // of silently rendering an empty scene.
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading guild...', {
        fontFamily: 'Georgia, serif', fontSize: '16px', color: '#8b7355',
      }).setOrigin(0.5);
      return;
    }

    // Fade in
    this.cameras.main.fadeIn(300, 10, 9, 8);

    // Mood-reactive guildhall tint — when collective cat morale is
    // low, the whole scene dims slightly; when it's high, a warm
    // amber glow washes over the hall. Per the philosophy docs:
    // beauty is "harmonious form… parts fitting a whole." The
    // guildhall should FEEL like its inhabitants' mood — not just
    // display mood text on each cat's card but let the player sense
    // it from the atmosphere the moment the scene opens. A full
    // overlay rectangle at low alpha creates the tint without
    // changing individual sprite colors.
    const moodScores: Record<string, number> = { happy: 2, content: 1, unhappy: -1 };
    const totalMood = save.cats.reduce((sum, c) => sum + (moodScores[c.mood] ?? 0), 0);
    const avgMood = totalMood / Math.max(1, save.cats.length);
    if (avgMood >= 1.2) {
      // Warm amber glow — guild is thriving
      const warmth = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xdda055, 0.04);
      warmth.setScrollFactor(0).setDepth(0);
    } else if (avgMood <= -0.5) {
      // Cool dim — guild morale is suffering
      const chill = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a2030, 0.12);
      chill.setScrollFactor(0).setDepth(0);
    }

    // Ambient dust motes
    for (let i = 0; i < 6; i++) {
      const mote = this.add.circle(
        Math.random() * GAME_WIDTH,
        80 + Math.random() * 300,
        1, 0xc4956a, 0.15 + Math.random() * 0.1
      );
      this.tweens.add({
        targets: mote,
        x: mote.x + 20 + Math.random() * 30,
        y: mote.y - 10 + Math.random() * 20,
        alpha: 0,
        duration: 4000 + Math.random() * 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'guildhall');

    // Guildhall building art
    if (this.textures.exists('scene_guildhall')) {
      const hall = this.add.sprite(GAME_WIDTH / 2, 140, 'scene_guildhall');
      hall.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      hall.setScale(1.5);
      hall.setAlpha(0.3);
    }

    // Guild name header
    const chapterName = getChapterName(save.chapter);
    const hallName = save.chapter < 2 ? 'Behind the Grain Market' : 'The Guildhall';
    // Show crest next to guildhall name when established
    if (save.chapter >= 2 && this.textures.exists('crest')) {
      const crest = this.add.sprite(GAME_WIDTH / 2 - 90, 55, 'crest');
      crest.setScale(0.25);
      crest.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    // Per playtest (2026-04-18): "the behind the grain market header
    // is a bit obscured by the top row on the screen." Pushed title
    // from y=55 to y=70 so it clears the status bar.
    this.add.text(GAME_WIDTH / 2, 70, hallName, {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 91, `Chapter ${save.chapter}: ${chapterName}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#6b5b3e',
    }).setOrigin(0.5);

    // Chapter progress hint
    const progressHint = getNextChapterHint(save);
    if (progressHint) {
      this.add.text(GAME_WIDTH / 2, 105, progressHint, {
        fontFamily: 'Georgia, serif',
        fontSize: '9px',
        color: '#6b8ea6',
        wordWrap: { width: ROOM_WIDTH - 20 },
        align: 'center',
      }).setOrigin(0.5, 0);
    }

    // Festival indicator
    const festival = getCurrentFestival(save.day);
    if (festival) {
      const festY = 93;
      this.add.rectangle(GAME_WIDTH / 2, festY, ROOM_WIDTH, 20, 0x3a3520, 0.8);
      this.add.text(GAME_WIDTH / 2, festY, `\u{1F389} ${festival.name}`, {
        fontFamily: 'Georgia, serif', fontSize: '10px', color: '#dda055',
      }).setOrigin(0.5);
    }

    // Plague warning
    if (save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved) {
      const warningY = 95;
      this.add.rectangle(GAME_WIDTH / 2, warningY, ROOM_WIDTH, 22, 0x5a2020, 0.8);
      this.add.text(GAME_WIDTH / 2, warningY, 'The Rat Plague ravages the town', {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#cc6666',
      }).setOrigin(0.5);
    }

    // Inquisition warning
    if (save.flags.inquisitionStarted && !save.flags.inquisitionResolved) {
      const inqY = save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved ? 118 : 95;
      const inqStart = Number(save.flags.inquisitionDayStarted ?? save.day);
      const inqDaysLeft = Math.max(0, 5 - (save.day - inqStart));
      this.add.rectangle(GAME_WIDTH / 2, inqY, ROOM_WIDTH, 22, 0x3a2050, 0.8);
      this.add.text(GAME_WIDTH / 2, inqY, `The Inquisitor watches (${inqDaysLeft} days remain)`, {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#bb88cc',
      }).setOrigin(0.5);
    }

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
    });

    // Compute the daily wish before drawing rooms so drawRooms can
    // pass it down to drawCats and render a thought bubble above the
    // wishing cat. Both the inline panel below the rooms AND the
    // bubble above the cat are visible simultaneously when there's an
    // unfulfilled wish.
    const wish = getDailyWish(save.day, save.cats, save.furniture.map((f) => f.furnitureId));
    const activeWish = wish && !save.flags[`wish_day_${save.day}`] ? wish : null;
    this.activeWish = activeWish;

    this.drawRooms(save);

    // Inline wish display — sits below the rooms so the wish stays
    // visible even after the player dismisses the floating top banner.
    // Per user feedback (2026-04-08): "add a way to dismiss wishes
    // from the top of the screen, but always display them above or
    // below the rooms in the guild view / scene."
    if (activeWish) {
      const wishY = ROOM_START_Y + 3 * (ROOM_HEIGHT + ROOM_GAP) - 10;
      this.add.rectangle(GAME_WIDTH / 2, wishY, ROOM_WIDTH, 38, 0x2a2520, 0.85)
        .setStrokeStyle(1, 0x6b5b3e);
      this.add.text(GAME_WIDTH / 2, wishY - 8, `\u{1F4AD} ${activeWish.catName}\u2019s wish`, {
        fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, wishY + 7, `"${activeWish.wish}"`, {
        fontFamily: 'Georgia, serif', fontSize: '10px', color: '#8b7355',
      }).setOrigin(0.5);
    }

    // Cellar entrance (Chapter 5+)
    if (save.chapter >= 5) {
      const cellarY = ROOM_START_Y + 3 * (ROOM_HEIGHT + ROOM_GAP) + 10;
      const cellarBtn = this.add.rectangle(GAME_WIDTH / 2, cellarY, ROOM_WIDTH, 40, 0x1a1818);
      cellarBtn.setStrokeStyle(1, 0x3a3530);
      cellarBtn.setInteractive({ useHandCursor: true });
      this.add.text(GAME_WIDTH / 2, cellarY, '\u{1F5DD}\u{FE0F} The Cellar — Dungeon Run', {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#8b7355',
      }).setOrigin(0.5);
      cellarBtn.on('pointerover', () => cellarBtn.setFillStyle(0x2a2520));
      cellarBtn.on('pointerout', () => cellarBtn.setFillStyle(0x1a1818));
      cellarBtn.on('pointerdown', () => {
        eventBus.emit('navigate', 'DungeonRunScene');
        this.scene.start('DungeonRunScene');
      });
    }

    // Content height and scrolling
    const contentHeight = 3 * (ROOM_HEIGHT + ROOM_GAP) + ROOM_START_Y + (save.chapter >= 5 ? 60 : 40);
    const maxScroll = Math.max(0, contentHeight - GAME_HEIGHT + 120);

    if (maxScroll > 0) {
      let scrollY = 0;
      let dragStartY = 0;
      let scrollStart = 0;

      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        dragStartY = pointer.y;
        scrollStart = scrollY;
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown) return;
        const dy = dragStartY - pointer.y;
        if (Math.abs(dy) > 5) {
          scrollY = Phaser.Math.Clamp(scrollStart + dy, 0, maxScroll);
          this.cameras.main.scrollY = scrollY;
        }
      });
    }
  }

  private drawRooms(save: SaveData): void {
    const cx = GAME_WIDTH / 2;
    const startY = save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved ? 130 : ROOM_START_Y;

    getRooms(save.chapter).forEach((room, i) => {
      const y = startY + i * (ROOM_HEIGHT + ROOM_GAP);
      const roomData = save.rooms.find((r) => r.id === room.id);
      const unlocked = roomData?.unlocked ?? false;

      // Wall (darker top section)
      this.add.rectangle(cx, y + 30, ROOM_WIDTH, 60, room.wallColor);
      // Floor (lighter bottom section)
      this.add.rectangle(cx, y + 90 + 30, ROOM_WIDTH, ROOM_HEIGHT - 60, room.floorColor);
      // Border
      const border = this.add.rectangle(cx, y + ROOM_HEIGHT / 2, ROOM_WIDTH, ROOM_HEIGHT);
      border.setStrokeStyle(unlocked ? 2 : 1, unlocked ? 0x6b5b3e : 0x3a3530);
      border.setFillStyle(0x000000, 0);

      if (unlocked) {
        // Make room clickable
        border.setFillStyle(0x000000, 0);
        border.setInteractive({ useHandCursor: true });
        border.on('pointerover', () => border.setStrokeStyle(2, 0xc4956a));
        border.on('pointerout', () => border.setStrokeStyle(2, 0x6b5b3e));
        border.on('pointerdown', () => {
          // Single emit with data — navigate now forwards data to
          // switchScene. The previous version called navigate AND
          // this.scene.start back-to-back, which was a double-start
          // race that left GuildhallScene blank when the player came
          // back from RoomScene via the back button.
          eventBus.emit('navigate', 'RoomScene', { roomId: room.id });
        });

        // Room name with subtle decoration
        const nameY = y + 14;
        this.add.text(cx, nameY, room.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '15px',
          color: '#c4956a',
        }).setOrigin(0.5);
        this.add.text(cx, nameY + 16, room.description, {
          fontFamily: 'Georgia, serif',
          fontSize: '10px',
          color: '#6b5b3e',
        }).setOrigin(0.5);

        // "Tap to enter" hint
        this.add.text(cx, y + ROOM_HEIGHT - 10, 'Tap to enter', {
          fontFamily: 'Georgia, serif',
          fontSize: '9px',
          color: '#555',
        }).setOrigin(0.5);

        // Wall decorations (lantern glow effects)
        this.drawWallDecor(cx - ROOM_WIDTH / 2 + 20, y + 20);
        this.drawWallDecor(cx + ROOM_WIDTH / 2 - 20, y + 20);

        // Draw placed furniture
        const placed = save.furniture.filter((f) => f.room === room.id);
        this.drawFurniture(placed, cx, y + 60, ROOM_WIDTH - 40);

        // Draw cats assigned to this room
        const anyAssigned = save.cats.some((c) => c.assignedRoom);
        let catsForRoom: typeof save.cats;
        if (anyAssigned) {
          catsForRoom = save.cats.filter((c) => c.assignedRoom === room.id || (!c.assignedRoom && room.id === 'sleeping'));
        } else {
          // Auto-distribute: spread cats across unlocked rooms
          const unlockedRoomIds = save.rooms.filter((r) => r.unlocked).map((r) => r.id);
          const roomIndex = unlockedRoomIds.indexOf(room.id);
          if (roomIndex >= 0) {
            catsForRoom = save.cats.filter((_, idx) => idx % unlockedRoomIds.length === roomIndex);
          } else {
            catsForRoom = [];
          }
        }
        if (catsForRoom.length > 0) {
          this.drawCats({ ...save, cats: catsForRoom }, cx, y + ROOM_HEIGHT - 55);
        }
      } else {
        // Locked room — visually distinct with dark overlay and lock icon
        this.add.rectangle(cx, y + ROOM_HEIGHT / 2, ROOM_WIDTH, ROOM_HEIGHT, 0x0a0908, 0.6);

        this.add.text(cx, y + ROOM_HEIGHT / 2 - 30, '\u{1F512}', {
          fontSize: '20px',
        }).setOrigin(0.5);

        this.add.text(cx, y + ROOM_HEIGHT / 2 - 10, room.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '15px',
          color: '#555',
        }).setOrigin(0.5);

        // Unlock button
        const canAfford = save.fish >= room.cost;
        const btnY = y + ROOM_HEIGHT / 2 + 15;
        const btn = this.add.rectangle(cx, btnY, 160, 36, canAfford ? 0x3a3530 : 0x2a2520);
        btn.setStrokeStyle(1, canAfford ? 0x6b5b3e : 0x444444);

        this.add.text(cx, btnY, `Unlock — ${room.cost} Fish`, {
          fontFamily: 'Georgia, serif',
          fontSize: '13px',
          color: canAfford ? '#c4956a' : '#555',
        }).setOrigin(0.5);

        if (canAfford) {
          btn.setInteractive({ useHandCursor: true });
          btn.on('pointerover', () => btn.setFillStyle(0x4a4540));
          btn.on('pointerout', () => btn.setFillStyle(0x3a3530));
          btn.on('pointerdown', () => eventBus.emit('unlock-room', room.id));
        }
      }
    });
  }

  private drawWallDecor(x: number, y: number): void {
    // Simple lantern glow
    const glow = this.add.circle(x, y, 12, 0xc4956a, 0.08);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.05, to: 0.12 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // Lantern body
    this.add.rectangle(x, y, 6, 10, 0x8b7355).setStrokeStyle(1, 0x6b5b3e);
    this.add.circle(x, y, 3, 0xdda055, 0.6);
  }

  private drawFurniture(placed: { furnitureId: string; room: string; gridX: number; gridY: number }[], cx: number, y: number, width: number): void {
    if (placed.length === 0) {
      this.add.text(cx, y + 20, 'No furniture yet', {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#444',
      }).setOrigin(0.5);
      return;
    }

    const itemW = 48;
    const cols = Math.min(placed.length, Math.floor(width / (itemW + 8)));
    const startX = cx - (cols * (itemW + 8)) / 2 + (itemW + 8) / 2;

    placed.forEach((f, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fx = startX + col * (itemW + 8);
      const fy = y + row * 42;

      // Try to use the furniture sprite; fall back to colored rectangle
      const spriteKey = `furniture_${f.furnitureId}`;
      if (this.textures.exists(spriteKey)) {
        const sprite = this.add.sprite(fx, fy, spriteKey);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        // Scale to fit within the item space
        const maxDim = Math.max(sprite.width, sprite.height);
        const scale = Math.min(1, (itemW - 8) / maxDim);
        sprite.setScale(scale);
      } else {
        const furnitureColors: Record<string, number> = {
          straw_bed: 0x6b5b3e, woolen_blanket: 0x5a4a6a, cushioned_basket: 0x6a5a4a,
          fish_barrel: 0x4a5a6a, herb_rack: 0x4a6a4a, stone_hearth: 0x5a5a5a,
          notice_board: 0x6a6a4a, lantern: 0x8a7a4a, candle_stand: 0x7a6a3a,
          scratching_post: 0x7a5a3a, bookshelf: 0x5a4a3a, rug_wool: 0x6a4a4a,
          saints_icon: 0x6a6a7a, fish_bone_mobile: 0x5a6a6a, potted_catnip: 0x4a6a4a,
        };
        const color = furnitureColors[f.furnitureId] ?? 0x5a4a3a;
        this.add.rectangle(fx, fy, itemW - 4, 28, color).setStrokeStyle(1, 0x6b5b3e);
        const label = f.furnitureId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        this.add.text(fx, fy, label, {
          fontFamily: 'Georgia, serif', fontSize: '7px', color: '#bbb',
          align: 'center', wordWrap: { width: itemW - 8 },
        }).setOrigin(0.5);
      }
    });
  }

  private drawCats(save: SaveData, cx: number, baseY: number): void {
    const catCount = save.cats.length;
    const spacing = Math.min(60, (ROOM_WIDTH - 40) / catCount);
    const startX = cx - ((catCount - 1) * spacing) / 2;

    const moodColors: Record<string, string> = {
      happy: '#4a8a4a',
      content: '#8a8a4a',
      tired: '#8a6a4a',
      unhappy: '#8a4a4a',
    };

    const directions = ['south', 'east', 'west', 'north'];

    save.cats.forEach((cat, i) => {
      const x = startX + i * spacing;
      const y = baseY;

      if (BREEDS_WITH_SPRITES.has(cat.breed)) {
        const dir = directions[i % directions.length];
        const sprite = this.add.sprite(x, y - 10, `${cat.breed}_idle_${dir}`);
        sprite.setScale(1.5);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

        this.tweens.add({
          targets: sprite,
          y: sprite.y - 1,
          duration: 1500 + i * 200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        // Wish thought bubble — only for the cat with the active wish.
        if (this.activeWish && this.activeWish.catId === cat.id) {
          this.drawWishBubble(x + 14, y - 30);
        }
      } else {
        const color = parseInt((BREED_COLORS[cat.breed] ?? '#8B7355').replace('#', ''), 16);
        const gfx = this.add.graphics();
        gfx.lineStyle(2, color);
        gfx.beginPath();
        gfx.moveTo(x + 12, y + 2);
        gfx.lineTo(x + 20, y - 5);
        gfx.lineTo(x + 22, y - 10);
        gfx.strokePath();

        gfx.fillStyle(color);
        gfx.fillEllipse(x, y, 24, 16);
        gfx.fillCircle(x, y - 12, 8);
        gfx.fillTriangle(x - 7, y - 15, x - 3, y - 24, x + 1, y - 15);
        gfx.fillTriangle(x + 7, y - 15, x + 3, y - 24, x - 1, y - 15);
        gfx.fillStyle(0xddcc88);
        gfx.fillCircle(x - 3, y - 13, 2);
        gfx.fillCircle(x + 3, y - 13, 2);
        gfx.fillStyle(0x111111);
        gfx.fillCircle(x - 3, y - 13, 1);
        gfx.fillCircle(x + 3, y - 13, 1);

        this.tweens.add({
          targets: gfx,
          scaleY: { from: 1, to: 1.03 },
          duration: 1500 + i * 200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        // Wish thought bubble — same affordance for the no-sprite path.
        if (this.activeWish && this.activeWish.catId === cat.id) {
          this.drawWishBubble(x + 14, y - 30);
        }
      }

      this.add.text(x, y + 14, cat.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '9px',
        color: moodColors[cat.mood] ?? '#c4956a',
      }).setOrigin(0.5);
    });
  }

  /** Draw a small thought bubble above a cat sprite. Per user feedback
   *  (2026-04-08): "maybe there can be a thought bubble above the cat
   *  on the guild view if they have a wish, and the player can tap
   *  that bubble to see the wish, then they can close it again."
   *  The bubble is a circle with a small pendant trail and a 💭
   *  glyph; tapping it pops up a bordered text panel with the wish
   *  text, and tapping the panel (or its close button) hides it.
   *
   *  v2: bumped the hit-zone to a 26px-radius invisible disc and
   *  added an explicit stopPropagation in the pointerdown handler.
   *  Per follow-up feedback: "I click it and enter the sleeping
   *  quarters" — the original visual radius was 9px and the room
   *  border underneath has its own pointerdown that navigates into
   *  the room, so finger taps that landed just outside the visual
   *  fell through to the room. The larger hit zone (22px) makes the
   *  bubble forgiving without changing how it looks. */
  private drawWishBubble(x: number, y: number): void {
    if (!this.activeWish) return;
    // Two small trail dots leading from the cat up to the bubble
    this.add.circle(x - 7, y + 8, 2, 0xfff8e0, 0.85).setDepth(15);
    this.add.circle(x - 4, y + 4, 2.5, 0xfff8e0, 0.9).setDepth(15);
    // Bubble visual
    const bubble = this.add.circle(x, y, 9, 0xfff8e0, 0.95).setDepth(15);
    bubble.setStrokeStyle(1, 0x8b7355);
    const glyph = this.add.text(x, y, '\u{1F4AD}', {
      fontFamily: 'Georgia, serif', fontSize: '11px',
    }).setOrigin(0.5).setDepth(16);
    void glyph;
    // Invisible larger hit zone overlaying the bubble — gives the
    // player a forgiving tap target. The visible bubble stays small.
    const hitZone = this.add.zone(x, y, 44, 44).setDepth(17);
    hitZone.setInteractive({ useHandCursor: true });
    // Gentle pulse so the player notices it
    this.tweens.add({
      targets: bubble,
      scale: { from: 1, to: 1.18 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    hitZone.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      // Stop the room border behind from also firing its navigate
      // handler. Without this, tapping the bubble enters the room
      // AND opens the popup, but the scene transitions before the
      // popup is visible.
      event.stopPropagation();
      this.toggleWishPopup(x, y);
    });
  }

  /** Show or hide a small wish-text popup near the bubble. The popup
   *  is a single bordered rectangle pinned at the bubble's location;
   *  tapping it (or its inner X) hides it. Stores the popup in the
   *  scene registry so a second bubble tap toggles it cleanly. */
  private wishPopupContainer: Phaser.GameObjects.Container | null = null;
  private toggleWishPopup(anchorX: number, anchorY: number): void {
    if (this.wishPopupContainer) {
      this.wishPopupContainer.destroy();
      this.wishPopupContainer = null;
      return;
    }
    if (!this.activeWish) return;
    const wishText = this.activeWish.wish;
    const catName = this.activeWish.catName;
    // Position the popup above the bubble; clamp to screen bounds.
    const w = 220;
    const h = 70;
    let px = Phaser.Math.Clamp(anchorX, w / 2 + 10, GAME_WIDTH - w / 2 - 10);
    let py = anchorY - h / 2 - 14;
    if (py < h / 2 + 10) py = anchorY + h / 2 + 14; // flip below if no room above
    const bg = this.add.rectangle(0, 0, w, h, 0x1a1612, 0.96).setStrokeStyle(1, 0x6b5b3e);
    const title = this.add.text(0, -h / 2 + 12, `\u{1F4AD} ${catName}\u2019s wish`, {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#dda055',
    }).setOrigin(0.5);
    const body = this.add.text(0, 6, `"${wishText}"`, {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#c4956a',
      align: 'center', wordWrap: { width: w - 20 },
    }).setOrigin(0.5);
    const closeBtn = this.add.text(w / 2 - 10, -h / 2 + 8, '\u00D7', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#8b7355',
    }).setOrigin(0.5);
    const container = this.add.container(px, py, [bg, title, body, closeBtn]).setDepth(50);
    this.wishPopupContainer = container;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      container.destroy();
      this.wishPopupContainer = null;
    });
  }
}
