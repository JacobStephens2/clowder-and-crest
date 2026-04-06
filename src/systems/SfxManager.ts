// Simple HTML5 Audio SFX player (works outside Phaser scenes)
// Uses a small pool (up to 3 elements) per sound so rapid plays don't collide.
const POOL_SIZE = 3;
const sfxPool = new Map<string, HTMLAudioElement[]>();
let sfxMuted = localStorage.getItem('clowder_sfx_muted') === '1';
let sfxVolume = parseFloat(localStorage.getItem('clowder_sfx_volume') ?? '0.5');

const SFX_PATHS: Record<string, string> = {
  fish_earn: 'assets/sfx/fish_earn.mp3',
  block_slide: 'assets/sfx/block_slide.mp3',
  purr: 'assets/sfx/purr.mp3',
  day_bell: 'assets/sfx/day_bell.mp3',
  job_accept: 'assets/sfx/job_accept.mp3',
  chapter: 'assets/sfx/chapter_complete.mp3',
  tap: 'assets/sfx/ui_tap.mp3',
  hiss: 'assets/sfx/cat_hiss.mp3',
  victory: 'assets/sfx/victory.mp3',
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
