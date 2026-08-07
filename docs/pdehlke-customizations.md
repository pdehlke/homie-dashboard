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
- replace Overview C's inline AC controls with a Main House thermostat launcher that opens the
  dedicated thermostat overlay filtered to `climate.casasolar_south_zone_1`
- route the bottom Climate control to the dedicated thermostat overlay
- confirm irrigation starts while allowing immediate stops
- render the Screen A status grid as four columns by two rows
- make the Solar condition panel informational rather than interactive
- add an expand button to Overview C's floors card, opening the thermostat overlay filtered to
  whichever floor (Main House or Office Wing) is currently visible
- install the accepted presentation defaults once per browser

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
