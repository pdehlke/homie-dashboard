# Dual Inverter Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add equal-width Left and Right Inverter placeholders to the expanded Solar view and make Fahrenheit the permanent temperature-display convention.

**Architecture:** Extend the existing five-column flex pattern rather than introducing a new layout. Keep both inverter values unbound and independently addressable for future entity integration.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, Home Assistant Lovelace iframe strategy.

## Global Constraints

- Display all temperatures in Fahrenheit with `°F`.
- Keep both inverter values unbound as `—` until their integrations exist.
- Preserve the existing Home Assistant token during deployment and never write it to Git.
- Do not modify Home Assistant internals.

---

### Task 1: Dual inverter markup, equal sizing, and permanent documentation

**Files:**
- Modify: `test/screen-a.test.cjs`
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/pdehlke-customizations.md`

**Interfaces:**
- Consumes: existing `.sfs-stats-row` flex layout and `_sfsUpdate` refresh function
- Produces: `sfs-stat-left-inverter` and `sfs-stat-right-inverter` placeholder elements

- [ ] **Step 1: Write the failing regression assertions**

Assert that the lower row contains five cards, includes the exact labels `Left Inverter` and
`Right Inverter`, provides unique value IDs, shows `°F` for both, and documents the global
Fahrenheit rule.

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test test/screen-a.test.cjs`. Expect the dual-inverter assertions to fail because the
single `Inverter Temp` card still exists.

- [ ] **Step 3: Implement the minimal markup and update logic**

Replace the single inverter card with two cards using unique IDs, set both placeholder values from
the existing unbound inverter value, and retain the shared `flex: 1` card styling so each row has
five equal cards.

- [ ] **Step 4: Document Fahrenheit as a fork-wide rule**

Add a Temperature Display Convention section to `docs/pdehlke-customizations.md` stating that all
temperature UI uses Fahrenheit and future integrations must supply or convert values accordingly.

- [ ] **Step 5: Run tests and static checks**

Run `node --test test/screen-a.test.cjs`, `node --check dist/homie-custom.js`, and
`git diff --check`. Expect all checks to pass.

### Task 2: Cache-safe deployment

**Files:**
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/superpowers/specs/2026-08-07-asset-versioning-design.md`
- Modify: `docs/superpowers/plans/2026-08-07-asset-versioning.md`

**Interfaces:**
- Consumes: `HOMIE_ASSET_VERSION` and the `homie-dash` Lovelace iframe strategy
- Produces: release `20260807.4`

- [ ] **Step 1: Make the version assertion expect `20260807.4` and verify RED**

Run `node --test test/screen-a.test.cjs`. Expect the release-token assertion to fail on
`20260807.3`.

- [ ] **Step 2: Update the release token and version documentation**

Change the HTML and current asset-version documentation to `20260807.4`.

- [ ] **Step 3: Verify and deploy**

Run the full checks, back up the installed Homie directory, preserve the installed token while
copying the validated files, and update `homie-dash` through `lovelace/config/save` to load
`homie-dashboard.html?v=20260807.4`.

- [ ] **Step 4: Verify live state**

Confirm deployed hashes, both inverter labels and Fahrenheit units in the served HTML, and the
Lovelace iframe URL. Leave all changes uncommitted.
