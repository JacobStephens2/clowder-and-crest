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
  /** Apply a cool-tint + CSS snow particle layer over the background.
   *  Used by the Long Winter scenes so the town visibly looks wintery
   *  without requiring a new pixel art asset. */
  winterOverlay?: boolean;
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
    const winterFilter = config.winterOverlay
      ? 'grayscale(0.5) brightness(0.7) contrast(1.1) hue-rotate(180deg)'
      : '';
    img.style.cssText = `position:absolute;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:420px;image-rendering:pixelated;opacity:${tone.imgOpacity};pointer-events:none;${winterFilter ? `filter:${winterFilter};` : ''}`;
    overlay.appendChild(img);
  }

  // Winter overlay — cool tint plus CSS snow particles. The 30 particles
  // are absolutely-positioned divs that animate downward with slight
  // horizontal drift via CSS keyframes injected once per overlay. No new
  // art, no canvas, just enough motion to read as "snowstorm" over the
  // existing town.png placeholder.
  if (config.winterOverlay) {
    const tint = document.createElement('div');
    tint.style.cssText = 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(120,150,200,0.18) 0%,rgba(180,200,230,0.12) 100%);pointer-events:none;';
    overlay.appendChild(tint);

    // Inject the snow keyframes once
    const styleId = 'narrative-snow-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes narrative-snow {
          0%   { transform: translate(0, -10vh); opacity: 0; }
          10%  { opacity: 0.9; }
          90%  { opacity: 0.9; }
          100% { transform: translate(var(--drift, 0), 110vh); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    const snowLayer = document.createElement('div');
    snowLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    for (let i = 0; i < 30; i++) {
      const flake = document.createElement('div');
      const size = 2 + Math.random() * 3;
      const left = Math.random() * 100;
      const drift = `${(Math.random() - 0.5) * 60}px`;
      const duration = 6 + Math.random() * 6;
      const delay = -Math.random() * duration;
      flake.style.cssText = `position:absolute;left:${left}vw;top:0;width:${size}px;height:${size}px;background:#e8eef5;border-radius:50%;--drift:${drift};animation:narrative-snow ${duration}s linear infinite;animation-delay:${delay}s;box-shadow:0 0 4px rgba(232,238,245,0.6);`;
      snowLayer.appendChild(flake);
    }
    overlay.appendChild(snowLayer);
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
