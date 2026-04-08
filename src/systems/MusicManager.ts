// Music manager — per-scene track sets with crossfade between tracks.
//
// 2026-04-08: rewritten from a 3-mode (normal/puzzle/fight) pool model
// to a per-scene track set model after migrating to the shared-leitmotif
// music set (70 tracks total — 35 scenes × 2 variants each, including
// the post-migration Brawl 1 + Brawl 2 replacements). Each scene/state has
// its own dedicated track set; the manager picks a random variant each
// time and crossfades between them.
//
// Legacy 3-mode functions (switchToNormalMusic, switchToPuzzleMusic,
// switchToFightMusic) are kept as thin wrappers around switchToTrackset
// for backward compatibility with existing call sites in jobFlow.ts and
// main.ts. New code should call switchToTrackset directly.

// Per-scene track sets. Each entry is an array of variant mp3 paths;
// the manager picks one at random each time the set becomes active and
// rotates through the rest as the current track ends.
const TRACK_SETS: Record<string, string[]> = {
  // ── Title / world / hub ──
  title: ['assets/audio/title_screen_1.mp3', 'assets/audio/title_screen_2.mp3'],
  guildhall: ['assets/audio/guildhall_1.mp3', 'assets/audio/guildhall_2.mp3'],
  prologue: ['assets/audio/prologue_1.mp3', 'assets/audio/prologue_2.mp3'],

  // ── Town ──
  town_day: ['assets/audio/market_day_1.mp3', 'assets/audio/market_day_2.mp3'],
  town_dusk: ['assets/audio/dusk_night_1.mp3', 'assets/audio/dusk_night_2.mp3'],

  // ── Guildhall rooms ──
  sleeping: ['assets/audio/sleeping_quarters_1.mp3', 'assets/audio/sleeping_quarters_2.mp3'],
  kitchen: ['assets/audio/kitchen_1.mp3', 'assets/audio/kitchen_2.mp3'],
  operations: ['assets/audio/operations_hall_1.mp3', 'assets/audio/operations_hall_2.mp3'],

  // ── Chapter event tracks (chapter intros, plague, established, rival, inquisition) ──
  chapter_2: ['assets/audio/the_crew_1.mp3', 'assets/audio/the_crew_2.mp3'],
  chapter_3: ['assets/audio/rat_plague_1.mp3', 'assets/audio/rat_plague_2.mp3'],
  chapter_5: ['assets/audio/established_1.mp3', 'assets/audio/established_2.mp3'],
  chapter_6: ['assets/audio/silver_paws_1.mp3', 'assets/audio/silver_paws_2.mp3'],
  chapter_7: ['assets/audio/inquisition_1.mp3', 'assets/audio/inquisition_2.mp3'],

  // ── 14 minigames ──
  chase: ['assets/audio/chase_1.mp3', 'assets/audio/chase_2.mp3'],
  hunt: ['assets/audio/hunt_1.mp3', 'assets/audio/hunt_2.mp3'],
  fishing: ['assets/audio/fishing_1.mp3', 'assets/audio/fishing_2.mp3'],
  sokoban: ['assets/audio/sokoban_1.mp3', 'assets/audio/sokoban_2.mp3'],
  nonogram: ['assets/audio/nonogram_1.mp3', 'assets/audio/nonogram_2.mp3'],
  stealth: ['assets/audio/stealth_1.mp3', 'assets/audio/stealth_2.mp3'],
  pounce: ['assets/audio/pounce_1.mp3', 'assets/audio/pounce_2.mp3'],
  patrol: ['assets/audio/patrol_1.mp3', 'assets/audio/patrol_2.mp3'],
  ritual: ['assets/audio/ritual_1.mp3', 'assets/audio/ritual_2.mp3'],
  scent_trail: ['assets/audio/scent_trail_1.mp3', 'assets/audio/scent_trail_2.mp3'],
  heist: ['assets/audio/heist_1.mp3', 'assets/audio/heist_2.mp3'],
  courier_run: ['assets/audio/courier_run_1.mp3', 'assets/audio/courier_run_2.mp3'],
  slide_blocks: ['assets/audio/slide_blocks_1.mp3', 'assets/audio/slide_blocks_2.mp3'],
  brawl: ['assets/audio/brawl_1.mp3', 'assets/audio/brawl_2.mp3'],

  // ── Overlay / event tracks ──
  bond_conversation: ['assets/audio/bond_conversation_1.mp3', 'assets/audio/bond_conversation_2.mp3'],
  day_end: ['assets/audio/day_end_1.mp3', 'assets/audio/day_end_2.mp3'],
  game_over: ['assets/audio/game_over_1.mp3', 'assets/audio/game_over_2.mp3'],
  victory: ['assets/audio/victory_1.mp3', 'assets/audio/victory_2.mp3'],
  merchant_visit: ['assets/audio/merchant_visit_1.mp3', 'assets/audio/merchant_visit_2.mp3'],
  new_cat_recruited: ['assets/audio/new_cat_recruited_1.mp3', 'assets/audio/new_cat_recruited_2.mp3'],

  // ── Ambient variants (used by the legacy normal pool) ──
  castle_halls: ['assets/audio/castle_halls_1.mp3', 'assets/audio/castle_halls_2.mp3'],
  dawn_parapets: ['assets/audio/dawn_parapets_1.mp3', 'assets/audio/dawn_parapets_2.mp3'],
};

// Legacy "normal mode" pool — what plays in the guildhall when no scene
// has set its own trackset. Includes the guildhall + ambient variants
// so the player gets variety on the main hub.
const NORMAL_POOL: string[] = [
  ...TRACK_SETS.guildhall,
  ...TRACK_SETS.castle_halls,
  ...TRACK_SETS.dawn_parapets,
];

