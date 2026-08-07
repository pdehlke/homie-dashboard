# Floors Card Target Cell and Bottom Card Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Target temperature cell to the Overview C floors card, turning its 3-item row into
a 2x2 grid (Temp/Target top, Humid/PM2.5 bottom), and remove the now-redundant bottom Main House
thermostat launcher card that phase 1's floors-card expand button superseded.

**Architecture:** A pure helper (`floorTargetText`) formats a resolved climate entity's target
value the same terse way this card already formats Temp, tested independently of the DOM. The
floors card's existing build/refresh functions gain a fourth stat item that calls it. Removing the
old launcher card deletes its markup, CSS, JS, and its one remaining `HOMIE_CUSTOM` consumer
(`thermostatLauncherView`), and rehomes the one test that exercised it onto the floors card's
existing `_openFloorsThermostat()`.

**Tech Stack:** Plain HTML/CSS/JavaScript, Node.js built-in test runner, the existing Homie
`CONFIG`/`HOMIE_CUSTOM` module pattern.

## Global Constraints

- No change to `openThermostat`, `closeThermostat`, `_renderThermRoom`, or
  `thermostatTemperatureView`. All already correct and tested.
- PM2.5 stays a static `n/a` on both floors. Not addressed this phase.
- Nothing fills the grid space freed by removing `#ov3-ac-card`. Leave it to natural flex reflow.
- Target's display format is terse, matching this card's own Temp cell (`"78°"`), not the
  thermostat overlay's `"78 °F"` style.
- Bump `HOMIE_ASSET_VERSION` on deploy (`20260807.14` → `.15`) and update both the Lovelace iframe
  token and the version test.
- Take a timestamped backup of the live Homie directory before deploying.
- Do not stage, commit, or push until pde separately authorizes it (per this project's standing
  convention). Per-task commits on the isolated worktree branch are fine; that gate is for the
  final merge/push.

---

### Task 1: Add the `floorTargetText` helper

**Files:**
- Modify: `dist/homie-custom.js`
- Test: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: an entity id string (or `null`/`undefined`) and a Home Assistant state object (or
  `null`) shaped like what `thermostatTemperatureView` already accepts.
- Produces: `HOMIE_CUSTOM.floorTargetText(entity, state)` returning `"n/a"` (no entity configured),
  `"—"` (entity configured but no target value available), or `"NN°"` (a resolved target).

- [ ] **Step 1: Write the failing test**

Add to `test/screen-a.test.cjs`, near the `floorThermostatEntity` tests (search for
`"floorThermostatEntity resolves the visible floor's climate entity"`):

```js
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/screen-a.test.cjs`
Expected: FAIL with `custom.floorTargetText is not a function`.

- [ ] **Step 3: Implement the helper**

In `dist/homie-custom.js`, add near `floorThermostatEntity`:

```js
function floorTargetText(entity, state) {
  if (!entity) return "n/a";
  const target = thermostatTemperatureView(state).targetTemperatureValue;
  return target === null ? "—" : `${Math.round(target)}°`;
}
```

Add `floorTargetText` to the module's returned object, next to `floorThermostatEntity`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/screen-a.test.cjs`
Expected: PASS. Baseline before this task is 41 passing tests; expect 42 after.

---

### Task 2: Add the Target cell and 2x2 grid layout

**Files:**
- Modify: `dist/homie-dashboard.html:5744-5759` (`.ov3-floors-stat-row`/`.ov3-floors-stat-item` CSS)
- Modify: `dist/homie-dashboard.html:18294-18347` (`_buildOv3FloorsCard`)
- Modify: `dist/homie-dashboard.html:18381-18400` (`_refreshOv3FloorsCard`)
- Test: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: `HOMIE_CUSTOM.floorTargetText` (Task 1), the existing `floor.entity` field (already in
  `dist/config.js` from phase 1), the existing `haGetCached(entityId)`.
- Produces: a fourth `.ov3-floors-stat-item` per floor panel (id `ov3-fl-${fi}-target`), populated
  by both the initial build and the live refresh cycle.

- [ ] **Step 1: Write the failing CSS test**

