// Chapter intro narrative beats — shared between main.ts (which fires
// them when the chapter advances) and RelationalJournal/Memories
// (which lets the player replay any chapter intro they've already
// seen). Per user feedback (2026-04-08): "add chapter introductions
// and group discussion dialogues to the memories area, letting
// players play back ones they've already found."
//
// Each builder takes the player's cat name + breed + reputation
// label and returns a NarrativeConfig ready for showNarrativeOverlay.
// This keeps the prose centralized so future tone tweaks land in one
// place instead of being duplicated between main.ts and the journal.

import type { NarrativeConfig } from '../ui/narrativeOverlay';
import { playSfx } from '../systems/SfxManager';

export interface ChapterContext {
  catName: string;
  catBreed: string;
  reputationLabel: string;
}

/** Build the narrative-overlay config for a given chapter intro. The
 *  scene data, image, tone, and SFX hooks all live here so main.ts
 *  and the Memories replay flow render IDENTICAL beats. Returns null
 *  for chapters that don't have a registered intro (1, or anything
 *  out of range). */
export function buildChapterIntroScene(chapter: number, ctx: ChapterContext): NarrativeConfig | null {
  const { catName, catBreed, reputationLabel } = ctx;
  switch (chapter) {
    case 2:
      return {
        scenes: [
          'CHAPTER 2 — THE CREW',
          'Word had spread.',
          'A stray who catches rats and earns fish — that was worth talking about.',
          'A second cat appeared at the lean-to one morning. Not a friend. Not yet.',
          `${catName} looked at the newcomer. Two cats. Two sets of paws.`,
          'The beginning of something.',
        ],
        image: 'assets/sprites/scenes/guildhall.png',
        catSprite: catBreed,
        tone: 'warm',
        onScene: (i) => { if (i === 0) playSfx('chapter', 0.5); if (i === 2) playSfx('recruit', 0.4); },
      };
    case 3:
      return {
        scenes: [
          'CHAPTER 3 — THE RAT PLAGUE',
          'The granary fell first.',
          'Rats poured from the walls like dark water, overrunning the flour stores in a single night.',
          'By morning, the cathedral cellar was lost. The monks fled. The market was abandoned.',
          'Only cats.',
          `${catName} gathered the guild. This was no ordinary job.`,
          'This was a siege.',
        ],
        image: 'assets/sprites/scenes/town_plague.png',
        catSprite: catBreed,
        tone: 'urgent',
        onScene: (i) => {
          if (i === 0) playSfx('chapter', 0.5);
          if (i === 1) playSfx('thunder');
          if (i === 4) playSfx('hiss', 0.3);
        },
      };
    case 4:
      return {
        scenes: [
          'CHAPTER 4 — THE NAME',
          'The guild had a reputation now.',
          'Not strays. Not odd-jobbers. An institution.',
          `The town council sent a messenger. They wanted to give ${catName}'s guild a name.`,
          'A formal recognition.',
          'Hard jobs. Sacred rites. Logic puzzles. The guild was ready for all of it.',
        ],
        image: 'assets/sprites/scenes/town_day.png',
        catSprite: catBreed,
        tone: 'neutral',
        onScene: (i) => { if (i === 0) playSfx('chapter', 0.5); if (i === 4) playSfx('chapter', 0.4); },
      };
    case 5:
      return {
        scenes: [
          'CHAPTER 5 — ESTABLISHED',
          'The lean-to is gone.',
          'In its place — a guildhall. Warm. Furnished. Full of life.',
          `${catName} looks around. Each cat with their own story. Their own strength.`,
          'A clowder.',
          `The notice is gone from the market wall. ${catName} took it down weeks ago, after the third recruit arrived. It was the only thing left from the lean-to.`,
          'The town knows their names. The merchants wave. The monks nod.',
          `From a stray in a storm to ${reputationLabel === 'Noble' ? 'the most trusted guild in town' : reputationLabel === 'Shadowed' ? 'a guild feared and wealthy' : 'a guild that earned its place'}.`,
          'Home.',
        ],
        image: 'assets/sprites/crest.png',
        catSprite: catBreed,
        tone: 'warm',
        onScene: (i) => { if (i === 0) playSfx('chapter', 0.5); if (i === 8) playSfx('chapter'); if (i === 4) playSfx('purr', 0.3); },
      };
    case 6:
      return {
        scenes: [
          'CHAPTER 6 — THE RIVAL',
          'The merchant had slipped an extra fish into the basket that morning, no charge. "For the founder," he said, not meeting eyes.',
          'Three days of soft sun. The kind of week the guild had stopped expecting.',
          'Then word arrived at dawn.',
          'A second guild had entered the town.',
          'The Silver Paws.',
          'Sleek. Well-funded. Hungry for work.',
          `${catName} watched from across the square.`,
          'This was no longer about survival.',
          'This was about legacy.',
        ],
        image: 'assets/sprites/scenes/town_day.png',
        catSprite: catBreed,
        tone: 'neutral',
        onScene: (i) => { if (i === 0) playSfx('chapter', 0.5); if (i === 5) playSfx('alarm', 0.3); },
      };
    case 7:
      return {
        scenes: [
          'CHAPTER 7 — THE INQUISITION',
          'A letter arrived.',
          'It bore the Bishop\u2019s seal.',
          '"We have heard of your guild. Cats that serve the saints — or so you claim."',
          `${catName} read the words twice.`,
          'Five days.',
          'Five days to prove what the guild truly was.',
          'The Bishop is watching.',
        ],
        image: 'assets/sprites/scenes/guildhall.png',
        catSprite: catBreed,
        tone: 'solemn',
        onScene: (i) => {
          if (i === 0) playSfx('chapter', 0.5);
          if (i === 1) playSfx('thunder');
          if (i === 5) playSfx('day_bell', 0.3);
        },
      };
    default:
      return null;
  }
}

/** Title displayed in the Memories list for each chapter intro. */
export const CHAPTER_INTRO_TITLES: Record<number, string> = {
  2: 'Chapter 2 — The Crew',
  3: 'Chapter 3 — The Rat Plague',
  4: 'Chapter 4 — The Name',
  5: 'Chapter 5 — Established',
  6: 'Chapter 6 — The Rival',
  7: 'Chapter 7 — The Inquisition',
};
