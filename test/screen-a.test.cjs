const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const workDir = path.resolve(__dirname, "../dist");

function loadConfig() {
  const source = fs.readFileSync(path.join(workDir, "config.js"), "utf8");
  const context = { console };
  vm.createContext(context);
  vm.runInContext(
    `${source}\nglobalThis.__config = CONFIG; globalThis.__backgrounds = BACKGROUND_IMAGES;`,
    context,
  );
  return context.__config;
}

function loadCustomizations() {
  const modulePath = path.join(workDir, "homie-custom.js");
  assert.ok(fs.existsSync(modulePath), "homie-custom.js must exist");
  return require(modulePath);
}

function cssDeclarations(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} CSS rule must exist`);
  return match[1];
}

function dashboardElementsById(source) {
  const elements = new Map();
  const stack = [];
  const tags = source.matchAll(/<\/?([a-z][\w-]*)([^>]*)>/gi);

  for (const match of tags) {
    const [markup, tagName, attributes = ""] = match;
    if (markup.startsWith("</")) {
      stack.pop();
      continue;
    }

    const element = {
      tagName: tagName.toLowerCase(),
      id: attributes.match(/\bid="([^"]+)"/)?.[1] || null,
      className: attributes.match(/\bclass="([^"]+)"/)?.[1] || "",
      onclick: attributes.match(/\bonclick="([^"]+)"/)?.[1] || "",
      parent: stack.at(-1) || null,
    };
    if (element.id) elements.set(element.id, element);
    if (!markup.endsWith("/>") && !["input", "meta", "link", "br", "img", "hr"].includes(element.tagName)) {
      stack.push(element);
    }
  }

  return elements;
}

function loadThermostatOverlay() {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const thermostatSource = source.slice(
    source.indexOf("let _thermEntities"),
    source.indexOf("/** _buildThermTabs"),
  );
  const overlayClasses = new Set();
  const context = {
    CONFIG: loadConfig(),
    HOMIE_CUSTOM: loadCustomizations(),
    document: {
      getElementById: (id) => id === "thermostat-overlay"
        ? { classList: { add: (name) => overlayClasses.add(name), remove: (name) => overlayClasses.delete(name) } }
        : null,
    },
    haptic: () => {},
    _closeLauncher: () => {},
    _buildThermTabs: () => {},
    _renderThermRoom: () => {},
    window: {},
  };
  vm.createContext(context);
  vm.runInContext(
    `${thermostatSource}\nglobalThis.__thermostat = { openThermostat, closeThermostat, entities: () => _thermEntities };`,
    context,
  );
  return { context, overlayClasses, thermostat: context.__thermostat };
}

test("Screen A has the agreed balanced status grid", () => {
  const config = loadConfig();
  assert.deepEqual(
    Array.from(config.homeStats, (entry) => [entry.label, entry.entity, entry.unit || ""]),
    [
      ["Alarm", "sensor.homie_alarm_status", ""],
      ["Lights", "sensor.homie_lights_status", ""],
      ["Main House", "sensor.casasolar_south_zone_1_casasolar_south_zone_1_temperature", " °F"],
      ["Office Wing", "sensor.casasolar_north_zone_1_casasolar_north_zone_1_temperature", " °F"],
      ["Media", "sensor.homie_media_status", ""],
      ["Irrigation", "sensor.homie_irrigation_status", ""],
      ["Robot", "sensor.homie_robot_status", ""],
      ["EV", "sensor.homie_ev_status", ""],
    ],
  );
});

test("Overview B inherits Overview A's four-column center grid", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  assert.match(cssDeclarations(source, ".hero-stats"), /grid-template-columns:\s*repeat\(4,\s*1fr\)/);
  assert.doesNotMatch(cssDeclarations(source, ".ov2-stats"), /grid-template-columns/);
});

test("condition pills contain only agreed zone and solar readings", () => {
  const config = loadConfig();
  assert.deepEqual(
    Array.from(config.floorSensors, (panel) => ({
      label: panel.label,
      interactive: panel.interactive !== false,
      sensors: Array.from(panel.sensors, (sensor) => [sensor.type, sensor.entity, sensor.unit]),
    })),
    [
      {
        label: "Main House",
        interactive: true,
        sensors: [
          ["temp", "sensor.casasolar_south_zone_1_casasolar_south_zone_1_temperature", "°F"],
          ["humidity", "sensor.casasolar_south_zone_1_casasolar_south_zone_1_humidity", "%"],
        ],
      },
      {
        label: "Office Wing",
        interactive: true,
        sensors: [
          ["temp", "sensor.casasolar_north_zone_1_casasolar_north_zone_1_temperature", "°F"],
          ["humidity", "sensor.casasolar_north_zone_1_casasolar_north_zone_1_humidity", "%"],
        ],
      },
      {
        label: "Solar",
        interactive: false,
        sensors: [
          ["solar", "sensor.homie_solar_generation", "kW"],
          ["power", "sensor.homie_whole_house_load", "kW"],
          ["export", "sensor.homie_grid_flow", "kW"],
        ],
      },
    ],
  );
});

test("solar data roles bind the accepted Sense and Electricity Maps entities", () => {
  const config = loadConfig();
  assert.deepEqual(
    Array.from(config.solar.stats, (entry) => [entry.type, entry.entity]),
    [
      ["live-consumption", "sensor.sense_287516_energy"],
      ["solar", "sensor.sense_287516_production"],
      ["export", "sensor.homie_grid_flow"],
      ["daily-consumption", "sensor.sense_287516_daily_energy"],
      ["monthly-kwh", "sensor.sense_287516_monthly_energy"],
      ["net-today", "sensor.sense_287516_daily_net_production"],
      ["fossil-percentage", "sensor.electricity_maps_grid_fossil_fuel_percentage"],
      ["co2-intensity", "sensor.electricity_maps_co2_intensity"],
      ["solar-temp", ""],
    ],
  );
});

test("solar value helpers preserve units and house-centric grid direction", () => {
  const custom = loadCustomizations();
  assert.equal(custom.powerKw({ state: "3354", attributes: { unit_of_measurement: "W" } }), 3.354);
  assert.equal(custom.powerKw({ state: "-2.1", attributes: { unit_of_measurement: "kW" } }), -2.1);
  assert.equal(custom.powerKw({ state: "unavailable", attributes: {} }), null);
  assert.equal(custom.signedValue(6.4, 1), "+6.4");
  assert.equal(custom.signedValue(-0.7, 1), "-0.7");
  assert.deepEqual(custom.gridDirection(-2.1), { label: "Export", magnitude: 2.1, mode: "export" });
  assert.deepEqual(custom.gridDirection(1.2), { label: "Import", magnitude: 1.2, mode: "import" });
  assert.deepEqual(custom.gridDirection(0), { label: "Grid", magnitude: 0, mode: "neutral" });
  assert.equal(custom.lowCarbonPercentage(73.52), 26.48);
  assert.equal(custom.lowCarbonPercentage(120), null);
});

test("Overview C solar view model formats live, daily, solar, and grid values", () => {
  const custom = loadCustomizations();
  assert.deepEqual(
    custom.solarCardView({
      "live-consumption": { state: "1269", attributes: { unit_of_measurement: "W" } },
      "net-today": { state: "6.4", attributes: { unit_of_measurement: "kWh" } },
      solar: { state: "3354", attributes: { unit_of_measurement: "W" } },
      export: { state: "-2.1", attributes: { unit_of_measurement: "kW" } },
    }),
    {
      liveWatts: "1269",
      netToday: "+6.4 kWh",
      solar: "3.35 kW",
      grid: "2.10 kW",
      gridLabel: "Export",
      gridMode: "export",
    },
  );
});

test("Overview C solar view model resets unavailable values", () => {
  const custom = loadCustomizations();
  assert.deepEqual(custom.solarCardView({}), {
    liveWatts: "—",
    netToday: "—",
    solar: "—",
    grid: "—",
    gridLabel: "Grid",
    gridMode: "neutral",
  });
});

test("full-screen solar view model uses real usage and Electricity Maps values", () => {
  const custom = loadCustomizations();
  assert.deepEqual(
    custom.solarFullscreenView({
      "live-consumption": { state: "1269", attributes: { unit_of_measurement: "W" } },
      "daily-consumption": { state: "8.6", attributes: { unit_of_measurement: "kWh" } },
      "monthly-kwh": { state: "271.1", attributes: { unit_of_measurement: "kWh" } },
      "fossil-percentage": { state: "73.52", attributes: { unit_of_measurement: "%" } },
      "co2-intensity": { state: "450", attributes: { unit_of_measurement: "gCO2eq/kWh" } },
      solar: { state: "3354", attributes: { unit_of_measurement: "W" } },
      export: { state: "-2.1", attributes: { unit_of_measurement: "kW" } },
      "solar-temp": null,
    }),
    {
      liveWatts: "1269",
      dailyUsage: "8.6",
      monthlyUsage: "271.1",
      lowCarbon: "26.5",
      co2Intensity: "450",
      solarKw: 3.354,
      homeKw: 1.269,
      gridKw: -2.1,
      gridLabel: "Export",
      gridMagnitude: "2.10",
      inverterTemp: "—",
    },
  );
});

test("hourly power averages convert both Sense series from W to kW", () => {
  const custom = loadCustomizations();
  const values = custom.hourlyPowerAverages(
    [
      { state: "1000", last_changed: "2026-08-07T08:05:00-07:00" },
      { state: "3000", last_changed: "2026-08-07T08:35:00-07:00" },
      { state: "2000", last_changed: "2026-08-07T09:10:00-07:00" },
    ],
    "W",
  );
  assert.equal(values[8], 2);
  assert.equal(values[9], 2);
  assert.equal(values[10], 0);
});

test("full-screen solar markup removes battery and exposes accepted readings", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  assert.doesNotMatch(source, /id="sfs-node-bat-val"|id="sfs-stat-battery"|id="sfs-lbl-charge"/);
  assert.match(source, />Low Carbon</);
  assert.match(source, />CO2 Intensity</);
  assert.match(source, /id="sfs-stat-left-inverter"/);
  assert.match(source, /id="sfs-stat-right-inverter"/);
  assert.match(source, />Left Inverter</);
  assert.match(source, />Right Inverter</);
  assert.match(source, /id="sfs-stat-left-inverter">—<\/span><span class="sfs-stat-unit"> °F<\/span>/);
  assert.match(source, /id="sfs-stat-right-inverter">—<\/span><span class="sfs-stat-unit"> °F<\/span>/);
  const statsRow = source.slice(
    source.indexOf('<div class="sfs-stats-row">'),
    source.indexOf("<!-- Hourly chart -->"),
  );
  assert.equal((statsRow.match(/class="sfs-stat-card"/g) || []).length, 5);
  const consumptionRow = source.slice(
    source.indexOf('<div class="sfs-consumption-row">'),
    source.indexOf("<!-- Stats row -->"),
  );
  assert.equal((consumptionRow.match(/class="sfs-con-card"/g) || []).length, 5);
  assert.match(source, />HOURLY AVERAGE POWER</);
  assert.match(source, />kW<\/text>/);
});

test("customization docs make Fahrenheit permanent for every temperature display", () => {
  const source = fs.readFileSync(path.join(workDir, "..", "docs", "pdehlke-customizations.md"), "utf8");
  assert.match(source, /all temperature-related displays[^.]*Fahrenheit/i);
  assert.match(source, /future[^.]*convert[^.]*Fahrenheit/i);
});

test("Overview C uses OpenWeatherMap for a five-day future forecast", () => {
  const config = loadConfig();
  assert.equal(config.weather.entity, "weather.openweathermap");
  assert.equal(config.weather.uvEntity, "sensor.openweathermap_uv_index");
  assert.equal(config.weather.tempUnit, "°F");
  assert.equal(config.sun.entity, "sun.sun");
  assert.equal(config.moon.entity, "sensor.moon_phase");
});

test("weather details read native sun attributes and the dedicated UV sensor", () => {
  const custom = loadCustomizations();
  const sun = {
    attributes: {
      next_rising: "2026-08-08T12:43:17+00:00",
      next_setting: "2026-08-08T02:15:19+00:00",
    },
  };
  assert.deepEqual(custom.sunEventTimes(sun), {
    riseISO: "2026-08-08T12:43:17+00:00",
    setISO: "2026-08-08T02:15:19+00:00",
  });
  assert.equal(custom.weatherUvValue({ state: "9.66" }, { attributes: {} }), 9.66);
  assert.equal(custom.weatherUvValue(null, { attributes: { uv_index: 7 } }), 7);
  assert.equal(custom.weatherUvValue({ state: "unavailable" }, { attributes: {} }), null);
});

test("five-day weather selection excludes today and returns five future days", () => {
  const custom = loadCustomizations();
  const forecast = Array.from({ length: 8 }, (_unused, index) => ({ day: index }));
  assert.deepEqual(custom.futureForecastDays(forecast, 5), [
    { day: 1 },
    { day: 2 },
    { day: 3 },
    { day: 4 },
    { day: 5 },
  ]);
});

test("empty configured AQI bands fall back to dashboard defaults", () => {
  const custom = loadCustomizations();
  const defaults = [
    { max: 50, label: "Good" },
    { max: Infinity, label: "Hazardous" },
  ];
  assert.deepEqual(custom.aqiBandForValue([], defaults, 25), defaults[0]);
  assert.deepEqual(custom.aqiBandForValue([], defaults, 125), defaults[1]);
});

test("Overview C and expanded Weather use tested forecast and AQI helpers", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const expandedWeather = source.slice(
    source.indexOf("function _refreshWeatherFS()"),
    source.indexOf("function openWeatherFS()"),
  );
  assert.match(source, /HOMIE_CUSTOM\.futureForecastDays\(forecast,\s*5\)/);
  assert.match(source, /HOMIE_CUSTOM\.aqiBandForValue\(aqiCfg\.bands,\s*defaultBands,\s*aqi\)/);
  assert.match(source, /HOMIE_CUSTOM\.sunEventTimes\(sunD,\s*riseD,\s*setD\)/);
  assert.match(expandedWeather, /const uvD\s*=.*uvEntity/);
  assert.match(expandedWeather, /const uvValue\s*=\s*HOMIE_CUSTOM\.weatherUvValue\(uvD,\s*d\)/);
});

test("AQI configuration binds the accepted Geronimo WAQI station sensors", () => {
  const config = loadConfig();
  assert.deepEqual(
    {
      entity: config.aqi.entity,
      pm25: config.aqi.pm25,
      pm10: config.aqi.pm10,
      co: config.aqi.co,
      no2: config.aqi.no2,
    },
    {
      entity: "sensor.geronimo_pima_county_usa_air_quality_index",
      pm25: "sensor.geronimo_pima_county_usa_pm2_5",
      pm10: "sensor.geronimo_pima_county_usa_pm10",
      co: "sensor.geronimo_pima_county_usa_carbon_monoxide",
      no2: "sensor.geronimo_pima_county_usa_nitrogen_dioxide",
    },
  );
});

test("WAQI pollutant sub-indices stay unitless and preserve zero", () => {
  const custom = loadCustomizations();
  assert.deepEqual(
    custom.aqiPollutantView({
      pm25: { state: "25" },
      pm10: { state: 0 },
      co: { state: "unavailable" },
      no2: { state: "not-a-number" },
    }),
    { pm25: "25.0", pm10: "0.0", co: "—", no2: "—" },
  );
  assert.deepEqual(
    custom.aqiPollutantView({ pm25: null, pm10: { state: "" }, co: { state: "unknown" } }),
    { pm25: "—", pm10: "—", co: "—", no2: "—" },
  );
});

test("Homie HTML loads config and helpers with one release token", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const version = source.match(/const HOMIE_ASSET_VERSION = "([^"]+)";/)?.[1];
  assert.equal(version, "20260807.13");
  assert.match(source, /config\.js\?v=\$\{HOMIE_ASSET_VERSION\}/);
  assert.match(source, /homie-custom\.js\?v=\$\{HOMIE_ASSET_VERSION\}/);
  assert.doesNotMatch(source, /<script src="(?:config|homie-custom)\.js"><\/script>/);
});

test("solar chart history status distinguishes failures from empty history", () => {
  const custom = loadCustomizations();
  assert.equal(custom.chartHistoryMessage(null, null, true), "History unavailable");
  assert.equal(custom.chartHistoryMessage(null, null, false), "No history yet");
  assert.equal(custom.chartHistoryMessage([1], null, true), null);
});

test("control row and popup mappings match the approved design", () => {
  const config = loadConfig();
  assert.deepEqual(Array.from(config.controls, (entry) => entry.label), ["Lights", "Climate", "A/V", "Irrigation"]);
  assert.equal(config.controls[1].action, "thermostat");
  assert.equal(config.controls[2].action, "media_browser");
  assert.equal(config.controls[3].confirmStart, true);
  assert.deepEqual(
    Array.from(config.controls[1].subEntities, (entry) => [entry.label, entry.entity]),
    [
      ["Main House", "climate.casasolar_south_zone_1"],
      ["Office Wing", "climate.casasolar_north_zone_1"],
    ],
  );
  assert.deepEqual(
    Array.from(config.controls[0].subGroups, (group) => group.label),
    ["Dining Room", "Entry", "Kitchen", "Office", "Primary Suite"],
  );
  assert.deepEqual(
    Array.from(config.controls[3].subEntities, (entry) => entry.entity),
    [
      "switch.main_irrigation_east_of_garage",
      "switch.main_irrigation_east_triangle",
      "switch.main_irrigation_emmas_yard",
      "switch.main_irrigation_south_of_driveway",
      "switch.back_yard_irrigation",
    ],
  );
});

test("shared UI defaults select Screen A, Classic Gold, and 12-hour time", () => {
  const config = loadConfig();
  assert.deepEqual(
    JSON.parse(JSON.stringify(config.uiDefaults)),
    { startupMode: "overview1", clockFormat: "12h", theme: "gold", backgroundMode: "vivid" },
  );
  assert.equal(config.brandName, "HOME");
  assert.deepEqual(Array.from(config.backgroundImages || []), []);
});

test("Homie connects to Home Assistant by canonical hostname", () => {
  const source = fs.readFileSync(path.join(workDir, "config.js"), "utf8");
  assert.match(source, /const WS_URL = "ws:\/\/homeassistant\.local:8123\/api\/websocket";/);
  assert.doesNotMatch(source, /192\.168\.4\.125/);
});

test("custom actions route Climate and A/V without generic toggles", () => {
  const custom = loadCustomizations();
  assert.equal(custom.controlOnClick({ action: "thermostat" }, 1), "openThermostat()");
  assert.equal(custom.controlOnClick({ action: "media_browser" }, 2), "openMediaBrowser()");
  assert.equal(custom.controlOnClick({ subEntities: [{}] }, 1), "openPopup(1)");
  assert.equal(custom.controlIndex([{ label: "Climate" }, { label: "Lights" }], "Lights"), 1);
});

test("thermostat filtering keeps all entries by default and selects an exact entity", () => {
  const custom = loadCustomizations();
  const entities = [
    { label: "Main House", entity: "climate.casasolar_south_zone_1" },
    { label: "Office Wing", entity: "climate.casasolar_north_zone_1" },
  ];

  assert.deepEqual(custom.filterThermostats(entities), entities);
  assert.deepEqual(
    custom.filterThermostats(entities, "climate.casasolar_south_zone_1"),
    [entities[0]],
  );
  assert.deepEqual(custom.filterThermostats(entities, "climate.invalid"), []);
});

test("thermostat launcher formats live cooling state and setpoint", () => {
  const custom = loadCustomizations();

  assert.deepEqual(
    custom.thermostatLauncherView({
      state: "cool",
      attributes: { current_temperature: 78.4, temperature: 72.4 },
    }),
    { temperature: "78 °F", targetTemperature: "72 °F", mode: "Cool", modeClass: "mode-cool" },
  );
});

test("thermostat view normalizes Fahrenheit display and range setpoints", () => {
  const custom = loadCustomizations();

  assert.deepEqual(
    custom.thermostatTemperatureView({
      attributes: { temperature_unit: "°C", current_temperature: 20, temperature: 21.5 },
    }),
    {
      currentTemperature: "68 °F",
      targetTemperature: "71 °F",
      currentTemperatureValue: 68,
      targetTemperatureValue: 70.7,
      hasRange: false,
      nativeUnit: "°C",
    },
  );
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: {
        temperature_unit: "°F",
        current_temperature: 78.4,
        target_temp_low: 69.1,
        target_temp_high: 75.9,
      },
    }),
    {
      currentTemperature: "78 °F",
      targetTemperature: "73 °F",
      currentTemperatureValue: 78.4,
      targetTemperatureValue: 72.5,
      hasRange: true,
      nativeUnit: "°F",
    },
  );
  assert.deepEqual(
    custom.thermostatSetTemperaturePayload({
      state: "heat_cool",
      attributes: {
        temperature_unit: "°C",
        target_temp_low: 18,
        target_temp_high: 22,
      },
    }, 0.5),
    {
      target_temp_high: 22.3,
      target_temp_low: 18.3,
    },
  );
  assert.deepEqual(
    custom.thermostatSetTemperaturePayload({
      attributes: {
        temperature_unit: "°F",
        temperature: 72,
      },
    }, -1),
    { temperature: 71 },
  );
});

test("thermostat range setpoint follows the active hvac_action bound, not a midpoint average", () => {
  const custom = loadCustomizations();

  // Real live fixture: climate.casasolar_south_zone_1 while actively cooling. A midpoint
  // average of 70 would look wrong next to "Cooling" when the unit is really working
  // toward 78.
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: {
        current_temperature: 78,
        target_temp_high: 78,
        target_temp_low: 62,
        hvac_action: "cooling",
      },
    }),
    {
      currentTemperature: "78 °F",
      targetTemperature: "78 °F",
      currentTemperatureValue: 78,
      targetTemperatureValue: 78,
      hasRange: true,
      nativeUnit: "°F",
    },
  );
  // Home Assistant's climate.set_temperature schema hard-400s a call that supplies only one
  // of target_temp_high/target_temp_low; both keys must always be present, even though only
  // the active one's value changes. Confirmed against the real HD21K77727 entity: a
  // target_temp_high-only call returns 200 with an empty body and never touches the state.
  assert.deepEqual(
    custom.thermostatSetTemperaturePayload({
      state: "heat_cool",
      attributes: { target_temp_high: 78, target_temp_low: 62, hvac_action: "cooling" },
    }, 0.5),
    { target_temp_high: 78.5, target_temp_low: 62 },
  );

  // Same band, actively heating: the low bound is the one in play.
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: {
        current_temperature: 60,
        target_temp_high: 78,
        target_temp_low: 62,
        hvac_action: "heating",
      },
    }).targetTemperature,
    "62 °F",
  );
  assert.deepEqual(
    custom.thermostatSetTemperaturePayload({
      state: "heat_cool",
      attributes: { target_temp_high: 78, target_temp_low: 62, hvac_action: "heating" },
    }, -0.5),
    { target_temp_high: 78, target_temp_low: 61.5 },
  );

  // Idle or unreported hvac_action: no single bound is "active", so fall back to shifting
  // the whole band together, matching the existing no-hvac_action behavior.
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: { current_temperature: 70, target_temp_high: 78, target_temp_low: 62, hvac_action: "idle" },
    }).targetTemperature,
    "70 °F",
  );
});

test("range-mode set_temperature payloads always carry both bounds, regardless of hvac_action", () => {
  const custom = loadCustomizations();

  // Home Assistant rejects a set_temperature call carrying only one of
  // target_temp_high/target_temp_low with a bare 400, for any hvac_action. This must never
  // regress to a single-key payload again.
  for (const hvacAction of ["cooling", "heating", "idle", "", "fan"]) {
    const payload = custom.thermostatSetTemperaturePayload(
      { state: "heat_cool", attributes: { target_temp_high: 78, target_temp_low: 62, hvac_action: hvacAction } },
      0.5,
    );
    assert.deepEqual(Object.keys(payload).sort(), ["target_temp_high", "target_temp_low"]);
  }
});

test("thermostat step size follows the entity's declared target_temp_step", () => {
  const custom = loadCustomizations();

  // Real fixture: both CasaSolar zones (lennoxs30) declare a whole-degree step. A
  // set_temperature call that doesn't land on a step multiple is silently dropped by that
  // integration -- no error, no state change -- so this must never fall back to 0.5 when a
  // real step is declared.
  assert.equal(custom.thermostatStepSize({ attributes: { target_temp_step: 1.0 } }), 1);
  assert.equal(custom.thermostatStepSize({ attributes: { target_temp_step: 0.5 } }), 0.5);
  assert.equal(custom.thermostatStepSize({ attributes: {} }), 0.5);
  assert.equal(custom.thermostatStepSize(null), 0.5);
  assert.equal(custom.thermostatStepSize({ attributes: { target_temp_step: 0 } }), 0.5);
});

test("thermostat launcher treats unavailable and missing states as unavailable", () => {
  const custom = loadCustomizations();

  assert.deepEqual(
    custom.thermostatLauncherView({ state: "unavailable", attributes: {} }),
    { temperature: "— °F", targetTemperature: "— °F", mode: "Unavailable", modeClass: "" },
  );
  assert.deepEqual(
    custom.thermostatLauncherView(null),
    { temperature: "— °F", targetTemperature: "— °F", mode: "Unavailable", modeClass: "" },
  );
});

test("floorThermostatEntity resolves the visible floor's climate entity", () => {
  const custom = loadCustomizations();
  const floors = [
    { label: "Main House", entity: "climate.casasolar_south_zone_1", sensors: [] },
    { label: "Office Wing", entity: "climate.casasolar_north_zone_1", sensors: [] },
  ];

  assert.equal(custom.floorThermostatEntity(floors, 0), "climate.casasolar_south_zone_1");
  assert.equal(custom.floorThermostatEntity(floors, 1), "climate.casasolar_north_zone_1");
  assert.equal(custom.floorThermostatEntity(floors, 2), null);
  assert.equal(custom.floorThermostatEntity(floors, -1), null);
  assert.equal(custom.floorThermostatEntity([{ label: "Solar", sensors: [] }], 0), null);
  assert.equal(custom.floorThermostatEntity(null, 0), null);
});

test("Overview C places Garden in the center and Floors in the right column", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const elements = dashboardElementsById(source);

  assert.match(elements.get("ov3-garden-card").parent.className, /\bov3-grid\b/);
  assert.match(elements.get("ov3-floors-card").parent.className, /\bov3-col3\b/);
});

test("Overview C launcher opens only Main House, while Overview A remains unfiltered after close", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const launcher = dashboardElementsById(source).get("ov3-ac-card");
  const { context, overlayClasses, thermostat } = loadThermostatOverlay();

  vm.runInContext(launcher.onclick, context);
  assert.equal(overlayClasses.has("open"), true);
  assert.deepEqual(
    Array.from(thermostat.entities(), (entry) => entry.entity),
    ["climate.casasolar_south_zone_1"],
  );

  thermostat.closeThermostat();
  thermostat.openThermostat();
  assert.equal(overlayClasses.has("open"), true);
  assert.deepEqual(
    Array.from(thermostat.entities(), (entry) => entry.entity),
    ["climate.casasolar_south_zone_1", "climate.casasolar_north_zone_1"],
  );
});

test("an invalid thermostat filter closes an already-open overlay", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const thermostatSource = source.slice(
    source.indexOf("let _thermEntities"),
    source.indexOf("/** _buildThermTabs"),
  );
  const overlayClasses = new Set(["open"]);
  const context = {
    CONFIG: {
      controls: [{
        subEntities: [{ label: "Main House", entity: "climate.casasolar_south_zone_1" }],
      }],
    },
    HOMIE_CUSTOM: loadCustomizations(),
    document: {
      getElementById: (id) => id === "thermostat-overlay"
        ? {
            classList: {
              add: (name) => overlayClasses.add(name),
              remove: (name) => overlayClasses.delete(name),
            },
          }
        : null,
    },
    haptic: () => {},
    _closeLauncher: () => {},
  };
  vm.createContext(context);
  vm.runInContext(
    `${thermostatSource}\nglobalThis.__openThermostat = openThermostat;`,
    context,
  );

  context.__openThermostat("climate.invalid");

  assert.equal(overlayClasses.has("open"), false);
});

test("Overview C uses the Now Playing icon for the semantic A/V action", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const resolver = source.slice(
    source.indexOf("function _sbIcon(ctrl)"),
    source.indexOf("const hasPopup", source.indexOf("function _sbIcon(ctrl)")),
  );
  assert.match(resolver, /ctrl\.action === ["']media_browser["']/);
  assert.match(resolver, /<circle cx="12" cy="12" r="10"\/>/);
  assert.match(resolver, /<polygon points="10 8 16 12 10 16 10 8"/);
});

test("Overview C floors card has an expand button wired to the visible floor's thermostat", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const cardStart = source.indexOf('class="ov3-floors-card"');
  const cardMarkup = source.slice(cardStart, source.indexOf("<!-- Purifier card", cardStart));

  assert.match(cardMarkup, /ov3-floors-launch-btn/);
  assert.match(cardMarkup, /onclick="_openFloorsThermostat\(\)"/);
  assert.match(source, /function _openFloorsThermostat\(\)/);
});

test("custom safety behavior confirms starts but never stops", () => {
  const custom = loadCustomizations();
  assert.equal(custom.requiresStartConfirmation({ confirmStart: true }, false), true);
  assert.equal(custom.requiresStartConfirmation({ confirmStart: true }, true), false);
  assert.equal(custom.requiresStartConfirmation({ confirmStart: false }, false), false);
  assert.match(custom.startConfirmationMessage({ label: "East Triangle" }), /East Triangle/);
});

test("custom layout and placeholder security behavior are explicit", () => {
  const custom = loadCustomizations();
  assert.equal(custom.statColumns(8), 4);
  assert.equal(custom.statColumns(10), 5);
  assert.equal(custom.sensorPanelInteractive({ label: "Solar", interactive: false }), false);
  assert.equal(custom.securityMessage(), "Alarm Not Configured");
});

test("custom defaults migrate each browser once without clobbering later choices", () => {
  const custom = loadCustomizations();
  const values = new Map([
    ["homie_dashboard_settings", JSON.stringify({ clockFormat: "24h", startupMode: "overview3" })],
    ["homie-theme", "cyan"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const defaults = { startupMode: "overview1", clockFormat: "12h", theme: "gold", backgroundMode: "vivid" };

  assert.equal(custom.installDefaults(storage, defaults, "screen-a-v1"), true);
  assert.deepEqual(JSON.parse(values.get("homie_dashboard_settings")), {
    clockFormat: "12h",
    startupMode: "overview1",
    bgMode: "vivid",
  });
  assert.equal(values.get("homie-theme"), "gold");

  values.set("homie-theme", "emerald");
  assert.equal(custom.installDefaults(storage, defaults, "screen-a-v1"), false);
  assert.equal(values.get("homie-theme"), "emerald");
});
