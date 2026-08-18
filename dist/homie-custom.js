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
    if (control && control.action === "harmony") {
      return "openTVControl()";
    }
    if (control && control.action === "nas") {
      return "openNasOverlay()";
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

  function floorThermostatEntity(floors, index) {
    const list = Array.isArray(floors) ? floors : [];
    const floor = list[index];
    return floor && floor.entity ? floor.entity : null;
  }

  function floorTargetText(entity, state) {
    if (!entity) return "n/a";
    const target = thermostatTemperatureView(state).targetTemperatureValue;
    return target === null ? "—" : `${Math.round(target)}°`;
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
    // A dual-setpoint band has no single "the" setpoint. hvac_action reports which bound the
    // equipment is actively working toward right now, so prefer that one. With no active action
    // (idle, fan, or unreported) -- which is the *normal resting state* of a satisfied
    // thermostat, not a rare edge case -- fall back to whichever bound current_temperature sits
    // closer to. That was previously the band midpoint, but the midpoint isn't a setpoint either
    // bound is actually near, so it reads as wrong (e.g. 70 shown for a 62/78 band idling at 76)
    // even though the underlying data is fine. A tied or unknown current_temperature defaults to
    // the high (cooling) bound.
    const currentNative = numericState(attributes.current_temperature);
    const rangeTarget = isRangeMode
      ? (hvacAction === "cooling" ? targetHigh
        : hvacAction === "heating" ? targetLow
        : (currentNative !== null && Math.abs(currentNative - targetLow) < Math.abs(currentNative - targetHigh)
          ? targetLow
          : targetHigh))
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

  // Share of the home's own consumption that is green, not the grid's raw mix.
  // Solar production counts as 100% green. While exporting or neutral, solar
  // alone covers consumption, so the result is 100 regardless of the grid's
  // mix. While importing, the result blends solar and imported grid power
  // (at the grid's green fraction) weighted by each source's share of
  // homeKw. Clamped to [0, 100] to absorb noise between independently
  // metered sensors.
  function homeGreenPercentage(solarKw, gridKw, homeKw, gridGreenPercent) {
    const solar = numericState(solarKw);
    const grid = numericState(gridKw);
    const home = numericState(homeKw);
    if (solar === null || grid === null || home === null || home <= 0) return null;
    if (gridDirection(grid).mode !== "import") return 100;
    const gridGreen = numericState(gridGreenPercent);
    if (gridGreen === null) return null;
    const greenKw = solar + grid * (gridGreen / 100);
    const percent = (greenKw / home) * 100;
    return Math.round(Math.min(100, Math.max(0, percent)) * 100) / 100;
  }

  // Aligns several recorder-statistics series (one per role) by hourly bucket
  // start time into one array of per-hour records. A bucket present in only
  // some series still appears, with null for the roles that have no point at
  // that start time — callers decide what a missing value means for them.
  function mergeHourlyStatistics(seriesByRole) {
    const roles = seriesByRole || {};
    const fieldByRole = {
      solar: ["solarChange", "change"],
      export: ["exportChange", "change"],
      import: ["importChange", "change"],
      fossilPct: ["fossilPctMean", "mean"],
      co2: ["co2Mean", "mean"],
    };
    const pointsByStart = new Map();
    for (const [role, [outKey, sourceField]] of Object.entries(fieldByRole)) {
      for (const point of roles[role] || []) {
        if (!pointsByStart.has(point.start)) pointsByStart.set(point.start, { start: point.start });
        pointsByStart.get(point.start)[outKey] = point[sourceField];
      }
    }
    return Array.from(pointsByStart.values())
      .sort((a, b) => a.start - b.start)
      .map((hour) => ({
        start: hour.start,
        solarChange: hour.solarChange ?? null,
        exportChange: hour.exportChange ?? null,
        importChange: hour.importChange ?? null,
        fossilPctMean: hour.fossilPctMean ?? null,
        co2Mean: hour.co2Mean ?? null,
      }));
  }

  // Time-weighted extension of homeGreenPercentage: sums self-consumed solar
  // plus grid-import green share across every elapsed hour today that has a
  // complete set of inputs, then divides by today's live consumption total
  // (the same figure already shown as "Today's Usage"). An hour missing any
  // required input is skipped rather than counted as zero, so the running
  // total understates a gappy day instead of going blank.
  function todayGreenPercentage(hourlyBuckets, todayConsumptionKwh) {
    const consumption = numericState(todayConsumptionKwh);
    if (consumption === null || consumption <= 0 || !Array.isArray(hourlyBuckets)) return null;
    let greenKwh = 0;
    let countedHours = 0;
    for (const hour of hourlyBuckets) {
      const solar = numericState(hour.solarChange);
      const exported = numericState(hour.exportChange);
      const imported = numericState(hour.importChange);
      const fossilPct = numericState(hour.fossilPctMean);
      if (solar === null || exported === null || imported === null || fossilPct === null) continue;
      const selfConsumed = Math.max(0, solar - exported);
      const gridGreenPct = Math.min(100, Math.max(0, 100 - fossilPct));
      greenKwh += selfConsumed + imported * (gridGreenPct / 100);
      countedHours++;
    }
    if (countedHours === 0) return null;
    const percent = (greenKwh / consumption) * 100;
    return Math.round(Math.min(100, Math.max(0, percent)) * 100) / 100;
  }

  // Same shape as todayGreenPercentage but for carbon mass: grid import
  // carries the hour's mean CO2 intensity, self-consumed solar carries none.
  function todayCo2Intensity(hourlyBuckets, todayConsumptionKwh) {
    const consumption = numericState(todayConsumptionKwh);
    if (consumption === null || consumption <= 0 || !Array.isArray(hourlyBuckets)) return null;
    let totalGrams = 0;
    let countedHours = 0;
    for (const hour of hourlyBuckets) {
      const imported = numericState(hour.importChange);
      const co2Mean = numericState(hour.co2Mean);
      if (imported === null || co2Mean === null) continue;
      totalGrams += Math.max(0, imported) * co2Mean;
      countedHours++;
    }
    if (countedHours === 0) return null;
    return Math.round((totalGrams / consumption) * 100) / 100;
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
    const gridGreenPercent = lowCarbonPercentage(number("fossil-percentage"));
    const co2 = number("co2-intensity");
    const temp = number("solar-temp");
    const solarKw = powerKw(states.solar);
    const homeKw = powerKw(states["live-consumption"]);
    const gridKw = powerKw(states.export);
    const direction = gridDirection(gridKw);
    const homeGreen = homeGreenPercentage(solarKw, gridKw, homeKw, gridGreenPercent);
    return {
      liveWatts: card.liveWatts,
      dailyUsage: daily === null ? "—" : daily.toFixed(1),
      monthlyUsage: monthly === null ? "—" : monthly.toFixed(1),
      lowCarbon: homeGreen === null ? "—" : homeGreen.toFixed(1),
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
    floorTargetText,
    floorThermostatEntity,
    installDefaults,
    gridDirection,
    futureForecastDays,
    homeGreenPercentage,
    hourlyPowerAverages,
    lowCarbonPercentage,
    mergeHourlyStatistics,
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
    thermostatTemperatureUnit,
    thermostatTemperatureView,
    thermostatToFahrenheit,
    thermostatFromFahrenheit,
    todayCo2Intensity,
    todayGreenPercentage,
    weatherUvValue,
  };
});