// Legacy "puzzle pool" — what the old switchToPuzzleMusic mapped to.
// Now combines several puzzle-genre minigame tracks for variety when
// a scene hasn't opted in to its own trackset.
const PUZZLE_POOL: string[] = [
  ...TRACK_SETS.sokoban,
  ...TRACK_SETS.nonogram,
  ...TRACK_SETS.slide_blocks,
  ...TRACK_SETS.scent_trail,
  ...TRACK_SETS.ritual,
];

// Legacy "fight pool" — for the old switchToFightMusic. Brawl is the
// only true combat scene; chase + hunt have driving energy too.
const FIGHT_POOL: string[] = [
  ...TRACK_SETS.brawl,
  ...TRACK_SETS.chase,
  ...TRACK_SETS.hunt,
];

let bgmAudio: HTMLAudioElement | null = null;
let bgmMuted = localStorage.getItem('clowder_bgm_muted') === '1';
let bgmVolume = parseFloat(localStorage.getItem('clowder_bgm_volume') ?? '0.35');
let currentTrackList: string[] = NORMAL_POOL;
let currentSetName: string = '__normal_pool__';
let bgmTrackIndex = -1;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function pickNextTrack(): string {
  const tracks = currentTrackList;
  if (tracks.length === 0) return '';
  let next: number;
  do {
    next = Math.floor(Math.random() * tracks.length);
  } while (next === bgmTrackIndex && tracks.length > 1);
  bgmTrackIndex = next;
  return tracks[next];
}

function onTrackEnded(): void {
  playTrack(pickNextTrack(), false);
}

function clearFade(): void {
  if (fadeTimer !== null) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fadeOutAndStop(audio: HTMLAudioElement, duration: number, cb: () => void): void {
  clearFade();
  const startVol = audio.volume;
  const steps = Math.max(1, Math.floor(duration / 20));
  const decrement = startVol / steps;
  let step = 0;
  fadeTimer = setInterval(() => {
    step++;
    audio.volume = Math.max(0, startVol - decrement * step);
    if (step >= steps) {
      clearFade();
      audio.pause();
      audio.removeEventListener('ended', onTrackEnded);
      cb();
    }
  }, 20);
}

function playTrack(src: string, fade = true): void {
  if (!src) return;
  const startNew = () => {
    bgmAudio = new Audio(src);
    bgmAudio.volume = bgmVolume;
    bgmAudio.muted = bgmMuted;
    bgmAudio.addEventListener('ended', onTrackEnded);
    bgmAudio.play().catch(() => {
      bgmAudio = null;
    });
  };

  if (bgmAudio && fade) {
    const old = bgmAudio;
    bgmAudio = null;
    fadeOutAndStop(old, 300, startNew);
  } else {
    if (bgmAudio) {
      bgmAudio.pause();
      bgmAudio.removeEventListener('ended', onTrackEnded);
    }
    startNew();
  }
}

export function startBgm(): void {
  if (bgmAudio) return;
  playTrack(pickNextTrack());
}

/** Switch to a named track set. The set names match the keys of TRACK_SETS
 *  above (e.g. 'chase', 'kitchen', 'bond_conversation'). If the set is
 *  already active this is a no-op. If the set name doesn't exist, falls
 *  back to the normal pool.
 *
 *  This is the primary API new code should use. The legacy 3-mode
 *  functions below are thin wrappers around this. */
export function switchToTrackset(setName: string): void {
  if (currentSetName === setName) return;
  currentSetName = setName;
  const tracks = TRACK_SETS[setName];
  currentTrackList = tracks && tracks.length > 0 ? tracks : NORMAL_POOL;
  bgmTrackIndex = -1;
  playTrack(pickNextTrack());
}

/** List of valid trackset names — useful for tests + assertions. */
export function getTracksetNames(): string[] {
  return Object.keys(TRACK_SETS);
}

// ──── Legacy 3-mode API (kept for backward compatibility) ────

export function switchToPuzzleMusic(): void {
  if (currentSetName === '__puzzle_pool__') return;
  currentSetName = '__puzzle_pool__';
  currentTrackList = PUZZLE_POOL;
  bgmTrackIndex = -1;
  playTrack(pickNextTrack());
}

export function switchToFightMusic(): void {
  if (currentSetName === '__fight_pool__') return;
  currentSetName = '__fight_pool__';
  currentTrackList = FIGHT_POOL;
  bgmTrackIndex = -1;
  playTrack(pickNextTrack());
}

export function switchToNormalMusic(): void {
  if (currentSetName === '__normal_pool__') return;
  currentSetName = '__normal_pool__';
  currentTrackList = NORMAL_POOL;
  bgmTrackIndex = -1;
  playTrack(pickNextTrack());
}

// ──── Mute / volume ────

export function toggleMute(): boolean {
  bgmMuted = !bgmMuted;
  localStorage.setItem('clowder_bgm_muted', bgmMuted ? '1' : '0');
  if (bgmAudio) {
    bgmAudio.muted = bgmMuted;
  }
  return bgmMuted;
}

export function isMuted(): boolean {
  return bgmMuted;
}

export function setBgmVolume(vol: number): void {
  bgmVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem('clowder_bgm_volume', String(bgmVolume));
  if (bgmAudio) bgmAudio.volume = bgmVolume;
}

export function getBgmVolume(): number {
  return bgmVolume;
}

export function pauseMusic(): void {
  if (bgmAudio) bgmAudio.pause();
}

export function resumeMusic(): void {
  if (bgmAudio && !bgmMuted) bgmAudio.play().catch(() => {});
}
