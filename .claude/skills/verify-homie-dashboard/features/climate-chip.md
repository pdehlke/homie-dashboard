# Climate chip

The Climate chip and the floors card's expand button both open Home
Assistant's own real climate more-info dialog for the Main House or Office
Wing Lennox thermostat — not a Homie-drawn reimplementation. Homie's iframe
is same-origin with the parent HA frontend, so it dispatches the real
`hass-more-info` event on the parent frame's `<home-assistant>` element, the
same event HA's own cards use internally. This **requires** the full
Lovelace path with a real HA session; the direct-file load has no parent
frame to dispatch onto.

## Sub-features

- `climate-picker` — the unfiltered Overview A/B Climate chip shows a
  Main House / Office Wing picker first, then opens the real dialog for
  whichever is picked.
- `climate-direct` — the floors card's faces (already filtered to one
  entity) and its expand button go straight to the real dialog, one tap.
- `climate-count` — the chip's "N on" badge reflects `hvac_action`
  (actively heating/cooling), not `hvac_mode` (both zones sit in
  `heat_cool` almost permanently, so `hvac_mode` alone would read "on"
  nearly always).
- `climate-real-controls` — the dialog's own +/- and mode controls, once
  open, call the real `climate.*` services against the real thermostats.
  Mutating; see Gotchas before touching them.

## How to get to it (user POV)

- Bottom chip row, "CLIMATE" chip, on Overview A or B: opens the picker,
  then the real dialog.
- Floors card face (Overview C) for Main House or Office Wing: "Show more
  information" / the card's expand button opens the real dialog directly.

## Driving it with playwright-cli

Preconditions:

- `doctor.py` passes.
- A real HA session (full Lovelace path only — this feature has no
  direct-file equivalent).
- Note the thermostat's current `hvac_action`, `target_temp_high`,
  `target_temp_low` before touching anything the dialog itself controls.

- **Load and open the chip.**

  ```bash
  python3 ../scripts/make-auth-state.py HOMIE_TOKEN /tmp/homie-auth-state.json
  playwright-cli open
  playwright-cli state-load /tmp/homie-auth-state.json
  playwright-cli goto "https://hass.ehlke.net/homie-dash/0"
  playwright-cli snapshot
  playwright-cli click <ref-for-Climate-chip>
  ```

- **Prove it's the real dialog, not a reimplementation.** The real dialog
  has HA's own History icon and renders a recorder-backed chart when
  clicked — Homie's old hand-rolled overlay never had one. Screenshot the
  open dialog and confirm the History icon is present and produces a chart.

  ```bash
  playwright-cli screenshot --filename=../evidence/climate-dialog.png
  ```

- **Cross-check against the real entity**, e.g. for the Main House zone:

  ```bash
  HB="Authorization: Bearer $HA_TOKEN"; U=https://hass.ehlke.net
  curl -s --max-time 8 -H "$HB" "$U/api/states/climate.casasolar_south_zone_1" | \
    python3 -c "import json,sys; d=json.load(sys.stdin); a=d['attributes']; print(d['state'], a.get('hvac_action'), a.get('target_temp_high'), a.get('target_temp_low'))"
  ```

  The dialog's displayed target and action should match.

- **Cleanup.** `playwright-cli close`, `rm -f /tmp/homie-auth-state.json`. If
  `climate-real-controls` was exercised, restore the pre-check target values
  via `POST /api/services/climate/set_temperature` with the noted
  `target_temp_high`/`target_temp_low` pair — both zones run dual-setpoint
  `heat_cool` and silently drop any call that isn't a paired call landing on
  the 1.0° step.

## Gotchas

- Both real Lennox zones run `heat_cool` mode almost permanently — a call
  that sets only one of `target_temp_high`/`target_temp_low` is silently
  dropped. Always pair them.
- If a preset change puts a zone into `schedule hold`, re-selecting the
  prior named preset does **not** clear it — only the `cancel hold` preset
  does. This one was flaky through the UI under Playwright in a past
  session; if a restoration click keeps failing with "element intercepts
  pointer events," fall back to `POST /api/services/climate/set_preset_mode`
  directly rather than fighting the UI.
- `.therm-dial-svg` (Homie's own decorative dial, still present around the
  entry points even though the dialog itself is now native) is a rotated
  360x360 element with an oversized hit box; it has `pointer-events: none`
  now, but if a future change reintroduces a clickable element near it,
  retest that nothing behind it silently eats taps.
- This feature has no direct-file equivalent. Don't try to reproduce it by
  loading `homie-dashboard.html` standalone — there is no parent
  `<home-assistant>` frame to dispatch `hass-more-info` onto, so it will
  silently no-op.
