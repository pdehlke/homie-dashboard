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

// Minimal CustomEvent stand-in: a fresh vm context has none of Node's WHATWG globals,
// only the JS language's own built-ins, so openThermostatNative's `new CustomEvent(...)`
// needs this passed in explicitly like every other global the sandbox stubs.
class FakeCustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init && init.detail;
    this.bubbles = Boolean(init && init.bubbles);
    this.composed = Boolean(init && init.composed);
  }
}

// openThermostatNative is async (it awaits an input_boolean.turn_on before dispatching, see
// below), but its callers (openThermostat, thermSelectRoom, the floors-card opener) fire it
// without awaiting, same as any other click handler on this dashboard. A test that calls one
// of those synchronously and asserts right after would run before that pending promise's
// continuation (the dispatch itself) has had a turn -- setImmediate defers past the whole
// microtask queue, not just one hop of it, so it's used here rather than a bare
// `await Promise.resolve()` whose hop count would be an implementation detail to keep in sync.
const flush = () => new Promise((resolve) => setImmediate(resolve));

// withParentFrame: false simulates Homie having no reachable parent HA frame at all (e.g. a
// future change to iframe sandboxing, or the page loaded directly with no parent) -- used by
// the "can't reach the parent frame" test below, sharing the real sliced source rather than
// a hand-copied duplicate that could drift from it.
function loadThermostatOverlay({ withParentFrame = true } = {}) {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const thermostatSource = source.slice(
    source.indexOf("let _thermEntities"),
    source.indexOf("/** _buildThermTabs"),
  );
  const openerStart = source.indexOf("function _openFloorsThermostat");
  const openerSource = source.slice(openerStart, source.indexOf("}", openerStart) + 1);
  // thermSelectRoom lives after the _thermEntities..._buildThermTabs slice above (it calls
  // closeThermostat/openThermostatNative, defined inside that slice), so it's grabbed the
  // same way as _openFloorsThermostat rather than widening the main slice to also swallow
  // _buildThermTabs/_refreshThermTabStates, which this harness stubs out instead.
  const selectRoomStart = source.indexOf("function thermSelectRoom");
  const selectRoomSource = source.slice(selectRoomStart, source.indexOf("}", selectRoomStart) + 1);
  const overlayClasses = new Set();
  const dispatchedEvents = [];
  const calls = [];
  const order = [];
  // dialog-closed listeners registered on the mock parent document, keyed by function
  // identity so removeEventListener(handler) actually removes the matching one, same as
  // a real EventTarget.
  const dialogClosedListeners = new Set();
  // Stands in for the real parent HA frame's <home-assistant> element, which
  // openThermostatNative reaches via window.parent.document.querySelector(...).
  const mockHomeAssistantEl = { dispatchEvent: (evt) => { order.push("dispatch"); dispatchedEvents.push(evt); } };
  const mockParentDocument = {
    querySelector: (sel) => sel === "home-assistant" ? mockHomeAssistantEl : null,
    addEventListener: (type, handler) => { if (type === "dialog-closed") dialogClosedListeners.add(handler); },
    removeEventListener: (type, handler) => { if (type === "dialog-closed") dialogClosedListeners.delete(handler); },
  };
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
    haService: async (domain, service, data) => {
      calls.push({ domain, service, data });
      if (domain === "input_boolean") order.push(service); // "turn_on" / "turn_off"
    },
    window: withParentFrame
      ? { parent: { document: mockParentDocument } }
      : {}, // no .parent at all -- window.parent === window is the top-level-page case
    CustomEvent: FakeCustomEvent,
  };
  vm.createContext(context);
  vm.runInContext(
    `${thermostatSource}\n` +
      `let _ov3FloorsList = []; let _ov3FloorsActiveIndex = 0;\n` +
      `${openerSource}\n` +
      `${selectRoomSource}\n` +
      `globalThis.__thermostat = { openThermostat, closeThermostat, entities: () => _thermEntities };\n` +
      `globalThis.__floors = { open: _openFloorsThermostat, setState: (list, idx) => { _ov3FloorsList = list; _ov3FloorsActiveIndex = idx; } };\n` +
      `globalThis.__selectRoom = thermSelectRoom;\n` +
      `globalThis.__openNative = openThermostatNative;\n` +
      `globalThis.__nativeDialogHelper = NATIVE_DIALOG_HELPER;`,
    context,
  );
  return {
    context,
    overlayClasses,
    dispatchedEvents,
    calls,
    order,
    nativeDialogHelper: context.__nativeDialogHelper,
    // Simulates HA's own ha-more-info-dialog (or any other dialog) firing its bubbled,
    // composed `dialog-closed` event on the parent document when it closes.
    fireDialogClosed: (dialog) => {
      for (const handler of Array.from(dialogClosedListeners)) handler({ detail: { dialog } });
    },
    thermostat: context.__thermostat,
    floors: context.__floors,
    selectRoom: context.__selectRoom,
    openThermostatNative: context.__openNative,
  };
}

// loadSceneToggle: sceneAffectedEntities/sceneIsOn/togglePopupScene against a fake
// stateCache and a fake bubble element, the same slice-real-source approach as
// loadThermostatOverlay above rather than a hand-copied duplicate that could drift.
function loadSceneToggle() {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const entityIsOnStart = source.indexOf("function entityIsOn(state, entity)");
  const entityIsOnSource = source.slice(entityIsOnStart, source.indexOf("}", entityIsOnStart) + 1);
  const helpersStart = source.indexOf("function sceneAffectedEntities(entities)");
  const helpersEnd = source.indexOf("function irrigationDisabledZones()");
  const helpersSource = source.slice(helpersStart, helpersEnd);
  const toggleStart = source.indexOf("async function togglePopupScene(entities, bubbleId)");
  const toggleEnd = source.indexOf("\n/**\n * closePopup", toggleStart);
  const toggleSource = source.slice(toggleStart, toggleEnd);
  assert.ok(entityIsOnStart > -1 && helpersStart > -1 && helpersEnd > helpersStart && toggleStart > -1 && toggleEnd > toggleStart,
    "entityIsOn/sceneAffectedEntities/sceneIsOn/togglePopupScene must all be found");

  const stateCache = new Map();
  const calls = [];
  const classSets = new Map(); // bubbleId -> Set<string>
  const bubble = (id) => {
    if (!classSets.has(id)) classSets.set(id, new Set());
    const classes = classSets.get(id);
    return {
      offsetWidth: 0,
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, force) => { (force ?? !classes.has(c)) ? classes.add(c) : classes.delete(c); },
        contains: (c) => classes.has(c),
      },
    };
  };
  const context = {
    haGetCached: (id) => stateCache.get(id) ?? null,
    haService: async (domain, service, data) => { calls.push({ domain, service, data }); },
    haptic: () => {},
    document: { getElementById: bubble },
    setTimeout: () => {}, // fired-class removal not exercised by these tests
  };
  vm.createContext(context);
  vm.runInContext(
    `${entityIsOnSource}\n${helpersSource}\n${toggleSource}\n` +
      `globalThis.__toggle = togglePopupScene;\n` +
      `globalThis.__sceneIsOn = sceneIsOn;\n` +
      `globalThis.__sceneAffected = sceneAffectedEntities;`,
    context,
  );
  return {
    toggle: context.__toggle,
    sceneIsOn: context.__sceneIsOn,
    sceneAffectedEntities: context.__sceneAffected,
    setState: (id, state, attributes = {}) => stateCache.set(id, { state, attributes }),
    calls,
    classesOf: (id) => classSets.get(id) || new Set(),
  };
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
      ["daily-production", "sensor.sense_287516_daily_production"],
      ["daily-from-grid", "sensor.sense_287516_daily_from_grid"],
      ["daily-to-grid", "sensor.sense_287516_daily_to_grid"],
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

