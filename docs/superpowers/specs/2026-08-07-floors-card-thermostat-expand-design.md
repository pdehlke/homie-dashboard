# Floors Card Thermostat Expand Design

## Goal

Give the Overview C floors card (Main House / Office Wing, middle of the right column) an expand
button that opens the already-working thermostat overlay filtered to whichever floor is currently
showing, using the same expand-icon convention as the weather, solar, and A/V cards. This is phase
1 of a two-phase change; phase 2, removing the bottom-right thermostat launcher card and reclaiming
its grid space, is a separate follow-up gated on pde reviewing this phase on a real device.

## Non-goals

- Removing or changing `#ov3-ac-card` (the bottom launcher). Deferred to phase 2.
- Any change to `openThermostat`, `closeThermostat`, `_renderThermRoom`, or the thermostat overlay
  itself. That code is already fixed and verified; see `homie-thermostat-control-fix.md` in the
  [pdehlke/homeassistant](https://github.com/pdehlke/homeassistant) archive repo. This phase only
  adds a new caller.
- De-duplicating the "Main House"/"Office Wing" labels that already appear independently in
  `config.js`'s status grid, `floorSensors`, and Climate control sections. Adding an `entity` field
  to `floorSensors` is one more instance of that duplication, not a new problem. A TODO in this
  repo's README records it as a future DRY candidate; no code changes toward it in this phase.

## Design

### Trigger and placement

A new button, `.ov3-floors-launch-btn`, absolutely positioned `top:10px; right:10px;` at `30x30`
inside `.ov3-floors-card` (already `position:relative`), using the same diagonal-arrows SVG icon
and `:active { opacity: 0.6 }` treatment as `.ov3-wx-launch-btn` and `.ov3-energy-launch-btn`.
Placed above the card's existing horizontal-scroll swipe area (`z-index: 2`, matching the existing
launch buttons), so it does not compete with either the floors card's internal swipe or the outer
Overview A/B/C swipe layer.

### Data model

Add an `entity` field to the "Main House" and "Office Wing" entries in `config.js`'s
`floorSensors` array:

```js
{ label: "Main House", entity: "climate.casasolar_south_zone_1", sensors: [...] }
{ label: "Office Wing", entity: "climate.casasolar_north_zone_1", sensors: [...] }
```

The "Solar" entry gets no `entity` field; it is already excluded from the floors card by
`_buildOv3FloorsCard`'s existing filter and never reaches this code path.

### Behavior

`_buildOv3FloorsCard`'s existing scroll-spy listener computes the visible panel index on every
scroll event but only used it to update DOM (active dot class, active-name text). It now also
stores that index in a module-level `_ov3FloorsActiveIndex`, initialized to `0` alongside the rest
of the card's build.

A new pure helper in `homie-custom.js`, matching the style of the existing `filterThermostats`:

```js
function floorThermostatEntity(floors, index) {
  const floor = Array.isArray(floors) ? floors[index] : null;
  return floor && floor.entity ? floor.entity : null;
}
```

The launch button's `onclick` calls a small wrapper, `_openFloorsThermostat()`, defined alongside
`_buildOv3FloorsCard`:

```js
function _openFloorsThermostat() {
  const entity = HOMIE_CUSTOM.floorThermostatEntity(_ov3FloorsList, _ov3FloorsActiveIndex);
  if (!entity) return;
  openThermostat(entity);
}
```

`_ov3FloorsList` is the same filtered `floors` array `_buildOv3FloorsCard` already computes from
`CONFIG.floorSensors`, hoisted to module scope so both functions can read it without rebuilding it.
If no entity resolves (defensive only; both real floors always have one), the button does nothing
rather than falling through to `openThermostat()`'s unfiltered default, which would silently show
the wrong scope.

`openThermostat(entity)` and everything downstream of it (tab building, room rendering, dial,
set_temperature payload) are unchanged and already covered by existing tests and live verification.

## Testing

New `test/screen-a.test.cjs` cases for `floorThermostatEntity`:

- Returns the South zone entity for index 0 (Main House).
- Returns the North zone entity for index 1 (Office Wing).
- Returns `null` for an out-of-range index and for a floor entry with no `entity` field.

No new DOM-level test for `_openFloorsThermostat` itself; it is a thin wrapper over already-tested
pieces (`floorThermostatEntity`, `openThermostat`), consistent with how the existing Overview C
launcher wiring is tested at the view-model level rather than the DOM-event level.

## Verification and rollback

Same deployment discipline as the thermostat control fix: `node --test test/screen-a.test.cjs`,
`node --check dist/homie-custom.js`, back up the live Homie directory before deploying, bump the
cache-busting release token on every deploy that touches a nested asset (the `.12`/`.13` lesson
from the thermostat fix), and verify live via a direct Playwright tap confirming the overlay opens
filtered to the correct entity on both faces before calling this phase done. Rollback is deleting
the new button, helper, and `entity` fields; nothing else changes.

## TODO for this repo

Add to `README.md`: "Main House"/"Office Wing" labels are independently duplicated across
`config.js`'s status grid, `floorSensors`, and Climate control sections (and now the floors card's
`entity` field too). Candidate for a single source of truth once there is time for that refactor.
