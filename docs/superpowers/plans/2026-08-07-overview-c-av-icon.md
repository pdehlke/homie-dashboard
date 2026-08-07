# Overview C A/V Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Overview C's incorrect A/V switch icon with the established Now Playing icon.

**Architecture:** Add an action-based override at the start of the existing sidebar icon resolver.
Retain domain inference for every other control.

**Tech Stack:** Static HTML/JavaScript, Node.js built-in test runner, Home Assistant Lovelace iframe.

## Global Constraints

- Match `media_browser` semantically, not by the `A/V` label.
- Reuse the existing circle-and-play Now Playing artwork.
- Do not change the A/V click action or other sidebar controls.
- Deploy through supported interfaces and preserve the installed token.

---

### Task 1: Semantic A/V icon

**Files:**
- Modify: `test/screen-a.test.cjs`
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/pdehlke-customizations.md`

**Interfaces:**
- Consumes: `_sbIcon(ctrl)` and `ctrl.action`
- Produces: circle-and-play SVG for `media_browser`

- [ ] Add a failing source regression test for the semantic action override and play artwork.
- [ ] Run `node --test test/screen-a.test.cjs` and confirm the new assertion fails.
- [ ] Add the minimal action override before domain inference.
- [ ] Document the corrected Overview C sidebar behavior.
- [ ] Run all tests, JavaScript syntax validation, and `git diff --check`.

### Task 2: Cache-safe deployment

**Files:**
- Modify: `dist/homie-dashboard.html`
- Modify: `docs/superpowers/specs/2026-08-07-asset-versioning-design.md`
- Modify: `docs/superpowers/plans/2026-08-07-asset-versioning.md`

**Interfaces:**
- Produces: release `20260807.5`

- [ ] Change the version test to `20260807.5` and confirm it fails on the previous release.
- [ ] Update the HTML and current version documentation.
- [ ] Back up and deploy the validated bundle while preserving its live token.
- [ ] Update `homie-dash` through `lovelace/config/save` and verify the served icon markup.
- [ ] Leave all changes uncommitted.
