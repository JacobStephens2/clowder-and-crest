// Simple HTML5 Audio SFX player (works outside Phaser scenes)
const sfxCache = new Map<string, HTMLAudioElement>();
let sfxMuted = localStorage.getItem('clowder_sfx_muted') === '1';

function getAudio(key: string): HTMLAudioElement | null {
  if (sfxCache.has(key)) return sfxCache.get(key)!;
  const paths: Record<string, string> = {
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
  };
  const path = paths[key];
  if (!path) return null;
  const audio = new Audio(path);
  sfxCache.set(key, audio);
  return audio;
}

export function playSfx(key: string, volume = 0.5): void {
  if (sfxMuted) return;
  const audio = getAudio(key);
  if (!audio) return;
  audio.volume = volume;
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
