# HOME Screen A Customizations

This fork tracks the accepted HOME tablet dashboard derived from upstream
Homie Dashboard v4.1.1.

## Configuration

`dist/config.js` contains the house-specific entity mapping but deliberately
retains `YOUR_LONG_LIVED_ACCESS_TOKEN`. Never commit a populated Home Assistant
token. Deployment must replace the placeholder only in the copy installed on
Home Assistant.

The accepted Screen A configuration provides:

- Main House temperature and humidity from the South thermostat
- Office Wing temperature and humidity from the North thermostat
- Solar generation, whole-house load, and directional grid flow
- Lights, Climate, A/V, and Irrigation controls
- Main House and Office Wing thermostat zones
- Five irrigation zones, retaining Back Yard while its controller is offline
- Classic Gold, Screen A, vivid gradient, and 12-hour browser defaults
- Weather from Home Assistant's `weather.openweathermap` entity in Fahrenheit. Overview C depends
  on OpenWeatherMap's daily response to display five actual future days; Met.no's
  `weather.forecast_home` currently supplies only two future days and is intentionally not used for
  this card.
- Expanded Weather reads sunrise and sunset from `sun.sun`, UV index from
  `sensor.openweathermap_uv_index`, and moon phase from the native Moon integration's
  `sensor.moon_phase` entity.
- AQI and unitless pollutant sub-indices from the Geronimo, Pima County WAQI station

Several `sensor.homie_*` entities are Home Assistant template helpers created
for the dashboard. The alarm helper intentionally reports `Not Configured`
until a real alarm integration replaces it.

## Behavior Changes

`dist/homie-custom.js` isolates fork-specific behavior used by the patched
`dist/homie-dashboard.html`:

- replace Pet Stats with a Lights launcher
- show the unconfigured alarm state without placeholder alarm controls
- route A/V to the Music Assistant browser and player selector
- render Overview C's A/V sidebar control with the Now Playing circle-and-play icon
- swap Overview C's Garden and Floors cards while retaining their existing content and behavior
- replace Overview C's inline AC controls with a Main House thermostat launcher (later removed
  once the floors card's expand button provided the same functionality)
- route the bottom Climate control to the dedicated thermostat overlay
- confirm irrigation starts while allowing immediate stops
- render the Screen A status grid as four columns by two rows
- make the Solar condition panel informational rather than interactive
- add an expand button to Overview C's floors card, opening the thermostat overlay filtered to
  whichever floor (Main House or Office Wing) is currently visible
- show the floors card's Target temperature in a 2x2 grid (Temp/Target, Humid/PM2.5) on its main
  faces, and remove the bottom-of-column Main House thermostat launcher card the floors card's
  expand button superseded
- install the accepted presentation defaults once per browser
- remove Solar from the Startup view options (`sm-solar` radio, release `20260808.1`): its
  fullscreen overlay hides the corner close button in favor of gesture-only exit (swipe or
  Escape), so landing there by default on a tablet or wallscreen left no visible way back to
  Settings. A stale `startupMode: "solar"` from before this change now falls through to the
  Overview 1 default instead of reopening the trap. Solar is still reachable from its topbar
  button and the Overview C launch card; only its use as a *default landing view* was removed.
  Solar is still selectable as a Screensaver rotation mode (`ssm-solar`), which has the same
  gesture-only exit and was not in scope for this change.

The Climate routing avoids upstream's generic climate popup. That popup assumes
a single Celsius-style setpoint and does not correctly handle the home's
Fahrenheit `heat_cool` thermostat entities.

## Thermostat Overlay: Dual-Setpoint and Step-Size Fix (release `20260807.13`)

Both real thermostats (`climate.casasolar_south_zone_1`, `climate.casasolar_north_zone_1`, the
`lennoxs30` integration) run in `heat_cool` mode essentially all the time, reporting
`target_temp_high` and `target_temp_low` rather than a single `temperature` attribute. The
dedicated overlay built for the Climate routing above was itself written assuming a single
setpoint, so it inherited the exact problem it was built to avoid: the target field showed
`— °F` until the first tap, then seeded from a hardcoded `22` and never reached the real unit.

Two separate defects, both confirmed against the live entities before and after the fix:

