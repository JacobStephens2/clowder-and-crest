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

let bgmAudio: HTMLAudioElement | null = null;
let bgmMuted = localStorage.getItem('clowder_bgm_muted') === '1';
let bgmTrackIndex = -1;
let currentMode: 'normal' | 'puzzle' = 'normal';

function getTrackList(): string[] {
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
  playTrack(pickNextTrack());
}

function playTrack(src: string): void {
  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio.removeEventListener('ended', onTrackEnded);
  }
  bgmAudio = new Audio(src);
  bgmAudio.volume = 0.35;
  bgmAudio.muted = bgmMuted;
  bgmAudio.addEventListener('ended', onTrackEnded);
  bgmAudio.play().catch(() => {
    bgmAudio = null;
  });
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
