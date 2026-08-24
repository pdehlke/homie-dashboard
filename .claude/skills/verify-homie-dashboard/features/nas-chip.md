# NAS chip

An admin-only chip on the bottom control row opens an overlay reproducing
the native Synology health dashboard: a four-state health hero, capacity and
temperature tiles, a health-checks list, system context, and a conditional
Open DSM link. Strictly read-only — nothing in the overlay calls a service.
Visibility is gated by a live cross-frame read of the real logged-in HA
user's admin flag (`isAdminViewer()`), re-checked every refresh, not a
device-level toggle. This is the clearest feature for proving Homie renders
differently per account, since the chip is never removed from
`CONFIG.controls` — only hidden via a CSS class.

## Sub-features

- `nas-visible` — `Pete` (admin) sees the chip; `Homie Dashboard`
  (non-admin) does not.
- `nas-overlay` — opening it shows the same data a direct read of the
  Synology entities would show.
- `nas-glow` — a hardcoded needs-attention color, not the active theme's
  accent, so Attention/Critical can't render as reassuring green under any
  theme.
- `nas-scroll` — the overlay scrolls internally rather than overflowing a
  vertically centered popup (every NAS row renders expanded at once, unlike
  the accordion-style Lights/Irrigation popups — this overflowed off the top
  edge before the 2026-08-17 fix).

## How to get to it (user POV)

- Bottom chip row, "NAS" chip — visible only when logged in as an admin
  account.
- Requires the full Lovelace path (`/homie-dash/0`) with a real HA session;
  admin-ness is read from the parent frame, so the direct-file load can
  never show this chip regardless of which token drove it.

## Driving it with playwright-cli

Preconditions:

- `doctor.py` passes.
- Two sessions if proving `nas-visible` both ways: one with `$HA_TOKEN`
  (admin), one with `$HOMIE_TOKEN` (non-admin).

- **Admin session: chip visible.**

  ```bash
  python3 ../scripts/make-auth-state.py HA_TOKEN /tmp/pete-auth-state.json
  playwright-cli -s=admin open
  playwright-cli -s=admin state-load /tmp/pete-auth-state.json
  playwright-cli -s=admin goto "https://hass.ehlke.net/homie-dash/0"
  playwright-cli -s=admin eval "() => document.querySelector('.chip-nas')?.classList.contains('chip-hidden')"
  ```

  Expect `false` (visible). `.chip-nas` is the chip's real class, set by
  `buildControls()`'s `chipClass()`; `chip-hidden` is appended only when
  `isAdminViewer()` reads false (`dist/homie-dashboard.html`, confirmed in
  source 2026-08-23). There is no `data-chip` attribute — don't invent one.

- **Non-admin session: chip hidden.**

  ```bash
  python3 ../scripts/make-auth-state.py HOMIE_TOKEN /tmp/homie-auth-state.json
  playwright-cli -s=nonadmin open
  playwright-cli -s=nonadmin state-load /tmp/homie-auth-state.json
  playwright-cli -s=nonadmin goto "https://hass.ehlke.net/homie-dash/0"
  playwright-cli -s=nonadmin eval "() => document.querySelector('.chip-nas')?.classList.contains('chip-hidden')"
  ```

  Expect `true` (hidden).

- **Open the overlay (admin session) and cross-check.** Click the chip,
  screenshot, and compare the hero/capacity numbers against a direct read of
  the Synology entities (see the sibling `homeassistant` repo's
  `docs/synology-nas/synology-nas-dashboard.md` for which entities back
  which tile).

  ```bash
  playwright-cli -s=admin screenshot --filename=../evidence/nas-overlay.png
  ```

- **Cleanup.** `playwright-cli close-all`,
  `rm -f /tmp/pete-auth-state.json /tmp/homie-auth-state.json`.

## Gotchas

- The chip's index in `CONFIG.controls` never changes between accounts —
  only the `chip-hidden` class does. Don't assert on chip *position* to
  prove visibility.
- `isAdminViewer()` fails closed on any uncertainty (per its own test
  coverage) — if a session's admin state can't be read, the chip should
  hide, not show. Treat an unexpectedly-hidden chip on an admin session as
  worth investigating, not immediately as a false positive.
- This is one of the few chips with no direct-file equivalent at all, not
  even a degraded one — there's no parent frame, so `isAdminViewer()` has
  nothing to read and the chip stays hidden regardless of which token was
  used.
