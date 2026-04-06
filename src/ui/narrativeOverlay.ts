/**
 * Reusable narrative scene overlay.
 * Shows a sequence of text panels with background image, character sprite,
 * and tone-aware styling. Player taps to advance.
 */

export interface NarrativeConfig {
  scenes: string[];
  image?: string;
  /** Cat breed to show as a large sprite (e.g. 'wildcat') */
  catSprite?: string;
  /** Tone affects background color, text color, and fade speed */
  tone?: 'neutral' | 'dark' | 'warm' | 'urgent' | 'solemn';
  onScene?: (index: number) => void;
  onComplete?: () => void;
}

const TONE_STYLES: Record<string, { bg: string; text: string; accent: string; fadeMs: number; imgOpacity: number }> = {
  neutral: { bg: '#0a0908', text: '#c4956a', accent: '#8b7355', fadeMs: 500, imgOpacity: 0.35 },
  dark:    { bg: '#06050a', text: '#cc8888', accent: '#6b4444', fadeMs: 400, imgOpacity: 0.2 },
  warm:    { bg: '#0f0c08', text: '#ddb87a', accent: '#8b7355', fadeMs: 700, imgOpacity: 0.45 },
  urgent:  { bg: '#0a0606', text: '#cc6666', accent: '#884444', fadeMs: 300, imgOpacity: 0.25 },
  solemn:  { bg: '#08080c', text: '#aaaacc', accent: '#6666aa', fadeMs: 600, imgOpacity: 0.3 },
};

export function showNarrativeOverlay(config: NarrativeConfig): void {
  const { scenes, image, catSprite, onScene, onComplete } = config;
  const tone = TONE_STYLES[config.tone ?? 'neutral'];
  let idx = 0;

  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:${tone.bg};z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:30px;overflow:hidden;`;

  // Background image — full width, tone-appropriate opacity
  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.style.cssText = `position:absolute;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:420px;image-rendering:pixelated;opacity:${tone.imgOpacity};pointer-events:none;`;
    overlay.appendChild(img);
  }

  // Character sprite — large, pixel-art, centered above text
  if (catSprite) {
    const sprite = document.createElement('img');
    sprite.src = `assets/sprites/${catSprite}/south.png`;
    sprite.style.cssText = 'width:96px;height:96px;image-rendering:pixelated;margin-bottom:12px;position:relative;z-index:1;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));';
    overlay.appendChild(sprite);
  }

  const textDiv = document.createElement('div');
  textDiv.style.cssText = `color:${tone.text};font-family:Georgia,serif;font-size:15px;text-align:center;max-width:320px;line-height:1.8;position:relative;z-index:1;`;
  overlay.appendChild(textDiv);

  const hint = document.createElement('div');
  hint.style.cssText = `color:${tone.accent};font-size:11px;margin-top:20px;font-family:Georgia,serif;position:relative;z-index:1;opacity:0.6;`;
  hint.textContent = 'Tap to continue';
  overlay.appendChild(hint);

  const showScene = () => {
    if (idx >= scenes.length) {
      overlay.style.transition = 'opacity 0.5s';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        onComplete?.();
      }, 500);
      return;
    }

    const text = scenes[idx];
    // Short panels (under 30 chars) get larger font for dramatic emphasis
    const isShort = text.length < 30;

    textDiv.style.opacity = '0';
    textDiv.textContent = text;
    textDiv.style.fontSize = isShort ? '20px' : '15px';
    textDiv.style.fontStyle = isShort ? 'italic' : 'normal';

    setTimeout(() => {
      textDiv.style.transition = `opacity ${tone.fadeMs}ms`;
      textDiv.style.opacity = '1';
    }, 50);

    onScene?.(idx);
    idx++;
  };

  showScene();
  overlay.addEventListener('click', showScene);
  document.body.appendChild(overlay);
}
