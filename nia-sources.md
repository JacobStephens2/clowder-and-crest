# Nia Indexed Sources

Track sources indexed via Nia so future sessions skip discovery. Update this whenever `nia sources add` or `nia repos add` succeeds.

## Indexed Docs

_(none yet)_

## Indexed GitHub Repos

_(none yet — use `nia github search/tree/read` for live search without indexing)_

## Candidates to Index (only if we start consulting them frequently)

- `docs.phaser.io` — Phaser 3 API reference (slot: sources)
- `phaserjs/phaser` GitHub repo — for source-level lookups beyond what live search covers
- `capacitorjs/capacitor` — Capacitor core, if Android build issues recur
- `liabru/matter-js` — Matter.js physics, only if PounceScene physics gets deeper

## Notes

- Free plan: only 3 indexing slots per month. Index conservatively.
- `nia github search` is rate-limited to 10/min but unlimited total — prefer it for one-off code questions.
- Always index the root URL for docs sites (e.g. `docs.phaser.io`, not a specific page).