Add to `test/screen-a.test.cjs`, near the other Overview C markup tests:

```js
test("floors card stat row is a 2x2 grid with Temp/Target on top and Humid/PM2.5 below", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  assert.match(cssDeclarations(source, ".ov3-floors-stat-row"), /display:\s*grid/);
  assert.match(cssDeclarations(source, ".ov3-floors-stat-row"), /grid-template-columns:\s*1fr 1fr/);

  const cardStart = source.indexOf('class="ov3-floors-card"');
  const buildFnStart = source.indexOf("function _buildOv3FloorsCard");
  const buildFnBody = source.slice(buildFnStart, source.indexOf("\nfunction _ov3FloorsScrollTo", buildFnStart));
  assert.match(buildFnBody, /\["temp",\s*"target",\s*"humidity",\s*"pm25"\]/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/screen-a.test.cjs`
Expected: FAIL, `.ov3-floors-stat-row` still uses `display: flex` and the item type list doesn't
include `"target"`.

- [ ] **Step 3: Change the CSS to a 2x2 grid**

Replace this block (currently at `dist/homie-dashboard.html:5744-5759`):

```css
  .ov3-floors-stat-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  .ov3-floors-stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1;
    padding: 2px 0;
  }
  .ov3-floors-stat-item + .ov3-floors-stat-item {
    border-left: 1px solid rgba(255,255,255,0.12);
  }
```

with:

```css
  .ov3-floors-stat-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
  .ov3-floors-stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
  }
  .ov3-floors-stat-item:nth-child(2n) {
    border-left: 1px solid rgba(255,255,255,0.12);
  }
  .ov3-floors-stat-item:nth-child(n+3) {
    border-top: 1px solid rgba(255,255,255,0.12);
  }
```

(`nth-child(2n)` is the right column, giving the vertical divider between Temp/Target and
Humid/PM2.5; `nth-child(n+3)` is the bottom row, giving the horizontal divider. `flex: 1` is
dropped — it sized items along a flex row, which no longer exists.)

- [ ] **Step 4: Add the Target item to the build function**

In `_buildOv3FloorsCard` (`dist/homie-dashboard.html:18294`), change the `items` mapping inside
the `scroll.innerHTML = floors.map(...)` block from:

```js
  scroll.innerHTML = floors.map((floor, fi) => {
    const items = ["temp", "humidity", "pm25"].map(type => {
      const sensor = (floor.sensors || []).find(s => s.type === type);
      const labels = { temp: "Temp", humidity: "Humid", pm25: "PM2.5" };
      return `<div class="ov3-floors-stat-item">
        <div class="ov3-floors-stat-label">${labels[type]}</div>
        <div class="ov3-floors-stat-value" id="ov3-fl-${fi}-${type}">${sensor ? "—" : "n/a"}</div>
      </div>`;
    }).join('');
```

to:

```js
  scroll.innerHTML = floors.map((floor, fi) => {
    const labels = { temp: "Temp", target: "Target", humidity: "Humid", pm25: "PM2.5" };
    const items = ["temp", "target", "humidity", "pm25"].map(type => {
      const configured = type === "target"
        ? Boolean(floor.entity)
        : (floor.sensors || []).some(s => s.type === type);
      return `<div class="ov3-floors-stat-item">
        <div class="ov3-floors-stat-label">${labels[type]}</div>
        <div class="ov3-floors-stat-value" id="ov3-fl-${fi}-${type}">${configured ? "—" : "n/a"}</div>
      </div>`;
    }).join('');
```

Everything else in `_buildOv3FloorsCard` (the dots, scroll spy, active-name init) is unchanged —
this function only builds the item list order and the initial placeholder.

- [ ] **Step 5: Refresh the Target value alongside the existing three**

In `_refreshOv3FloorsCard` (`dist/homie-dashboard.html:18381`), add a target update inside the
`floors.forEach` loop, after the existing `SENSOR_TYPES.forEach` call:

