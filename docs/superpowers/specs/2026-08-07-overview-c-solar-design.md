# Overview C Solar Design

## Goal

Populate Overview C's Solar card and Homie's full-screen Solar view with the home's real Sense and Electricity Maps data while preserving the dashboard's established visual language.

## Configuration Boundary

Entity IDs remain in `dist/config.js` under `CONFIG.solar.stats`. Dashboard rendering and derived display values remain in `dist/homie-dashboard.html`. No additional Home Assistant template helpers are required.

The configuration provides these roles:

- Live whole-house demand: `sensor.sense_287516_energy` in W
- Live solar production: `sensor.sense_287516_production` in W
- Live grid flow: `sensor.homie_grid_flow` in kW
- Daily household consumption: `sensor.sense_287516_daily_energy` in kWh
- Monthly household consumption: `sensor.sense_287516_monthly_energy` in kWh
- Daily grid net: `sensor.sense_287516_daily_net_production` in kWh
- Grid fossil-fuel percentage: `sensor.electricity_maps_grid_fossil_fuel_percentage` in percent
- Grid carbon intensity: `sensor.electricity_maps_co2_intensity` in gCO2eq/kWh
- Left and Right Inverter temperatures: intentionally unbound as `— °F` until the Tesla inverter
  integration is installed; all dashboard temperatures use Fahrenheit. **Superseded 2026-08-09:**
  that integration was cancelled and isn't happening. Both placeholders were repurposed into
  "% Green Today" and "CO2 Intensity Today" (`f3a1531`); see
  `overview-c-solar-today-totals.md` in `pdehlke/homeassistant`.

## Sign Convention

Grid values are house-centric:

- Positive means net energy entering the house from the grid.
- Negative means net energy leaving the house for the grid.

`Net Today` displays the signed daily grid net to one decimal place with an explicit plus or minus sign. The live Grid field uses an absolute magnitude and a directional `Import`, `Export`, or `Grid` label.

## Overview C Solar Card

The large center value shows live whole-house demand in watts.

The lower row contains:

1. `Net Today`: signed daily import minus export in kWh
2. `Solar`: live solar production in kW
3. Directional grid flow: absolute live flow in kW with a dynamic label

Unavailable or nonnumeric values display `—`. Returning to a neutral grid state resets both label and color.

## Full-Screen Solar View

The energy-flow diagram contains Solar, Home, and Grid nodes. The battery node, battery stat, battery paths, charge label, and charge animation are removed because the home has no whole-house battery.

Flow animation follows the configured sign convention:

- Negative grid flow animates Solar to Grid and indicates export.
- Positive grid flow animates Grid to Home and indicates import.
- Solar-to-Home flow is active while solar production is positive.

The first statistics row contains:

1. Live Usage in W
2. Today's Usage in kWh
3. Low Carbon in percent, calculated as `100 - fossil fuel percentage`
4. Monthly Usage in kWh
5. CO2 Intensity in gCO2/kWh

Low Carbon uses a green leaf icon. CO2 Intensity uses a complementary emissions icon. Values are clamped or validated where appropriate; malformed or unavailable data displays `—`.

The second statistics row contains:

1. Live solar production in kW
2. Directional live grid flow in kW
3. Left Inverter and Right Inverter temperature placeholders, retained as `— °F` until their Tesla
   inverter entities are configured. **Superseded 2026-08-09:** see the note above.
4. Outdoor temperature from the configured weather entity, displayed in Fahrenheit

## Hourly Chart

The chart title is `Hourly Average Power`. It plots hourly averages from midnight through the current hour:

- Gold: `sensor.sense_287516_production`
- Blue: `sensor.sense_287516_energy`
- Y-axis: kW

Both series use the same instantaneous-sensor averaging path. Future hours remain empty, and a missing series does not prevent the other series from rendering.

## Testing and Deployment

Regression tests cover configuration roles, signed daily net formatting, live direction labels, W-to-kW conversion, low-carbon calculation, unavailable values, removal of battery UI, retained inverter placeholder, and the chart's two average-power inputs and kW labeling.

Before deployment, create a new backup of the live Homie Dashboard directory. Deploy only the changed Homie files. Do not alter the Home dashboard or its tablet top navigation, and do not expose or commit the live Home Assistant token.
