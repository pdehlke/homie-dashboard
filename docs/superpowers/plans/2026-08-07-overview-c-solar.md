# Overview C Solar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate Overview C and the full-screen Solar view with accurate Sense and Electricity Maps data.

**Architecture:** Add explicit solar data roles to `CONFIG.solar.stats`, put reusable unit/sign/low-carbon transformations in `homie-custom.js`, and make both Solar renderers consume those roles. Simplify the full-screen diagram to Solar, Home, and Grid, and use one hourly-average algorithm for both instantaneous power histories.

**Tech Stack:** Static HTML/CSS/JavaScript, Home Assistant REST/history APIs, Node.js built-in test runner.

## Global Constraints

- Positive grid values mean import; negative grid values mean export.
- `Net Today` shows an explicit sign and one decimal place in kWh.
- Remove the battery UI; retain the unbound inverter-temperature placeholder.
- Low Carbon is `100 - fossil fuel percentage`; CO2 Intensity uses the Electricity Maps sensor directly.
- The hourly chart shows average power in kW, not energy in kWh.
- Do not modify the Home dashboard or tablet top navigation.
- Do not expose or commit the live Home Assistant token.
- Back up the live Homie directory before deployment.
- Leave implementation changes uncommitted until explicitly requested.

---

### Task 1: Solar configuration and value semantics

**Files:**
- Modify: `dist/config.js`
- Modify: `dist/homie-custom.js`
- Modify: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: Home Assistant state objects with `state` and `attributes.unit_of_measurement`.
- Produces: `HOMIE_CUSTOM.powerKw`, `signedValue`, `gridDirection`, and `lowCarbonPercentage`.

- [ ] **Step 1: Write failing configuration and transformation tests**

Assert that `CONFIG.solar.stats` maps these exact roles and entities:

```js
[
  ["live-consumption", "sensor.sense_287516_energy"],
  ["solar", "sensor.sense_287516_production"],
  ["export", "sensor.homie_grid_flow"],
  ["daily-consumption", "sensor.sense_287516_daily_energy"],
  ["monthly-kwh", "sensor.sense_287516_monthly_energy"],
  ["net-today", "sensor.sense_287516_daily_net_production"],
  ["fossil-percentage", "sensor.electricity_maps_grid_fossil_fuel_percentage"],
  ["co2-intensity", "sensor.electricity_maps_co2_intensity"],
  ["solar-temp", ""],
]
```

Assert these literal transformation results:

```js
assert.equal(custom.powerKw({ state: "3354", attributes: { unit_of_measurement: "W" } }), 3.354);
assert.equal(custom.powerKw({ state: "-2.1", attributes: { unit_of_measurement: "kW" } }), -2.1);
assert.equal(custom.powerKw({ state: "unavailable", attributes: {} }), null);
assert.equal(custom.signedValue(6.4, 1), "+6.4");
assert.equal(custom.signedValue(-0.7, 1), "-0.7");
assert.deepEqual(custom.gridDirection(-2.1), { label: "Export", magnitude: 2.1, mode: "export" });
assert.deepEqual(custom.gridDirection(1.2), { label: "Import", magnitude: 1.2, mode: "import" });
assert.deepEqual(custom.gridDirection(0), { label: "Grid", magnitude: 0, mode: "neutral" });
assert.equal(custom.lowCarbonPercentage(73.52), 26.48);
assert.equal(custom.lowCarbonPercentage(120), null);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/screen-a.test.cjs`

Expected: FAIL because the solar roles and transformation functions do not exist.

- [ ] **Step 3: Implement the minimal configuration and pure functions**

Add the exact role mappings above. Implement strict numeric parsing, W-to-kW conversion, explicit signed formatting, house-centric direction classification with a `0.01 kW` neutral threshold, and low-carbon validation restricted to `0..100`.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test test/screen-a.test.cjs`

Expected: all tests PASS.

---

### Task 2: Overview C Solar card

**Files:**
- Modify: `dist/homie-dashboard.html`
- Modify: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: Task 1 solar roles and `HOMIE_CUSTOM` transformations.
- Produces: `_updateOv3EnergyCard()` rendering live demand, signed daily net, solar production, and directional grid flow.

- [ ] **Step 1: Write a failing renderer contract test**

Extract the inline script into a VM test context with controlled cached states and DOM elements. Invoke `_updateOv3EnergyCard()` and assert:

```js
assert.equal(elements["ov3-energy-live"].textContent, "1269");
assert.equal(elements["ov3-energy-today"].textContent, "+6.4 kWh");
assert.equal(elements["ov3-energy-solar"].textContent, "3.35 kW");
assert.equal(elements["ov3-energy-grid-label"].textContent, "Export");
assert.equal(elements["ov3-energy-grid"].textContent, "2.10 kW");
```

Also assert unavailable inputs produce `—` and reset the grid label to `Grid` and its color to the neutral value.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/screen-a.test.cjs`

