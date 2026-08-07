# Overview C Card Swap and Main House Thermostat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the Overview C Main House and Irrigation card locations and make the bottom-right Main House card open the existing thermostat overlay filtered to `climate.casasolar_south_zone_1`.

**Architecture:** Keep the existing dashboard and overlay rather than creating a second thermostat UI. Add a small pure filter helper to `homie-custom.js`, let `openThermostat(entityId)` optionally filter the configured climate entities, and clear that filter on close. Reposition existing card elements with explicit Overview C layout classes, and turn the bottom-right AC card into a live-state launcher.

**Tech Stack:** Plain HTML/CSS/JavaScript, Home Assistant WebSocket state cache, Node.js built-in test runner.

## Global Constraints

- The Overview C launcher displays only `climate.casasolar_south_zone_1`; the North thermostat is not added in this change.
- Overview A's existing `openThermostat()` call remains unfiltered and continues to show Main House and Office Wing.
- Closing the thermostat overlay clears any entity filter.
- An invalid filtered entity must not fall back to showing unrelated thermostats.
- Preserve the accepted Overview C Solar and A/V behavior.
- Do not modify the Home Assistant `vision-sample` dashboard.
- Never print, copy into Git, or overwrite the live token in `/config/www/community/homie-dashboard/config.js`.
- Do not commit any artifact without separate user authorization.

---

### Task 1: Add reusable thermostat filtering

**Files:**
- Modify: `dist/homie-custom.js`
- Modify: `dist/homie-dashboard.html:16411-16448`
- Test: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: configured thermostat entries shaped as `{ label: string, entity: string }`.
- Produces: `HOMIE_CUSTOM.filterThermostats(entities, entityId)` and `openThermostat(entityId)` where `entityId` is optional.

- [ ] **Step 1: Write failing helper tests**

Add tests that assert:

```js
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
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/screen-a.test.cjs`

Expected: FAIL because `filterThermostats` and the filtered overlay contract do not exist.

- [ ] **Step 3: Implement the pure filter**

Add and export:

```js
function filterThermostats(entities, entityId) {
  const configured = Array.isArray(entities) ? entities : [];
  if (!entityId) return configured;
  return configured.filter((entry) => entry && entry.entity === entityId);
}
```

- [ ] **Step 4: Add optional filtering to the existing overlay**

Introduce `_thermEntityFilter = null`. Change `openThermostat(entityId)` to store `entityId || null`, build the configured entries, filter them through `HOMIE_CUSTOM.filterThermostats`, and return without opening if the result is empty. Change `closeThermostat()` to set `_thermEntityFilter = null` after removing the `open` class. Do not change existing no-argument callers.

- [ ] **Step 5: Run the focused test and verify success**

Run: `node --test test/screen-a.test.cjs`

Expected: all tests PASS.

- [ ] **Step 6: Exercise overlay behavior in a DOM-capable browser**

Open Overview A's Climate button and confirm both thermostat tabs appear. Close it, open the Overview C Main House launcher, and confirm only Main House appears. Close and reopen from Overview A to confirm the filter was cleared. If no browser connection is available, defer this check to Task 3's live visual verification and report it explicitly.

---

### Task 2: Swap cards and replace the inline AC controls

**Files:**
- Modify: `dist/homie-dashboard.html:5520-6040`
- Modify: `dist/homie-dashboard.html:8360-8470`
- Modify: `dist/homie-dashboard.html:17699-18030`
- Test: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: `openThermostat("climate.casasolar_south_zone_1")`, `haGetCached(entityId)`, and the existing Overview C refresh cycle.
- Produces: center-column `#ov3-garden-card`, right-column `#ov3-floors-card`, and bottom-right `#ov3-ac-card` as a Main House launcher.

- [ ] **Step 1: Write failing launcher view-model tests**

Add `HOMIE_CUSTOM.thermostatLauncherView(state)` tests using literal Home Assistant state fixtures. Assert:

```js
assert.deepEqual(
  custom.thermostatLauncherView({
    state: "cool",
    attributes: { current_temperature: 78.4 },
  }),
  { temperature: "78 °F", mode: "Cool", modeClass: "mode-cool" },
);
assert.deepEqual(
  custom.thermostatLauncherView({ state: "unavailable", attributes: {} }),
  { temperature: "— °F", mode: "Unavailable", modeClass: "" },
);
assert.deepEqual(
  custom.thermostatLauncherView(null),
  { temperature: "— °F", mode: "Unavailable", modeClass: "" },
);
```

