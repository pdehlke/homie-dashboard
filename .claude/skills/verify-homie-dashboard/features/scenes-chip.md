# Scenes chip

**Refilled 2026-09-03** with the first real scene, "Dinner", after being emptied earlier the same
day ([issue #16](https://github.com/pdehlke/homeassistant/issues/16)). The chip is a real,
**mutating** feature again: `light.turn_on`/`homeassistant.turn_off` on the room's lights and
`homeassistant.turn_on` on a Home Assistant script.

Dinner isn't a `scene.*` snapshot entity. It needs a conditional (turn off the TV only if it's on)
and a service-call sequence (start a specific radio station through Harmony) that a native scene
can't express, so it's backed by the HA script `script.scene_dinner` instead. This is the first
bubble to use the chip's generalized mechanism: `entities` is what the bubble's on/off glow follows
and what a tap-while-on turns off; `activate` is the separate entity a tap-while-off actually runs.
See [docs/homie-dashboard/homie-scenes-chip.md](../../../../../homeassistant/docs/homie-dashboard/homie-scenes-chip.md)
in the sibling `homeassistant` repo for the full mechanism and history.

## Sub-features

- `scene-dinner-popup` — tapping the chip opens a popup titled "SCENES" with one group ("Scenes")
  containing one bubble, "Dinner" (candle icon).
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

## How to get to it (user POV)

- Bottom chip row, "SCENES" chip, on any Overview screen. Tap to open, tap the "Dinner" bubble
  inside.

## Driving it with playwright-cli

Preconditions: `doctor.py` passes. **Mutating**: this starts real audio and real lighting, and
switches the Harmony hub's activity. Confirm the house's actual state (not just an assumption)
before running, and restore it after.

- **Load direct-file (no HA login needed for viewing the popup; a same-origin `$HOMIE_TOKEN`
  session, or `$HA_TOKEN` for a direct REST check, is needed to confirm state changes actually
  happened).**

  ```bash
  playwright-cli open "https://hass.ehlke.net/local/community/homie-dashboard/homie-dashboard.html?v=<version>"
  playwright-cli snapshot
  playwright-cli click <ref-for-"Scenes ›">
  playwright-cli screenshot --filename=../evidence/scenes-dinner-popup.png
  playwright-cli click <ref-for-"Dinner">
  ```

  Screenshot should show the "SCENES" header, one "Scenes" group label, and the Dinner bubble with
  its candle icon. After tapping, read `/api/states` for at least `light.kitchen_island` and
  `media_player.crestron` — don't trust the screenshot's glow alone — then tap again and confirm
  the ten lights read `off` while `remote.harmony_hub`/`media_player.crestron` are untouched.

- **Cleanup.** Whatever state Dinner leaves running (music, Harmony) that a second tap doesn't
  clear needs its own restore: `media_player.media_stop` then `remote.turn_off` on
  `remote.harmony_hub`. `playwright-cli close` when done. No auth-state file needed for the popup
  itself; delete one immediately if a same-origin check required creating it.

## Gotchas

- `isSceneChip` takes its own early-return path in `openPopup` (a bespoke bubble grid, not the
  generic accordion every other chip falls through to).
- Tapping Dinner off only reverses the lighting piece. If Dinner was tapped on, the music keeps
  playing and Harmony stays on Airplay until you stop them explicitly — don't assume a second tap
  is a full undo.
- `script.scene_dinner` lives in Home Assistant, not in this repo or its config entries. Confirm
  its actual sequence via `GET /api/config/script/config/scene_dinner` or the trace tooling
  (`scripts/haws.py` in the `homeassistant` repo's skill) if its behavior is ever in question — the
  dashboard side only knows it as an entity_id to call `homeassistant.turn_on` on.
