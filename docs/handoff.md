# Handoff: upstream v5.0.0 merge

Updated 2026-11-10.

## Where things are

- Merged to `main` and pushed, tagged `v5.0.0` on this fork. The `merge/v5.0.0` and
  `feat/alarm-dashboard-v4.3.0` branches are deleted.
- Deployed by SFTP to `/config/custom_components/homie_dashboard/` and running. Manifest version
  `5.0.0.1`, so `panel.js` and `index.html` load under `?v=5.0.0.1`.
- The v5 panel is at `/homie-dash`, titled "Homie Dash". The old Lovelace iframe dashboard was
  recreated at `/homie-dash-v4` ("Homie Dash v4") with an identical config, and the original
  `homie-dash` dashboard was deleted to free the URL. `PANEL_URL_PATH` in `const.py` is the fork
  change that puts v5 there.
- `panel.js` hides HA's sidebar for the `Homie Dashboard` user, and for anyone while
  `input_boolean.homie_native_dialog_open` is on. kiosk-mode cannot do this: its `run()` returns
  early on any page without `ha-panel-lovelace`.
- The `homie` user's per-user default dashboard (`frontend/set_user_data`, key `core`,
  `default_panel`) is `homie-dash`.

## Last verified step

- `node --test test/`: 201 pass.
- Playwright at 1280x800 as `Homie Dashboard`: `/` lands on `/homie-dash`, v5 renders with live
  data, no sidebar; the sidebar returns on `/history` and hides again on return. As an admin the
  sidebar shows, and hides only while the native-dialog helper is on.

Not verified: the Fire HD tablet itself.

## Exact next action

1. pde checks the tablet, including a thermostat opened from the Climate chip.
2. Then retire v4: delete `/config/www/community/homie-dashboard/` (its `config.js` holds the live
   long-lived token and is web-readable), the `homie-dash-v4` dashboard and the HACS Dashboard
   entry, and revoke that token.
3. Rewrite the `verify-homie-dashboard` skill for the v5 panel.

## Open uncertainty

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
  whole v4.2.0 redesign. Future upstream merges should diff from upstream's v5.0.0, `5683565`
  (now the merge base), which works.
- This fork's `v5.0.0` tag is on the fork's merge, not on upstream's `5683565`, which carries the
  same tag name upstream. `git fetch upstream --tags` reports that tag as rejected ("would clobber
  existing tag"); that is expected. Do not force-fetch it over the fork's tag.
