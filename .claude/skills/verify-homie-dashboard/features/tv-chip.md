# TV chip

The living room television. The overlay has Harmony Activity buttons and an
Integra volume row, and below them a Samsung section added 2026-10-04: the
screen's real power state, a power button for the screen alone, a remote pad
and config-driven shortcuts. This is a real, **mutating** feature: it switches
the television on and off and sends it remote keys.

The chip is `action: "harmony"` in `dist/config.js`, with `entity` naming the
Harmony hub and a `tv` block naming the two Samsung entities, the pad keys and
the shortcut list. See
[docs/homie-dashboard/homie-tv-chip-samsung.md](../../../../../homeassistant/docs/homie-dashboard/homie-tv-chip-samsung.md)
in the sibling `homeassistant` repo for the design and the measurements.

## Sub-features

- `tv-state` — `#tv-state` reads "TV on", "TV off" or "TV off or unreachable"
  from `media_player.living_room_tv`.
- `tv-power` — `#tv-action-power` calls `media_player.turn_on` or `turn_off`
  on the Samsung entity and stays `.busy` until that entity reports the new
  state. It does not touch Harmony.
- `tv-pad` — eight buttons, `#tv-pad-<id>`, each sending one key through
  `remote.send_command` on `remote.living_room_tv`. Disabled while the set is
  off.
- `tv-shortcuts` — `#tv-shortcuts`, hidden while `tv.shortcuts` is empty.
- `tv-glow` — the chip is `.on` when the screen is on or a Harmony Activity is
  running.

## How to get to it (user POV)

Tap the TV chip on Overview A or B, or the TV icon in Overview C's sidebar.

## Driving it with playwright-cli

Direct-file load, no HA login. Open the overlay with `openTVControl()`, click
`#tv-action-power`, and poll `#tv-state` until it reads "TV on". Confirm with
`GET /api/states/media_player.living_room_tv`, and confirm
`remote.harmony_hub` is still `off` to prove the screen came on alone. Click
pad buttons, then click power again and confirm `off`.

## Gotchas

- Waking the set takes 5 to 12 seconds. Do not treat a busy button as a hang
  before 30 seconds, which is when the overlay itself gives up.
- Home Assistant answers 200 for a key the set does not know, so a clean run
  of pad presses proves the calls went out and nothing about the screen. Only
  a person watching the set can confirm a key landed.
- Do not query the set's own API at port 8001 under `/api/v2/applications/`.
  It hung and made Home Assistant report the set as off.
- Leave the set off unless it was on when you started.
