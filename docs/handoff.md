# Handoff: upstream v5.0.0 merge

Updated 2026-11-09.

## Where things are

- Worktree `/Users/pde/src/github.com/pdehlke/homie-dashboard-v5`, local branch `merge/v5.0.0`.
  Nothing is pushed and nothing is deployed.
  - `0f05bac` holds the v4.3.0 Alarm port that was sitting uncommitted in the main checkout.
    The content is unchanged; it was copied via `git diff` (patch sha1 `c8089bc6…`).
  - `ac708c3` is the merge of `upstream/main` (`5683565`, tag `v5.0.0`).
- The main checkout (`/Users/pde/src/github.com/pdehlke/homie-dashboard`, `main` at `037e765`)
  is untouched, with its four uncommitted Alarm-port files still there. Once `merge/v5.0.0` is
  accepted those changes are redundant: they are in `0f05bac`.

## Last verified step

- `node --test test/` in the worktree: 201 pass, 0 fail. That includes 4 new tests for the v5
  import and the wizard round trip; all 4 fail against upstream's unpatched `setup.html`.
- Local headless render (Chromium via playwright-cli). A fake panel parent page supplied
  `window.homieBridge` with the imported config. `index.html` booted with no JS exceptions:
  `DASHBOARD_VERSION` 5.0.0, `WS_URL` derived from the origin, all eight fork chips, and Screen A
  with Steel Blue and the 12-hour clock. The only errors were the expected WebSocket/REST 404s,
  because no HA was behind it.
- The same harness drove the real `setup.html`: Choose config.js… → `config/config.js` → Save.
  The saved payload equals the expected import exactly, plus `calendarDashboard`.
- Gitleaks pre-commit hook: no leaks.

Not verified: anything against the real Home Assistant. Integration install, panel load, session
auth, the tablet.

## Exact next action

Decide how the integration reaches HA, then cut over:

1. Copy `custom_components/homie_dashboard/` to `/config/custom_components/homie_dashboard/` on
   the HA host. SFTP matches how v4 was deployed. HACS (type Integration) would need
   `merge/v5.0.0` on `origin/main` first.
2. Restart HA. Then Settings → Devices & services → Add integration → Homie Dashboard.
3. Open the Homie panel as an admin. In the wizard: Choose config.js… → upload this repo's
   `config/config.js` (not the auto-detected live copy, which may be stale) → Review → Save.
4. Check it with the verify skill's approach adapted to the panel URL `/homie-dashboard`. The skill
   itself still describes v4 (it now carries a banner saying so) and needs a rewrite after cutover.
5. After cutover: remove `/config/www/community/homie-dashboard/` (its `config.js` holds the
   live long-lived token and is web-readable), remove the old HACS Dashboard entry and Lovelace
   resource, and revoke that token.

## Open uncertainty

- **Tablet presentation.** v5 renders as an HA sidebar panel. The Fire HD 10 currently uses the
  `homie-dash` Lovelace iframe dashboard with a `kiosk_mode` block that hides HA's header and
  sidebar for the `Homie Dashboard` user. I have not verified whether kiosk-mode can hide chrome on
  a custom panel. If it cannot, the HA sidebar takes width away from Overview C's 1280x800 layout.
  The dashboard only signs in when the panel is its parent: `window.homieBridge` is defined by
  `panel.js`. So pointing the old Lovelace iframe at `/homie_dashboard_static/index.html` shows
  "Open Homie Dashboard from Home Assistant" instead.
- **Which account calls HA.** v4 sent every WebSocket/REST call as the dedicated account whose
  token was in `config.js`. v5 uses the session of whoever is logged in to HA. On the tablet that
  is still the `Homie Dashboard` user. For an admin viewing the panel, calls now run as that admin.
  `isAdminViewer()` (NAS chip) already read the parent session, and still works under the panel.
- **Saving needs an admin.** `homie_dashboard/set_config` requires admin, so config can't be
  edited from the non-admin tablet account.
- **Wizard schema.** Only Lights is wizard-managed now. Picking new scenes in the wizard's Scenes
  step would add a second, upstream-format Scenes chip next to the fork's. Edit scenes in
  `config/config.js` and re-import instead.
- **Upstream v4.2.0 features** (Dashboards launcher, Favorites, new Settings, Calendar, Pet Stats
  page, WebRTC cameras) are still not merged, by the same choice made for v4.3.0. The merge commit
  records v5.0.0 as merged, so a later attempt to take them has to be a port by hand. A re-merge
  will not bring them in.

## Do not retry

- Don't let `git merge` auto-resolve `index.html` from the v4.1.1 base: that silently brings in the
  whole v4.2.0 redesign. Future upstream merges should diff from `v5.0.0` (now the merge base),
  which works.
