// "Move to another room?" picker - opens when the player drags a piece
// of furniture off the grid in RoomScene.
//
// Originally inlined in RoomScene's furniture drag handler. Extracted for
// the same reasons as ExileChoice: put the overlay's HTML in one focused
// file, one that loads without Phaser so the logic tests can render it.

import { esc } from '../../utils/helpers';
import type { RoomSaveData } from '../../systems/SaveManager';

export interface MoveFurniturePickerOptions {
  /** The furniture being moved, e.g. `straw_bed`. Shown in the title. */
  furnitureId: string;
  /** The rooms offered, one button each. */
  rooms: RoomSaveData[];
  /** The player picked a room. Called with its id after the picker is removed. */
  onMove: (roomId: string) => void;
  /** The player closed or cancelled. Called after the picker is removed. */
  onClose: () => void;
}

export function showMoveFurniturePicker(options: MoveFurniturePickerOptions): void {
  const picker = document.createElement('div');
  picker.className = 'assign-overlay';
  const fLabel = options.furnitureId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  picker.innerHTML = `
    <button class="panel-close" id="move-furn-close">&times;</button>
    <h2>Move ${esc(fLabel)}</h2>
    <div style="color:#8b7355;margin-bottom:12px">Move to another room?</div>
    ${options.rooms.map((r) => {
      const rLabel = r.id === 'sleeping' ? 'Sleeping Quarters' : r.id === 'kitchen' ? 'Kitchen' : 'Operations';
      return `<button class="menu-btn move-furn-btn" data-room="${esc(r.id)}">${rLabel}</button>`;
    }).join('')}
    <button class="menu-btn" id="move-furn-cancel" style="margin-top:12px">Cancel</button>
  `;
  document.getElementById('overlay-layer')?.appendChild(picker);
  const close = () => {
    picker.remove();
    options.onClose();
  };
  document.getElementById('move-furn-close')!.addEventListener('click', close);
  document.getElementById('move-furn-cancel')!.addEventListener('click', close);
  picker.querySelectorAll('.move-furn-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      picker.remove();
      options.onMove(btn.getAttribute('data-room')!);
    });
  });
}
