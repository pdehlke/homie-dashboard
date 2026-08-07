# Overview C WAQI Design

## Goal

Populate Overview C's existing AQI card from the World Air Quality Index station named
`Geronimo, Pima County, USA` without presenting pollutant index values as physical concentrations.

## Entity Mapping

- Overall AQI: `sensor.geronimo_pima_county_usa_air_quality_index`
- PM2.5 sub-index: `sensor.geronimo_pima_county_usa_pm2_5`
- PM10 sub-index: `sensor.geronimo_pima_county_usa_pm10`
- CO sub-index: `sensor.geronimo_pima_county_usa_carbon_monoxide`
- NO2 sub-index: `sensor.geronimo_pima_county_usa_nitrogen_dioxide`

The current card layout and pollutant labels remain unchanged. The overall value continues to use
the established US AQI bands and card colors. Pollutant values are rounded to one decimal place and
shown without `µg/m³`, `ppm`, or another concentration unit because the WAQI integration exposes
unitless pollutant sub-index values.

## Shared Display Behavior

`CONFIG.aqi` feeds both Overview C and the full-screen weather AQI section. Both consumers will use
the same unitless formatting so opening the expanded weather view cannot reinterpret the same
entities as concentrations.

Unavailable, unknown, empty, and nonnumeric states render as `—`. Valid zero values remain visible.

## Verification and Deployment

Regression tests will assert the exact Geronimo mappings and formatting behavior for valid and
unavailable states. The cache token will advance so wall-mounted browsers load the updated config
and renderer without manual cache clearing. Deployment will preserve the installed Homie token,
use a timestamped backup, and update the Lovelace iframe through its supported WebSocket API.
