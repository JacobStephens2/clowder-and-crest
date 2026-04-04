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

let bgmAudio: HTMLAudioElement | null = null;
let bgmMuted = localStorage.getItem('clowder_bgm_muted') === '1';
let bgmTrackIndex = -1;

function pickNextTrack(): string {
  let next: number;
  do {
    next = Math.floor(Math.random() * BGM_TRACKS.length);
  } while (next === bgmTrackIndex && BGM_TRACKS.length > 1);
  bgmTrackIndex = next;
  return BGM_TRACKS[next];
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
