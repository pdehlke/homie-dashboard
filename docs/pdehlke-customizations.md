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
- Weather from Home Assistant's available `weather.forecast_home` entity in Fahrenheit

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
- route the bottom Climate control to the dedicated thermostat overlay
- confirm irrigation starts while allowing immediate stops
- render the Screen A status grid as four columns by two rows
- make the Solar condition panel informational rather than interactive
- install the accepted presentation defaults once per browser

The Climate routing avoids upstream's generic climate popup. That popup assumes
a single Celsius-style setpoint and does not correctly handle the home's
Fahrenheit `heat_cool` thermostat entities.

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
