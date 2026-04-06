import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { DPR, GAME_WIDTH, GAME_HEIGHT, BREED_COLORS } from '../utils/constants';
import { getGameState } from '../main';
import type { SaveData } from '../systems/SaveManager';
import { getCurrentFestival } from '../systems/GameSystems';
import { getChapterName, getNextChapterHint } from '../systems/ProgressionManager';

import { ALL_BREED_IDS } from '../utils/constants';
const BREEDS_WITH_SPRITES = new Set(ALL_BREED_IDS as readonly string[]);
const ROOM_WIDTH = 340;
const ROOM_HEIGHT = 180;
const ROOM_GAP = 16;
const ROOM_START_Y = 100;

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
  constructor() {
    super({ key: 'GuildhallScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');
    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    const save = getGameState();
    if (!save) return;

    // Fade in
    this.cameras.main.fadeIn(300, 10, 9, 8);

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
    this.add.text(GAME_WIDTH / 2, 55, hallName, {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 76, `Chapter ${save.chapter}: ${chapterName}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#6b5b3e',
    }).setOrigin(0.5);

    // Chapter progress hint
    const progressHint = getNextChapterHint(save);
    if (progressHint) {
      this.add.text(GAME_WIDTH / 2, 90, progressHint, {
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

    this.drawRooms(save);

    // Content height and scrolling
    const contentHeight = 3 * (ROOM_HEIGHT + ROOM_GAP) + ROOM_START_Y + 40;
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
          eventBus.emit('navigate', 'RoomScene');
          this.scene.start('RoomScene', { roomId: room.id });
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
      }

      this.add.text(x, y + 14, cat.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '9px',
        color: moodColors[cat.mood] ?? '#c4956a',
      }).setOrigin(0.5);
    });
  }
}
