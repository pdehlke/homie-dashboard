# Floors Card Target Cell and Bottom Card Removal Design

## Goal

Phase 2 of the floors-card thermostat work: add a Target temperature cell to the floors card's
main (non-expanded) faces, turning its 3-item row into a 2x2 grid, and remove the now-redundant
bottom-of-column Main House thermostat launcher card (`#ov3-ac-card`), which phase 1's expand
button superseded.

## Non-goals

- No change to `openThermostat`, `closeThermostat`, `_renderThermRoom`, `thermostatTemperatureView`,
  or any other part of the thermostat overlay. All of that is already correct and tested; this
  phase only adds a new read-only consumer of `thermostatTemperatureView`.
- No change to the PM2.5 cell's behavior. It stays a static `n/a` on both floors, as it has since
  phase 1 — pde has said he doesn't want that addressed.
- Nothing fills the grid space freed by removing `#ov3-ac-card`. That remains a future decision,
  per the phase-1 discussion.

## Design

### 2x2 grid layout

`.ov3-floors-stat-row` changes from `display:flex` (single row) to a 2-column CSS grid:

```css
.ov3-floors-stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
}
```

Items render in source order Temp, Target, Humid, PM2.5; grid auto-flow places them top-left,
top-right, bottom-left, bottom-right without needing explicit row/column assignment.

The existing divider (`.ov3-floors-stat-item + .ov3-floors-stat-item { border-left: ... }`) only
covers the horizontal case. Add a rule for the vertical divider between rows: every item past the
first two gets a top border matching the same color/width as the existing left border, so the grid
reads as four cells with both a vertical and horizontal divider, not just a horizontal one.

### Target data source

`_buildOv3FloorsCard` and `_refreshOv3FloorsCard` (`dist/homie-dashboard.html`) both currently
iterate `SENSOR_TYPES = ["temp", "humidity", "pm25"]`, each type backed by an entry in
`floor.sensors`. Target is different: it comes from `floor.entity` (the climate entity phase 1
added to `floorSensors`), not from `floor.sensors`, and its value comes from
`HOMIE_CUSTOM.thermostatTemperatureView(state).targetTemperatureValue`, not from a sensor's raw
`state.state`.

Both functions gain a `target` stat item, built and refreshed alongside the existing three but
through this separate path. Formatting matches the terse style already used for Temp on this card
(`Math.round(value) + "°"`), not the thermostat overlay's `"NN °F"` style — pde's explicit call, to
stay visually consistent with this card's own Humid/PM2.5 neighbors rather than the overlay.

Three states, mirroring the existing Temp/Humid vs. PM2.5 distinction already present in this code:

- `floor.entity` set, and `HOMIE_CUSTOM.thermostatTemperatureView(haGetCached(floor.entity))`
  returns a numeric `targetTemperatureValue` → `"78°"`.
- `floor.entity` set, but the cached state is missing or the view returns no target value → `"—"`
  (matches the existing "configured but temporarily unavailable" convention for Temp/Humid).
- `floor.entity` not set at all → `"n/a"` (matches the existing "not wired up" convention already
  used for PM2.5).

### Removing `#ov3-ac-card`

Delete, in `dist/homie-dashboard.html`:

- The markup block (`<div class="ov3-ac-card" ...>...</div>`).
- Its exclusive CSS: `.ov3-ac-card` and its `.mode-*` variants, `.ov3-ac-name`, `.ov3-ac-current`,
  `.ov3-ac-target`, `.ov3-ac-target-label`, `.ov3-ac-target-value`, `.ov3-ac-mode`. None of these
  selectors are used outside this card.
- `_buildOv3AcCard()` and `_refreshOv3AcCard()`, and their call sites in `_ensureOv3Built()` and
  `_refreshOv3()`.
- The `#ov3-ac-card` entry in `OV3_SWIPE_EXCLUDE_SELECTOR` (the `.mush-ac-card` entry is a
  different, unrelated card on a different overview screen and stays).

`HOMIE_CUSTOM.thermostatLauncherView` (`dist/homie-custom.js`) becomes dead code once
`_refreshOv3AcCard` — its only caller — is deleted. Remove the function, its export, and its three
existing tests in `test/screen-a.test.cjs`.

`.ov3-col3` is `display:flex; flex-direction:column; justify-content:space-between;`; removing one
of its four children lets the remaining three (Security, Floors, Purifier) reflow naturally. No
CSS change needed there beyond the deletions above.

### Test rehoming

`test/screen-a.test.cjs`'s "Overview C launcher opens only Main House, while Overview A remains
unfiltered after close" test currently drives the scenario through `#ov3-ac-card`'s `onclick`
attribute (`dashboardElementsById(source).get("ov3-ac-card")`). Rewrite it to drive the same
scenario through the floors card's `_openFloorsThermostat()` instead: open via
`_openFloorsThermostat()` while `_ov3FloorsActiveIndex` is `0` (filtered to Main House), close,
then confirm Overview A's existing unfiltered `openThermostat()` call still shows both zones. Same
behavior under test, new trigger, matching the recommendation the phase-1 final review already
made for this exact situation.

## Verification

Same discipline as phase 1: `node --test test/screen-a.test.cjs`, `node --check
dist/homie-custom.js`, a live backup before deploying, a cache-busting version bump
(`20260807.14` → `.15`) on the deploy since both `homie-dashboard.html` and `homie-custom.js`
change, and a live Playwright verification confirming the 2x2 grid renders correctly on both
floors' main faces (including live Target values) and that the bottom card is gone with no layout
breakage.
