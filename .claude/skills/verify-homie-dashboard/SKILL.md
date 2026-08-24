---
name: verify-homie-dashboard
description: >
  Drive the real, deployed Homie Dashboard (a wall-tablet Home Assistant
  dashboard: a single homie-dashboard.html plus config.js and homie-custom.js,
  served from hass.ehlke.net and viewed either directly or inside the
  `homie-dash` Lovelace iframe) and prove a chip or screen actually works,
  with screenshots and real entity-state reads. Use before calling any Homie
  change done, after a deploy, or whenever pde wants to see something running
  rather than read a diff.
---

# Verify Homie Dashboard

Homie Dashboard has no dev server and no build step. It is one static HTML
file (`dist/homie-dashboard.html`) plus `dist/config.js` and
`dist/homie-custom.js`, hand-deployed by SFTP to
`/config/www/community/homie-dashboard/` on the live Home Assistant host and
served from there. "Running the app" and "the production instance" are the
same thing — there is no side-by-side staging copy. Verifying against real
entities is fine (see the memory note this repo's agents carry: the house is
real but has no household dependency yet), but every drive touches the one
instance pde and the Fire HD tablet also use. Never leave it in a state a
mutating check put it in — restore anything you change.

## Launch

**Verifying what's already live (no code change):** nothing to launch. Skip
straight to Doctor.

**Verifying a local change in `dist/`:**

1. Run the regression suite: `node --test test/screen-a.test.cjs`. Fix
   failures before deploying; do not deploy on red.
2. Bump `HOMIE_ASSET_VERSION` in `dist/homie-dashboard.html` (cache-busting
   token, `YYYYMMDD.N`) — required whenever any nested file's bytes change,
   not only for releases meant for a person to notice.
3. Back up the live directory, then SFTP the changed file(s) to
   `/config/www/community/homie-dashboard/` by temporary name and atomically
   rename. SSH/SFTP is `root@192.168.4.141:2222` (the Home Assistant VM's own
   LAN address, confirmed live 2026-08-24) — **not** `hass.ehlke.net`, which
   now resolves to the Caddy reverse proxy in front of HA and doesn't speak
   SSH at all; see the sibling `homeassistant` repo's
   `docs/networking/caddy-reverse-proxy.md`. The key is `$HA_EDIT_KEY`.
   The SSH & Web Terminal add-on (`a0d7b954_ssh`) is manual-boot and normally
   stopped — start it first or expect `Connection refused`, not an auth
   failure. Full credential-handling patterns (mode-0600 temp key file,
   deleted in a `finally`) are in this repo's sibling
   `pdehlke/homeassistant` repo at
   `.claude/skills/home-assistant/references/api-access.md`.
4. If `config.js` changed, splice the real token in **on the HA host**, never
   locally — the checked-in copy keeps the `YOUR_LONG_LIVED_ACCESS_TOKEN`
   placeholder. This host's `grep`/`sed` are BusyBox, not GNU; a `grep -P`
   extraction silently returns nothing there (bit the fork once, see
   `docs/homie-scenes-chip.md`'s 2026-08-12 checkpoint in the homeassistant
   repo).
5. Bump the `homie-dash` Lovelace dashboard's iframe `?v=` to match, via
   WebSocket `lovelace/config/save` (back up the prior config first;
   `scripts/apply-card.py` in the sibling repo's home-assistant skill does
   this safely — it refuses to write when its match count is wrong).
6. Run `scripts/doctor.py` (below). It is the read-only version of steps 3-5's
   proof: live bytes match `dist/`, live version matches, live `config.js` has
   a real token.

## Doctor

```bash
python3 .claude/skills/verify-homie-dashboard/scripts/doctor.py
```

Stdlib only, no dependencies to install. Checks, in order: `$HA_TOKEN`
authenticates against `hass.ehlke.net`; live `homie-dashboard.html` and
`homie-custom.js` are byte-identical (SHA-256) to this checkout's `dist/`;
live and local `HOMIE_ASSET_VERSION` match; live `config.js` has a real token
spliced in, not the placeholder. Exit 0 means safe to drive. A checksum
mismatch means `dist/` has local changes not yet deployed — that's Launch's
job, not Drive's.

