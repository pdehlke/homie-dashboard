# Overview A status grid

Overview A is Homie's home screen: a clock, current weather, a "Good
Afternoon"-style greeting, an eight-cell status grid (Alarm, Lights, Main
House, Office Wing, Media, Irrigation, Robot, EV), and a Main
House/Office Wing/Solar pill row above the bottom chip row. Everything on it
is a live read of real Home Assistant state; nothing here is mutating.

## Sub-features

- `status-grid` — the eight-cell grid reads real domain-status template
  sensors.
- `solar-pill` — generation / whole-house load / directional grid flow.
- `climate-pill` — Main House / Office Wing temperature and humidity.
- `chip-row` — the bottom row (Lights, Climate, A/V, Music, TV, Irrigation,
  Scenes), each showing on/off/count state live.

## How to get to it (user POV)

- It's the first thing Homie shows on load, both via the direct file and via
  the `homie-dash` Lovelace dashboard.
- Swipe/tap the pagination dots at the bottom to return to it from Overview
  B/C.

## Driving it with playwright-cli

Preconditions:

- `doctor.py` passes.
- `$HOMIE_TOKEN` set (this recipe uses the non-admin account, matching what
  the tablet actually runs as).

- **Load it.** Generate a Homie-account session and open the real Lovelace
  path, the tablet's own path:

  ```bash
  python3 ../scripts/make-auth-state.py HOMIE_TOKEN /tmp/homie-auth-state.json
  playwright-cli open
  playwright-cli state-load /tmp/homie-auth-state.json
  playwright-cli goto "http://hass.ehlke.net:8123/homie-dash/0"
  ```

  Wait ~7s (weather/background load late), then `playwright-cli console`
  should show `Homie Dashboard package initialized successfully.` with no
  new errors beyond the pre-existing, unrelated `rss-news-card` duplicate
  custom-element warning.

- **Screenshot and cross-check the Solar pill.** The pill's three numbers
  are `sensor.homie_solar_generation`, `sensor.homie_whole_house_load`, and
  `sensor.homie_grid_flow` (negative = exporting, shown as the export
  direction plus magnitude).

  ```bash
  playwright-cli screenshot --filename=../evidence/overview-a-<run-id>.png
  HB="Authorization: Bearer $HA_TOKEN"; U=http://hass.ehlke.net:8123
  for e in sensor.homie_solar_generation sensor.homie_whole_house_load sensor.homie_grid_flow; do
    curl -s --max-time 8 -H "$HB" "$U/api/states/$e" | \
      python3 -c "import json,sys; d=json.load(sys.stdin); print(d['entity_id'],'=',d['state'])"
  done
  ```

  The three values must match what the screenshot shows on the Solar pill,
  accounting for `grid_flow`'s sign (negative on the API = the export arrow
  in the UI). Verified live 2026-08-23: API read `4.1 kW` / `2.0 kW` /
  `-2.1 kW` matched the rendered `4.1 kW` / `2.0 kW` / `2.1 kW` (export)
  exactly. See `evidence/overview-a-homie-account.png`.

- **Cleanup.** `playwright-cli close`, then `rm -f /tmp/homie-auth-state.json`
  immediately.

## Gotchas

- Weather and background images load after the initial paint — screenshot
  too early and the hero area is blank even though the grid is already
  correct.
- `grid_flow`'s sign flips relative to the pill's displayed arrow direction;
  don't treat a sign mismatch as a bug without checking which way the arrow
  points in the screenshot.
- Loading via the direct file (no HA login) shows Overview A fine, but skips
  the `kiosk_mode` header/sidebar hiding — only the full `/homie-dash/0`
  path with a real HA session reproduces exactly what the tablet renders.
- If any of the eight status-grid cells reads a Sense-backed sensor rather
  than the dedicated `homie_*` template sensors, verify the underlying Sense
  entity isn't one of the stale, dead ones this instance is known to carry
  (see the sibling `homeassistant` repo's `home-assistant` skill) before
  treating a `0`/`Unavailable` cell as a Homie bug.
