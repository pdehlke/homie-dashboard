# Homie Dashboard verification map

Maintained source for verifying Homie Dashboard's user-facing behavior. Read
[../SKILL.md](../SKILL.md) first for Launch/Doctor/Drive/Evidence/Cleanup,
then use the matching feature file below as the recipe.

## Baseline preconditions

- `python3 ../scripts/doctor.py` passes (live assets match `dist/`).
- `$HA_TOKEN` (admin), `$HOMIE_TOKEN` (the `Homie Dashboard` non-admin
  account) are set and authenticate — doctor checks `$HA_TOKEN`; see
  SKILL.md's Drive section for `$HOMIE_TOKEN`.
- `playwright-cli` reachable (`npx playwright-cli` after a local
  `npm install @playwright/cli@latest`, or a project install already on
  PATH).
- There is exactly one instance. No disposable data directory, no seeding —
  every recipe below drives the real house. Read a feature's Gotchas before
  running anything that toggles a real device.

## Driving conventions

- Prefer the direct-file load (`homie-dashboard.html?v=<version>`, no HA
  login) unless the feature specifically needs a same-origin HA session —
  see SKILL.md's Drive section for which features do.
- Generate storage-state with `make-auth-state.py`, load it with
  `state-load`, and delete the file the moment the session closes.
- Prefer a real backing entity's `GET /api/states/<id>` read over trusting
  the screenshot alone, wherever a feature's table below names one.
- Restore anything you toggle. If a feature's proof requires leaving state
  changed, say so in that feature file's Gotchas, not silently.

## Proof and skip reporting

- Capture the screenshot and, where a backing entity exists, the API read
  that confirms it, not the screenshot alone.
- Record which account (`Pete` / admin via `$HA_TOKEN`, or `Homie Dashboard`
  via `$HOMIE_TOKEN`) and which load mode (direct file vs. full Lovelace
  path) produced each artifact — several features render differently by
  account.
- Report an unreachable feature with the exact command attempted and what
  failed (auth, missing entity, doctor failure) rather than skipping
  silently.
- Do not report a feature verified through a path other than the one its
  file names, even if the result looks the same.

## Feature entry contract

Each feature file has an H1 title, one paragraph on the user-visible
behavior, then exactly four H2 sections: `Sub-features`,
`How to get to it (user POV)`, `Driving it with playwright-cli`, `Gotchas`.

## Features

- [Overview A status grid](overview-a-status-grid.md) — the home screen's
  live status grid and Solar pill. No login required to prove; safest
  starting point, read-only throughout.
- [Music chip](music-chip.md) — six Music Assistant radio presets on the
  Crestron player, routed through Harmony. Mutating: starts real audio.
- [Climate chip](climate-chip.md) — opens Home Assistant's real native
  climate dialog for the Lennox thermostats via cross-frame same-origin
  dispatch. Read path is non-mutating; the dialog's own controls do move
  real setpoints if used.
- [NAS chip](nas-chip.md) — admin-only Synology health overlay, strictly
  read-only, the clearest case of per-account rendering differences.
- [Scenes chip](scenes-chip.md) — refilled 2026-09-03 with the first real scene, "Dinner",
  script-backed (`script.scene_dinner`) rather than an HA `scene.*` snapshot. Mutating: turns on
  real lights and starts real audio.
