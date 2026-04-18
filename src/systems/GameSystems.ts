// ── Job combo tracking ──
const jobCombos = new Map<string, { category: string; count: number; lastDay: number }>();

export function getComboMultiplier(catId: string, category: string, day: number): number {
  const combo = jobCombos.get(catId);
  if (combo && combo.category === category && combo.lastDay === day - 1) {
    return 1 + Math.min(combo.count, 5) * 0.05;
  }
  return 1;
}

export function updateCombo(catId: string, category: string, day: number): number {
  const combo = jobCombos.get(catId);
  let count = 1;
  if (combo && combo.category === category && combo.lastDay === day - 1) {
    count = combo.count + 1;
  }
  jobCombos.set(catId, { category, count, lastDay: day });
  return count;
}

// ── Daily cat wish system ──
export function getDailyWish(day: number, cats: { id: string; name: string }[], ownedFurniture?: string[]): { catId: string; catName: string; wish: string; reward: string; requiresFurniture?: string } | null {
  if (cats.length < 2) return null;
  const rng = (day * 7919) % cats.length;
  const cat = cats[rng];
  const wishes = [
    { wish: 'wants a fish treat', reward: '+5 mood', furniture: 'fish_barrel' },
    { wish: 'wants to explore a room', reward: '+2 bond' },
    { wish: 'wants to scratch something', reward: '+1 agility', furniture: 'scratching_post' },
    // Per playtest (2026-04-18): "this should be able to be fulfilled
    // by any sleeping furniture." Changed from straw_bed to any of the
    // three sleeping-room items.
    { wish: 'wants to nap in a warm spot', reward: '+3 mood', furniture: 'straw_bed', altFurniture: ['woolen_blanket', 'cushioned_basket'] },
    { wish: 'wants to play with a friend', reward: '+3 bond', furniture: 'potted_catnip' },
  ];
  const pick = wishes[(day * 1013) % wishes.length];

  // Check if player has the required furniture (or an alternative)
  if (pick.furniture && ownedFurniture) {
    const allOptions = [pick.furniture, ...(pick.altFurniture ?? [])];
    const hasFurniture = allOptions.some(f => ownedFurniture.includes(f));
    if (!hasFurniture) {
      return { catId: cat.id, catName: cat.name, wish: pick.wish, reward: pick.reward, requiresFurniture: pick.furniture };
    }
  }

  return { catId: cat.id, catName: cat.name, wish: pick.wish, reward: pick.reward };
}

// ── Festival system ──
const FESTIVALS = [
  { name: 'Feast of St. Gertrude', bonus: 'All pest control jobs pay double today.', category: 'pest_control', multiplier: 2 },
  { name: 'Market Festival', bonus: 'All courier jobs pay double today.', category: 'courier', multiplier: 2 },
  { name: 'Night of the Watch', bonus: 'All guard jobs pay double today.', category: 'guard', multiplier: 2 },
  { name: 'Festival of Lights', bonus: 'All sacred jobs pay double today.', category: 'sacred', multiplier: 2 },
  { name: 'Day of Mysteries', bonus: 'All detection jobs pay double today.', category: 'detection', multiplier: 2 },
  { name: 'Fisherman\'s Bounty', bonus: 'Fishing minigames give triple fish!', category: 'all', multiplier: 1.5 },
  { name: 'Guild Anniversary', bonus: 'All jobs pay +50%. Celebrate!', category: 'all', multiplier: 1.5 },
];

export function getCurrentFestival(day: number, save?: { flags: Record<string, any> }): typeof FESTIVALS[number] | null {
  if (day % 7 !== 0 || day === 0) return null;
  // Per playtest (2026-04-18): "don't have market festivals during
  // the rat plague, as it thematically doesn't fit." Suppress
  // festivals while the plague is active.
  if (save?.flags?.ratPlagueStarted && !save?.flags?.ratPlagueResolved) return null;
  return FESTIVALS[(day / 7) % FESTIVALS.length];
}

// ── Analytics ──
export function trackEvent(name: string, params?: Record<string, any>): void {
  try { (window as any).gtag?.('event', name, params); } catch { /* ignore */ }
}
