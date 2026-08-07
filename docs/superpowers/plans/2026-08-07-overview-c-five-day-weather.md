# Overview C Five-Day Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display five actual future forecast days on Overview C and restore its expanded Weather view.

**Architecture:** Use the already-installed `weather.openweathermap` entity because its daily service response contains today plus seven future days. Keep forecast selection and AQI-band fallback as pure helpers in `homie-custom.js`, with the dashboard consuming those helpers.

**Tech Stack:** Plain JavaScript, Home Assistant WebSocket `weather.get_forecasts`, Node.js built-in test runner.

## Global Constraints

- Display temperatures in Fahrenheit.
- Display five future days, excluding today's daily entry.
- Do not silently label a shorter fallback forecast as five days.
- Do not commit without explicit user approval.

---

### Task 1: Forecast selection and AQI fallback

**Files:**
- Modify: `test/screen-a.test.cjs`
- Modify: `dist/homie-custom.js`

**Interfaces:**
- Produces: `futureForecastDays(forecast, count)` returning up to `count` entries after today.
- Produces: `aqiBandForValue(configuredBands, defaultBands, value)` returning a usable band even when configured bands are empty.

- [x] Write tests proving five future entries are selected from an eight-entry forecast and empty AQI bands use defaults.
- [x] Run `node --test test/screen-a.test.cjs` and confirm both new tests fail for missing helpers.
- [x] Implement the two helpers and export them from `HOMIE_CUSTOM`.
- [x] Run `node --test test/screen-a.test.cjs` and confirm the suite passes.

### Task 2: Dashboard wiring

**Files:**
- Modify: `dist/config.js`
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/pdehlke-customizations.md`
- Test: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: `HOMIE_CUSTOM.futureForecastDays()` and `HOMIE_CUSTOM.aqiBandForValue()` from Task 1.

- [x] Change the expected weather entity test to `weather.openweathermap` and add source checks for both helper call sites.
- [x] Run `node --test test/screen-a.test.cjs` and confirm the wiring assertions fail.
- [x] Bind weather configuration to `weather.openweathermap`, render Overview C from the five-day helper, and resolve full-screen AQI bands through the fallback helper.
- [x] Document OpenWeatherMap as the required five-day source and Met.no as intentionally insufficient for this card.
- [x] Run `node --test test/screen-a.test.cjs` and confirm the full suite passes.

### Task 3: Deploy and verify

**Files:**
- Deploy: `dist/config.js`, `dist/homie-custom.js`, `dist/homie-dashboard.html`

**Interfaces:**
- Consumes: tested distribution assets from Tasks 1 and 2.

- [x] Create a timestamped backup of `/config/www/community/homie-dashboard` over SSH.
- [x] Increment the dashboard asset-version token and upload the changed files without copying the live token back into Git.
- [x] Query `weather.openweathermap` daily forecasts and confirm at least six entries exist, yielding five future days.
- [x] Verify deployed checksums and report the result without committing.