- `climate.set_temperature` requires `target_temp_high` and `target_temp_low` together; Home
  Assistant's own service schema rejects a call that supplies only one of them with a bare
  `400`. `thermostatSetTemperaturePayload` now always sends both, changing only the bound that
  `hvac_action` (`cooling` / `heating`) says the equipment is actively working toward, and
  shifting the whole band together only when there is no single active bound (idle/fan/unknown).
- Both zones declare `target_temp_step: 1.0`. A `set_temperature` call that does not land on a
  multiple of that step is silently dropped by the `lennoxs30` integration: HTTP `200`, empty
  response body, no logbook entry, no state change, nothing. The dial's +/- buttons were
  hardcoded to a 0.5° delta. `thermostatStepSize` now reads the real entity's
  `target_temp_step` (falling back to 0.5 only when an entity doesn't declare one), and
  `thermAdjust` sends `direction * that step`.

`thermostatTemperatureView`'s displayed target follows the same `hvac_action` logic, so the
number shown next to "Cooling" is the bound the AC is actually cooling to, not a midpoint
average of the whole band.

Note the payload always carries both `target_temp_high` and `target_temp_low` keys even though
only one value changes; an earlier version of this fix sent only the changed key and was
confirmed, via a live browser test against the deployed asset, to 400 every single time. Verified
end to end against the real entities: direct `climate.set_temperature` calls, then an actual
Playwright tap through the deployed dashboard, confirmed by the entity's `target_temp_high`
changing and `last_updated` advancing. Also confirms release `.11` → `.12` → `.13`: redeploying
`homie-custom.js` under an unchanged version token served the browser's cached pre-fix copy
despite the live file on disk being correct. The version token must change on every deploy that
touches a nested asset's content, not just on releases meant for the user to see.

## Overview C Vertical Overflow on the Target Tablet (release `20260807.16`)

Overview C is designed to fill a chromeless 1280x800 canvas exactly: `#overview3` is
`position: fixed; inset: 0`, and `.ov3-main` explicitly hides all of Home Assistant's own
top-level chrome equivalents, on the assumption that it owns the whole viewport.

Manual measurement in a resized browser found the layout needed 821px of height to avoid clipping,
21px more than the target Fire HD 10's 800px screen. Direct-load testing against the live asset at
a true 1280x800 viewport showed Overview C's own content bottoming out at 763px, well within
budget, so the layout itself was never the problem. The actual cause: `homie-dash` loads this page
inside an `<iframe>` via a Lovelace `strategy: iframe` dashboard, and Home Assistant's own top app
bar, rendered around that iframe, was consuming 56px that Overview C's CSS has no way to see or
account for. 763px of content in a 744px box (800 minus that 56px) overflows by 19px, and
763 + 56 = 819, matching the manually measured 821 within rounding.

Fixed on the Home Assistant side, not in this repository: a `kiosk_mode` block was added to
`homie-dash`'s dashboard config, scoped to `users: ["Homie Dashboard"]`, setting `hide_header` and
`hide_sidebar`. This is the same per-user chrome-hiding mechanism already used for the `Tablet`
kiosk account on the domain dashboards (see `dashboard-home.md` in the `pdehlke/homeassistant`
repo). It restores Overview C's full 800px canvas without any change to this fork's layout, and
only affects the dedicated `Homie Dashboard` account; other users viewing `homie-dash` (an admin
debugging it, for instance) still see the native header.

As a defensive fallback only, `.ov3-main` changed from `overflow: hidden` to `overflow-x: hidden` /
`overflow-y: auto`. Nothing scrolls under normal operation; the point is that if a future change
ever un-hides the host header again, whether a `kiosk_mode` update, a load-order change, or the
plugin being removed, the failure becomes a visible, scrollable cutoff instead of silently clipped,
invisible content, which is what made the original 21px overflow hard to notice in the first place.

## Temperature Display Convention

All temperature-related displays in this fork use Fahrenheit and show `°F`. Future integrations
that expose another unit must convert their values to Fahrenheit before displaying them. The two
Solar inverter cards intentionally remain unbound as `— °F` until the Left Inverter and Right
Inverter entities are available.

## Verification

Run the regression suite before deployment or commit:

```sh
node --test test/screen-a.test.cjs
```

Also run JavaScript syntax checks and a repository secret scan. The accepted
tablet view requires a final hard-refresh and visual check after deployment.