Real output, run 2026-08-23 against release `20260817.2` (predates the
2026-08-24 Caddy proxy migration; `doctor.py`'s default URL no longer has a
port, see [docs/networking/caddy-reverse-proxy.md](../../../../homeassistant/docs/networking/caddy-reverse-proxy.md)
in the sibling `homeassistant` repo — this transcript is left as captured):

```
Doctor: http://hass.ehlke.net:8123/local/community/homie-dashboard

OK    HA_TOKEN authenticates against http://hass.ehlke.net:8123
OK    homie-dashboard.html: live sha256 d23da2031524.. == local d23da2031524..
OK    homie-custom.js: live sha256 f586739ed347.. == local f586739ed347..
OK    HOMIE_ASSET_VERSION: live='20260817.2' dist='20260817.2'
OK    live config.js has a real token spliced in (placeholder absent)

All checks passed. Safe to drive.
```

Doctor does not check the SSH add-on or the Lovelace iframe version — those
only matter mid-deploy (Launch), not while driving an already-live instance.
To check the add-on state from the sibling `homeassistant` repo:

```bash
cd /Users/pde/src/github.com/pdehlke/homeassistant
export HA_URL=https://hass.ehlke.net
python3 .claude/skills/home-assistant/scripts/haws.py \
  '{"type":"supervisor/api","endpoint":"/addons/a0d7b954_ssh/info","method":"get"}'
```

`"state": "error"` with `"boot": "manual"` is the normal stopped state, not a
break — see that repo's `ssh-addon-manual-boot` memory note.

## Drive

Harness: `playwright-cli` (`npx playwright-cli` if not on PATH; install once
per scratch dir with `npm install @playwright/cli@latest`). There is no
`control-notes`-style wrapper here — use the raw commands.

**Two ways to load the app, pick based on what the feature needs:**

- **Direct file, no HA login.** `https://hass.ehlke.net/local/community/homie-dashboard/homie-dashboard.html?v=<version>`. Homie authenticates its own WebSocket using the token baked into the live `config.js`; the browser never needs an HA session. Use this for anything that is purely Homie's own state (chip toggles, popups, Music Assistant playback) and does not depend on which HA user is "logged in."
- **Full Lovelace path, HA-session-aware.** `https://hass.ehlke.net/homie-dash/0`. This is what the Fire HD tablet actually loads: Homie runs inside HA's own iframe strategy dashboard, `kiosk_mode` hides the outer header/sidebar for the `Homie Dashboard` user, and same-origin cross-frame features (`isAdminViewer()` for the NAS chip, the Climate chip's native `hass-more-info` dialog) only work here, because they read the parent frame's real logged-in `hass.user`. Requires an HA browser session — inject one without ever touching the login form:

```bash
python3 .claude/skills/verify-homie-dashboard/scripts/make-auth-state.py HOMIE_TOKEN /path/to/scratch/homie-auth-state.json   # Homie Dashboard account, non-admin
python3 .claude/skills/verify-homie-dashboard/scripts/make-auth-state.py HA_TOKEN    /path/to/scratch/pete-auth-state.json    # admin account
```

Then, from wherever `playwright-cli` is installed:

```bash
playwright-cli open
playwright-cli state-load /path/to/scratch/homie-auth-state.json
playwright-cli goto "https://hass.ehlke.net/homie-dash/0"
# give it ~7s: weather/solar/background images load late
playwright-cli screenshot --filename=/path/to/evidence/whatever.png
playwright-cli close
```

Verified working 2026-08-24 (this exact sequence, `HOMIE_TOKEN` account, over
HTTPS): loaded, real live data rendered (weather, status grid, solar pill),
zero Mixed Content or WebSocket errors, only the same pre-existing unrelated
console entries (`navigator.vibrate`, the `rss-news-card` duplicate
custom-element warning) prior checkpoints already recorded. This re-proves,
not supersedes, the 2026-08-23 confirmation below. The sequence itself
hasn't changed, only the URL scheme.

