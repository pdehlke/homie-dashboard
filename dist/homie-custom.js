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

  function thermostatTemperatureUnit(state) {
    return state && state.attributes && state.attributes.temperature_unit === "°C" ? "°C" : "°F";
  }

  function thermostatToFahrenheit(value, unit) {
    const numeric = numericState(value);
    if (numeric === null) return null;
    return unit === "°C" ? (numeric * 9 / 5) + 32 : numeric;
  }

  function thermostatFromFahrenheit(value, unit) {
    const numeric = numericState(value);
    if (numeric === null) return null;
    return unit === "°C" ? ((numeric - 32) * 5 / 9) : numeric;
  }

  function thermostatTemperatureView(state) {
    const attributes = state && state.attributes ? state.attributes : {};
    const mode = (state && state.state) || attributes.hvac_mode || "";
    const hvacAction = attributes.hvac_action || "";
    const unit = thermostatTemperatureUnit(state);
    const current = thermostatToFahrenheit(attributes.current_temperature, unit);
    const targetTemperature = numericState(attributes.temperature);
    const targetHigh = numericState(attributes.target_temp_high);
    const targetLow = numericState(attributes.target_temp_low);
    const isRangeMode = targetHigh !== null && targetLow !== null && (mode === "heat_cool" || mode === "auto");
    // A dual-setpoint band has no single "the" setpoint. hvac_action reports which bound
    // the equipment is actually working toward right now, so prefer that one; with no
    // active action (idle, fan, or unreported) there is no single correct answer, so show
    // the midpoint of the band instead.
    const rangeTarget = isRangeMode
      ? (hvacAction === "cooling" ? targetHigh
        : hvacAction === "heating" ? targetLow
        : (targetHigh + targetLow) / 2)
      : null;
    const target = targetTemperature
      ?? rangeTarget
      ?? (mode === "cool" ? targetHigh : null)
      ?? (mode === "heat" ? targetLow : null)
      ?? targetHigh
      ?? targetLow;

    return {
      currentTemperature: current === null ? "— °F" : `${Math.round(current)} °F`,
      targetTemperature: target === null ? "— °F" : `${Math.round(thermostatToFahrenheit(target, unit))} °F`,
      currentTemperatureValue: current,
      targetTemperatureValue: target === null ? null : thermostatToFahrenheit(target, unit),
      hasRange: targetHigh !== null && targetLow !== null,
      nativeUnit: unit,
    };
  }

  function thermostatStepSize(state) {
    const attributes = state && state.attributes ? state.attributes : {};
    const step = numericState(attributes.target_temp_step);
    // lennoxs30 (and climate entities generally) silently drop set_temperature calls that
    // don't land on a multiple of target_temp_step -- no error, no state change, nothing.
    // Half a degree is only a safe default when the entity doesn't declare a step at all.
    return step !== null && step > 0 ? step : 0.5;
  }

  function thermostatSetTemperaturePayload(state, deltaF) {
    const attributes = state && state.attributes ? state.attributes : {};
    const mode = (state && state.state) || attributes.hvac_mode || "";
    const hvacAction = attributes.hvac_action || "";
    const unit = thermostatTemperatureUnit(state);
    const targetTemperature = numericState(attributes.temperature);
    const targetHigh = numericState(attributes.target_temp_high);
    const targetLow = numericState(attributes.target_temp_low);
    const roundedDelta = Math.round(deltaF * 2) / 2;

    function shifted(value) {
      const nextF = (thermostatToFahrenheit(value, unit) ?? value) + roundedDelta;
      const next = thermostatFromFahrenheit(nextF, unit);
      return next === null ? undefined : Math.round(next * 10) / 10;
    }

    if (targetHigh !== null && targetLow !== null && (mode === "heat_cool" || mode === "auto")) {
      // Home Assistant's climate.set_temperature schema requires target_temp_high and
      // target_temp_low together -- supplying only one is a hard 400 at the service-call
      // validation layer, before it ever reaches the entity. So both keys are always present;
      // only the bound thermostatTemperatureView is currently displaying actually changes value,
      // keeping the on-screen number and the value sent in sync. With no single active bound
      // (idle/fan/unreported), shift the whole band together to preserve its width.
      if (hvacAction === "cooling") {
        return { target_temp_high: shifted(targetHigh), target_temp_low: targetLow };
      }
      if (hvacAction === "heating") {
        return { target_temp_high: targetHigh, target_temp_low: shifted(targetLow) };
      }
      return {
        target_temp_high: shifted(targetHigh),
        target_temp_low: shifted(targetLow),
      };
    }

    if (mode === "cool" && targetHigh !== null) {
      return { target_temp_high: shifted(targetHigh) };
    }

    if (mode === "heat" && targetLow !== null) {
      return { target_temp_low: shifted(targetLow) };
    }

    const base = targetTemperature ?? targetHigh ?? targetLow ?? 22;
    return { temperature: shifted(base) };
  }

  function thermostatLauncherView(state) {
    if (!state || state.state === "unknown" || state.state === "unavailable") {
      return { temperature: "— °F", targetTemperature: "— °F", mode: "Unavailable", modeClass: "" };
    }
    const modeViews = {
      cool: { mode: "Cool", modeClass: "mode-cool" },
      heat: { mode: "Heat", modeClass: "mode-heat" },
      fan_only: { mode: "Fan Only", modeClass: "mode-fan" },
      heat_cool: { mode: "Auto", modeClass: "" },
      dry: { mode: "Dry", modeClass: "mode-dry" },
      auto: { mode: "Auto", modeClass: "" },
      off: { mode: "Off", modeClass: "" },
    };
    const view = modeViews[state.state] || { mode: "Unavailable", modeClass: "" };
    const temperatures = thermostatTemperatureView(state);
    return {
      temperature: temperatures.currentTemperature,
      targetTemperature: temperatures.targetTemperature,
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
    thermostatSetTemperaturePayload,
    thermostatStepSize,
    thermostatTemperatureUnit,
    thermostatTemperatureView,
    thermostatToFahrenheit,
    thermostatFromFahrenheit,
    weatherUvValue,
  };
});