The card-location swap is a CSS/DOM composition change and is verified against the rendered dashboard in Task 3 rather than by tests that grep private source structure.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/screen-a.test.cjs`

Expected: FAIL because the original card positions and inline AC carousel remain.

- [ ] **Step 3: Move the existing cards**

Move `#ov3-garden-card` out of `.ov3-col3` into the center-grid slot formerly occupied by `#ov3-floors-card`. Give it `grid-column: 2; grid-row: 2` and sizing compatible with the 120px grid row. Move `#ov3-floors-card` into `.ov3-col3` at the former garden-card position and give it the former garden card's `204px` flex footprint. Preserve all existing child IDs so garden, irrigation, floor, and swipe refresh functions continue to bind normally.

- [ ] **Step 4: Replace the AC carousel markup with a launcher**

Keep `#ov3-ac-card`, but replace its viewport, slides, controls, and dots with static child elements for:

```html
<div class="ov3-ac-name" id="ov3-ac-name">Main House</div>
<span id="ov3-ac-current">—</span>
<span id="ov3-ac-mode">Unavailable</span>
```

Set the card's click handler to `openThermostat('climate.casasolar_south_zone_1')`. Keep the existing bottom-right footprint and visual mode classes, but remove interactive inline temperature, HVAC-mode, fan-mode, carousel, and power controls.

- [ ] **Step 5: Replace carousel build/refresh code with launcher refresh code**

Add and export `thermostatLauncherView(state)` in `dist/homie-custom.js`; it returns `{ temperature, mode, modeClass }`, rounds a valid `current_temperature`, permanently formats Fahrenheit, maps HVAC states to `Cool`, `Heat`, `Fan Only`, `Dry`, `Auto`, or `Off`, and maps missing, `unknown`, or `unavailable` state to `{ temperature: "— °F", mode: "Unavailable", modeClass: "" }`. Replace `_buildOv3AcCard()` with a minimal initializer that calls `_refreshOv3AcCard()`. Implement `_refreshOv3AcCard()` to read `climate.casasolar_south_zone_1`, consume that view model, update the launcher, and apply its mode class.

- [ ] **Step 6: Remove dead carousel-only code and swipe exclusions**

Delete `_gatherOv3AcEntities`, carousel state, nudge, power, mode, fan, slide-refresh, and swipe functions used only by the old inline AC card. Remove `#ov3-ac-viewport` from `OV3_SWIPE_EXCLUDE_SELECTOR`, retaining `#ov3-ac-card` so tapping the launcher cannot trigger an overview swipe.

- [ ] **Step 7: Run focused tests and syntax checks**

Run:

```sh
node --test test/screen-a.test.cjs
node --check dist/homie-custom.js
node --check test/screen-a.test.cjs
```

Expected: all tests and checks PASS.

---

### Task 3: Document and deploy release `20260807.11`

**Files:**
- Modify: `docs/pdehlke-customizations.md`
- Modify: asset references in `dist/homie-dashboard.html`
- Do not modify the placeholder token in `dist/config.js`

**Interfaces:**
- Consumes: tested repository assets and `/Users/pde/tmp/homie-ha-edit-key`.
- Produces: live Homie assets with release token `20260807.11` and preserved live `config.js` credentials.

- [ ] **Step 1: Add documentation and release-token tests**

Extend `test/screen-a.test.cjs` to assert that nested custom assets use `20260807.11`, and update `docs/pdehlke-customizations.md` to record the card swap and entity-filtered Main House overlay behavior.

- [ ] **Step 2: Run the test and verify failure before changing asset references**

Run: `node --test test/screen-a.test.cjs`

Expected: FAIL on the old release token.

- [ ] **Step 3: Update nested asset references**

Change all Homie nested cache-busting references for this deployment from `20260807.10` to `20260807.11`. Do not alter the placeholder in repository `dist/config.js`.

- [ ] **Step 4: Run the full local verification**

Run:

```sh
npm test
node --check dist/homie-custom.js
git diff --check
git status --short
```

Expected: tests PASS, syntax and diff checks report no errors, and only intended files are modified/untracked.

- [ ] **Step 5: Back up and deploy without exposing credentials**

Over SSH to `root@homeassistant.local:2222`, create a timestamped backup of the live Homie directory. Upload tested non-secret assets by temporary names and atomically rename them. Preserve the existing live `config.js`; do not upload repository `dist/config.js`. Delete stale compressed copies only for assets that changed.

- [ ] **Step 6: Update the Lovelace iframe release token**

Read and back up the complete `homie-dash` Lovelace configuration, then change only its iframe URL query token from `20260807.10` to `20260807.11`. Verify the unrelated `vision-sample` dashboard was not saved or changed.

- [ ] **Step 7: Verify live state**

Confirm over read-only SSH and WebSocket calls that the live HTML and Lovelace iframe both reference `20260807.11`. If a browser becomes available, verify the swapped card positions and that the Main House launcher opens a one-room thermostat overlay. Otherwise report visual verification as pending rather than claiming it passed.

- [ ] **Step 8: Stop before commit**

Report the diff, tests, deployment result, and remaining visual-verification status. Do not stage, commit, or push until the user separately authorizes it.