Superseded but left for the record: verified working 2026-08-23 (same
sequence, over plain HTTP, before Caddy's automatic HTTPS went live 2026-08-24;
see [docs/networking/caddy-reverse-proxy.md](../../../../homeassistant/docs/networking/caddy-reverse-proxy.md)
in the sibling `homeassistant` repo): loaded, console showed `Homie Dashboard
package initialized successfully.`, screenshot showed real live data (see
`evidence/overview-a-homie-account.png` and the Overview A feature file).

For anything that has to reach inside the DOM directly (reading a chip's
computed state, calling a global function like `musicStationIsOn()`, or
scoping to the Homie iframe specifically rather than the outer HA chrome),
use `playwright-cli eval`/`run-code`. Homie's own functions are defined on
the iframe's `window`, not the outer page's — target the frame, not the top
document, when the full Lovelace path is loaded. When only Homie's own state
matters, prefer the direct-file load instead so there's no frame to find.

Use `-s=<name>` (a named session) if you need `Pete` (admin) and
`Homie Dashboard` (non-admin) sessions open at once, e.g. to prove a chip
renders differently per account the way the NAS chip does.

## Evidence

Screenshots and any raw API reads used as proof go to
`.claude/skills/verify-homie-dashboard/evidence/` (gitignored — this is a
public fork; real house data like weather and thermostat targets shouldn't
land in git history). Name files `<feature>-<what>.png`.

Proof standard for this app, drawn from how every checkpoint in this repo's
sibling `homeassistant` docs has actually verified Homie changes:

- Screenshot the real rendered state, not a mocked one.
- Where the feature has a backing entity, independently read it with
  `GET /api/states/<entity_id>` (using `$HA_TOKEN`) and confirm the two
  agree. This caught real bugs before pde ever saw them (the NAS overlay
  overflow, the Music chip's unavailable-entity flash) — a screenshot alone
  would have missed both.
- For a toggle/mutation (a scene, a light, a station), capture state before
  and after, and restore the prior state unless the whole point was to leave
  it changed. Several past sessions restored a thermostat preset or a scene's
  lights this way; see `docs/homie-scenes-chip.md` and
  `climate-idle-target-fallback.md` in the sibling repo.
- A save/API-success response is not proof by itself — reopen or re-read to
  confirm it actually persisted, the same standard `homie-dashboard-elements.md`
  and the checkpoints already hold every change to.

## Cleanup

- `playwright-cli close` (or `close-all` if multiple sessions were opened).
- Delete every auth-state file `make-auth-state.py` wrote — it holds a live
  token in plaintext. `rm -f` it as soon as the browser session using it is
  closed, not batched at the end.
- Delete any mode-0600 SSH key temp file the same way.
- If this run started the SSH & Web Terminal add-on for a deploy, stop it
  again when done — it's meant to sit stopped between uses.
- Never kill browsers or add-ons by process name; only close/stop what this
  run itself opened or started.
- Do **not** delete anything under `evidence/` during cleanup. That directory
  is the point of the run.

## Helpers

- `scripts/doctor.py` — read-only live-vs-`dist/` check. `python3
  .claude/skills/verify-homie-dashboard/scripts/doctor.py`. No arguments, no
  dependencies beyond the stdlib.
- `scripts/make-auth-state.py` — writes a Playwright storage-state file that
  logs a browser in as a given account without the token ever touching a
  command line. `python3
  .claude/skills/verify-homie-dashboard/scripts/make-auth-state.py <ENV_VAR>
  <output-path>`, e.g. `... HOMIE_TOKEN /tmp/homie-auth-state.json`. Delete
  the output file right after the session that loaded it closes.

## Feature map

See [features/README.md](features/README.md) for the maintained list of
user-facing features, how to reach each one, and how to drive it. Keep it
current as chips and screens change — `/maintain-verification-skill` if one
exists in this harness, otherwise update the relevant feature file by hand in
the same change that touches the feature.
