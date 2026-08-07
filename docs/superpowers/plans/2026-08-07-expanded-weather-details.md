# Expanded Weather Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate sunrise, sunset, moon phase, and UV index in Homie's expanded Weather view from native Home Assistant entities.

**Architecture:** Bind `sun.sun`, `sensor.moon_phase`, and `sensor.openweathermap_uv_index` in configuration. Normalize sun-event and UV lookup in pure tested helpers, then consume those helpers in both expanded Weather and Overview C where the same values appear.

**Tech Stack:** Plain JavaScript, Home Assistant REST/config flow, Node.js built-in test runner.

## Global Constraints

- Use the `America/Phoenix` timezone and 12-hour clock for sun times.
- Keep Home Assistant as the source of truth; do not calculate moon phases in Homie.
- Do not commit without explicit approval.

---

### Task 1: Entity bindings and normalization

**Files:**
- Modify: `test/screen-a.test.cjs`
- Modify: `dist/homie-custom.js`
- Modify: `dist/config.js`

- [x] Add failing tests for the three entity bindings, `sun.sun` attribute extraction, and UV sensor extraction.
- [x] Implement `sunEventTimes()` and `weatherUvValue()` and export both helpers.
- [x] Bind `sun.sun`, `sensor.moon_phase`, and `sensor.openweathermap_uv_index`.
- [x] Run the full test suite.

### Task 2: Expanded Weather wiring and deployment

**Files:**
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/pdehlke-customizations.md`
- Modify: `test/screen-a.test.cjs`

- [x] Add failing source-wiring and release-token tests.
- [x] Use the helpers in expanded Weather and Overview C, then document the bindings.
- [x] Deploy version `20260807.9` after a timestamped backup.
- [x] Verify live entity states, deployed checksums, Lovelace cache token, and the complete test suite.
