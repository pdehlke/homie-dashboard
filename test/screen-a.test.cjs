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
  const openerStart = source.indexOf("function _openFloorsThermostat");
  const openerSource = source.slice(openerStart, source.indexOf("}", openerStart) + 1);
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
    `${thermostatSource}\n` +
      `let _ov3FloorsList = []; let _ov3FloorsActiveIndex = 0;\n` +
      `${openerSource}\n` +
      `globalThis.__thermostat = { openThermostat, closeThermostat, entities: () => _thermEntities };\n` +
      `globalThis.__floors = { open: _openFloorsThermostat, setState: (list, idx) => { _ov3FloorsList = list; _ov3FloorsActiveIndex = idx; } };`,
    context,
  );
  return { context, overlayClasses, thermostat: context.__thermostat, floors: context.__floors };
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

test("home green percentage blends solar and grid-import green share", () => {
  const custom = loadCustomizations();
  // Exporting: home consumption is fully covered by solar, so it's 100% green
  // regardless of the grid's own mix.
  assert.equal(custom.homeGreenPercentage(3.354, -2.1, 1.269, 26.48), 100);
  // Neutral grid (no meaningful import or export): same, still fully solar-covered.
  assert.equal(custom.homeGreenPercentage(1, 0, 1, 50), 100);
  // No solar at all: home green % collapses to the raw grid green %.
  assert.equal(custom.homeGreenPercentage(0, 2, 2, 40), 40);
  // Mixed solar + grid import: weighted by each source's share of consumption.
  assert.equal(custom.homeGreenPercentage(1, 1, 2, 50), 75);
  // Clamped even if sensor noise would push the blend past 100.
  assert.equal(custom.homeGreenPercentage(5, 0.5, 3, 100), 100);
  // Missing inputs, or importing with no grid-mix data, yield null.
  assert.equal(custom.homeGreenPercentage(null, 1, 2, 50), null);
  assert.equal(custom.homeGreenPercentage(1, 1, 0, 50), null);
  assert.equal(custom.homeGreenPercentage(1, 2, 3, null), null);
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
      // Exporting, so solar alone covers all consumption: 100% green, not the
      // raw grid mix (which would have been 26.5).
      lowCarbon: "100.0",
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

test("full-screen solar view model blends solar and grid-import green share while importing", () => {
  const custom = loadCustomizations();
  const view = custom.solarFullscreenView({
    "live-consumption": { state: "2000", attributes: { unit_of_measurement: "W" } },
    "daily-consumption": { state: "8.6", attributes: { unit_of_measurement: "kWh" } },
    "monthly-kwh": { state: "271.1", attributes: { unit_of_measurement: "kWh" } },
    "fossil-percentage": { state: "50", attributes: { unit_of_measurement: "%" } },
    "co2-intensity": { state: "450", attributes: { unit_of_measurement: "gCO2eq/kWh" } },
    solar: { state: "1000", attributes: { unit_of_measurement: "W" } },
    export: { state: "1", attributes: { unit_of_measurement: "kW" } },
    "solar-temp": null,
  });
  // 1 kW solar (100% green) + 1 kW grid import at 50% green, over 2 kW total
  // consumption, is 75% green.
  assert.equal(view.lowCarbon, "75.0");
  assert.equal(view.gridLabel, "Import");
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
  assert.equal(version, "20260809.2");
  assert.match(source, /config\.js\?v=\$\{HOMIE_ASSET_VERSION\}/);
  assert.match(source, /homie-custom\.js\?v=\$\{HOMIE_ASSET_VERSION\}/);
  assert.doesNotMatch(source, /<script src="(?:config|homie-custom)\.js"><\/script>/);
});

test("Overview C sidebar's Irrigation icon uses material-symbols:sprinkler-rounded, not the generic switch icon", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const fnStart = source.indexOf("function _sbIcon(ctrl)");
  const fnEnd = source.indexOf("\n  const hasPopup", fnStart);
  assert.ok(fnStart > -1 && fnEnd > fnStart, "_sbIcon must be found");
  const fnBody = source.slice(fnStart, fnEnd);

  assert.match(fnBody, /labelLower\.includes\("irrigation"\)/);
  // The fetched Iconify body for material-symbols:sprinkler-rounded, verified
  // against the live API rather than hand-drawn like its siblings.
  assert.match(fnBody, /M11 18H8q-\.425 0-\.712-\.288T7 17t\.288-\.712T8 16h8/);
  // Filled by design (Iconify's "sprinkler-rounded" is the Filled variant),
  // unlike the stroke-outline icons around it in the same map.
  assert.match(fnBody, /fill="currentColor" stroke="none"><path d="M11\.288/);
});

test("Overview C sidebar pins Settings, Modes, and Security; everything else is the dynamic list", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const elements = dashboardElementsById(source);

  for (const id of ["ov3-settings-btn", "ov3-mode-btn", "ov3-security-btn"]) {
    assert.ok(elements.has(id), `.ov3-sidebar must pin #${id}`);
    assert.equal(elements.get(id).className, "ov3-sb-btn");
  }
  assert.equal(elements.get("ov3-security-btn").onclick, elements.get("security-btn").onclick);

  // No pinned Pet Stats button (this house will never have smart pet
  // devices), and no pinned Lights button either — Lights comes from the
  // dynamic list now, same as Climate/A-V/Irrigation.
  assert.ok(!elements.has("ov3-pet-btn"));
  assert.ok(!elements.has("ov3-lights-btn"));

  // The dynamic per-CONFIG.controls list is back.
  assert.ok(elements.has("ov3-sb-controls"));
  assert.match(source, /function _buildOv3SidebarControls\(\)/);
  assert.match(source, /function _refreshOv3SidebarControls\(\)/);
  assert.match(source, /\n\s*_buildOv3SidebarControls\(\);/); // called from _ensureOv3Built
  assert.match(source, /\n\s*_refreshOv3SidebarControls\(\);/); // called from _refreshOv3

  // Chrome is untouched.
  assert.match(cssDeclarations(source, ".ov3-sb-btn"), /border-radius:\s*12px/);
});

test("Overview C's dynamic sidebar controls are unfiltered: Climate and Irrigation get buttons too", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const fnStart = source.indexOf("function _buildOv3SidebarControls()");
  const fnEnd = source.indexOf("\n/* Refresh sidebar control button", fnStart);
  assert.ok(fnStart > -1 && fnEnd > fnStart, "_buildOv3SidebarControls must be found");
  const fnBody = source.slice(fnStart, fnEnd);

  // Deliberately no filter: an earlier version excluded Irrigation and the
  // climate/fan domains. Removed on purpose — accepted duplicate click paths
  // into Irrigation and Climate, which already have their own full cards.
  assert.doesNotMatch(fnBody, /c\.label !== ["']Irrigation["']/);
  assert.doesNotMatch(fnBody, /_sbDomain/);
  assert.match(fnBody, /activeControls\.map\(/);
});

test("Overview C's Climate sidebar glow reflects hvac_action, not just state !== \"off\"", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const fnStart = source.indexOf("function _refreshOv3SidebarControls()");
  const fnEnd = source.indexOf("\n/* Build/rebuild the entire purifier card", fnStart);
  assert.ok(fnStart > -1 && fnEnd > fnStart, "_refreshOv3SidebarControls must be found");
  const fnBody = source.slice(fnStart, fnEnd);

  // Both real thermostats stay in heat_cool mode almost always, so a plain
  // entityIsOn() (state !== "off") glow would be lit nearly permanently.
  // hvac_action reports whether the equipment is actually doing something.
  assert.match(fnBody, /hvac_action/);
  assert.match(fnBody, /["']heating["']/);
  assert.match(fnBody, /["']cooling["']/);
});

test("Solar is not offered or launched as a Startup view", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Not selectable in the Startup settings list.
  assert.doesNotMatch(source, /applySetting\('startupMode','solar'\)/);
  assert.doesNotMatch(source, /id="sm-solar"/);

  // Not dispatched on load, including for a stale value from before this change:
  // Solar's fullscreen overlay hides its close button and exits by gesture only
  // (see docs/pdehlke-customizations.md), so any startupMode of "solar" must fall
  // through to the default Overview 1 landing instead of trapping the user.
  const dispatchStart = source.indexOf("// Apply startup mode from settings");
  const dispatchEnd = source.indexOf("// Apply petName from CONFIG", dispatchStart);
  assert.ok(dispatchStart > -1 && dispatchEnd > dispatchStart, "startup dispatch block must be found");
  const dispatch = source.slice(dispatchStart, dispatchEnd);
  assert.doesNotMatch(dispatch, /"solar"/);
  assert.match(dispatch, /"overview3"/); // sibling modes remain intact
});

test("Overview C's main column scrolls instead of clipping if its host ever hands it a short canvas", () => {
  // .ov3-main is sized to fit a full 1280x800 canvas exactly when the host (Home Assistant's
  // Lovelace iframe) hides its own header, as configured via kiosk_mode for the Homie Dashboard
  // user. overflow-y: auto is a defensive fallback only, not the primary fix: if that host chrome
  // is ever un-hidden, content becomes reachable by scroll instead of silently clipping off-screen
  // with no visual signal, the failure mode that made the original overflow hard to notice.
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const start = source.indexOf(".ov3-main {");
  const rule = source.slice(start, source.indexOf("}", start));
  assert.match(rule, /overflow-y:\s*auto/);
  assert.match(rule, /overflow-x:\s*hidden/);
  assert.doesNotMatch(rule, /overflow:\s*hidden/);
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
    Array.from(config.controls[1].subEntities, (entry) => entry.alertEntity),
    [
      "sensor.basement_casasolar_south_casasolar_south_alert",
      "sensor.basement_casasolar_north_casasolar_north_alert",
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
      "switch.main_irrigation_north",
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

test("configured floors resolve to the real thermostat entities", () => {
  const custom = loadCustomizations();
  const SENSOR_TYPES = ["temp", "humidity", "pm25"];
  const floors = loadConfig().floorSensors
    .filter(f => f.label !== "Solar" && (f.sensors || []).some(s => SENSOR_TYPES.includes(s.type)));
  assert.equal(custom.floorThermostatEntity(floors, 0), "climate.casasolar_south_zone_1");
  assert.equal(custom.floorThermostatEntity(floors, 1), "climate.casasolar_north_zone_1");
});

test("floorTargetText formats a floor's target the same terse way as its Temp cell", () => {
  const custom = loadCustomizations();

  assert.equal(custom.floorTargetText(null, null), "n/a");
  assert.equal(custom.floorTargetText(undefined, null), "n/a");

  // Real live fixture: climate.casasolar_south_zone_1 while actively cooling.
  assert.equal(
    custom.floorTargetText("climate.casasolar_south_zone_1", {
      state: "heat_cool",
      attributes: { current_temperature: 78, target_temp_high: 78, target_temp_low: 62, hvac_action: "cooling" },
    }),
    "78°",
  );

  // Entity configured, but no cached state yet (or a state with no resolvable target).
  assert.equal(custom.floorTargetText("climate.casasolar_south_zone_1", null), "—");
  assert.equal(
    custom.floorTargetText("climate.casasolar_south_zone_1", { state: "unavailable", attributes: {} }),
    "—",
  );
});

test("Overview C places Garden in the center and Floors in the right column", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const elements = dashboardElementsById(source);

  assert.match(elements.get("ov3-garden-card").parent.className, /\bov3-grid\b/);
  assert.match(elements.get("ov3-floors-card").parent.className, /\bov3-col3\b/);
});

test("Overview C floors button opens only Main House, while Overview A remains unfiltered after close", () => {
  const { overlayClasses, thermostat, floors } = loadThermostatOverlay();
  const floorsList = [
    { label: "Main House", entity: "climate.casasolar_south_zone_1" },
    { label: "Office Wing", entity: "climate.casasolar_north_zone_1" },
  ];

  floors.setState(floorsList, 0);
  floors.open();
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

test("Overview C floors card has an expand button wired to the visible floor's thermostat", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const cardStart = source.indexOf('class="ov3-floors-card"');
  const cardMarkup = source.slice(cardStart, source.indexOf("<!-- Purifier card", cardStart));

  assert.match(cardMarkup, /ov3-floors-launch-btn/);
  assert.match(cardMarkup, /onclick="_openFloorsThermostat\(\)"/);
  assert.match(source, /function _openFloorsThermostat\(\)/);
});

test("floors card stat row is a 2x2 grid with Temp/Target on top and Humid/PM2.5 below", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  assert.match(cssDeclarations(source, ".ov3-floors-stat-row"), /display:\s*grid/);
  assert.match(cssDeclarations(source, ".ov3-floors-stat-row"), /grid-template-columns:\s*1fr 1fr/);

  const cardStart = source.indexOf('class="ov3-floors-card"');
  const buildFnStart = source.indexOf("function _buildOv3FloorsCard");
  const buildFnBody = source.slice(buildFnStart, source.indexOf("\nfunction _ov3FloorsScrollTo", buildFnStart));
  assert.match(buildFnBody, /\["temp",\s*"target",\s*"humidity",\s*"pm25"\]/);
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

test("Alert indicator surfaces HA persistent_notification via WS subscribe, not the unrelated CONFIG.notifications bar", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const elements = dashboardElementsById(source);

  // Both surfaces exist: Overview A/B's floating corner button and Overview
  // C's pinned sidebar button.
  assert.ok(elements.has("alert-indicator-corner"));
  assert.ok(elements.has("ov3-alert-btn"));
  assert.equal(elements.get("ov3-alert-btn").className, "ov3-sb-btn ov3-alert-btn");
  assert.equal(elements.get("alert-indicator-corner").onclick, "openAlertOverlay()");
  assert.equal(elements.get("ov3-alert-btn").onclick, "openAlertOverlay()");
  assert.ok(elements.has("alert-overlay"));
  assert.ok(elements.has("alert-popup-list"));

  // Sourced from persistent_notification/subscribe, which pushes a full
  // {type:"current",...} snapshot on connect plus {type:"added"|"removed",...}
  // afterward — not a one-shot persistent_notification/get, and not the
  // pre-existing CONFIG.notifications/notification-bar entity-watcher, which
  // is a different, unrelated feature despite the similar name.
  assert.match(source, /type:\s*"persistent_notification\/subscribe"/);
  assert.match(source, /pnSubscribeId/);
  assert.match(source, /type === "current"/);
  assert.match(source, /type === "added"/);
  assert.match(source, /type === "removed"/);
  assert.match(source, /let pnCache = new Map\(\)/);

  assert.match(source, /function refreshAlertIndicator\(\)/);
  assert.match(source, /function openAlertOverlay\(\)/);
  assert.match(source, /function closeAlertOverlay\(e\)/);
  assert.match(source, /function dismissAlertNotification\(id\)/);
});

test("Alert triangle's color is hardcoded against theming, and both indicators stay hidden until a notification is active", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const elements = dashboardElementsById(source);

  // Literal hex fill on the icon itself, not currentColor or a --accent var
  // a theme could redefine. Checked against the raw source since the SVG's
  // <path> isn't captured by dashboardElementsById.
  const iconMarkup = source.match(/id="alert-indicator-corner"[\s\S]*?<\/button>/)?.[0];
  assert.ok(iconMarkup, "alert-indicator-corner markup must be found");
  assert.match(iconMarkup, /fill="#FFC107"/);
  assert.doesNotMatch(iconMarkup, /fill="currentColor"/);
  assert.doesNotMatch(iconMarkup, /var\(--accent/);

  const sidebarIconMarkup = source.match(/id="ov3-alert-btn"[\s\S]*?<\/button>/)?.[0];
  assert.ok(sidebarIconMarkup, "ov3-alert-btn markup must be found");
  assert.match(sidebarIconMarkup, /fill="#FFC107"/);
  assert.doesNotMatch(sidebarIconMarkup, /var\(--accent/);

  // Hidden by default, shown only via .visible (toggled by refreshAlertIndicator
  // based on pnCache.size), same convention as .notification-bar/.connection-lost-bar.
  assert.match(cssDeclarations(source, ".alert-indicator-corner"), /display:\s*none/);
  assert.match(cssDeclarations(source, ".alert-indicator-corner.visible"), /display:\s*flex/);
  assert.match(cssDeclarations(source, ".ov3-alert-btn"), /display:\s*none/);
  assert.match(cssDeclarations(source, ".ov3-alert-btn.visible"), /display:\s*flex/);
  assert.match(source, /const has = pnCache\.size > 0/);

  // The corner button is force-hidden on Overview C — that screen uses its
  // own ov3-alert-btn inside .ov3-sidebar instead of the floating corner one.
  assert.match(
    cssDeclarations(source, "body.ov3-active .alert-indicator-corner"),
    /display:\s*none\s*!important/,
  );

  // ov3-alert-btn is declared after .ov3-sb-spacer, so it is pinned to the
  // bottom of the sidebar rather than sitting in the scrolling control list.
  assert.ok(source.indexOf('class="ov3-sb-spacer"') < source.indexOf('id="ov3-alert-btn"'));
});

test("Alert overlay lists notifications newest first, dismisses via persistent_notification.dismiss, and closes on Escape", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  const fnStart = source.indexOf("function _renderAlertOverlayList()");
  const fnEnd = source.indexOf("\nfunction openAlertOverlay()", fnStart);
  assert.ok(fnStart > -1 && fnEnd > fnStart, "_renderAlertOverlayList must be found");
  const renderBody = source.slice(fnStart, fnEnd);
  assert.match(renderBody, /No active alerts/); // empty state, since the indicator can still be tapped
  assert.match(renderBody, /sort\(\(a,\s*b\)\s*=>\s*new Date\(b\.created_at\)\s*-\s*new Date\(a\.created_at\)\)/);
  assert.match(renderBody, /dismissAlertNotification\(/);

  const dismissStart = source.indexOf("function dismissAlertNotification(id)");
  const dismissEnd = source.indexOf("\n/* ─── ECHO TIMER BUBBLE", dismissStart);
  assert.ok(dismissStart > -1 && dismissEnd > dismissStart, "dismissAlertNotification must be found");
  const dismissBody = source.slice(dismissStart, dismissEnd);
  assert.match(dismissBody, /pnCache\.delete\(id\)/); // optimistic, matches dismissNotification()'s pattern
  assert.match(dismissBody, /haService\("persistent_notification",\s*"dismiss",\s*\{\s*notification_id:\s*id\s*\}\)/);

  assert.match(source, /alert-overlay.*classList\.contains\("open"\).*closeAlertOverlay\(\)/);
});

test("A disabled Rachio zone rewrites its Irrigation popup card in place, since .popup-item has no icon/status slot to toggle", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Scoped to Irrigation specifically — an unrelated switch going unavailable
  // (e.g. a device offline) is not "disabled" in the Rachio sense.
  assert.match(source, /const isIrrigationControl = c\.label === "Irrigation"/);
  assert.match(
    source,
    /isIrrigationControl && \(domain === "switch" \|\| domain === "input_boolean" \|\| domain === "fan"\)/,
  );
  assert.match(source, /updateIrrigationZoneCard\(i, j, isOn, state === "unavailable", s\)/);

  const fnStart = source.indexOf("function updateIrrigationZoneCard(");
  const fnEnd = source.indexOf("\n\n", fnStart);
  assert.ok(fnStart > -1 && fnEnd > fnStart, "updateIrrigationZoneCard must be found");
  const fnBody = source.slice(fnStart, fnEnd);
  assert.match(fnBody, /popup-item-icon/);
  assert.match(fnBody, /popup-item-status/);
  assert.match(fnBody, />Disabled</);
  assert.match(fnBody, /WATER_OFF_ICON/);
  // Restores the plain label+toggle markup on recovery, so the toggle works again.
  assert.match(fnBody, /popup-toggle/);
  assert.match(fnBody, /dataset\.zoneDisabled/);

  // A disabled card is inert — no service call against an entity that isn't there.
  const toggleStart = source.indexOf("async function toggleSubEntity(");
  const toggleGuardEnd = source.indexOf("\n", source.indexOf('classList.contains("disabled")', toggleStart));
  const toggleGuard = source.slice(toggleStart, toggleGuardEnd);
  assert.match(toggleGuard, /if \(el\.classList\.contains\("disabled"\)\) return;/);
});

test("Disabled-zone red is hardcoded against theming, distinct from the alert triangle's amber", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // .popup-item.disabled uses the same red as rgba() (border/background wash);
  // the icon and status text use the literal hex. Neither ever a theme var.
  const cardDecl = cssDeclarations(source, ".popup-item.disabled");
  assert.match(cardDecl, /rgba\(255,\s*82,\s*82/, ".popup-item.disabled must use the hardcoded red");
  assert.doesNotMatch(cardDecl, /var\(--accent/, ".popup-item.disabled must not use a theme var");

  for (const selector of [".popup-item-icon svg", ".popup-item-status"]) {
    const decl = cssDeclarations(source, selector);
    assert.match(decl, /#FF5252/, `${selector} must use the hardcoded red`);
    assert.doesNotMatch(decl, /var\(--accent/, `${selector} must not use a theme var`);
  }

  // Struck-through water drop, not the plain SWITCH_ICON used elsewhere.
  assert.match(source, /const WATER_OFF_ICON = /);
});

test("Entry-point badges (Overview A chip, Overview B sidebar list, Overview C sidebar icon) surface a disabled zone without opening the popup", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const elements = dashboardElementsById(source);

  // Shared source of truth so every entry point agrees on what "disabled" means.
  assert.match(source, /function irrigationDisabledZones\(\)/);
  assert.match(source, /CONFIG\.controls \|\| \[\]\)\.find\(c => c\.label === "Irrigation"\)/);
  assert.match(source, /d\.state === "unavailable"/);

  // Overview A's bottom pill row.
  assert.ok(elements.has("chip-alert-0") === false); // not every chip gets one hardcoded in markup...
  assert.match(source, /chip-alert-\$\{i\}/); // ...it's templated per control index
  assert.match(cssDeclarations(source, ".chip-alert-dot"), /#FF5252/);
  assert.match(cssDeclarations(source, ".chip-alert-dot"), /display:\s*none/);
  assert.match(cssDeclarations(source, ".chip-alert-dot.visible"), /display:\s*inline-block/);
  assert.match(
    source,
    /if \(c\.label === "Irrigation"\) \{\s*const alertEl = document\.getElementById\(`chip-alert-\$\{i\}`\)/,
  );

  // Overview B does NOT share Overview A's chip DOM — its left sidebar list
  // (_buildOv2Controls/_refreshOv2) is a separate set of elements that mirrors
  // the chip badges rather than reusing them, the same way it already mirrors
  // the on-count badge (#ov2-count-i from #chip-count-i). Caught live: the red
  // dot showed on Overview A and the popup but not Overview B until this
  // mirror was added.
  assert.match(source, /ov2-alert-\$\{i\}/);
  assert.match(cssDeclarations(source, ".ov2-ctrl-alert-dot"), /#FF5252/);
  assert.match(cssDeclarations(source, ".ov2-ctrl-alert-dot"), /display:\s*none/);
  assert.match(cssDeclarations(source, ".ov2-ctrl-alert-dot.visible"), /display:\s*inline-block/);
  const refreshOv2Start = source.indexOf("function _refreshOv2()");
  const refreshOv2End = source.indexOf("\n}", source.indexOf("Disabled-zone badge", refreshOv2Start));
  assert.ok(refreshOv2Start > -1 && refreshOv2End > refreshOv2Start, "_refreshOv2 must be found");
  assert.match(source.slice(refreshOv2Start, refreshOv2End), /irrigationDisabledZones\(\)\.length > 0/);

  // Overview C's pinned sidebar icon.
  assert.match(source, /ov3-sb-alert-\$\{i\}/);
  assert.match(cssDeclarations(source, ".ov3-sb-alert-dot"), /#FF5252/);
  assert.match(cssDeclarations(source, ".ov3-sb-alert-dot"), /display:\s*none/);
  assert.match(cssDeclarations(source, ".ov3-sb-alert-dot.visible"), /display:\s*block/);
  // Opposite corner from .ov3-sb-dot (the on-state glow) so both can show at once.
  assert.match(cssDeclarations(source, ".ov3-sb-dot"), /right:\s*7px/);
  assert.match(cssDeclarations(source, ".ov3-sb-alert-dot"), /left:\s*7px/);
});

test("Climate entry-point badges reuse the same three dots for a Lennox alert, keyed off alertEntity", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Shared source of truth, mirroring irrigationDisabledZones().
  assert.match(source, /function lennoxAlertActive\(\)/);
  assert.match(source, /CONFIG\.controls \|\| \[\]\)\.find\(c => c\.label === "Climate"\)/);
  assert.match(source, /d\.state !== "none"/);

  // Overview A's chip reuses #chip-alert-i, not a new element.
  assert.match(
    source,
    /if \(c\.label === "Irrigation"\) \{[\s\S]*?\} else if \(c\.label === "Climate"\) \{\s*const alertEl = document\.getElementById\(`chip-alert-\$\{i\}`\)/,
  );

  // Overview B's mirror reuses #ov2-alert-i.
  const refreshOv2Start = source.indexOf("function _refreshOv2()");
  const refreshOv2End = source.indexOf("\n}", source.indexOf("Disabled-zone badge", refreshOv2Start));
  assert.match(
    source.slice(refreshOv2Start, refreshOv2End),
    /\} else if \(c\.label === "Climate"\) \{\s*const alertEl = document\.getElementById\(`ov2-alert-\$\{i\}`\)[\s\S]*?lennoxAlertActive\(\)\.length > 0/,
  );

  // Overview C's sidebar dot reuses #ov3-sb-alert-i.
  assert.match(
    source,
    /\} else if \(c\.label === "Climate"\) \{\s*const alertDot = document\.getElementById\(`ov3-sb-alert-\$\{i\}`\)\s*;?\s*if \(alertDot\) alertDot\.classList\.toggle\("visible", lennoxAlertActive\(\)\.length > 0\)/,
  );
});

test("Overview C Garden card's irrigation row is a non-scrolling 2x3 grid, and marks disabled zones inert", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Regression check: a single scrolling row was rejected outright (six
  // buttons' natural width summed to ~855px against ~561px available, more
  // than min-width tuning could close). The fix is a 2-column x 3-row grid
  // that fits all six without scrolling in either direction.
  const rowDecl = cssDeclarations(source, ".ov3-garden-irrigation-row");
  assert.match(rowDecl, /display:\s*grid/);
  assert.match(rowDecl, /grid-template-columns:\s*1fr 1fr/);
  assert.doesNotMatch(rowDecl, /overflow-x:\s*auto/, "no horizontal scroll expected once six zones fit on-grid");
  assert.doesNotMatch(rowDecl, /justify-content:\s*center/);

  const disabledDecl = cssDeclarations(source, ".ov3-garden-irr-btn.disabled .ov3-garden-irr-label");
  assert.match(disabledDecl, /#FF5252/);

  assert.match(source, /function _ov3ToggleGardenIrr\(entity, btn\)/);
  assert.match(source, /if \(btn\.classList\.contains\("disabled"\)\) return;/);
  assert.match(source, /onclick="_ov3ToggleGardenIrr\(/);

  const refreshStart = source.indexOf("// Sync irrigation toggle on/off state only");
  const refreshEnd = source.indexOf("\n}", refreshStart);
  const refreshBody = source.slice(refreshStart, refreshEnd);
  assert.match(refreshBody, /d\.state === "unavailable"/);
  assert.match(refreshBody, /classList\.toggle\("disabled", isDisabled\)/);
});

test("Garden card's irrigation grid has a static 'Irrigation' heading, not tied to any entity", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Static content, not built by any _buildOv3*/_refreshOv3* function — must
  // appear verbatim in the markup, ahead of the irrigation row it labels.
  const cardStart = source.indexOf('id="ov3-garden-card"');
  const headingIdx = source.indexOf('class="ov3-garden-irr-heading"', cardStart);
  const rowIdx = source.indexOf('id="ov3-garden-irrigation-row"', cardStart);
  assert.ok(headingIdx > -1 && headingIdx < rowIdx, "heading must exist and precede the irrigation row");
  assert.match(source.slice(headingIdx, rowIdx), />Irrigation</);

  const headingDecl = cssDeclarations(source, ".ov3-garden-irr-heading");
  assert.match(headingDecl, /text-transform:\s*uppercase/);
  assert.match(headingDecl, /text-align:\s*center/);
});
