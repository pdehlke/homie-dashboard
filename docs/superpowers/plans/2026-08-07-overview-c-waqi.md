# Overview C WAQI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate Homie's AQI displays from the Geronimo WAQI station without mislabeling pollutant sub-index values as concentrations.

**Architecture:** Bind the five accepted entities in `CONFIG.aqi`. Add one pure formatter to `homie-custom.js` and use it in both Overview C and full-screen weather so unavailable handling and unitless output cannot diverge.

**Tech Stack:** Static JavaScript/HTML, Node.js built-in test runner, Home Assistant WebSocket state cache.

## Global Constraints

- Preserve the existing AQI, PM2.5, PM10, CO, and NO2 card positions.
- Treat pollutant values as unitless WAQI sub-index values.
- Render unavailable, unknown, empty, and nonnumeric states as `—`; retain numeric zero.
- Preserve the installed token during deployment and never place it in Git.

---

### Task 1: WAQI mapping and shared formatting

**Files:**
- Modify: `test/screen-a.test.cjs`
- Modify: `dist/config.js`
- Modify: `dist/homie-custom.js`
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/pdehlke-customizations.md`

**Interfaces:**
- Consumes: Home Assistant state objects shaped as `{state, attributes}`
- Produces: `aqiSubIndex(state): string`, returning one decimal or `—`

- [ ] Add failing tests for the five exact entity mappings, valid decimal formatting, zero, and invalid states.
- [ ] Run `node --test test/screen-a.test.cjs` and confirm failures identify the empty AQI config and missing formatter.
- [ ] Bind the Geronimo entities and implement `aqiSubIndex` through the existing `numericState` parser.
- [ ] Replace hardcoded concentration formatting in both AQI renderers with `HOMIE_CUSTOM.aqiSubIndex`.
- [ ] Document the Geronimo source and unitless sub-index semantics.
- [ ] Run all tests, JavaScript syntax checks, and `git diff --check`.

### Task 2: Cache-safe deployment

**Files:**
- Modify: `test/screen-a.test.cjs`
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/superpowers/specs/2026-08-07-asset-versioning-design.md`
- Modify: `docs/superpowers/plans/2026-08-07-asset-versioning.md`

**Interfaces:**
- Produces: release `20260807.7`

- [ ] Change the version assertion to `20260807.7` and verify it fails on the previous release.
- [ ] Update the HTML and current asset-version documentation to `20260807.7`.
- [ ] Back up the live Homie directory and deploy the validated bundle while preserving its token.
- [ ] Update `homie-dash` through `lovelace/config/save` to the new versioned URL.
- [ ] Verify served mappings, formatter usage, live Geronimo values, and the Lovelace read-back.
- [ ] Leave the working tree uncommitted.
