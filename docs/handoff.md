# Handoff: upstream v5.0.0 and v5.1.0 merges

Updated 2026-11-12.

## Where things are

- Merged to `main` and pushed, tagged `v5.0.0` on this fork. The `merge/v5.0.0` and
  `feat/alarm-dashboard-v4.3.0` branches are deleted.
- Upstream v5.1.0 (security release, `b83e9da`) is merged locally as `7e32490`, **not pushed**.
  On top of it, uncommitted: the homie-only sidebar fix in `panel.js` and manifest `5.1.0.1`.
- Deployed by SFTP to `/config/custom_components/homie_dashboard/` as the whole directory, md5
  identical on all 86 files, and running at manifest `5.1.0.1`. The previous directory is backed up
  on the host as `/config/homie_dashboard.bak-20261112-085231.tar.gz`.
- v5.1.0 keeps the alarm code server-side. None is stored here (`alarmCodeSet` false), so arm and
  disarm still go through the fork's `_alarmNeedsCode()` check. If one is ever saved, the tablet's
  non-admin account only gets it with the wizard's "non-administrators may use it" option on.
- The fork's default font, Goudy Bookletter 1911, is bundled in `fonts/` like upstream's ten, so
  the page makes no Google requests.
- The v5 panel is at `/homie-dash`, titled "Homie Dash". The old Lovelace iframe dashboard was
  recreated at `/homie-dash-v4` ("Homie Dash v4") with an identical config, and the original
  `homie-dash` dashboard was deleted to free the URL. `PANEL_URL_PATH` in `const.py` is the fork
  change that puts v5 there.
- `panel.js` hides HA's sidebar for the `Homie Dashboard` user only. kiosk-mode cannot do this:
  its `run()` returns early on any page without `ha-panel-lovelace`. The native-dialog helper no
  longer affects v5; v4's kiosk-mode config still reads it.
- The `homie` user's per-user default dashboard (`frontend/set_user_data`, key `core`,
  `default_panel`) is `homie-dash`.

## Last verified step

- `node --test test/`: 201 pass.
- 2026-11-12, after the v5.1.0 deploy, Playwright at 1280x800 on `/homie-dash`: as `Homie
  Dashboard` the panel renders with live data and no sidebar; as an admin the sidebar shows. Both
  load Goudy from `fonts/` and make zero requests to Google. `/homie_dashboard_media/` returns 404.
  No `homie` entries in the system log.

Not verified: the Fire HD tablet itself.

## Exact next action

1. pde checks the tablet, including a thermostat opened from the Climate chip and arm/disarm.
   Then, on approval, commit the sidebar fix and push `main`.
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
  whole v4.2.0 redesign. Future upstream merges should diff from the last merged upstream
  release, now v5.1.0 `b83e9da` (the merge base), which works.
- This fork's `v5.0.0` tag is on the fork's merge, not on upstream's `5683565`, which carries the
  same tag name upstream. `git fetch upstream --tags` reports that tag as rejected ("would clobber
  existing tag"); that is expected. Do not force-fetch it over the fork's tag.