```js
  floors.forEach((floor, fi) => {
    SENSOR_TYPES.forEach(type => {
      const el = document.getElementById(`ov3-fl-${fi}-${type}`);
      if (!el) return;
      const sensor = (floor.sensors || []).find(s => s.type === type);
      if (!sensor) return;
      const d = haGetCached(sensor.entity);
      if (!d) { el.textContent = "—"; return; }
      const v = parseFloat(d.state);
      const val = isNaN(v) ? "—" : (sensor.decimal ? v.toFixed(1) : Math.round(v)) + UNITS[type];
      el.textContent = val;
    });

    const targetEl = document.getElementById(`ov3-fl-${fi}-target`);
    if (targetEl) {
      const state = floor.entity ? haGetCached(floor.entity) : null;
      targetEl.textContent = HOMIE_CUSTOM.floorTargetText(floor.entity, state);
    }
  });
```

- [ ] **Step 6: Run the tests and syntax checks**

Run:

```sh
node --test test/screen-a.test.cjs
node --check dist/homie-custom.js
```

Expected: all tests PASS (42 from Task 1, plus this task's new test = 43), syntax check clean.

---

### Task 3: Remove the bottom Main House launcher card

**Files:**
- Modify: `dist/homie-dashboard.html` (CSS block, markup, JS functions and call sites, swipe-exclude list)
- Modify: `dist/homie-custom.js` (remove `thermostatLauncherView`)
- Modify: `test/screen-a.test.cjs` (remove its tests, rehome one test onto the floors button)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing later tasks depend on. `HOMIE_CUSTOM.thermostatLauncherView` no longer exists
  after this task — nothing else in the codebase calls it once this task's own deletions land.

- [ ] **Step 1: Confirm nothing else depends on what's being removed**

Run:

```sh
grep -n "ov3-ac-card\|ov3-ac-name\|ov3-ac-current\|ov3-ac-target\|ov3-ac-mode\|_buildOv3AcCard\|_refreshOv3AcCard\|thermostatLauncherView" dist/homie-dashboard.html dist/homie-custom.js test/screen-a.test.cjs
```

Expected output at the start of this task (confirm it still matches before deleting; if it
doesn't, stop and report rather than deleting the wrong thing):

```
test/screen-a.test.cjs:689:  const launcher = dashboardElementsById(source).get("ov3-ac-card");
dist/homie-dashboard.html:6024:  .ov3-ac-card {
dist/homie-dashboard.html:6041:  .ov3-ac-card.mode-cool { ... }
dist/homie-dashboard.html:6042:  .ov3-ac-card.mode-heat { ... }
dist/homie-dashboard.html:6043:  .ov3-ac-card.mode-fan  { ... }
dist/homie-dashboard.html:6044:  .ov3-ac-card.mode-dry  { ... }
dist/homie-dashboard.html:6046:  .ov3-ac-name {
dist/homie-dashboard.html:6053:  .ov3-ac-current {
dist/homie-dashboard.html:6060:  .ov3-ac-target {
dist/homie-dashboard.html:6066:  .ov3-ac-target-label {
dist/homie-dashboard.html:6072:  .ov3-ac-target-value {
dist/homie-dashboard.html:6079:  .ov3-ac-mode {
dist/homie-dashboard.html:8278:        <div class="ov3-ac-card" id="ov3-ac-card" onclick="openThermostat('climate.casasolar_south_zone_1')">
dist/homie-dashboard.html:8279:          <div class="ov3-ac-name" id="ov3-ac-name">Main House</div>
dist/homie-dashboard.html:8280:          <span class="ov3-ac-current" id="ov3-ac-current">—</span>
dist/homie-dashboard.html:8281:          <div class="ov3-ac-target" id="ov3-ac-target">
dist/homie-dashboard.html:8282:            <span class="ov3-ac-target-label">Target</span>
dist/homie-dashboard.html:8283:            <span class="ov3-ac-target-value" id="ov3-ac-target-value">—</span>
dist/homie-dashboard.html:8285:          <span class="ov3-ac-mode" id="ov3-ac-mode">Unavailable</span>
dist/homie-dashboard.html:16731:const OV3_SWIPE_EXCLUDE_SELECTOR = "...,  #ov3-ac-card, ...";
dist/homie-dashboard.html:17173:  _buildOv3AcCard();
dist/homie-dashboard.html:17537:function _buildOv3AcCard() {
dist/homie-dashboard.html:17538:  _refreshOv3AcCard();
dist/homie-dashboard.html:17541:function _refreshOv3AcCard() {
dist/homie-dashboard.html:17542:  const card = document.getElementById("ov3-ac-card");
dist/homie-dashboard.html:17543:  const currentEl = document.getElementById("ov3-ac-current");
dist/homie-dashboard.html:17544:  const targetEl = document.getElementById("ov3-ac-target-value");
dist/homie-dashboard.html:17545:  const modeEl = document.getElementById("ov3-ac-mode");
dist/homie-dashboard.html:18409:  _refreshOv3AcCard();
```

(Line numbers may have shifted slightly from Task 2's edits; match by content, not by number.)

- [ ] **Step 2: Delete the markup**

Remove the entire block starting `<!-- Main House thermostat launcher (4th) -->` through the
matching `</div>` (currently `dist/homie-dashboard.html:8277-8286`, the `ov3-ac-card` div and its
four children).

- [ ] **Step 3: Delete the CSS**

Remove the entire block from `.ov3-ac-card {` through the end of `.ov3-ac-mode { ... }` (currently
`dist/homie-dashboard.html:6024-6084`), including the four `.ov3-ac-card.mode-*` variant rules.
Leave the blank line and the `/* ─── OV3 PURIFIER CARD ─── */` comment that follows untouched.

- [ ] **Step 4: Delete the JS functions and their call sites**

Remove `_buildOv3AcCard()` and `_refreshOv3AcCard()` in full (currently
`dist/homie-dashboard.html:17537-17557`).

Remove the line `  _buildOv3AcCard();` from the init function that also calls
`_buildOv3SidebarControls()`, `_buildOv3PurifierCard()`, `_buildOv3FloorsCard()`, etc. (currently
`dist/homie-dashboard.html:17173`).

Remove the line `  _refreshOv3AcCard();` from `_refreshOv3()` (currently
`dist/homie-dashboard.html:18409`).

- [ ] **Step 5: Remove the swipe-exclude entry**

In `OV3_SWIPE_EXCLUDE_SELECTOR` (currently `dist/homie-dashboard.html:16731`), remove the
`, #ov3-ac-card` segment. Leave `.mush-ac-card` alone — it's a different, unrelated card on a
different overview screen.

- [ ] **Step 6: Remove `thermostatLauncherView` from `homie-custom.js`**

Delete the `thermostatLauncherView` function and its entry in the module's returned object.

- [ ] **Step 7: Remove the two `thermostatLauncherView` tests**

Delete these two tests from `test/screen-a.test.cjs` in full:
- `"thermostat launcher formats live cooling state and setpoint"`
- `"thermostat launcher treats unavailable and missing states as unavailable"`

- [ ] **Step 8: Rehome the launcher-filtering test onto the floors card**

This is the one test that must keep working, just through a different trigger. Its current form
(`test/screen-a.test.cjs:687-706`) drives the scenario through `#ov3-ac-card`'s `onclick` via the
`loadThermostatOverlay()` helper defined near the top of the file. Extend that helper to also make
`_openFloorsThermostat()` callable in the same sandboxed context, then rewrite the test to trigger
through it.

Change `loadThermostatOverlay()` from:

```js
function loadThermostatOverlay() {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const thermostatSource = source.slice(
    source.indexOf("let _thermEntities"),
    source.indexOf("/** _buildThermTabs"),
  );
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
    `${thermostatSource}\nglobalThis.__thermostat = { openThermostat, closeThermostat, entities: () => _thermEntities };`,
    context,
  );
  return { context, overlayClasses, thermostat: context.__thermostat };
}
```

to:

```js
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
```

(`_openFloorsThermostat`'s body has no nested braces, so the naive
`source.indexOf("}", openerStart) + 1` correctly finds its closing brace — the same technique
already used elsewhere in this file for `_sbIcon`.)

Then rewrite the test itself, from:

```js
test("Overview C launcher opens only Main House, while Overview A remains unfiltered after close", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const launcher = dashboardElementsById(source).get("ov3-ac-card");
  const { context, overlayClasses, thermostat } = loadThermostatOverlay();

  vm.runInContext(launcher.onclick, context);
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
```

to:

```js
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
```

(Dropped the now-unused `source`/`dashboardElementsById(source).get(...)` lookup — nothing else in
the rewritten test reads `source`.)

- [ ] **Step 9: Run the full suite and syntax checks**

Run:

```sh
node --test test/screen-a.test.cjs
node --check dist/homie-custom.js
git diff --check
```

Expected: PASS. Test count: 43 (end of Task 2) minus 2 removed `thermostatLauncherView` tests,
same rehomed test still counted once = 41. No syntax or whitespace errors.

---

### Task 4: Version bump and documentation

**Files:**
- Modify: `dist/homie-dashboard.html` (`HOMIE_ASSET_VERSION`)
- Modify: `test/screen-a.test.cjs` (version assertion)
- Modify: `docs/pdehlke-customizations.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Bump the release token**

In `dist/homie-dashboard.html`, change `const HOMIE_ASSET_VERSION = "20260807.14";` to
`"20260807.15"`.

In `test/screen-a.test.cjs`, change the version assertion from `"20260807.14"` to `"20260807.15"`.

- [ ] **Step 2: Run the version test**

Run: `node --test test/screen-a.test.cjs`
Expected: PASS.

- [ ] **Step 3: Update the customizations doc**

In `docs/pdehlke-customizations.md`'s "Behavior Changes" bullet list, add:

```
- show the floors card's Target temperature in a 2x2 grid (Temp/Target, Humid/PM2.5) on its main
  faces, and remove the bottom-of-column Main House thermostat launcher card the floors card's
  expand button superseded
```

- [ ] **Step 4: Final local verification**

Run:

```sh
node --test test/screen-a.test.cjs
node --check dist/homie-custom.js
git diff --check
git status --short
```

Expected: 41 tests PASS, no whitespace errors, only the intended files modified.

---

### Task 5: Deploy and verify live

**Files:**
- None (deployment and verification only).

**Interfaces:**
- Consumes: the tested, version-bumped assets from Tasks 1-4.
- Produces: a live, verified `20260807.15` deployment and a report back to pde. No commit.

- [ ] **Step 1: Back up the live Homie directory**

Over SSH to `root@homeassistant.local:2222` using `/Users/pde/tmp/homie-ha-edit-key`, create a
timestamped backup of `/config/www/community/homie-dashboard/` under `/config/backups/`.

- [ ] **Step 2: Deploy the changed assets**

Upload `dist/homie-dashboard.html` and `dist/homie-custom.js` by temporary name and atomically
rename into place. `dist/config.js` did not change this phase — do not touch the live `config.js`.

- [ ] **Step 3: Bump the Lovelace iframe token**

Over the WebSocket API, read and back up the `homie-dash` Lovelace config, then change its iframe
URL's version query from `20260807.14` to `20260807.15`. Confirm `vision-sample` is untouched.

- [ ] **Step 4: Verify live**

Confirm the live `homie-dashboard.html` and `homie-custom.js` are byte-identical to the working
tree, and the Lovelace config reports `20260807.15`.

- [ ] **Step 5: Verify via browser**

Using the same redaction-safe Playwright pattern as prior deploys (a Python-generated storage
state, redacted output, never printing the admin token or the Homie token, and never running
`playwright-cli request <n>` against this instance — it dumps full headers): navigate to
Overview C, confirm the floors card's main face shows a 2x2 grid with Temp and Target on top,
Humid and PM2.5 below, with a real Target value for Main House. Swipe or scroll to Office Wing and
confirm its Target value too. Confirm the bottom Main House launcher card is gone and the column
doesn't look visually broken. Screenshot both floors' main faces.

- [ ] **Step 6: Report and stop**

Report the diff, test results, and screenshots to pde. Do not stage, commit, or push until he
separately authorizes it.
