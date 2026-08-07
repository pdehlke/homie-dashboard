(function initializeHomieCustom(root, factory) {
  const api = factory();
  root.HOMIE_CUSTOM = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function buildHomieCustom() {
  "use strict";

  function controlOnClick(control, index) {
    if (control && control.action === "thermostat") {
      return "openThermostat()";
    }
    if (control && control.action === "media_browser") {
      return "openMediaBrowser()";
    }
    if (control && (control.subEntities || control.subGroups)) {
      return `openPopup(${index})`;
    }
    return `toggleControl(${index})`;
  }

  function controlIndex(controls, label) {
    return (controls || []).findIndex((control) => control.label === label);
  }

  function filterThermostats(entities, entityId) {
    const configured = Array.isArray(entities) ? entities : [];
    if (!entityId) return configured;
    return configured.filter((entry) => entry && entry.entity === entityId);
  }

  function thermostatLauncherView(state) {
    if (!state || state.state === "unknown" || state.state === "unavailable") {
      return { temperature: "— °F", mode: "Unavailable", modeClass: "" };
    }
    const modeViews = {
      cool: { mode: "Cool", modeClass: "mode-cool" },
      heat: { mode: "Heat", modeClass: "mode-heat" },
      fan_only: { mode: "Fan Only", modeClass: "mode-fan" },
      dry: { mode: "Dry", modeClass: "mode-dry" },
      auto: { mode: "Auto", modeClass: "" },
      off: { mode: "Off", modeClass: "" },
    };
    const view = modeViews[state.state] || { mode: "Unavailable", modeClass: "" };
    const current = numericState(state.attributes && state.attributes.current_temperature);
    return {
      temperature: current === null ? "— °F" : `${Math.round(current)} °F`,
      ...view,
    };
  }

  function requiresStartConfirmation(control, isOn) {
    return Boolean(control && control.confirmStart && !isOn);
  }

  function startConfirmationMessage(entity) {
    const label = entity && entity.label ? entity.label : "this irrigation zone";
    return `Start ${label}?`;
  }

  function statColumns(statCount) {
    return statCount === 8 ? 4 : 5;
  }

  function sensorPanelInteractive(panel) {
    return !(panel && panel.interactive === false);
  }

  function securityMessage() {
    return "Alarm Not Configured";
  }

  function numericState(value) {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function powerKw(state) {
    if (!state) return null;
    const value = numericState(state.state);
    if (value === null) return null;
    return state.attributes && state.attributes.unit_of_measurement === "W" ? value / 1000 : value;
  }

  function signedValue(value, decimals) {
    const numeric = numericState(value);
    if (numeric === null) return null;
    return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(decimals)}`;
  }

  function gridDirection(value) {
    const numeric = numericState(value);
    if (numeric === null || Math.abs(numeric) <= 0.01) {
      return { label: "Grid", magnitude: numeric === null ? null : 0, mode: "neutral" };
    }
    return numeric < 0
      ? { label: "Export", magnitude: Math.abs(numeric), mode: "export" }
      : { label: "Import", magnitude: numeric, mode: "import" };
  }

  function lowCarbonPercentage(fossilPercentage) {
    const fossil = numericState(fossilPercentage);
    return fossil === null || fossil < 0 || fossil > 100 ? null : Math.round((100 - fossil) * 100) / 100;
  }

  function aqiPollutantView(statesByType) {
    const states = statesByType || {};
    const format = type => {
      const value = states[type] ? numericState(states[type].state) : null;
      return value === null ? "—" : value.toFixed(1);
    };
    return {
      pm25: format("pm25"),
      pm10: format("pm10"),
      co: format("co"),
      no2: format("no2"),
    };
  }

  function aqiBandForValue(configuredBands, defaultBands, value) {
    const bands = Array.isArray(configuredBands) && configuredBands.length
      ? configuredBands
      : defaultBands;
    if (!Array.isArray(bands) || !bands.length) return null;
    const numeric = numericState(value);
    return numeric === null
      ? bands[0]
      : bands.find((band) => numeric <= band.max) || bands[bands.length - 1];
  }

  function futureForecastDays(forecast, count) {
    if (!Array.isArray(forecast)) return [];
    return forecast.slice(1, Math.max(0, count) + 1);
  }

  function sunEventTimes(sunState, sunriseState, sunsetState) {
    const attributes = sunState && sunState.attributes ? sunState.attributes : {};
    return {
      riseISO: sunriseState && sunriseState.state
        ? sunriseState.state
        : attributes.next_rising || null,
      setISO: sunsetState && sunsetState.state
        ? sunsetState.state
        : attributes.next_setting || null,
    };
  }

  function weatherUvValue(uvState, weatherState) {
    const dedicated = uvState ? numericState(uvState.state) : null;
    if (dedicated !== null) return dedicated;
    const attributes = weatherState && weatherState.attributes ? weatherState.attributes : {};
    return numericState(attributes.uv_index);
  }

  function solarCardView(statesByType) {
    const states = statesByType || {};
    const liveState = states["live-consumption"];
    let liveWatts = liveState ? numericState(liveState.state) : null;
    if (liveWatts !== null && liveState.attributes && liveState.attributes.unit_of_measurement === "kW") {
      liveWatts *= 1000;
    }
    const netTodayValue = states["net-today"] ? numericState(states["net-today"].state) : null;
    const solarKw = powerKw(states.solar);
    const gridKw = powerKw(states.export);
    const direction = gridDirection(gridKw);
    return {
      liveWatts: liveWatts === null ? "—" : String(Math.round(liveWatts)),
      netToday: netTodayValue === null ? "—" : `${signedValue(netTodayValue, 1)} kWh`,
      solar: solarKw === null ? "—" : `${solarKw.toFixed(2)} kW`,
      grid: direction.magnitude === null ? "—" : `${direction.magnitude.toFixed(2)} kW`,
      gridLabel: direction.label,
      gridMode: direction.mode,
    };
  }

  function solarFullscreenView(statesByType) {
    const states = statesByType || {};
    const card = solarCardView(states);
    const number = type => states[type] ? numericState(states[type].state) : null;
    const daily = number("daily-consumption");
    const monthly = number("monthly-kwh");
    const lowCarbon = lowCarbonPercentage(number("fossil-percentage"));
    const co2 = number("co2-intensity");
    const temp = number("solar-temp");
    const solarKw = powerKw(states.solar);
    const homeKw = powerKw(states["live-consumption"]);
    const gridKw = powerKw(states.export);
    const direction = gridDirection(gridKw);
    return {
      liveWatts: card.liveWatts,
      dailyUsage: daily === null ? "—" : daily.toFixed(1),
      monthlyUsage: monthly === null ? "—" : monthly.toFixed(1),
      lowCarbon: lowCarbon === null ? "—" : lowCarbon.toFixed(1),
      co2Intensity: co2 === null ? "—" : String(Math.round(co2)),
      solarKw,
      homeKw,
      gridKw,
      gridLabel: direction.label,
      gridMagnitude: direction.magnitude === null ? "—" : direction.magnitude.toFixed(2),
      inverterTemp: temp === null ? "—" : temp.toFixed(1),
    };
  }

  function hourlyPowerAverages(entries, unit) {
    const buckets = {};
    for (const entry of entries || []) {
      const value = numericState(entry.state);
      if (value === null || value < 0 || !entry.last_changed) continue;
      const hour = new Date(entry.last_changed).getHours();
      if (!buckets[hour]) buckets[hour] = { sum: 0, count: 0 };
      buckets[hour].sum += value;
      buckets[hour].count += 1;
    }
    return Array.from({ length: 24 }, (_unused, hour) => {
      if (!buckets[hour]) return 0;
      const average = buckets[hour].sum / buckets[hour].count;
      return unit === "W" ? average / 1000 : average;
    });
  }

  function chartHistoryMessage(solarHistory, powerHistory, failed) {
    if (solarHistory || powerHistory) return null;
    return failed ? "History unavailable" : "No history yet";
  }

  function installDefaults(storage, defaults, version) {
    const markerKey = "homie_pde_defaults_version";
    if (storage.getItem(markerKey) === version) {
      return false;
    }
    let settings = {};
    try {
      settings = JSON.parse(storage.getItem("homie_dashboard_settings") || "{}");
    } catch (_error) {
      settings = {};
    }
    settings.clockFormat = defaults.clockFormat;
    settings.startupMode = defaults.startupMode;
    settings.bgMode = defaults.backgroundMode;
    storage.setItem("homie_dashboard_settings", JSON.stringify(settings));
    storage.setItem("homie-theme", defaults.theme);
    storage.setItem("homie-base-theme", defaults.theme);
    storage.setItem(markerKey, version);
    return true;
  }

  return {
    aqiBandForValue,
    aqiPollutantView,
    chartHistoryMessage,
    controlIndex,
    controlOnClick,
    filterThermostats,
    installDefaults,
    gridDirection,
    futureForecastDays,
    hourlyPowerAverages,
    lowCarbonPercentage,
    powerKw,
    requiresStartConfirmation,
    securityMessage,
    sensorPanelInteractive,
    signedValue,
    solarCardView,
    solarFullscreenView,
    startConfirmationMessage,
    statColumns,
    sunEventTimes,
    thermostatLauncherView,
    weatherUvValue,
  };
});