test("mergeHourlyStatistics aligns per-hour series by bucket start, nulling absent points", () => {
  const custom = loadCustomizations();
  assert.deepEqual(
    custom.mergeHourlyStatistics({
      solar: [{ start: 1000, change: 2 }, { start: 2000, change: 0 }],
      export: [{ start: 1000, change: 0.5 }, { start: 2000, change: 0 }],
      import: [{ start: 1000, change: 1 }, { start: 2000, change: 3 }, { start: 3000, change: 5 }],
      fossilPct: [{ start: 1000, mean: 40 }, { start: 2000, mean: 70 }],
      co2: [{ start: 1000, mean: 400 }],
    }),
    [
      { start: 1000, solarChange: 2, exportChange: 0.5, importChange: 1, fossilPctMean: 40, co2Mean: 400 },
      { start: 2000, solarChange: 0, exportChange: 0, importChange: 3, fossilPctMean: 70, co2Mean: null },
      // import reported an hour none of the other series has yet; still shows up, nulled elsewhere.
      { start: 3000, solarChange: null, exportChange: null, importChange: 5, fossilPctMean: null, co2Mean: null },
    ],
  );
});

test("today's green % sums self-consumed solar plus grid-import green share across the elapsed hours", () => {
  const custom = loadCustomizations();
  const hours = [
    // 2 kWh solar, 0.5 kWh exported: 1.5 kWh self-consumed + 1 kWh import at 60% green = 2.1
    { solarChange: 2, exportChange: 0.5, importChange: 1, fossilPctMean: 40 },
    // No solar: 3 kWh import at 30% green = 0.9
    { solarChange: 0, exportChange: 0, importChange: 3, fossilPctMean: 70 },
  ];
  // (2.1 + 0.9) / 5 kWh today = 60%
  assert.equal(custom.todayGreenPercentage(hours, 5), 60);

  // An hour missing any required input is skipped, not zeroed — result is unchanged.
  const withGap = hours.concat([{ solarChange: 1, exportChange: 0, importChange: 1, fossilPctMean: null }]);
  assert.equal(custom.todayGreenPercentage(withGap, 5), 60);

  // Clamped to 100 even if independently-metered sensors would blend past it.
  assert.equal(custom.todayGreenPercentage([{ solarChange: 10, exportChange: 0, importChange: 10, fossilPctMean: 0 }], 5), 100);

  // No hour today has a complete set of inputs: nothing to report.
  assert.equal(custom.todayGreenPercentage([{ solarChange: null, exportChange: 0, importChange: 1, fossilPctMean: 50 }], 5), null);

  // No live consumption reading yet (e.g. just after midnight): can't divide.
  assert.equal(custom.todayGreenPercentage(hours, null), null);
  assert.equal(custom.todayGreenPercentage(hours, 0), null);
});

test("today's CO2 intensity weights grid import by that hour's CO2 mean, solar hours contribute zero", () => {
  const custom = loadCustomizations();
  const hours = [
    { importChange: 1, co2Mean: 400 },
    { importChange: 3, co2Mean: 500 },
  ];
  // (400 + 1500) grams / 5 kWh today = 380 gCO2/kWh
  assert.equal(custom.todayCo2Intensity(hours, 5), 380);

  // An hour missing CO2 data is skipped, not zeroed.
  const withGap = hours.concat([{ importChange: 2, co2Mean: null }]);
  assert.equal(custom.todayCo2Intensity(withGap, 5), 380);

  assert.equal(custom.todayCo2Intensity([{ importChange: null, co2Mean: 400 }], 5), null);
  assert.equal(custom.todayCo2Intensity(hours, null), null);
  assert.equal(custom.todayCo2Intensity(hours, 0), null);
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
  // The old, permanently-unbound inverter-temperature placeholders are gone.
  assert.doesNotMatch(source, /id="sfs-stat-left-inverter"|id="sfs-stat-right-inverter"|>Left Inverter<|>Right Inverter</);
  assert.match(source, />% Green Today</);
  assert.match(source, />CO2 Intensity Today</);
  assert.match(source, /id="sfs-stat-green-today" class="sfs-stat-value-green">—<\/span><span class="sfs-stat-unit"> %<\/span>/);
  assert.match(source, /id="sfs-stat-co2-today">—<\/span><span class="sfs-stat-unit"> gCO2\/kWh<\/span>/);
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
  assert.equal(version, "20260812.7");
  assert.match(source, /config\.js\?v=\$\{HOMIE_ASSET_VERSION\}/);
  assert.match(source, /homie-custom\.js\?v=\$\{HOMIE_ASSET_VERSION\}/);
  assert.doesNotMatch(source, /<script src="(?:config|homie-custom)\.js"><\/script>/);
});

