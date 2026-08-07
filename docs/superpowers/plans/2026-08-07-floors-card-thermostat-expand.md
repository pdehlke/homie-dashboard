# Floors Card Thermostat Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expand button to Overview C's floors card (Main House / Office Wing) that opens
the already-working thermostat overlay filtered to whichever floor is currently visible, matching
the weather/solar/A-V expand-icon convention.

**Architecture:** A pure helper (`floorThermostatEntity`) maps the currently-visible floor index to
its climate entity, tested the same way as the existing `filterThermostats` helper. A thin DOM
wrapper (`_openFloorsThermostat`) reads the floors card's own tracked scroll position and calls the
already-fixed `openThermostat(entity)`. No changes to the overlay itself.

**Tech Stack:** Plain HTML/CSS/JavaScript, Node.js built-in test runner, the existing Homie
`CONFIG`/`HOMIE_CUSTOM` module pattern.

## Global Constraints

- Phase 1 only. Do not touch `#ov3-ac-card`, `openThermostat`, `closeThermostat`,
  `_renderThermRoom`, or the thermostat overlay markup/logic. All of that is already fixed and
  verified; this plan only adds a new caller.
- Do not de-duplicate the "Main House"/"Office Wing" labels already repeated across `config.js`.
  Add one TODO note to this repo's `README.md` instead.
- New button styling must match `.ov3-wx-launch-btn`/`.ov3-energy-launch-btn` exactly:
  `position:absolute; top:10px; right:10px; width:30px; height:30px;`, the same diagonal-arrows
  SVG icon, `:active { opacity: 0.6 }`.
- Bump `HOMIE_ASSET_VERSION` on deploy and update both the Lovelace iframe token and the version
  test; reusing an unchanged token serves browsers a stale cached file (the `.12` lesson from the
  thermostat fix).
- Take a timestamped backup of the live Homie directory before deploying, per this fork's
  established deployment discipline.
- Do not stage, commit, or push until pde separately authorizes it, per this project's standing
  convention (overrides this skill's default per-task commit step; TDD steps still apply, commits
  do not happen until the end).

---

### Task 1: Add the `floorThermostatEntity` helper

**Files:**
- Modify: `dist/homie-custom.js`
- Test: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: an array of floor entries shaped `{ label: string, entity?: string, sensors: [...] }`
  and an index.
- Produces: `HOMIE_CUSTOM.floorThermostatEntity(floors, index)` returning the entity string or
  `null`.

- [ ] **Step 1: Write the failing test**

Add to `test/screen-a.test.cjs`, near the other thermostat tests:

```js
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/screen-a.test.cjs`
Expected: FAIL with `custom.floorThermostatEntity is not a function`.

- [ ] **Step 3: Implement the helper**

In `dist/homie-custom.js`, add near `filterThermostats`:

```js
function floorThermostatEntity(floors, index) {
  const list = Array.isArray(floors) ? floors : [];
  const floor = list[index];
  return floor && floor.entity ? floor.entity : null;
}
```

