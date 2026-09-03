# Scenes chip

**Emptied 2026-09-03 ([issue #16](https://github.com/pdehlke/homeassistant/issues/16)).** The chip
still exists in the bottom row (`isSceneChip: true`, `showCount: true`, chevron present), but
`subGroups` is `[]`: there are no bubbles to tap. Both scenes it used to point at,
`scene.bedroom_evening` and `scene.bathroom_evening`, were deleted 2026-09-02 with the rest of the
placeholder Crestron-PoC fleet. The mechanism this file used to describe below (a real on/off
toggle per bubble, live-derived state, grouped bubbles) is untouched in the code and its tests —
see [docs/homie-dashboard/homie-scenes-chip.md](../../../../../homeassistant/docs/homie-dashboard/homie-scenes-chip.md)
in the sibling `homeassistant` repo for the full mechanism, the emptying record, and the three
bubble icons preserved verbatim for whenever a real scene catalogue refills this chip. Read that
document before reaching for this feature file to drive a bubble that currently doesn't exist.

Until refilled, this is a **read-only, non-mutating** feature: there is nothing here that changes
real lights.

## Sub-features

- `scene-empty-popup` — tapping the chip opens a popup titled "SCENES" showing a centered "No
  scenes configured" message (`.popup-scene-empty`), not a blank popup and not an error.
- `scene-chip-quiet` — the chip itself shows no count badge and no glow, since
  `refreshControls`'s `isSceneChip` branch computes both from an empty `subGroups`.

## How to get to it (user POV)

- Bottom chip row, "SCENES" chip, on any Overview screen. Tap to open; there is nothing to tap
  inside.

## Driving it with playwright-cli

Preconditions: `doctor.py` passes.

- **Load direct-file (no HA login needed — nothing here depends on which account is "logged
  in").**

  ```bash
  playwright-cli open "https://hass.ehlke.net/local/community/homie-dashboard/homie-dashboard.html?v=<version>"
  playwright-cli snapshot
  playwright-cli click <ref-for-"Scenes ›">
  playwright-cli screenshot --filename=../evidence/scenes-empty-popup.png
  ```

  Screenshot should show the "SCENES" header and "NO SCENES CONFIGURED" (or equivalent
  case-transformed by CSS) centered underneath, nothing else, no console error beyond the
  already-known-benign noise (`navigator.vibrate`, `/api/states/` 404s, favicon).

- **Cleanup.** `playwright-cli close`. No auth-state file was created; nothing to restore.

## Gotchas

- `isSceneChip` takes its own early-return path in `openPopup` (a bespoke bubble grid, not the
  generic accordion every other emptied chip falls through to), so don't assume proof that an
  emptied Lights-style chip renders cleanly also covers this one — it was checked separately, see
  the sibling repo's checkpoint linked above.
- Do not try to exercise `scene-on`/`scene-off`/`scene-grouped` against this live instance until a
  real scene catalogue exists again. The functions (`sceneIsOn`, `sceneAffectedEntities`,
  `togglePopupScene`) still work and are still covered by `test/screen-a.test.cjs`'s synthetic-state
  unit tests; there is just nothing configured for them to act on in `dist/config.js` right now.