test("Bladerunner (Goudy Bookletter 1911) is registered as the default font", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Catalogue entry: single weight (400 only — Goudy Bookletter 1911 has no
  // light/thin variant), serif generic fallback.
  assert.match(
    source,
    /\{ name: 'Goudy Bookletter 1911', weights: \[400\],\s*generic: 'serif' \}/,
  );

  // Registered as the default in both places that carry a literal fallback.
  assert.match(source, /dashFont:\s*'Goudy Bookletter 1911',/);
  assert.match(source, /dashFontWeight:\s*400,/);
  assert.match(source, /_settings\.dashFont\s*\|\| 'Goudy Bookletter 1911',/);
  assert.match(source, /_settings\.dashFontWeight \|\| 400/);

  // Settings panel radio: labeled "Bladerunner", wired to the real family name.
  assert.match(
    source,
    /onclick="applyFontSetting\('font','Goudy Bookletter 1911'\)">\s*<input type="radio" name="dashFont" value="Goudy Bookletter 1911"[^>]*>\s*<span class="startup-mode-label">Bladerunner<\/span>/,
  );
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

test("Overview C sidebar's Scenes icon uses the existing icons.scene star, not the domain fallback", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const fnStart = source.indexOf("function _sbIcon(ctrl)");
  const fnEnd = source.indexOf("\n  const hasPopup", fnStart);
  assert.ok(fnStart > -1 && fnEnd > fnStart, "_sbIcon must be found");
  const fnBody = source.slice(fnStart, fnEnd);

  // A scene chip has no top-level entity and its subGroups[].scenes[] isn't
  // the subEntities shape the generic domain lookup expects, so without this
  // override it would silently fall through to the "switch" icon.
  assert.match(fnBody, /if \(ctrl\.isSceneChip\) return icons\.scene;/);
  const overrideIndex = fnBody.indexOf("if (ctrl.isSceneChip)");
  const iconsIndex = fnBody.indexOf("const icons = {");
  assert.ok(iconsIndex > -1 && overrideIndex > iconsIndex, "override must come after icons is defined, not before (TDZ)");
});

test("sceneAffectedEntities reads live from the scene entity's own attributes, not config", () => {
  // Array.from: sceneAffectedEntities runs inside the vm sandbox, so it returns
  // a different-realm Array; deepEqual against a plain literal needs it
  // normalized first, same as loadConfig()'s results are elsewhere in this file.
  const scene = loadSceneToggle();
  assert.deepEqual(Array.from(scene.sceneAffectedEntities(["scene.bedroom_evening"])), []); // not in cache yet
  scene.setState("scene.bedroom_evening", "2026-08-12T00:00:00+00:00", {
    entity_id: ["light.bedroom_perimeter", "light.bedroom_diagonals", "light.hallway"],
  });
  assert.deepEqual(Array.from(scene.sceneAffectedEntities(["scene.bedroom_evening"])), [
    "light.bedroom_perimeter", "light.bedroom_diagonals", "light.hallway",
  ]);
});

test("sceneAffectedEntities unions and de-duplicates across multiple scenes (a grouped bubble)", () => {
  // Primary Suite Evening's real shape: two scenes that both touch light.hallway.
  const scene = loadSceneToggle();
  scene.setState("scene.bedroom_evening", "x", {
    entity_id: ["light.bedroom_perimeter", "light.hallway"],
  });
  scene.setState("scene.bathroom_evening", "x", {
    entity_id: ["light.bath_perimeter", "light.hallway"],
  });
  assert.deepEqual(
    Array.from(scene.sceneAffectedEntities(["scene.bedroom_evening", "scene.bathroom_evening"])),
    ["light.bedroom_perimeter", "light.hallway", "light.bath_perimeter"],
  );
});

test("sceneIsOn is any-on across a scene's affected entities, not all-on", () => {
  const scene = loadSceneToggle();
  scene.setState("scene.bedroom_evening", "x", {
    entity_id: ["light.bedroom_perimeter", "light.bedroom_diagonals"],
  });
  scene.setState("light.bedroom_perimeter", "off");
  scene.setState("light.bedroom_diagonals", "off");
  assert.equal(scene.sceneIsOn(["scene.bedroom_evening"]), false);

  scene.setState("light.bedroom_perimeter", "on"); // only one of two
  assert.equal(scene.sceneIsOn(["scene.bedroom_evening"]), true);
});

test("sceneIsOn over a grouped bubble is on if either underlying scene has anything on", () => {
  const scene = loadSceneToggle();
  scene.setState("scene.bedroom_evening", "x", { entity_id: ["light.bedroom_perimeter"] });
  scene.setState("scene.bathroom_evening", "x", { entity_id: ["light.bath_perimeter"] });
  scene.setState("light.bedroom_perimeter", "off");
  scene.setState("light.bath_perimeter", "off");
  assert.equal(scene.sceneIsOn(["scene.bedroom_evening", "scene.bathroom_evening"]), false);

  scene.setState("light.bath_perimeter", "on"); // only the bathroom side is on
  assert.equal(scene.sceneIsOn(["scene.bedroom_evening", "scene.bathroom_evening"]), true);
});

test("togglePopupScene activates the scene when off, and turns off every affected entity when on", async () => {
  // Off -> on: activates the real scene, HA scenes have no turn_off action.
  const off = loadSceneToggle();
  off.setState("scene.bedroom_evening", "x", { entity_id: ["light.bedroom_perimeter", "light.hallway"] });
  off.setState("light.bedroom_perimeter", "off");
  off.setState("light.hallway", "off");
  await off.toggle(["scene.bedroom_evening"], "psb-Bedroom-0");
  assert.equal(off.calls.length, 1);
  assert.equal(off.calls[0].domain, "scene");
  assert.equal(off.calls[0].service, "turn_on");
  assert.deepEqual(Array.from(off.calls[0].data.entity_id), ["scene.bedroom_evening"]);
  assert.ok(off.classesOf("psb-Bedroom-0").has("on"), "bubble should show on optimistically after activating");

  // On -> off: turns off every entity the scene controls, not the scene itself
  // (there's nothing to turn a scene off) or just one of its entities.
  const on = loadSceneToggle();
  on.setState("scene.bedroom_evening", "x", { entity_id: ["light.bedroom_perimeter", "light.hallway"] });
  on.setState("light.bedroom_perimeter", "on");
  on.setState("light.hallway", "off"); // only one on is enough to read "on"
  await on.toggle(["scene.bedroom_evening"], "psb-Bedroom-0");
  // data.entity_id is built inside the vm sandbox (a different-realm Array),
  // so it's checked separately via Array.from rather than one deepEqual over
  // the whole call, same reason as the sceneAffectedEntities test above.
  assert.equal(on.calls.length, 1);
  assert.equal(on.calls[0].domain, "homeassistant");
  assert.equal(on.calls[0].service, "turn_off");
  assert.deepEqual(Array.from(on.calls[0].data.entity_id), ["light.bedroom_perimeter", "light.hallway"]);
  assert.ok(!on.classesOf("psb-Bedroom-0").has("on"), "bubble should show off optimistically after clearing");
});

test("togglePopupScene on a grouped bubble activates every underlying scene in one call, and clears their de-duplicated union", async () => {
  // Off -> on: one scene.turn_on call targeting both scenes at once, not two
  // separate calls — HA applies a multi-entity target to each entity itself.
  const off = loadSceneToggle();
  off.setState("scene.bedroom_evening", "x", { entity_id: ["light.bedroom_perimeter", "light.hallway"] });
  off.setState("scene.bathroom_evening", "x", { entity_id: ["light.bath_perimeter", "light.hallway"] });
  off.setState("light.bedroom_perimeter", "off");
  off.setState("light.bath_perimeter", "off");
  off.setState("light.hallway", "off");
  await off.toggle(["scene.bedroom_evening", "scene.bathroom_evening"], "psb-PrimarySuite-0");
  assert.equal(off.calls.length, 1);
  assert.equal(off.calls[0].domain, "scene");
  assert.equal(off.calls[0].service, "turn_on");
  assert.deepEqual(Array.from(off.calls[0].data.entity_id), ["scene.bedroom_evening", "scene.bathroom_evening"]);

  // On -> off: one homeassistant.turn_off call over the de-duplicated union —
  // light.hallway (shared by both scenes) appears once, not twice.
  const on = loadSceneToggle();
  on.setState("scene.bedroom_evening", "x", { entity_id: ["light.bedroom_perimeter", "light.hallway"] });
  on.setState("scene.bathroom_evening", "x", { entity_id: ["light.bath_perimeter", "light.hallway"] });
  on.setState("light.bedroom_perimeter", "on");
  on.setState("light.bath_perimeter", "off");
  on.setState("light.hallway", "on");
  await on.toggle(["scene.bedroom_evening", "scene.bathroom_evening"], "psb-PrimarySuite-0");
  assert.equal(on.calls.length, 1);
  assert.equal(on.calls[0].domain, "homeassistant");
  assert.equal(on.calls[0].service, "turn_off");
  assert.deepEqual(
    Array.from(on.calls[0].data.entity_id),
    ["light.bedroom_perimeter", "light.hallway", "light.bath_perimeter"],
  );
});

test("scene on-state (sceneIsOn) is shared by the popup bubble, refreshControls, the Overview C sidebar, and the live popup refresh", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Popup bubble render.
  const openStart = source.indexOf("async function openPopup(i)");
  const openEnd = source.indexOf("\n  // ── Determine card type from entity domain", openStart);
  assert.ok(openStart > -1 && openEnd > openStart, "openPopup must be found");
  assert.match(source.slice(openStart, openEnd), /const on = sceneIsOn\(sc\.entities\)/);

  // Bottom chip glow/count.
  const rcStart = source.indexOf("function refreshControls()");
  const rcEnd = source.indexOf("\nfunction refreshNotifications()", rcStart);
  assert.ok(rcStart > -1 && rcEnd > rcStart, "refreshControls must be found");
  assert.match(source.slice(rcStart, rcEnd), /activeCount = allScenes\.filter\(sc => sceneIsOn\(sc\.entities\)\)/);

  // Overview C sidebar glow.
  const sbStart = source.indexOf("function _refreshOv3SidebarControls()");
  const sbEnd = source.indexOf("\n/* Build/rebuild the entire purifier card", sbStart);
  assert.ok(sbStart > -1 && sbEnd > sbStart, "_refreshOv3SidebarControls must be found");
  assert.match(source.slice(sbStart, sbEnd), /flatMap\(g => g\.scenes \|\| \[\]\)\.some\(sc => sceneIsOn\(sc\.entities\)\)/);

  // Live popup refresh (only surface that doesn't reuse refreshControls' loop).
  const ropStart = source.indexOf("function refreshOpenScenePopup()");
  const ropEnd = source.indexOf("\n/**\n * isPopupOpen", ropStart);
  assert.ok(ropStart > -1 && ropEnd > ropStart, "refreshOpenScenePopup must be found");
  assert.match(source.slice(ropStart, ropEnd), /sceneIsOn\(sc\.entities\)/);

  // Called from the popup-open branch of refreshAllUI, not just defined.
  assert.match(source, /refreshOpenAcCards\(\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*refreshOpenScenePopup\(\);/);
});

// loadMusicToggle: musicStationIsOn/musicChipIsOn/togglePopupMusic against a fake
// stateCache and a fake bubble element, the same slice-real-source approach as
// loadSceneToggle above. Reuses the identical source slice — Scenes' and Music's
// helper/toggle functions sit adjacent in the real file — and just exposes the
// Music-specific globals instead.
function loadMusicToggle() {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const entityIsOnStart = source.indexOf("function entityIsOn(state, entity)");
  const entityIsOnSource = source.slice(entityIsOnStart, source.indexOf("}", entityIsOnStart) + 1);
  const helpersStart = source.indexOf("function sceneAffectedEntities(entities)");
  const helpersEnd = source.indexOf("function irrigationDisabledZones()");
  const helpersSource = source.slice(helpersStart, helpersEnd);
  const toggleStart = source.indexOf("async function togglePopupScene(entities, bubbleId)");
  const toggleEnd = source.indexOf("\n/**\n * closePopup", toggleStart);
  const toggleSource = source.slice(toggleStart, toggleEnd);
  assert.ok(entityIsOnStart > -1 && helpersStart > -1 && helpersEnd > helpersStart && toggleStart > -1 && toggleEnd > toggleStart,
    "entityIsOn/musicStationIsOn/musicChipIsOn/togglePopupMusic must all be found");

  const stateCache = new Map();
  const calls = [];
  const classSets = new Map(); // bubbleId -> Set<string>
  const bubble = (id) => {
    if (!classSets.has(id)) classSets.set(id, new Set());
    const classes = classSets.get(id);
    return {
      offsetWidth: 0,
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, force) => { (force ?? !classes.has(c)) ? classes.add(c) : classes.delete(c); },
        contains: (c) => classes.has(c),
      },
    };
  };
  const context = {
    haGetCached: (id) => stateCache.get(id) ?? null,
    haService: async (domain, service, data) => { calls.push({ domain, service, data }); },
    haptic: () => {},
    document: { getElementById: bubble },
    setTimeout: () => {}, // fired-class removal not exercised by these tests
  };
  vm.createContext(context);
  vm.runInContext(
    `${entityIsOnSource}\n${helpersSource}\n${toggleSource}\n` +
      `globalThis.__toggle = togglePopupMusic;\n` +
      `globalThis.__stationIsOn = musicStationIsOn;\n` +
      `globalThis.__chipIsOn = musicChipIsOn;`,
    context,
  );
  return {
    toggle: context.__toggle,
    stationIsOn: context.__stationIsOn,
    chipIsOn: context.__chipIsOn,
    setState: (id, state, attributes = {}) => stateCache.set(id, { state, attributes }),
    calls,
    classesOf: (id) => classSets.get(id) || new Set(),
  };
}

