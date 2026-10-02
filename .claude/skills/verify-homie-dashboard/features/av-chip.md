# A/V chip

The six Crestron audio zones, with the same controls as Home Assistant's
Speakers dashboard (`dashboard-speakers`). Filled 2026-10-02, after the chip
had been emptied earlier the same day. This is a real, **mutating** feature:
every control switches amplifiers in the house.

The chip is `action: "av"` in `dist/config.js` and carries an `av` block naming
the link sensor, the refresh button, the two scripts and the four entities of
each zone. Source options and the volume range are read from the entities, not
repeated in config. See
[docs/homie-dashboard/homie-av-chip.md](../../../../../homeassistant/docs/homie-dashboard/homie-av-chip.md)
in the sibling `homeassistant` repo for the design.

## Sub-features

- `av-panel` — tapping the chip opens `#av-overlay`, titled "A/V", with the
  AADS link state at the right of the header, three buttons, one freshness
  line and six `.av-zone` cards in a 3x2 grid: Kitchen, Outdoor Kitchen, Master
  Bed, Master Bath, Studio, Courtyard. Opening it calls no service.
- `av-refresh` — Refresh presses `button.crestron_audio_refresh`. The button
  stays `.busy` until the six-zone walk returns, and the freshness line then
  reads "Read just now."
- `av-zone-power` — a card's power button calls `switch.turn_on` or
  `switch.turn_off` on `switch.crestron_<zone>_audio`. On comes up on AirPlay
  at the zone's `on_volume` (Kitchen 80, the rest 90).
- `av-zone-source` — the picker calls `select.select_option`. Picking a source
  in an off room switches the room on.
- `av-zone-volume` — the slider calls `number.set_value` on release, in the
  entity's own range (70 to 100, step 5).
- `av-zone-mute` — `switch.turn_on` / `turn_off` on `switch.crestron_<zone>_mute`.
- `av-all` — All AirPlay calls `script.all_rooms_airplay` and All Off calls
  `script.all_av_off`, both as `script.<name>` so the button stays busy until
  the script has finished.
- `av-chip-glow` — the chip is `.on` while any zone's power switch is on.

## How to get to it (user POV)

Overview A, bottom chip row, third chip.

## Driving it with playwright-cli

Direct-file load at 1280x800. `openAvPanel()` or a click on `#chip-2`. Element
ids are `av-btn-allOn`, `av-btn-allOff`, `av-btn-refresh`, `av-link`,
`av-fresh`, and per zone index `z` (0 to 5, in the order above) `av-zone-z`,
`av-power-z`, `av-source-z`, `av-vol-z`, `av-vol-label-z`, `av-mute-z`.

Use Studio (index 4) for a single-room pass, and confirm each step against
`GET /api/states/` for the matching entity. A command takes several seconds;
wait for `.busy` to clear from the card before reading.

## Gotchas

- Tap Refresh first. After a Home Assistant restart the zones may be unread:
  power and source `unknown`, volume and mute `unavailable`.
- An off room's volume and mute are disabled, because those entities are
  unavailable. That is the entity model, not a rendering fault.
- While a command is running the volume can read 0% for a moment. A muted room
  reads 0% for as long as it is muted.
- After All Off the freshness line returns to "Not all rooms have been read
  yet" until the next Refresh, because the integration invalidates its cache.
- All AirPlay powers every room. Finish with All Off and a Refresh.
- Nothing is audible unless something is playing into the selected source, but
  the amplifiers do switch.
