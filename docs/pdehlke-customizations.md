# HOME Screen A Customizations

This fork tracks the accepted HOME tablet dashboard derived from upstream
Homie Dashboard v4.1.1.

## Configuration

`dist/config.js` contains the house-specific entity mapping but deliberately
retains `YOUR_LONG_LIVED_ACCESS_TOKEN`. Never commit a populated Home Assistant
token. Deployment must replace the placeholder only in the copy installed on
Home Assistant.

The accepted Screen A configuration provides:

- Main House temperature and humidity from the South thermostat
- Office Wing temperature and humidity from the North thermostat
- Solar generation, whole-house load, and directional grid flow
- Lights, Climate, A/V, and Irrigation controls
- Main House and Office Wing thermostat zones
- Five irrigation zones, retaining Back Yard while its controller is offline
- Classic Gold, Screen A, vivid gradient, and 12-hour browser defaults
- Weather from Home Assistant's `weather.openweathermap` entity in Fahrenheit. Overview C depends
  on OpenWeatherMap's daily response to display five actual future days; Met.no's
  `weather.forecast_home` currently supplies only two future days and is intentionally not used for
  this card.
- Expanded Weather reads sunrise and sunset from `sun.sun`, UV index from
  `sensor.openweathermap_uv_index`, and moon phase from the native Moon integration's
  `sensor.moon_phase` entity.
- AQI and unitless pollutant sub-indices from the Geronimo, Pima County WAQI station

Several `sensor.homie_*` entities are Home Assistant template helpers created
for the dashboard. The alarm helper intentionally reports `Not Configured`
until a real alarm integration replaces it.

## Behavior Changes

`dist/homie-custom.js` isolates fork-specific behavior used by the patched
`dist/homie-dashboard.html`:

- replace Pet Stats with a Lights launcher
- show the unconfigured alarm state without placeholder alarm controls
- route A/V to the Music Assistant browser and player selector
- swap Overview C's Garden and Floors cards while retaining their existing content and behavior
- replace Overview C's inline AC controls with a Main House thermostat launcher (later removed
  once the floors card's expand button provided the same functionality)
- route the bottom Climate control to the dedicated thermostat overlay
- confirm irrigation starts while allowing immediate stops
- render the Screen A status grid as four columns by two rows
- make the Solar condition panel informational rather than interactive
- add an expand button to Overview C's floors card, opening the thermostat overlay filtered to
  whichever floor (Main House or Office Wing) is currently visible
- show the floors card's Target temperature in a 2x2 grid (Temp/Target, Humid/PM2.5) on its main
  faces, and remove the bottom-of-column Main House thermostat launcher card the floors card's
  expand button superseded
- install the accepted presentation defaults once per browser
- remove Solar from the Startup view options (`sm-solar` radio, release `20260808.1`): its
  fullscreen overlay hides the corner close button in favor of gesture-only exit (swipe or
  Escape), so landing there by default on a tablet or wallscreen left no visible way back to
  Settings. A stale `startupMode: "solar"` from before this change now falls through to the
  Overview 1 default instead of reopening the trap. Solar is still reachable from its topbar
  button and the Overview C launch card; only its use as a *default landing view* was removed.
  Solar is still selectable as a Screensaver rotation mode (`ssm-solar`), which has the same
  gesture-only exit and was not in scope for this change.
- remove the pinned Pet Stats button from Overview C's sidebar (`ov3-pet-btn`, release
  `20260808.4`): this house will never have smart pet devices, so a dedicated button for it is a
  waste of the sidebar's limited real estate. `openPetStats()` and its overlay are untouched
  elsewhere in the app; only the sidebar's link to it is gone.