test("Overview C sidebar's Music icon uses the explicit icons.music override, not the media_player domain fallback", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const fnStart = source.indexOf("function _sbIcon(ctrl)");
  const fnEnd = source.indexOf("\n  const hasPopup", fnStart);
  assert.ok(fnStart > -1 && fnEnd > fnStart, "_sbIcon must be found");
  const fnBody = source.slice(fnStart, fnEnd);

  // A Music chip does have a top-level entity (media_player.crestron), but
  // "media_player" isn't a key in the generic icons map, so without this
  // override it would silently fall through to the generic default icon.
  assert.match(fnBody, /if \(ctrl\.isMusicChip\) return icons\.music;/);
  const overrideIndex = fnBody.indexOf("if (ctrl.isMusicChip)");
  const iconsIndex = fnBody.indexOf("const icons = {");
  assert.ok(iconsIndex > -1 && overrideIndex > iconsIndex, "override must come after icons is defined, not before (TDZ)");
});

test("musicStationIsOn requires both an exact media_content_id match and a playing state", () => {
  const music = loadMusicToggle();
  music.setState("media_player.crestron", "paused", { media_content_id: "library://radio/38" });
  assert.equal(music.stationIsOn("media_player.crestron", "library://radio/38"), false); // paused, not playing

  music.setState("media_player.crestron", "playing", { media_content_id: "library://radio/1" });
  assert.equal(music.stationIsOn("media_player.crestron", "library://radio/38"), false); // wrong station

  music.setState("media_player.crestron", "playing", { media_content_id: "library://radio/38" });
  assert.equal(music.stationIsOn("media_player.crestron", "library://radio/38"), true);
});

