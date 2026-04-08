// Relational Journal — replay viewed bond conversations.
//
// Per user feedback (2026-04-08): "add a way for the player to play
// through prior dialogue scenes again, like the day of rest feature,
// maybe titled relational journal or something." The naming options
// considered were:
//   - Relational Journal — clear, parallel to the existing Guild
//     Journal (an event log). Chosen because it tells the player
//     exactly what's inside without being clever.
//   - Bonds — too short, ambiguous (could mean the bond status panel).
//   - Memoirs / Shared Moments — pretty but vague.
//   - Memories — already used by the Day of Rest panel for minigame
//     replays. Reusing it would blur the two features.
//
// The journal lists every bond pair the player has formed, shows the
// current bond rank, and exposes the C/B/A conversations they've
// already viewed. Tapping a viewed conversation replays it through
// Conversations.replayConversation in no-stakes mode (no save
// mutation, no rank-up toast, no scene switch on close).

import type { SaveData } from '../systems/SaveManager';
import { BREED_NAMES } from '../utils/constants';
import { esc } from '../utils/helpers';
import { replayConversation } from './Conversations';
import { getBondRank } from '../systems/BondSystem';

interface JournalDeps {
  getGameState: () => SaveData | null;
  overlayLayer: HTMLElement;
}

let deps: JournalDeps;

export function initRelationalJournal(d: JournalDeps): void {
  deps = d;
}

interface ViewedEntry {
  breedA: string;
  breedB: string;
  rank: string;       // 'C', 'B', or 'A'
  rankLabel: string;  // human-readable C/B/A or first/second/third
}

const RANK_LABELS: Record<string, string> = {
  C: 'First conversation',
  B: 'Second conversation',
  A: 'Third conversation',
};

const BOND_RANK_LABELS: Record<string, string> = {
  stranger: 'Stranger',
  acquaintance: 'Acquaintance',
  companion: 'Companion',
  bonded: 'Bonded',
};

/** Render the Relational Journal as a menu-overlay panel. Lists every
 *  bond pair with viewed conversations and exposes a replay button per
 *  conversation. */
export function showRelationalJournalPanel(): void {
  const gameState = deps.getGameState();
  if (!gameState) return;

  deps.overlayLayer.querySelectorAll('.menu-overlay, .relational-journal-overlay').forEach((el) => el.remove());

  // Walk every bond and collect the viewed conversations. Bonds with
  // no viewed conversations are skipped — same hide-locked-content
  // principle as the Day of Rest panel.
  const pairsWithReplays: Array<{
    breedA: string;
    breedB: string;
    rank: ReturnType<typeof getBondRank>;
    viewed: ViewedEntry[];
  }> = [];

  for (const bond of gameState.bonds ?? []) {
    if (!bond.conversationsViewed || bond.conversationsViewed.length === 0) continue;
    const viewed: ViewedEntry[] = [];
    for (const rank of ['C', 'B', 'A']) {
      if (bond.conversationsViewed.includes(rank)) {
        viewed.push({
          breedA: bond.catA,
          breedB: bond.catB,
          rank,
          rankLabel: RANK_LABELS[rank] ?? rank,
        });
      }
    }
    if (viewed.length > 0) {
      pairsWithReplays.push({
        breedA: bond.catA,
        breedB: bond.catB,
        rank: getBondRank(bond.points),
        viewed,
      });
    }
  }

  const totalReplays = pairsWithReplays.reduce((sum, p) => sum + p.viewed.length, 0);

  const panel = document.createElement('div');
  panel.className = 'menu-overlay relational-journal-overlay';

  let html = `
    <button class="panel-close" id="rj-close">&times;</button>
    <h2>Relational Journal</h2>
    <div style="margin-bottom:8px;color:#8b7355;font-size:12px;font-style:italic;text-align:center;line-height:1.5">
      The conversations your guild has shared so far.<br>Tap one to revisit it.
    </div>
    <div style="margin-bottom:14px;color:#6b5b3e;font-size:11px;text-align:center">
      ${totalReplays} ${totalReplays === 1 ? 'conversation' : 'conversations'} shared
    </div>
  `;

  if (pairsWithReplays.length === 0) {
    html += `
      <div style="color:#6b5b3e;font-size:13px;text-align:center;padding:30px 20px;font-style:italic">
        No conversations yet. Build bonds between your cats and they'll start sharing moments worth remembering.
      </div>
    `;
  } else {
    for (const pair of pairsWithReplays) {
      const nameA = BREED_NAMES[pair.breedA] ?? pair.breedA;
      const nameB = BREED_NAMES[pair.breedB] ?? pair.breedB;
      const rankLabel = BOND_RANK_LABELS[pair.rank] ?? pair.rank;
      html += `
        <div style="margin-bottom:14px;padding:10px 12px;background:rgba(42,37,32,0.6);border:1px solid #3a3530;border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <div style="color:#c4956a;font-family:Georgia,serif;font-size:14px">${esc(nameA)} &amp; ${esc(nameB)}</div>
            <div style="color:#8b7355;font-size:11px">${esc(rankLabel)}</div>
          </div>
      `;
      for (const v of pair.viewed) {
        html += `
          <button class="rj-replay-btn" data-breed-a="${esc(v.breedA)}" data-breed-b="${esc(v.breedB)}" data-rank="${v.rank}" style="display:block;width:100%;padding:8px 10px;margin-bottom:4px;background:#2a2520;border:1px solid #3a3530;border-radius:4px;color:#c4956a;font-family:Georgia,serif;font-size:12px;cursor:pointer;text-align:left">
            <span style="color:#dda055;margin-right:8px">${v.rank}</span>${esc(v.rankLabel)}
          </button>
        `;
      }
      html += `</div>`;
    }
  }

  panel.innerHTML = html;
  deps.overlayLayer.appendChild(panel);

  document.getElementById('rj-close')!.addEventListener('click', () => panel.remove());

  panel.querySelectorAll<HTMLButtonElement>('.rj-replay-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const breedA = btn.dataset.breedA!;
      const breedB = btn.dataset.breedB!;
      const rank = btn.dataset.rank!;
      panel.remove();
      // Replay the conversation; reopen the journal when it ends so
      // the player can pick another or close out.
      replayConversation(breedA, breedB, rank, () => {
        showRelationalJournalPanel();
      });
    });
  });
}

/** Returns true if the player has at least one viewed conversation —
 *  used by the menu to decide whether to show the Relational Journal
 *  entry at all. A fresh save with no bonds shouldn't see an empty
 *  panel option in the menu. */
export function hasAnyRelationalJournalEntries(save: SaveData | null): boolean {
  if (!save) return false;
  return (save.bonds ?? []).some((b) => (b.conversationsViewed?.length ?? 0) > 0);
}
