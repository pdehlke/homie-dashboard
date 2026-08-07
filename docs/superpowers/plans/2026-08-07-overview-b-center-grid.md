# Overview B Center Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Overview B render the same four-column, two-row center status grid as accepted Overview A.

**Architecture:** Overview A and Overview B already share the `hero-stats` and `stat` rendering. Remove Overview B's conflicting five-column layout rule so its center grid inherits the accepted shared layout, and protect that relationship with a DOM/CSS regression test.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, Home Assistant static dashboard deployment.

## Global Constraints

- Do not modify the Home Assistant Home dashboard or hide its top navigation.
- Preserve the eight accepted status entries and their live entity bindings.
- Back up the live Homie Dashboard directory before deployment.
- Do not expose or commit the live Home Assistant token.
- Do not commit changes without separate user approval.

---

### Task 1: Share the accepted center-grid layout

**Files:**
- Modify: `test/screen-a.test.cjs`
- Modify: `dist/homie-dashboard.html`

**Interfaces:**
- Consumes: `.hero-stats` shared layout and the `#ov2-stats` element.
- Produces: Overview B inheriting the same four-column grid behavior as Overview A.

- [ ] **Step 1: Write the failing test**

Add a test that loads `dist/homie-dashboard.html`, extracts the relevant CSS rules, and verifies that `.hero-stats` defines four columns while `.ov2-stats` does not independently define `grid-template-columns`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/screen-a.test.cjs`

Expected: FAIL because `.ov2-stats` currently specifies `repeat(5, 1fr)`.

- [ ] **Step 3: Write the minimal implementation**

Remove only `grid-template-columns: repeat(5, 1fr);` from the `.ov2-stats` rule. Retain its width, pointer-event, and alignment declarations.

- [ ] **Step 4: Run verification**

Run: `node --test test/screen-a.test.cjs`

Expected: all tests PASS.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 5: Deploy and verify**

Create a new timestamped backup under `/config/backups/`, deploy only `dist/homie-dashboard.html`, hard-refresh the Homie dashboard, and confirm Overview B displays the same 4 by 2 center grid as Overview A.

- [ ] **Step 6: Leave the change uncommitted**

Report the modified files and live backup path. Wait for explicit commit approval.