test("musicChipIsOn is on only when the target player is mid-playback of one of that chip's own configured stations", () => {
  const music = loadMusicToggle();
  const chip = {
    entity: "media_player.crestron",
    subGroups: [{ stations: [
      { uri: "library://radio/1", label: "Hiromi + more" },
      { uri: "library://radio/2", label: "80s 90s Radio" },
    ] }],
  };
  music.setState("media_player.crestron", "idle", {});
  assert.equal(music.chipIsOn(chip), false);

  // Playing something real, but not one of this chip's own presets — should
  // not glow, the same way an unrelated AirPlay session shouldn't light it up.
  music.setState("media_player.crestron", "playing", { media_content_id: "library://radio/99" });
  assert.equal(music.chipIsOn(chip), false);

  music.setState("media_player.crestron", "playing", { media_content_id: "library://radio/2" });
  assert.equal(music.chipIsOn(chip), true);
});

test("togglePopupMusic plays and resets volume to 40% when the player was idle", async () => {
  const music = loadMusicToggle();
  music.setState("media_player.crestron", "idle", {});
  await music.toggle("media_player.crestron", "library://radio/38", "pmb-0-4");
  assert.equal(music.calls.length, 2);
  assert.equal(music.calls[0].domain, "media_player");
  assert.equal(music.calls[0].service, "volume_set");
  assert.equal(music.calls[0].data.entity_id, "media_player.crestron");
  assert.equal(music.calls[0].data.volume_level, 0.4);
  assert.equal(music.calls[1].domain, "music_assistant");
  assert.equal(music.calls[1].service, "play_media");
  assert.equal(music.calls[1].data.entity_id, "media_player.crestron");
  assert.equal(music.calls[1].data.media_id, "library://radio/38");
  assert.equal(music.calls[1].data.media_type, "radio");
  assert.ok(music.classesOf("pmb-0-4").has("on"), "bubble should show on optimistically after playing");
});

test("togglePopupMusic hot-switches straight to a new station without touching volume when already playing", async () => {
  const music = loadMusicToggle();
  music.setState("media_player.crestron", "playing", { media_content_id: "library://radio/1" });
  await music.toggle("media_player.crestron", "library://radio/38", "pmb-0-4");
  assert.equal(music.calls.length, 1); // no volume_set call this time
  assert.equal(music.calls[0].domain, "music_assistant");
  assert.equal(music.calls[0].service, "play_media");
  assert.equal(music.calls[0].data.media_id, "library://radio/38");
});

test("togglePopupMusic stops playback, rather than pausing it, when tapping the currently-active station's own bubble", () => {
  return (async () => {
    const music = loadMusicToggle();
    music.setState("media_player.crestron", "playing", { media_content_id: "library://radio/38" });
    await music.toggle("media_player.crestron", "library://radio/38", "pmb-0-4");
    assert.equal(music.calls.length, 1);
    assert.equal(music.calls[0].domain, "media_player");
    assert.equal(music.calls[0].service, "media_stop");
    assert.equal(music.calls[0].data.entity_id, "media_player.crestron");
    assert.ok(!music.classesOf("pmb-0-4").has("on"), "bubble should show off optimistically after stopping");
  })();
});

