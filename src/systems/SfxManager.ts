// Simple HTML5 Audio SFX player (works outside Phaser scenes)
// Uses a small pool (up to 3 elements) per sound so rapid plays don't collide.
const POOL_SIZE = 3;
const sfxPool = new Map<string, HTMLAudioElement[]>();
let sfxMuted = localStorage.getItem('clowder_sfx_muted') === '1';
let sfxVolume = parseFloat(localStorage.getItem('clowder_sfx_volume') ?? '0.5');

// Variant pools — when one of these keys is requested, playSfx picks a
// random child key each time. The previously-played child is excluded
// from the next pick so the player never hears the same sound twice in
// a row. Per user feedback (2026-04-08): the single victory.mp3 was
// repetitive at the end of every minigame, so 'victory' rotates through
// a pool of triumphant sounds (the dedicated fanfare plus chapter-up,
// sparkle, and bell chime).
const SFX_POOLS: Record<string, string[]> = {
  victory: ['victory_fanfare', 'chapter', 'sparkle', 'bell_chime'],
  // Anti-repetition pools for high-frequency SFX (per sfx-gaps-audit.md
  // Tier 3). Each pool rotates variants so the player never hears the
  // exact same sample twice in a row.
  block_snap: ['block_snap_1', 'block_snap_2'],
  dialogue_advance: ['page_turn_1', 'page_turn_2'],
  swipe: ['swipe_1', 'swipe_2'],
  footstep_stone: ['footstep_stone_1', 'footstep_stone_2'],
};
const lastPoolPick: Record<string, string> = {};

const SFX_PATHS: Record<string, string> = {
  victory_fanfare: 'assets/sfx/victory.mp3',
  fish_earn: 'assets/sfx/fish_earn.mp3',
  block_slide: 'assets/sfx/block_slide.mp3',
  purr: 'assets/sfx/purr.mp3',
  day_bell: 'assets/sfx/day_bell.mp3',
  job_accept: 'assets/sfx/job_accept.mp3',
  chapter: 'assets/sfx/chapter_complete.mp3',
  tap: 'assets/sfx/ui_tap.mp3',
  hiss: 'assets/sfx/cat_hiss.mp3',
  // 'victory' is dispatched through SFX_POOLS above; the underlying
  // file is registered as 'victory_fanfare' to keep the pool dispatch
  // path the only way to play it.
  recruit: 'assets/sfx/recruit.mp3',
  furniture: 'assets/sfx/furniture_place.mp3',
  rat_caught: 'assets/sfx/rat_caught.mp3',
  fail: 'assets/sfx/fail.mp3',
  splash: 'assets/sfx/fish_splash.mp3',
  thunder: 'assets/sfx/thunder.mp3',
  room_unlock: 'assets/sfx/room_unlock.mp3',
  cat_sad: 'assets/sfx/cat_sad.mp3',
  sparkle: 'assets/sfx/sparkle.mp3',
  alarm: 'assets/sfx/alarm.mp3',
  crate_push: 'assets/sfx/crate_push.mp3',
  merchant: 'assets/sfx/merchant.mp3',
  bark: 'assets/sfx/bark.mp3',
  lock_click: 'assets/sfx/lock_click.mp3',
  lock_open: 'assets/sfx/lock_open.mp3',
  bell_chime: 'assets/sfx/bell_chime.mp3',
  sniff: 'assets/sfx/sniff.mp3',
  match_strike: 'assets/sfx/match_strike.mp3',
  // New purpose-built SFX (Freesound, 2026-04-10)
  block_snap_1: 'assets/sfx/block_snap.mp3',
  block_snap_2: 'assets/sfx/block_snap_2.mp3',
  page_turn_1: 'assets/sfx/page_turn.mp3',
  page_turn_2: 'assets/sfx/page_turn_2.mp3',
  swipe_1: 'assets/sfx/swipe.mp3',
  swipe_2: 'assets/sfx/swipe_2.mp3',
  fish_catch: 'assets/sfx/fish_splash_catch.mp3',
  flame_out: 'assets/sfx/flame_out.mp3',
  footstep_stone_1: 'assets/sfx/footstep_stone.mp3',
  footstep_stone_2: 'assets/sfx/footstep_stone_2.mp3',
};

function getAvailableAudio(key: string): HTMLAudioElement | null {
  const path = SFX_PATHS[key];
  if (!path) return null;

  let pool = sfxPool.get(key);
  if (!pool) {
    pool = [];
    sfxPool.set(key, pool);
  }

  // Find an element that has ended or hasn't started playing
  for (const el of pool) {
    if (el.ended || el.paused) return el;
  }

  // Pool not full — create a new element
  if (pool.length < POOL_SIZE) {
    const el = new Audio(path);
    pool.push(el);
    return el;
  }

  // All busy — steal the oldest (first) element by restarting it
  return pool[0];
}

export function playSfx(key: string, volume?: number): void {
  if (sfxMuted) return;
  // Variant-pool dispatch: pools rotate through child sounds, never
  // playing the same one twice in a row. The pool key itself isn't a
  // real audio file — it's a category name like 'victory'.
  const pool = SFX_POOLS[key];
  if (pool && pool.length > 0) {
    let pick: string;
    if (pool.length === 1) {
      pick = pool[0];
    } else {
      const last = lastPoolPick[key];
      const candidates = pool.filter((k) => k !== last);
      pick = candidates[Math.floor(Math.random() * candidates.length)];
    }
    lastPoolPick[key] = pick;
    const audio = getAvailableAudio(pick);
    if (!audio) return;
    audio.volume = volume ?? sfxVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  const audio = getAvailableAudio(key);
  if (!audio) return;
  audio.volume = volume ?? sfxVolume;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function toggleSfxMute(): boolean {
  sfxMuted = !sfxMuted;
  localStorage.setItem('clowder_sfx_muted', sfxMuted ? '1' : '0');
  return sfxMuted;
}

export function isSfxMuted(): boolean {
  return sfxMuted;
}

export function setSfxVolume(vol: number): void {
  sfxVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem('clowder_sfx_volume', String(sfxVolume));
}

export function getSfxVolume(): number {
  return sfxVolume;
}
