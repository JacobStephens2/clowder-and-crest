/**
 * Reusable narrative scene overlay.
 * Shows a sequence of text panels with an optional background image.
 * Player taps to advance through scenes, then the overlay fades out.
 */

export interface NarrativeConfig {
  scenes: string[];
  image?: string;       // e.g. 'assets/sprites/scenes/guildhall.png'
  onScene?: (index: number) => void;  // called when each scene is shown
  onComplete?: () => void;
}

export function showNarrativeOverlay(config: NarrativeConfig): void {
  const { scenes, image, onScene, onComplete } = config;
  let idx = 0;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#0a0908;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:30px;';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.style.cssText = 'width:280px;image-rendering:pixelated;margin-bottom:16px;border-radius:4px;opacity:0.4;';
    overlay.appendChild(img);
  }

  const textDiv = document.createElement('div');
  textDiv.style.cssText = 'color:#c4956a;font-family:Georgia,serif;font-size:15px;text-align:center;max-width:320px;line-height:1.7;';
  overlay.appendChild(textDiv);

  const hint = document.createElement('div');
  hint.style.cssText = 'color:#555;font-size:11px;margin-top:16px;font-family:Georgia,serif;';
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
    textDiv.style.opacity = '0';
    textDiv.textContent = scenes[idx];
    setTimeout(() => { textDiv.style.transition = 'opacity 0.5s'; textDiv.style.opacity = '1'; }, 50);
    onScene?.(idx);
    idx++;
  };

  showScene();
  overlay.addEventListener('click', showScene);
  document.body.appendChild(overlay);
}