test("music on-state (musicStationIsOn/musicChipIsOn) is shared by the popup bubble, refreshControls, the Overview C sidebar, and the live popup refresh", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Popup bubble render.
  const openStart = source.indexOf("async function openPopup(i)");
  const openEnd = source.indexOf("\n  // ── Determine card type from entity domain", openStart);
  assert.ok(openStart > -1 && openEnd > openStart, "openPopup must be found");
  assert.match(source.slice(openStart, openEnd), /const on = musicStationIsOn\(c\.entity, st\.uri\)/);

  // Bottom chip glow (no count badge, see the config comment).
  const rcStart = source.indexOf("function refreshControls()");
  const rcEnd = source.indexOf("\nfunction refreshNotifications()", rcStart);
  assert.ok(rcStart > -1 && rcEnd > rcStart, "refreshControls must be found");
  assert.match(source.slice(rcStart, rcEnd), /isOn = musicChipIsOn\(c\)/);

  // Overview C sidebar glow.
  const sbStart = source.indexOf("function _refreshOv3SidebarControls()");
  const sbEnd = source.indexOf("\n/* Build/rebuild the entire purifier card", sbStart);
  assert.ok(sbStart > -1 && sbEnd > sbStart, "_refreshOv3SidebarControls must be found");
  assert.match(source.slice(sbStart, sbEnd), /musicChipIsOn\(c\)/);

  // Live popup refresh (only surface that doesn't reuse refreshControls' loop).
  const ropStart = source.indexOf("function refreshOpenMusicPopup()");
  const ropEnd = source.indexOf("\n/**\n * isPopupOpen", ropStart);
  assert.ok(ropStart > -1 && ropEnd > ropStart, "refreshOpenMusicPopup must be found");
  assert.match(source.slice(ropStart, ropEnd), /musicStationIsOn\(c\.entity, st\.uri\)/);

  // Called from the popup-open branch of refreshAllUI, not just defined.
  const rauStart = source.indexOf("function refreshAllUI()");
  const rauEnd = source.indexOf("\n/**\n * refreshOpenAcCards", rauStart);
  assert.ok(rauStart > -1 && rauEnd > rauStart, "refreshAllUI must be found");
  assert.match(source.slice(rauStart, rauEnd), /refreshOpenScenePopup\(\);[\s\S]*refreshOpenMusicPopup\(\);/);
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

test("climateIsActive() is a shared, module-scope check of hvac_action, not just state !== \"off\"", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const fnStart = source.indexOf("function climateIsActive(entity)");
  assert.ok(fnStart > -1, "climateIsActive must be found at module scope");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);

  // Both real thermostats stay in heat_cool mode almost always, so a plain
  // entityIsOn() (state !== "off") would read "on" nearly permanently.
  // hvac_action reports whether the equipment is actually doing something.
  assert.match(fnBody, /hvac_action/);
  assert.match(fnBody, /["']heating["']/);
  assert.match(fnBody, /["']cooling["']/);

  // Only one definition — Overview C's sidebar glow and Overview A/B's chip
  // count/glow must agree on what "on" means, not keep separate copies.
  assert.equal(source.match(/function climateIsActive\(entity\)/g).length, 1);
});

test("Overview C's Climate sidebar glow, and Overview A/B's chip count and glow, all use climateIsActive()", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // Overview C's sidebar glow.
  const sbStart = source.indexOf("function _refreshOv3SidebarControls()");
  const sbEnd = source.indexOf("\n/* Build/rebuild the entire purifier card", sbStart);
  assert.ok(sbStart > -1 && sbEnd > sbStart, "_refreshOv3SidebarControls must be found");
  assert.match(source.slice(sbStart, sbEnd), /climateIsActive\(entity\)/);

  // Overview A's chip count/glow (Overview B mirrors A's rendered text, not
  // a separate computation, so fixing this one place covers both).
  const rcStart = source.indexOf("function refreshControls()");
  const rcEnd = source.indexOf("\nfunction refreshNotifications()", rcStart);
  assert.ok(rcStart > -1 && rcEnd > rcStart, "refreshControls must be found");
  const rcBody = source.slice(rcStart, rcEnd);
  assert.match(rcBody, /activeCount = allSubs\.filter\(s => climateIsActive\(s\.entity\)\)\.length/);

  // The old mode-based, _acCardState-optimistic path for the count is gone:
  // activity can't be known optimistically, so there's nothing to be
  // instant about. _acCardState itself is untouched elsewhere (the AC
  // card's own enabled/disabled toggle is a different, correct concept).
  assert.doesNotMatch(rcBody, /_acCardState\.(get|has)/);
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
  assert.deepEqual(
    Array.from(config.controls, (entry) => entry.label),
    ["Lights", "Climate", "A/V", "Music", "TV", "Irrigation", "Scenes"],
  );
  assert.equal(config.controls[1].action, "thermostat");
  assert.equal(config.controls[2].action, "media_browser");
  assert.equal(config.controls[4].action, "harmony");
  assert.equal(config.controls[5].confirmStart, true);
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
    Array.from(config.controls[5].subEntities, (entry) => entry.entity),
    [
      "switch.main_irrigation_east_of_garage",
      "switch.main_irrigation_east_triangle",
      "switch.main_irrigation_emmas_yard",
      "switch.main_irrigation_south_of_driveway",
      "switch.main_irrigation_north",
      "switch.back_yard_irrigation",
    ],
  );
  // Music: isMusicChip / subGroups[].stations[], the Scenes chip's shape
  // adapted for radio presets. Every bubble shares the one chip-level
  // `entity` (there's only one physical player), unlike Scenes where each
  // bubble carries its own entities — see
  // docs/homie-dashboard/homie-music-chip.md in the pdehlke/homeassistant
  // repo. Deliberately no showCount (see the config comment).
  assert.equal(config.controls[3].isMusicChip, true);
  assert.equal(config.controls[3].entity, "media_player.crestron");
  assert.equal(config.controls[3].showCount, undefined);
  assert.equal(config.controls[3].subGroups.length, 1);
  assert.deepEqual(
    Array.from(config.controls[3].subGroups[0].stations, (station) => [station.uri, station.label]),
    [
      ["library://radio/1", "Jazz: Hiromi"],
      ["library://radio/2", "80s/90s"],
      ["library://radio/4", "Dinner Party"],
      ["library://radio/5", "The Jam"],
      ["library://radio/38", "1st Wave"],
      ["library://radio/39", "Blues"],
    ],
  );
  for (const station of config.controls[3].subGroups[0].stations) {
    assert.match(station.uri, /^library:\/\/radio\/\d+$/);
  }
  // Scenes: stock isSceneChip mechanism. Each scene's "entities" is one or
  // more real scene.* entities — togglePopupScene fires scene.turn_on /
  // homeassistant.turn_off directly (see
  // docs/homie-dashboard/homie-scenes-chip.md in the pdehlke/homeassistant
  // repo), no wrapping automation needed. Primary Suite groups both Bedroom
  // and Bathroom's scenes into a single bubble, the multi-entity case.
  assert.equal(config.controls[6].isSceneChip, true);
  assert.equal(config.controls[6].showCount, true);
  assert.deepEqual(
    Array.from(config.controls[6].subGroups, (group) => group.label),
    ["Bedroom", "Bathroom", "Primary Suite"],
  );
  assert.deepEqual(
    Array.from(config.controls[6].subGroups, (group) =>
      Array.from(group.scenes, (scene) => [Array.from(scene.entities), scene.label])),
    [
      [[["scene.bedroom_evening"], "Evening"]],
      [[["scene.bathroom_evening"], "Evening"]],
      [[["scene.bedroom_evening", "scene.bathroom_evening"], "Evening"]],
    ],
  );
  for (const group of config.controls[6].subGroups) {
    for (const scene of group.scenes) {
      for (const entity of scene.entities) assert.match(entity, /^scene\./);
    }
  }
});

test("TV overlay has a second action row for volume/mute, styled like the activity row", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const elements = dashboardElementsById(source);

  const volDown = elements.get("tv-action-vol_down");
  const mute = elements.get("tv-action-mute");
  const volUp = elements.get("tv-action-vol_up");
  assert.ok(volDown && mute && volUp, "volume/mute buttons must exist");

  // Same row/button classes as the activity buttons above them — no new
  // visual language, just a second tv-action-row.
  for (const btn of [volDown, mute, volUp]) {
    assert.equal(btn.tagName, "button");
    assert.equal(btn.className, "tv-action-btn");
    assert.equal(btn.parent?.className, "tv-action-row");
  }
  // The volume row is a distinct row element from the activity row, not the same one.
  assert.notEqual(volDown.parent, elements.get("tv-action-watch_tv").parent);

  assert.equal(volDown.onclick, "tvVolumeAction('VolumeDown')");
  assert.equal(mute.onclick, "tvVolumeAction('Mute')");
  assert.equal(volUp.onclick, "tvVolumeAction('VolumeUp')");
});

