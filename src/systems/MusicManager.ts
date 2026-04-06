const BGM_TRACKS = [
  'assets/audio/guildhall.mp3',
  'assets/audio/castle_halls.mp3',
  'assets/audio/dawn_parapets.mp3',
  'assets/audio/market_stalls.mp3',
  'assets/audio/guildhall_2.mp3',
  'assets/audio/castle_halls_2.mp3',
  'assets/audio/dawn_parapets_2.mp3',
  'assets/audio/market_stalls_2.mp3',
];

const PUZZLE_TRACKS = [
  'assets/audio/puzzle_1.mp3',
  'assets/audio/puzzle_2.mp3',
];

const FIGHT_TRACKS = [
  'assets/audio/fight_1.mp3',
  'assets/audio/fight_2.mp3',
];

let bgmAudio: HTMLAudioElement | null = null;
let bgmMuted = localStorage.getItem('clowder_bgm_muted') === '1';
let bgmVolume = parseFloat(localStorage.getItem('clowder_bgm_volume') ?? '0.35');
let bgmTrackIndex = -1;
let currentMode: 'normal' | 'puzzle' | 'fight' = 'normal';
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function getTrackList(): string[] {
  if (currentMode === 'fight') return FIGHT_TRACKS;
  return currentMode === 'puzzle' ? PUZZLE_TRACKS : BGM_TRACKS;
}

function pickNextTrack(): string {
  const tracks = getTrackList();
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

export function switchToPuzzleMusic(): void {
  if (currentMode === 'puzzle') return;
  currentMode = 'puzzle';
  bgmTrackIndex = -1;
  playTrack(pickNextTrack());
}

export function switchToFightMusic(): void {
  if (currentMode === 'fight') return;
  currentMode = 'fight';
  bgmTrackIndex = -1;
  playTrack(pickNextTrack());
}

export function switchToNormalMusic(): void {
  if (currentMode === 'normal') return;
  currentMode = 'normal';
  bgmTrackIndex = -1;
  playTrack(pickNextTrack());
}

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
