import Phaser from 'phaser';
import { eventBus } from '../utils/events';
import { GAME_WIDTH, GAME_HEIGHT, BREED_COLORS, BREED_NAMES } from '../utils/constants';
import { getGameState } from '../main';
import { generateDailyJobs, getJob, getStatMatchScore, type JobDef } from '../systems/JobBoard';

export class TownScene extends Phaser.Scene {
  private dailyJobs: JobDef[] = [];

  constructor() {
    super({ key: 'TownScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c1b19');

    const save = getGameState();
    if (!save) return;

    eventBus.emit('show-ui');
    eventBus.emit('set-active-tab', 'town');

    // Townscape background
    this.drawTownscape();

    // Town header
    this.add.text(GAME_WIDTH / 2, 56, 'Town Square', {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#c4956a',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 76, `Day ${save.day}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#6b5b3e',
    }).setOrigin(0.5);

    // Job Board section
    const boardY = 250;
    this.add.rectangle(GAME_WIDTH / 2, boardY - 8, 200, 2, 0x6b5b3e, 0.3);
    this.add.text(GAME_WIDTH / 2, boardY + 4, 'Job Board', {
      fontFamily: 'Georgia, serif',
      fontSize: '17px',
      color: '#8b7355',
    }).setOrigin(0.5);

    // Generate daily jobs
    this.dailyJobs = generateDailyJobs(save);

    // Draw job cards
    let cardY = boardY + 30;
    this.dailyJobs.forEach((job) => {
      cardY = this.drawJobCard(job, cardY, save);
    });

    // Stationed cats section
    if (save.stationedCats && save.stationedCats.length > 0) {
      cardY += 16;
      this.add.rectangle(GAME_WIDTH / 2, cardY, 200, 2, 0x3a5a3a, 0.3);
      cardY += 16;
      this.add.text(GAME_WIDTH / 2, cardY, 'Stationed Cats', {
        fontFamily: 'Georgia, serif',
        fontSize: '17px',
        color: '#8baa8b',
      }).setOrigin(0.5);
      cardY += 24;

      for (const stationed of save.stationedCats) {
        const cat = save.cats.find((c: any) => c.id === stationed.catId);
        const job = getJob(stationed.jobId);
        if (!cat || !job) continue;

        const match = getStatMatchScore(cat, job);
        const dailyEarn = Math.max(1, Math.floor(job.baseReward * 0.5 + job.baseReward * match * 0.5));
        const daysWorked = save.day - stationed.dayStarted;

        const cardW = GAME_WIDTH - 30;
        const bg = this.add.rectangle(GAME_WIDTH / 2, cardY + 22, cardW, 46, 0x2a2e2a);
        bg.setStrokeStyle(1, 0x3a5a3a);

        const color = parseInt((BREED_COLORS[cat.breed] ?? '#8b7355').replace('#', ''), 16);
        this.add.circle(38, cardY + 22, 14, color);

        this.add.text(58, cardY + 12, `${cat.name} — ${job.name}`, {
          fontFamily: 'Georgia, serif',
          fontSize: '13px',
          color: '#8baa8b',
        });

        this.add.text(58, cardY + 28, `~${dailyEarn} fish/day | ${daysWorked} day${daysWorked !== 1 ? 's' : ''} worked`, {
          fontFamily: 'Georgia, serif',
          fontSize: '10px',
          color: '#6b8b6b',
        });

        cardY += 56;
      }
    }

    // Recruit section
    cardY += 16;
    this.add.rectangle(GAME_WIDTH / 2, cardY, 200, 2, 0x6b5b3e, 0.3);
    cardY += 16;
    this.add.text(GAME_WIDTH / 2, cardY, 'Stray Cats Nearby', {
      fontFamily: 'Georgia, serif',
      fontSize: '17px',
      color: '#8b7355',
    }).setOrigin(0.5);
    cardY += 24;

    this.drawRecruits(cardY, save);

    // Scrolling
    const maxScroll = Math.max(0, cardY + 200 - GAME_HEIGHT + 80);
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

  private drawJobCard(job: JobDef, startY: number, save: any): number {
    const cardH = 82;
    const cardW = GAME_WIDTH - 30;
    const cx = GAME_WIDTH / 2;

    // Card background
    const bg = this.add.rectangle(cx, startY + cardH / 2, cardW, cardH, 0x2a2520);
    bg.setStrokeStyle(1, 0x3a3530);

    // Category icon
    const catIcon = job.category === 'pest_control' ? '\u{1F400}' : '\u{1F4DC}';
    this.add.text(26, startY + 10, catIcon, {
      fontSize: '18px',
    });

    // Difficulty badge
    const diffColors: Record<string, number> = { easy: 0x3a5a3a, medium: 0x5a5a3a, hard: 0x5a3a3a };
    const diffX = cardW + 15 - 36;
    this.add.rectangle(diffX, startY + 14, 46, 16, diffColors[job.difficulty] ?? 0x444444).setStrokeStyle(1, 0x555555, 0.4);
    this.add.text(diffX, startY + 14, job.difficulty, {
      fontFamily: 'Georgia, serif',
      fontSize: '9px',
      color: '#ccc',
    }).setOrigin(0.5);

    // Job name
    this.add.text(50, startY + 8, job.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#c4956a',
    });

    // Description
    this.add.text(26, startY + 30, job.description, {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#888',
      wordWrap: { width: cardW - 40 },
    });

    // Reward and accept button
    this.add.text(26, startY + 56, `Reward: ${job.baseReward}-${job.maxReward} Fish`, {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#6b8ea6',
    });

    // Stats required
    this.add.text(180, startY + 56, job.keyStats.join(', '), {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#6b5b3e',
    });

    // Accept button
    const btnX = cardW + 15 - 40;
    const btnY = startY + 60;
    const btn = this.add.rectangle(btnX, btnY, 64, 26, 0x3a5a3a);
    btn.setStrokeStyle(1, 0x4a6a4a);
    btn.setInteractive({ useHandCursor: true });

    this.add.text(btnX, btnY, 'Accept', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#ddd',
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x4a6a4a));
    btn.on('pointerout', () => btn.setFillStyle(0x3a5a3a));
    btn.on('pointerdown', () => {
      eventBus.emit('job-accept', { job, catIndex: 0 });
    });

    return startY + cardH + 8;
  }