test("tvVolumeAction relays a raw button press to the Integra receiver via remote.send_command", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  assert.match(source, /const TV_VOLUME_DEVICE = "Integra AV Receiver";/);

  const fnStart = source.indexOf("async function tvVolumeAction(command)");
  const fnEnd = source.indexOf("\n}", fnStart) + 2;
  assert.ok(fnStart > -1, "tvVolumeAction must be found");
  const body = source.slice(fnStart, fnEnd);

  assert.match(body, /haptic\("light"\)/); // repeatable nudge, not a mode switch
  assert.match(
    body,
    /haService\("remote",\s*"send_command",\s*\{\s*entity_id:\s*CONFIG\.harmonyEntity,\s*device:\s*TV_VOLUME_DEVICE,\s*command,\s*\}\)/,
  );
});

test("refreshTVControlUI disables volume/mute at PowerOff and re-enables once an activity is running", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  // Slice from TV_ACTIVITY_LABELS so refreshTVControlUI's own dependencies
  // (the labels map, tvActionIdFor) come along with it, self-contained.
  const start = source.indexOf("const TV_ACTIVITY_LABELS = {");
  const end = source.indexOf("\nasync function openTVControl", start);
  assert.ok(start > -1 && end > start, "refreshTVControlUI and its helpers must be found");
  const body = source.slice(start, end);

  const tracked = { vol_down: { disabled: false }, mute: { disabled: false }, vol_up: { disabled: false } };
  const context = {
    document: {
      getElementById: (id) => {
        if (id === "tv-status-badge") return { classList: { add() {}, remove() {} } };
        const key = id.replace("tv-action-", "");
        return tracked[key] ? tracked[key] : { classList: { add() {}, remove() {} } };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${body}\nglobalThis.__refresh = refreshTVControlUI;`, context);

  context.__refresh("PowerOff");
  assert.deepEqual(Object.values(tracked).map((b) => b.disabled), [true, true, true]);

  context.__refresh("Watch TV");
  assert.deepEqual(Object.values(tracked).map((b) => b.disabled), [false, false, false]);

  context.__refresh(undefined);
  assert.deepEqual(Object.values(tracked).map((b) => b.disabled), [true, true, true]);
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

test("Homie connects to Home Assistant by real DNS name, not the old mDNS hostname or literal IP", () => {
  const source = fs.readFileSync(path.join(workDir, "config.js"), "utf8");
  assert.match(source, /const WS_URL = "ws:\/\/hass\.ehlke\.net:8123\/api\/websocket";/);
  assert.doesNotMatch(source, /const WS_URL = .*homeassistant\.local/);
  assert.doesNotMatch(source, /const WS_URL = .*192\.168\.4\.125/);
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
  // No hvac_action reported (unavailable/unreported), so the nearest-bound fallback applies:
  // 78.4 sits 2.5° from the 75.9 high bound and 9.3° from the 69.1 low bound.
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
      targetTemperature: "76 °F",
      currentTemperatureValue: 78.4,
      targetTemperatureValue: 75.9,
      hasRange: true,
      nativeUnit: "°F",
    },
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

  // Idle or unreported hvac_action: no single bound is "active", so show whichever setpoint
  // current_temperature is actually closer to, not the band midpoint. Real live fixture:
  // climate.casasolar_south_zone_1 idling at 76 in a 62/78 band -- the midpoint (70) matches
  // neither setpoint and reads as wrong next to the Lennox Home dashboard's native thermostat
  // card, which never collapses the band and shows 78 for the same state.
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: { current_temperature: 76, target_temp_high: 78, target_temp_low: 62, hvac_action: "idle" },
    }).targetTemperature,
    "78 °F",
  );
  // Idling nearer the low bound picks the low bound instead.
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: { current_temperature: 64, target_temp_high: 78, target_temp_low: 62, hvac_action: "idle" },
    }).targetTemperature,
    "62 °F",
  );
  // Exactly equidistant, or current_temperature missing entirely: defaults to the high
  // (cooling) bound rather than averaging.
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: { current_temperature: 70, target_temp_high: 78, target_temp_low: 62, hvac_action: "idle" },
    }).targetTemperature,
    "78 °F",
  );
  assert.deepEqual(
    custom.thermostatTemperatureView({
      state: "heat_cool",
      attributes: { target_temp_high: 78, target_temp_low: 62, hvac_action: "fan" },
    }).targetTemperature,
    "78 °F",
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

test("Overview C floors button opens the real dialog directly; Overview A's chip shows a picker for both", async () => {
  const { overlayClasses, dispatchedEvents, thermostat, floors } = loadThermostatOverlay();
  const floorsList = [
    { label: "Main House", entity: "climate.casasolar_south_zone_1" },
    { label: "Office Wing", entity: "climate.casasolar_north_zone_1" },
  ];

  // A floors-card face is already filtered to exactly one entity, so it skips Homie's own
  // picker overlay entirely and dispatches straight to HA's real native dialog.
  floors.setState(floorsList, 0);
  floors.open();
  await flush();
  assert.equal(overlayClasses.has("open"), false);
  assert.deepEqual(
    dispatchedEvents.map((evt) => evt.detail.entityId),
    ["climate.casasolar_south_zone_1"],
  );

  // Overview A/B's unfiltered Climate chip still has two entities to choose between, and the
  // real dialog is single-entity, so the small room picker shows instead -- nothing dispatched
  // until a room is actually picked (see the picker-selection test below).
  thermostat.openThermostat();
  assert.equal(overlayClasses.has("open"), true);
  assert.deepEqual(
    Array.from(thermostat.entities(), (entry) => entry.entity),
    ["climate.casasolar_south_zone_1", "climate.casasolar_north_zone_1"],
  );
  assert.equal(dispatchedEvents.length, 1);
});

test("picking a room from the unfiltered chip's picker closes it and opens that room's real dialog", async () => {
  const { overlayClasses, dispatchedEvents, thermostat, selectRoom } = loadThermostatOverlay();
  thermostat.openThermostat(); // unfiltered -> both entities, picker shows
  assert.equal(overlayClasses.has("open"), true);

  selectRoom(1); // Office Wing
  await flush();
  assert.equal(overlayClasses.has("open"), false);
  assert.deepEqual(
    dispatchedEvents.map((evt) => evt.detail.entityId),
    ["climate.casasolar_north_zone_1"],
  );
});

test("openThermostatNative dispatches the real hass-more-info event HA's own cards use", async () => {
  const { dispatchedEvents, openThermostatNative } = loadThermostatOverlay();

  await openThermostatNative("climate.casasolar_north_zone_1");
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, "hass-more-info");
  // detail is a plain object literal built inside the vm sandbox, so it carries that
  // context's own Object.prototype rather than this file's -- deepEqual against a literal
  // here would fail on cross-realm prototype identity despite matching structure, so compare
  // the field directly instead.
  assert.equal(dispatchedEvents[0].detail.entityId, "climate.casasolar_north_zone_1");
  assert.equal(dispatchedEvents[0].bubbles, true);
  assert.equal(dispatchedEvents[0].composed, true);

  // No entity to open -- nothing dispatched, no throw.
  await openThermostatNative(null);
  assert.equal(dispatchedEvents.length, 1);
});

test("openThermostatNative fails silently when it can't reach the parent frame", async () => {
  // window.parent absent -- e.g. a future HA change to iframe sandboxing, or this page
  // loaded directly with no parent frame at all. Must not throw inside what's ultimately a
  // click handler, and must not dispatch anything.
  const { dispatchedEvents, calls, openThermostatNative } = loadThermostatOverlay({ withParentFrame: false });

  await assert.doesNotReject(() => openThermostatNative("climate.casasolar_north_zone_1"));
  assert.equal(dispatchedEvents.length, 0);
  // No dialog is ever going to open, so the chrome-hiding helper must not get turned on either
  // -- nothing would ever turn it back off.
  assert.equal(calls.length, 0);
});

test("openThermostatNative turns on the chrome-hiding helper before dispatching, and off when HA's own dialog reports closed", async () => {
  const { calls, order, nativeDialogHelper, fireDialogClosed, openThermostatNative } = loadThermostatOverlay();

  await openThermostatNative("climate.casasolar_north_zone_1");
  assert.deepEqual(calls, [
    { domain: "input_boolean", service: "turn_on", data: nativeDialogHelper },
  ]);
  // The helper must be turned on *before* the dialog is asked to open, not after -- otherwise
  // kiosk_mode's own template (which reacts to this helper's state) would have nothing to react
  // to yet at the moment the dialog appears.
  assert.deepEqual(order, ["turn_on", "dispatch"]);

  // HA's real ha-more-info-dialog fires `dialog-closed` (bubbled, composed) when it closes,
  // whether that's the X button, Escape, or the scrim -- this is how the helper gets flipped
  // back off without Homie needing its own close affordance for a dialog it doesn't render.
  fireDialogClosed("ha-more-info-dialog");
  await flush();
  assert.deepEqual(calls, [
    { domain: "input_boolean", service: "turn_on", data: nativeDialogHelper },
    { domain: "input_boolean", service: "turn_off", data: nativeDialogHelper },
  ]);
});

test("a different dialog closing while the thermostat dialog is still open does not restore chrome", async () => {
  // e.g. an admin opens entity settings from inside the open thermostat dialog, then closes
  // just that nested dialog -- ha-more-info-dialog is still open underneath. dialog-closed's
  // own payload carries only the closing dialog's tag name, not an entity id, so the listener
  // has to filter on that name rather than treating every dialog-closed as "the" dialog closing.
  const { calls, fireDialogClosed, openThermostatNative } = loadThermostatOverlay();

  await openThermostatNative("climate.casasolar_north_zone_1");
  fireDialogClosed("dialog-entity-registry-detail");
  assert.equal(calls.filter((c) => c.service === "turn_off").length, 0);

  // The real dialog closing afterward still works normally.
  fireDialogClosed("ha-more-info-dialog");
  assert.equal(calls.filter((c) => c.service === "turn_off").length, 1);
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

test("Overview C's alert-triangle hidden rule out-specifies .ov3-sb-btn's display:flex, regardless of source order", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");

  // .ov3-alert-btn shares the .ov3-sb-btn base class, whose own
  // display:flex is declared later in the stylesheet (the shared
  // sidebar-button block). A single-class ".ov3-alert-btn { display: none; }"
  // carries the exact same specificity as ".ov3-sb-btn { display: flex; }",
  // so the later rule won regardless of the .visible toggle -- the triangle
  // rendered unconditionally on Overview C even with an empty pnCache. The
  // hidden-by-default rule must carry both classes to out-specify the base
  // rule no matter which comes first in the file.
  assert.match(cssDeclarations(source, ".ov3-sb-btn.ov3-alert-btn"), /display:\s*none/);
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
  assert.match(source, /d\.state === "critical"/);

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

test("lennoxAlertActive lights only for moderate/critical severities, matching the phone-notification threshold, not info or minor", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const fnStart = source.indexOf("function lennoxAlertActive()");
  assert.ok(fnStart > -1, "lennoxAlertActive must be found");
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = source.slice(fnStart, fnEnd);

  // The dashboard badge originally lit for any state other than
  // none/unavailable/unknown, deliberately including info and minor -- a
  // more permissive bar than the phone/persistent_notification threshold
  // (see lennox-thermostat-alerts.md). Revised on pde's call to match that
  // threshold instead: only moderate or critical light the dot.
  assert.match(fnBody, /d\.state === "critical"/);
  assert.match(fnBody, /d\.state === "moderate"/);
  assert.doesNotMatch(fnBody, /d\.state !== "none"/);
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
