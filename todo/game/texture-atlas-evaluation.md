# Texture Atlas Evaluation (2026-04-06)

## Status
**Deferred.** Not worth the dev workflow friction at current scale.

## The numbers

- **434** sprite PNG files, **2.3 MB** total
- **390** of those are breed sprites: 6 breeds × 65 files each, 304 KB per breed
  - Per breed: 4 idle directions + 6 walk frames × 4 directions + 12-frame scratch + 8-frame sit + 7-frame eat + 10-frame sleep = ~65 frames
- **44** standalone sprites (crest, dog, fish, guard, furniture, blocks, jobs, dialogues)

## With atlases
- 6 breed atlases × 2 files (PNG + JSON) = 12 requests
- ~44 standalone files
- **~56 total requests** vs. **434 currently**

## Why it's not worth it right now

1. **HTTP/2 multiplexing mitigates the request count.** Apache serves HTTP/2, so 434 requests over one connection is much less painful than it looks.
2. **The splash-screen loader bar hides the load.** Players don't see a jarring pause — they see a progress bar and then the title.
3. **Repeat visits hit the HTTP cache.** The load cost is a one-time (per cache clear) hit.
4. **Dev workflow friction.** Sprites are regenerated frequently via PixelLab. With atlases, every new sprite requires re-running a pack script. That's a tax on the iteration loop that the game's early development has been optimized around.

## If we ever revisit

**The best implementation path** would be an automated build-time pack step:

```bash
npm install --save-dev free-tex-packer-core
```

Then a `scripts/pack-atlases.mjs` that:
1. Reads each `public/assets/sprites/<breed>/` directory
2. Packs into `public/assets/atlases/<breed>.png` + `.json`
3. Runs as a `prebuild` npm script (`"prebuild": "node scripts/pack-atlases.mjs"`)

And `BootScene.ts` switches from:
```ts
this.load.image(`${breed}_walk_${dir}_${f}`, `assets/sprites/${breed}/walk/${dir}/${f}.png`);
```
to:
```ts
this.load.atlas(breed, `assets/atlases/${breed}.png`, `assets/atlases/${breed}.json`);
// Then animations reference frames as: { key: breed, frame: `walk_${dir}_${f}` }
```

This keeps the dev workflow the same (individual files, drop-in changes) while getting the prod benefit.

## Real criteria for when to revisit

- **Cold-load time exceeds 3s on a 4G connection** (currently ~1.5s)
- **We add a second language or extra breed tier** that pushes us past 600+ files
- **We start getting bug reports about initial load hitches**
- **We ship to a platform that charges per-request** (CDN egress, mobile app bundling)

Until then, the existing pipeline is fine.

## Alternative: Phaser Multi Atlas
Phaser also supports `load.multiatlas` for atlases that span multiple textures. If we ever pack, we should use this format so we can split huge atlases across multiple PNG files (e.g. to stay under mobile GPU texture size limits of 2048×2048).