Expected: FAIL because Overview C still reads `power` as Today's Usage and lacks `net-today` formatting.

- [ ] **Step 3: Implement the Overview C renderer**

Change the lower-left label from `Today` to `Net Today`. Use `live-consumption`, `net-today`, `solar`, and `export`, delegating conversions and direction semantics to `HOMIE_CUSTOM`.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test test/screen-a.test.cjs`

Expected: all tests PASS.

---

### Task 3: Full-screen Solar data and layout

**Files:**
- Modify: `dist/homie-dashboard.html`
- Modify: `test/screen-a.test.cjs`

**Interfaces:**
- Consumes: Task 1 roles and transformations.
- Produces: three-node flow diagram, real consumption/environmental stats, retained inverter placeholder, and hourly average-power chart.

- [ ] **Step 1: Write failing full-screen behavior tests**

Assert the rendered markup has no battery node, battery stat, charge label, or battery paths; retains `sfs-stat-temp`; labels the repurposed cards `Low Carbon` and `CO2 Intensity`; and labels the chart `HOURLY AVERAGE POWER` with a `kW` axis.

Exercise `_sfsRefresh()` with controlled states and assert live usage, daily usage, monthly usage, low-carbon percentage, CO2 intensity, solar/home/grid nodes, inverter `—`, and import/export animation states. Assert negative grid flow activates Solar-to-Grid and positive grid flow activates Grid-to-Home.

Exercise the chart history aggregator with literal instantaneous readings and assert both production and load are averaged and converted from W to kW.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/screen-a.test.cjs`

Expected: FAIL on the battery markup, cost cards, reversed flow sign, and mixed chart algorithms.

- [ ] **Step 3: Implement the full-screen view**

Remove battery SVG/UI paths and battery refresh logic. Replace cost cards with Low Carbon and CO2 Intensity. Bind daily/monthly consumption roles, preserve the empty inverter role, correct import/export animations and arrows, and use `fetchHourlyAvg` for both solar and demand histories. Rename chart text and axis units to average power in kW.

- [ ] **Step 4: Run complete local verification**

Run: `node --test test/screen-a.test.cjs`

Expected: all tests PASS.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

Run: `node --check dist/homie-custom.js`

Expected: exit 0.

---

### Task 4: Safe live deployment

**Files:**
- Deploy: `dist/config.js` with the live token preserved
- Deploy: `dist/homie-custom.js`
- Deploy: `dist/homie-dashboard.html`

**Interfaces:**
- Consumes: verified fork artifacts and the current live token-bearing `config.js`.
- Produces: live Overview C and full-screen Solar views with a recoverable backup.

- [ ] **Step 1: Verify live prerequisites**

Confirm the target directory exists, the proposed backup path does not, and the live `config.js` contains a token while the Git version contains only `YOUR_LONG_LIVED_ACCESS_TOKEN`.

- [ ] **Step 2: Create the backup**

Copy `/config/www/community/homie-dashboard` to `/config/backups/homie-dashboard-overview-c-solar-20260807-before`.

- [ ] **Step 3: Build a token-preserving deployment config**

Copy the tracked `dist/config.js` to a temporary file, replace only `YOUR_LONG_LIVED_ACCESS_TOKEN` with the existing live token, and verify the temporary file contains exactly one non-placeholder token assignment without printing it.

- [ ] **Step 4: Deploy the three changed artifacts**

Upload the token-preserving temporary `config.js`, `homie-custom.js`, and `homie-dashboard.html` to the live Homie directory.

- [ ] **Step 5: Verify deployment integrity**

Compare local/live hashes for `homie-custom.js` and `homie-dashboard.html`. Compare a sanitized hash of live `config.js` against tracked `dist/config.js`. Fetch the HTTP-served artifacts with cache-busting query strings and verify their content matches the deployed files.

- [ ] **Step 6: Report for visual review**

Report test totals, the backup path, modified files, and uncommitted Git status. Ask the user to hard-refresh and inspect Overview C and the full-screen Solar view.
