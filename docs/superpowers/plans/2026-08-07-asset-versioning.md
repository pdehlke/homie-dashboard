# Homie Asset Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure kiosk browsers always load a mutually compatible Homie HTML, config, and helper release.

**Architecture:** Define release token `20260807.6` in the HTML, dynamically load config and helper scripts with that token, and update the supported Lovelace iframe strategy to the same token. Make chart failures visible.

**Tech Stack:** Static HTML/JavaScript, Node.js tests, Home Assistant Lovelace WebSocket API.

## Global Constraints

- Do not edit Home Assistant source or `.storage` directly.
- Do not modify the Home dashboard or tablet navigation.
- Preserve the live token without displaying or committing it.
- Back up Homie assets and the Homie Lovelace config before deployment.
- Leave changes uncommitted until explicitly requested.

---

### Task 1: Version all Homie cache boundaries

**Files:**
- Modify: `dist/homie-dashboard.html`
- Modify: `test/screen-a.test.cjs`

**Interfaces:**
- Produces: `HOMIE_ASSET_VERSION = "20260807.6"` and versioned `config.js`/`homie-custom.js` loads.

- [ ] Add a failing test that extracts the token and asserts both script URLs use it.
- [ ] Run `node --test test/screen-a.test.cjs`; expect failure on unversioned URLs.
- [ ] Replace static dependency tags with ordered versioned loading from the single token.
- [ ] Run the tests; expect all tests to pass.

### Task 2: Expose chart request failures

**Files:**
- Modify: `dist/homie-dashboard.html`
- Modify: `test/screen-a.test.cjs`

**Interfaces:**
- Produces: `_sfsChartMessage(message)` and visible `History unavailable` feedback when neither history series loads.

- [ ] Add a failing test for visible error-state behavior.
- [ ] Run the test and confirm it fails because fetch errors are silently converted to `null`.
- [ ] Preserve the first fetch error and show `History unavailable`; keep `No history yet` for successful empty histories.
- [ ] Run the complete test suite, `node --check dist/homie-custom.js`, and `git diff --check`.

### Task 3: Deploy through supported interfaces

**Files:**
- Deploy: `dist/homie-dashboard.html`, `dist/config.js`, `dist/homie-custom.js`
- Update through API: Lovelace dashboard `homie_dash`

**Interfaces:**
- Produces: iframe URL `/local/community/homie-dashboard/homie-dashboard.html?v=20260807.6`.

- [ ] Read and back up the current Homie Lovelace config through the API; create a new Homie directory backup.
- [ ] Deploy token-preserving Homie files.
- [ ] Update only `homie_dash` through the Lovelace WebSocket API.
- [ ] Verify the API returns the versioned iframe URL and HTTP requests for all three versioned assets return the deployed content.
- [ ] Re-run all tests and report the uncommitted status for visual review.