Add `floorThermostatEntity` to the module's returned object (alphabetical position, next to
`filterThermostats`).

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/screen-a.test.cjs`
Expected: PASS, all other existing tests still passing (37/37 baseline plus this one).

---

### Task 2: Wire the expand button into the floors card

**Files:**
- Modify: `dist/homie-dashboard.html:5679` (`.ov3-floors-card` CSS block, add sibling rule)
- Modify: `dist/homie-dashboard.html:8234-8242` (`.ov3-floors-card` markup)
- Modify: `dist/homie-dashboard.html:18260-18321` (`_buildOv3FloorsCard` and friends)
- Modify: `dist/config.js` (`floorSensors` entries)
- Test: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: `HOMIE_CUSTOM.floorThermostatEntity` (Task 1), the existing `openThermostat(entityId)`.
- Produces: `.ov3-floors-launch-btn` (DOM), `_openFloorsThermostat()` (global function),
  `_ov3FloorsActiveIndex` and `_ov3FloorsList` (module-level state other code does not need to
  touch).

- [ ] **Step 1: Write the failing markup test**

Add to `test/screen-a.test.cjs`, near the existing "Overview C uses the Now Playing icon" test:

```js
test("Overview C floors card has an expand button wired to the visible floor's thermostat", () => {
  const source = fs.readFileSync(path.join(workDir, "homie-dashboard.html"), "utf8");
  const cardStart = source.indexOf('class="ov3-floors-card"');
  const cardMarkup = source.slice(cardStart, source.indexOf("<!-- Purifier card", cardStart));

  assert.match(cardMarkup, /ov3-floors-launch-btn/);
  assert.match(cardMarkup, /onclick="_openFloorsThermostat\(\)"/);
  assert.match(source, /function _openFloorsThermostat\(\)/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/screen-a.test.cjs`
Expected: FAIL, none of the matched strings exist yet.

- [ ] **Step 3: Add the CSS**

In `dist/homie-dashboard.html`, immediately after the `.ov3-floors-card { ... }` block (around
line 5691):

```css
  .ov3-floors-launch-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    z-index: 2;
  }
  .ov3-floors-launch-btn:active { opacity: 0.6; }
```

- [ ] **Step 4: Add the button markup**

In the `.ov3-floors-card` div (around line 8234), add the button as the first child, matching the
weather card's icon markup exactly:

```html
        <!-- Floors card (2nd) -->
        <div class="ov3-floors-card" id="ov3-floors-card">
          <!-- Launch icon — top right -->
          <button class="ov3-floors-launch-btn" onclick="_openFloorsThermostat()" title="Open Thermostat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
          <div class="ov3-floors-header">
            <div class="ov3-floors-active-name" id="ov3-floors-active-name"></div>
          </div>
          <div class="ov3-floors-scroll" id="ov3-floors-scroll">
            <!-- populated by _buildOv3FloorsCard() -->
          </div>
          <div class="ov3-floors-dots" id="ov3-floors-dots"></div>
        </div>
```

- [ ] **Step 5: Track the visible floor and add the open function**

In `dist/homie-dashboard.html`, near the top of the "OV3 FLOORS CARD" section (around line 18260),
add module-level state alongside the existing comment block:

```js
let _ov3FloorsList = [];
let _ov3FloorsActiveIndex = 0;
```

In `_buildOv3FloorsCard`, after computing `floors` (the filtered array), assign it to the tracked
list and reset the index:

```js
  _ov3FloorsList = floors;
  _ov3FloorsActiveIndex = 0;
```

In the same function's scroll-spy listener, where it currently computes `idx` and updates the DOM,
also store it:

```js
  scroll.addEventListener("scroll", () => {
    const w = scroll.offsetWidth;
    if (!w) return;
    const idx = Math.round(scroll.scrollLeft / w);
    _ov3FloorsActiveIndex = idx;
    floors.forEach((_, fi) => {
```

(This inserts one new line, `_ov3FloorsActiveIndex = idx;`, immediately after the existing
`const idx = Math.round(scroll.scrollLeft / w);` line and before the existing
`floors.forEach((_, fi) => {` line. Everything else in the listener, the dot/name updates, is
unchanged.)

After `_ov3FloorsScrollTo`, add:

```js
function _openFloorsThermostat() {
  const entity = HOMIE_CUSTOM.floorThermostatEntity(_ov3FloorsList, _ov3FloorsActiveIndex);
  if (!entity) return;
  openThermostat(entity);
}
```

- [ ] **Step 6: Add the `entity` field in `config.js`**

In `dist/config.js`'s `floorSensors` array, add an `entity` field to the "Main House" and "Office
Wing" entries (leave "Solar" untouched):

```js
    {
      label: "Main House",
      entity: "climate.casasolar_south_zone_1",
      sensors: [
```

```js
    {
      label: "Office Wing",
      entity: "climate.casasolar_north_zone_1",
      sensors: [
```

- [ ] **Step 7: Run the tests and syntax checks**

Run:

```sh
node --test test/screen-a.test.cjs
node --check dist/homie-custom.js
node --check dist/config.js
```

Expected: all tests PASS (baseline plus the two new ones), both syntax checks clean.

---

### Task 3: Version bump and documentation

**Files:**
- Modify: `dist/homie-dashboard.html` (`HOMIE_ASSET_VERSION`)
- Modify: `test/screen-a.test.cjs` (version assertion)
- Modify: `docs/pdehlke-customizations.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks; this is documentation and cache-busting bookkeeping.

- [ ] **Step 1: Bump the release token**

In `dist/homie-dashboard.html`, change `const HOMIE_ASSET_VERSION = "20260807.13";` to
`"20260807.14"`.

In `test/screen-a.test.cjs`, change the version assertion from `"20260807.13"` to `"20260807.14"`.

- [ ] **Step 2: Run the version test**

Run: `node --test test/screen-a.test.cjs`
Expected: PASS.

- [ ] **Step 3: Update the customizations doc**

In `docs/pdehlke-customizations.md`'s "Behavior Changes" bullet list, add:

```
- add an expand button to Overview C's floors card, opening the thermostat overlay filtered to
  whichever floor (Main House or Office Wing) is currently visible
```

- [ ] **Step 4: Add the README TODO**

`README.md` is upstream's project README (badges and links point at
`Big-Edge2297/homie-dashboard`), with no existing TODO or known-issues section. Add a new,
clearly fork-scoped section at the end of the file rather than folding this into upstream content:

```markdown
## pde Fork Notes

- The "Main House"/"Office Wing" labels are duplicated independently across `config.js`'s status
  grid, `floorSensors`, and Climate control sections (and now the floors card's `entity` field
  too). Candidate for a single source of truth once there is time for that refactor.
```

- [ ] **Step 5: Final local verification**

Run:

```sh
node --test test/screen-a.test.cjs
node --check dist/homie-custom.js
git diff --check
git status --short
```

Expected: tests PASS, no whitespace errors, only the intended files modified/untracked.

---

### Task 4: Deploy and verify live

**Files:**
- None (deployment and verification only).

**Interfaces:**
- Consumes: the tested, version-bumped assets from Tasks 1-3.
- Produces: a live, verified `20260807.14` deployment and a report back to pde. No commit.

- [ ] **Step 1: Back up the live Homie directory**

Over SSH to `root@homeassistant.local:2222` using `/Users/pde/tmp/homie-ha-edit-key`, create a
timestamped backup of `/config/www/community/homie-dashboard/` under `/config/backups/`.

- [ ] **Step 2: Deploy the changed assets**

Upload `dist/homie-dashboard.html`, `dist/homie-custom.js`, and `dist/config.js` by temporary name
and atomically rename into place. `config.js` needs the real `HA_TOKEN` injected from
`/Users/pde/tmp/homie-dashboard-token` in place of the placeholder before upload, exactly as prior
deployments have done; never print that token. Check for and delete a stale `config.js.gz` if one
exists after this upload; none exists as of this plan, but upstream requires removing it whenever
`config.js` changes.

- [ ] **Step 3: Bump the Lovelace iframe token**

Over the WebSocket API, read and back up the `homie-dash` Lovelace config, then change its iframe
URL's version query from `20260807.13` to `20260807.14`. Confirm `vision-sample` is untouched.

- [ ] **Step 4: Verify live**

Confirm the live `homie-dashboard.html` and `homie-custom.js` are byte-identical to the working
tree, and the Lovelace config reports `20260807.14`.

- [ ] **Step 5: Verify via browser**

Using the same redaction-safe Playwright pattern as the thermostat fix (a Python-generated storage
state, redacted output, never printing the admin token or the Homie token): navigate to Overview C,
confirm the floors card's expand button opens the thermostat overlay filtered to Main House only,
close it, swipe or scroll the floors card to Office Wing, tap the expand button again, and confirm
the overlay now opens filtered to Office Wing only. Screenshot both.

- [ ] **Step 6: Report and stop**

Report the diff, test results, and both screenshots to pde. Do not stage, commit, or push until he
separately authorizes it.