- unfilter Overview C's dynamic sidebar control list (`_buildOv3SidebarControls`, one button per
  `CONFIG.controls` entry, populating `#ov3-sb-controls`): it used to exclude Irrigation and the
  climate/fan domains, on the reasoning that Overview C already shows each as a full card (Main
  House climate, Garden/Irrigation toggles) and didn't need a second entry point. Removed that
  filter on request — it's now Lights, Climate, A/V, and Irrigation, same order as the bottom pill
  row on Overviews A/B, accepting the resulting duplicate click paths into Irrigation and Climate
  as a known, intentional tradeoff rather than an oversight.
- give Climate's sidebar "on" glow (`_refreshOv3SidebarControls`) its own definition of active
  instead of reusing the generic `entityIsOn()`: both real thermostats stay in `heat_cool` mode
  almost all the time, so a plain `state !== "off"` test would leave the glow lit nearly
  permanently. The climate case now reads `hvac_action` and glows only while a zone is actually
  `heating` or `cooling`, the same attribute-over-state preference `thermostatTemperatureView` in
  `homie-custom.js` already uses for the thermostat overlay's displayed target. Every other
  control's glow (Lights, Irrigation) is unchanged.
- pin Security (`ov3-security-btn`, same action as the topbar's `security-btn`) to Overview C's
  sidebar alongside Settings and Modes. It can't be part of the dynamic list above — Security
  isn't a `CONFIG.controls` entry, there's nothing to generate it from.
- give Irrigation its own sidebar icon (release `20260808.5`) instead of the generic `switch`
  glyph every other switch-domain control gets by default, via `_sbIcon`'s existing label-override
  mechanism (the same pattern already used for "bath" in the label). The icon is
  [`material-symbols:sprinkler-rounded`](https://icon-sets.iconify.design/material-symbols/sprinkler-rounded/)
  (Material Symbols, Rounded style, Filled), hand-inlined from Iconify's API like every other icon
  in this file — there is no icon-library dependency anywhere in the fork, and none was added for
  this. It renders solid (`fill="currentColor"`) rather than the stroke-outline style every other
  icon in this map uses, which is intentional: it's the Filled variant, not the outlined default.
- add an HA persistent_notification alert indicator (release `20260808.6`), see below.

The Climate routing avoids upstream's generic climate popup. That popup assumes
a single Celsius-style setpoint and does not correctly handle the home's
Fahrenheit `heat_cool` thermostat entities.

## Thermostat Overlay: Dual-Setpoint and Step-Size Fix (release `20260807.13`)

Both real thermostats (`climate.casasolar_south_zone_1`, `climate.casasolar_north_zone_1`, the
`lennoxs30` integration) run in `heat_cool` mode essentially all the time, reporting
`target_temp_high` and `target_temp_low` rather than a single `temperature` attribute. The
dedicated overlay built for the Climate routing above was itself written assuming a single
setpoint, so it inherited the exact problem it was built to avoid: the target field showed
`— °F` until the first tap, then seeded from a hardcoded `22` and never reached the real unit.

Two separate defects, both confirmed against the live entities before and after the fix:

- `climate.set_temperature` requires `target_temp_high` and `target_temp_low` together; Home
  Assistant's own service schema rejects a call that supplies only one of them with a bare
  `400`. `thermostatSetTemperaturePayload` now always sends both, changing only the bound that
  `hvac_action` (`cooling` / `heating`) says the equipment is actively working toward, and
  shifting the whole band together only when there is no single active bound (idle/fan/unknown).
- Both zones declare `target_temp_step: 1.0`. A `set_temperature` call that does not land on a
  multiple of that step is silently dropped by the `lennoxs30` integration: HTTP `200`, empty
  response body, no logbook entry, no state change, nothing. The dial's +/- buttons were
  hardcoded to a 0.5° delta. `thermostatStepSize` now reads the real entity's
  `target_temp_step` (falling back to 0.5 only when an entity doesn't declare one), and
  `thermAdjust` sends `direction * that step`.

`thermostatTemperatureView`'s displayed target follows the same `hvac_action` logic, so the
number shown next to "Cooling" is the bound the AC is actually cooling to, not a midpoint
average of the whole band.

Note the payload always carries both `target_temp_high` and `target_temp_low` keys even though
only one value changes; an earlier version of this fix sent only the changed key and was
confirmed, via a live browser test against the deployed asset, to 400 every single time. Verified
end to end against the real entities: direct `climate.set_temperature` calls, then an actual
Playwright tap through the deployed dashboard, confirmed by the entity's `target_temp_high`
changing and `last_updated` advancing. Also confirms release `.11` → `.12` → `.13`: redeploying
`homie-custom.js` under an unchanged version token served the browser's cached pre-fix copy
despite the live file on disk being correct. The version token must change on every deploy that
touches a nested asset's content, not just on releases meant for the user to see.

## Overview C Vertical Overflow on the Target Tablet (release `20260807.16`)

Overview C is designed to fill a chromeless 1280x800 canvas exactly: `#overview3` is
`position: fixed; inset: 0`, and `.ov3-main` explicitly hides all of Home Assistant's own
top-level chrome equivalents, on the assumption that it owns the whole viewport.

Manual measurement in a resized browser found the layout needed 821px of height to avoid clipping,
21px more than the target Fire HD 10's 800px screen. Direct-load testing against the live asset at
a true 1280x800 viewport showed Overview C's own content bottoming out at 763px, well within
budget, so the layout itself was never the problem. The actual cause: `homie-dash` loads this page
inside an `<iframe>` via a Lovelace `strategy: iframe` dashboard, and Home Assistant's own top app
bar, rendered around that iframe, was consuming 56px that Overview C's CSS has no way to see or
account for. 763px of content in a 744px box (800 minus that 56px) overflows by 19px, and
763 + 56 = 819, matching the manually measured 821 within rounding.

Fixed on the Home Assistant side, not in this repository: a `kiosk_mode` block was added to
`homie-dash`'s dashboard config, scoped to `users: ["Homie Dashboard"]`, setting `hide_header` and
`hide_sidebar`. This is the same per-user chrome-hiding mechanism already used for the `Tablet`
kiosk account on the domain dashboards (see `dashboard-home.md` in the `pdehlke/homeassistant`
repo). It restores Overview C's full 800px canvas without any change to this fork's layout, and
only affects the dedicated `Homie Dashboard` account; other users viewing `homie-dash` (an admin
debugging it, for instance) still see the native header.

As a defensive fallback only, `.ov3-main` changed from `overflow: hidden` to `overflow-x: hidden` /
`overflow-y: auto`. Nothing scrolls under normal operation; the point is that if a future change
ever un-hides the host header again, whether a `kiosk_mode` update, a load-order change, or the
plugin being removed, the failure becomes a visible, scrollable cutoff instead of silently clipped,
invisible content, which is what made the original 21px overflow hard to notice in the first place.

## Alert Indicator (release `20260808.6`)

A yellow-triangle indicator, bottom-left on Overviews A/B and pinned to the bottom of Overview
C's sidebar, that opens an overlay listing active Home Assistant `persistent_notification`
entries and lets you dismiss them.

The name collides with something already in this fork. `refreshNotifications()` /
`dismissNotification()` and the `#notification-bar` element watch specific
`CONFIG.notifications` entities (`input_boolean` / `switch` / `binary_sensor`) for state `on` and
render a bar under the top strip. That system is unrelated and untouched. This one surfaces HA's
own `persistent_notification` domain, the same data HA's native Notifications bell shows in its
sidebar elsewhere, which Homie Dash has never had any view into: the `kiosk_mode` config that
gives Overview C its full-height canvas (see below) hides HA's native header and sidebar
entirely for the Homie Dashboard account, bell included, for every screen, not just Overview C.

`persistent_notification` entities are not part of the state machine (confirmed earlier by this
fork's own `homie-dashboard-install-plan.md` history and, independently, by the parent repo's
`fridge-failure-alert.md`), so the existing `state_changed` WebSocket subscription that seeds and
live-updates `stateCache` never sees them regardless of what fires. A second, independent
subscription was needed: `persistent_notification/subscribe`, sent alongside the existing
`subscribe_events` call in `_wsConnect()`'s `auth_ok` handler. Its behavior was verified against
this instance directly before writing the parsing code, not assumed from documentation:

```json
// Immediately on subscribe, a full snapshot — no separate persistent_notification/get needed:
{"id":1,"type":"event","event":{"type":"current","notifications":{"<id>":{"message":"...","notification_id":"...","title":"...","created_at":"..."}}}}
// Then incremental updates as they happen:
{"id":1,"type":"event","event":{"type":"added","notifications":{"<id>":{...}}}}
{"id":1,"type":"event","event":{"type":"removed","notifications":{"<id>":{...}}}}
```

`pnCache` (a `Map<notification_id, {title, message, created_at}>`, separate from `stateCache`)
is rebuilt wholesale on every `"current"` event and patched incrementally on `"added"`/`"removed"`,
which also means a WebSocket reconnect self-heals the cache for free: the fresh `"current"` event
every new subscribe sends replaces it outright, no manual reset needed.

Both indicator buttons are hidden by default and shown only via a `.visible` class toggle
(`refreshAlertIndicator()`, called on every `pnCache` change), the same convention already used
for `.notification-bar`/`.connection-lost-bar`. Presence-only, no count badge, on request — HA's
own bell shows a count, this one doesn't. The triangle's fill is a literal `#FFC107` hex value on
the `<path>` itself, never `currentColor` or a `--accent`/`--accent-hi` var, so no dashboard theme
(Classic Gold, the vivid gradients, etc.) can recolor it; nothing else in this file applies a
blanket `svg { fill }` rule that could override it regardless, but the literal value was a
deliberate choice on request, not an accident of there being no conflict to worry about.

Dismissing calls `persistent_notification.dismiss` via the existing `haService()` REST helper and
optimistically removes the item from `pnCache` first, the same pattern `dismissNotification()`
above already uses for its own, unrelated entities — the subsequent `"removed"` WebSocket event
confirms it a moment later and is a no-op against an id that's already gone.

## Irrigation Control Missing a Re-Enabled Zone (release `20260808.8`)

The Rachio integration only creates a switch entity for a zone that is currently enabled; a
disabled zone has no HA entity at all (see the homeassistant repo's
`rachio-zone-disabled-alert.md`). `config.js`'s Irrigation control (`CONFIG.controls`, the
`subEntities` list behind the flat popup on Overviews A/B and the garden row on Overview C) was
built while the North zone was disabled, so it was never in that list. Re-enabling North in the
Rachio app created `switch.main_irrigation_north`, but nothing in Homie rescans the entity
registry: `subEntities` is a static list pde maintains by hand, so the new switch was invisible
everywhere in Homie until added here explicitly. Same root cause as the pre-existing gap in
`sensor.homie_irrigation_status`, the HA-side template sensor whose `expand([...])` zone list is
equally hardcoded and needed the same entity added on the HA side, outside this repo.

No dashboard code changed, just `config.js` data. `HOMIE_ASSET_VERSION` was still bumped
(`20260808.7` → `.8`) because `config.js` is fetched with the same cache-busting `?v=` query
param as the rest of the fork's assets, and a stale cached copy on an already-open tablet would
otherwise keep missing North until a hard refresh.

## Temperature Display Convention

All temperature-related displays in this fork use Fahrenheit and show `°F`. Future integrations
that expose another unit must convert their values to Fahrenheit before displaying them. The two
Solar inverter cards intentionally remain unbound as `— °F` until the Left Inverter and Right
Inverter entities are available.

## Verification

Run the regression suite before deployment or commit:

```sh
node --test test/screen-a.test.cjs
```

Also run JavaScript syntax checks and a repository secret scan. The accepted
tablet view requires a final hard-refresh and visual check after deployment.