  private drawRecruits(startY: number, save: any): void {
    const ownedBreeds = new Set(save.cats.map((c: any) => c.breed));

    const recruitable = [
      { id: 'russian_blue', name: 'Russian Blue', cost: 30, color: '#6b8ea6' },
      { id: 'tuxedo', name: 'Tuxedo', cost: 40, color: '#3c3c3c' },
      { id: 'maine_coon', name: 'Maine Coon', cost: 50, color: '#c4956a' },
      { id: 'siamese', name: 'Siamese', cost: 60, color: '#d4c5a9' },
    ].filter((r) => !ownedBreeds.has(r.id));

    if (recruitable.length === 0) {
      this.add.text(GAME_WIDTH / 2, startY + 10, 'All cats have joined the guild.', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: '#555',
      }).setOrigin(0.5);
      return;
    }

    recruitable.forEach((recruit, i) => {
      const y = startY + i * 56;
      const cardW = GAME_WIDTH - 30;
      const cx = GAME_WIDTH / 2;

      const bg = this.add.rectangle(cx, y + 22, cardW, 46, 0x2a2520);
      bg.setStrokeStyle(1, 0x3a3530);

      // Breed color swatch + cat silhouette
      const color = parseInt(recruit.color.replace('#', ''), 16);
      const gfx = this.add.graphics();
      gfx.fillStyle(color);
      gfx.fillEllipse(38, y + 22, 20, 12);
      gfx.fillCircle(38, y + 13, 6);
      gfx.fillTriangle(33, y + 11, 36, y + 5, 38, y + 11);
      gfx.fillTriangle(43, y + 11, 40, y + 5, 38, y + 11);

      this.add.text(58, y + 12, recruit.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#c4956a',
      });

      this.add.text(58, y + 28, `Wants to join for ${recruit.cost} Fish`, {
        fontFamily: 'Georgia, serif',
        fontSize: '10px',
        color: '#888',
      });

      const canAfford = save.fish >= recruit.cost;
      const btnX = cardW + 15 - 50;
      const btn = this.add.rectangle(btnX, y + 22, 70, 28, canAfford ? 0x3a5a3a : 0x333333);
      btn.setStrokeStyle(1, canAfford ? 0x4a6a4a : 0x444444);

      this.add.text(btnX, y + 22, canAfford ? 'Recruit' : `${recruit.cost} Fish`, {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: canAfford ? '#ddd' : '#555',
      }).setOrigin(0.5);

      if (canAfford) {
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setFillStyle(0x4a6a4a));
        btn.on('pointerout', () => btn.setFillStyle(0x3a5a3a));
        btn.on('pointerdown', () => eventBus.emit('recruit-cat', recruit.id));
      }
    });
  }
}
