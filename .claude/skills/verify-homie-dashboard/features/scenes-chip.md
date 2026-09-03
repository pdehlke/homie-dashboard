# Scenes chip

**Refilled 2026-09-03** with the first real scene, "Dinner", after being emptied earlier the same
day ([issue #16](https://github.com/pdehlke/homeassistant/issues/16)), then joined the same day by
a second scene, "Visitors". The chip is a real, **mutating** feature again: `light.turn_on`/
`homeassistant.turn_off` on a room's (or the whole house's) lights and `homeassistant.turn_on` on a
Home Assistant script.

Neither scene is a `scene.*` snapshot entity. Both need a conditional (turn off the TV only if it's
on) and a service-call sequence (start a specific radio station through Harmony) that a native
scene can't express, so each is backed by its own HA script — `script.scene_dinner` and
`script.scene_visitors` — instead. Dinner was the first bubble to use the chip's generalized
mechanism: `entities` is what the bubble's on/off glow follows and what a tap-while-on turns off;
`activate` is the separate entity a tap-while-off actually runs. Visitors reuses that same
mechanism verbatim — it needed a config entry, not a code change. See
[docs/homie-dashboard/homie-scenes-chip.md](../../../../../homeassistant/docs/homie-dashboard/homie-scenes-chip.md)
in the sibling `homeassistant` repo for the full mechanism and history.

## Sub-features

- `scene-popup` — tapping the chip opens a popup titled "SCENES" with one group ("Scenes")
  containing two bubbles, "Dinner" (candle icon) and "Visitors" (two-person icon).
- `scene-dinner-on` — tapping Dinner while off calls `homeassistant.turn_on` targeting
  `script.scene_dinner`, which (per the script's own logic, not this dashboard) turns off the TV if
  it was on, turns on the Kitchen/Dining Room/Living Room Pathway lights, and starts "Jazz: Hiromi"
  through Harmony. The bubble glows on once any of those ten lights reports on.
- `scene-dinner-off` — tapping Dinner while on calls `homeassistant.turn_off` against exactly the
  ten backing lights (`light.kitchen_cabinet`, `light.kitchen_island`, `light.kitchen_pathway`,
  `light.kitchen_perimeter`, `light.kitchen_range`, `light.dining_room_north`,
  `light.dining_room_powder`, `light.dining_room_south`, `light.dining_room_table`,
  `light.living_room_pathway`). This does **not** stop the music or touch `remote.harmony_hub` —
  by design, per the chosen bubble behavior (glow tracks the lights, not the script's own transient
  running-state).
- `scene-visitors-on` — tapping Visitors while off calls `homeassistant.turn_on` targeting
  `script.scene_visitors`: same TV-off-if-on and Jazz:Hiromi-through-Harmony sequence as Dinner, but
  turns on all 30 of the house's `light.*` entities (every room, plus both courtyard fixtures and
  both "outside" ones) instead of just ten. The bubble glows on once any of those 30 lights reports
  on.
- `scene-visitors-off` — tapping Visitors while on calls `homeassistant.turn_off` against all 30
  backing lights. Same non-reversal of music/Harmony as Dinner's off-tap, by the same design.

## How to get to it (user POV)

- Bottom chip row, "SCENES" chip, on any Overview screen. Tap to open, tap "Dinner" or "Visitors"
  inside.

## Driving it with playwright-cli

Preconditions: `doctor.py` passes. **Mutating**: this starts real audio and real lighting, and
switches the Harmony hub's activity. Visitors touches every light in the house, not just one room —
confirm the house's actual state (not just an assumption) before running either bubble, and restore
it after.

- **Load direct-file (no HA login needed for viewing the popup; a same-origin `$HOMIE_TOKEN`
  session, or `$HA_TOKEN` for a direct REST check, is needed to confirm state changes actually
  happened).**

  ```bash
  playwright-cli open "https://hass.ehlke.net/local/community/homie-dashboard/homie-dashboard.html?v=<version>"
  playwright-cli snapshot
  playwright-cli click <ref-for-"Scenes ›">
  playwright-cli screenshot --filename=../evidence/scenes-popup.png
  playwright-cli click <ref-for-"Dinner">
  # or: playwright-cli click <ref-for-"Visitors">
  ```

  Screenshot should show the "SCENES" header, one "Scenes" group label, and both bubbles (Dinner's
  candle, Visitors' two-person icon). After tapping Dinner, read `/api/states` for at least
  `light.kitchen_island` and `media_player.crestron`; after tapping Visitors, spot-check a light
  from each area including an outdoor one (e.g. `light.courtyard_patio_north`) — don't trust the
  screenshot's glow alone. Tap again and confirm the backing lights read `off` while
  `remote.harmony_hub`/`media_player.crestron` are untouched.

- **Cleanup.** Whatever state a scene leaves running (music, Harmony) that a second tap doesn't
  clear needs its own restore: `media_player.media_stop` then `remote.turn_off` on
  `remote.harmony_hub`. `playwright-cli close` when done. No auth-state file needed for the popup
  itself; delete one immediately if a same-origin check required creating it.

## Gotchas

- `isSceneChip` takes its own early-return path in `openPopup` (a bespoke bubble grid, not the
  generic accordion every other chip falls through to).
- Tapping either scene off only reverses the lighting piece. If it was tapped on, the music keeps
  playing and Harmony stays on Airplay until you stop them explicitly — don't assume a second tap
  is a full undo.
- `script.scene_dinner` and `script.scene_visitors` live in Home Assistant, not in this repo or its
  config entries. Confirm their actual sequence via `GET /api/config/script/config/<id>` or the
  trace tooling (`scripts/haws.py` in the `homeassistant` repo's skill) if their behavior is ever in
  question — the dashboard side only knows each as an entity_id to call `homeassistant.turn_on` on.
- Visitors' entity list is 30 long and was generated from a live `/api/states` read, not typed by
  hand from a room worksheet — if a light is ever added or removed from the house, re-derive this
  list from `/api/states` rather than editing it by inspection.
