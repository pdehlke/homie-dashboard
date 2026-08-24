# Scenes chip

Three scene bubbles — Bedroom (`scene.bedroom_evening`), Bathroom
(`scene.bathroom_evening`), and Primary Suite (both scenes together) — each
behaving as a real on/off toggle rather than a one-way "activate" button.
On-state is derived live: `sceneIsOn()` reads whether any of a bubble's
`entities` array is actually in the state a scene would put it in, not a
tracked boolean. A grouped bubble (Primary Suite) and a single-scene bubble
share the same code path — every scene entry is an `entities` array, even
when it holds one scene. This is a **mutating** feature: it changes real
lights.

## Sub-features

- `scene-on` — tapping an off bubble activates its scene(s)
  (`scene.turn_on`), and the bubble's ring lights immediately.
- `scene-off` — tapping an on bubble turns off the union of lights the
  scene(s) affect — reversibility that required refactoring from
  `automation.trigger` to direct `scene.turn_on`/light control, since scenes
  themselves have no native "off."
- `scene-grouped` — Primary Suite activates and clears Bedroom + Bathroom
  together; tapping it deduplicates shared lights (`light.hallway` belongs
  to both scenes but is only toggled once).
- `scene-independent-state` — after tapping Primary Suite, Bedroom's and
  Bathroom's own bubbles independently read "on" too, each from their own
  `sceneAffectedEntities`, without reopening the popup.

## How to get to it (user POV)

- Bottom chip row, "SCENES" chip, on any Overview screen.
- Tap to expand the popup; tap a bubble (Bedroom, Bathroom, or Primary
  Suite) to toggle it.

## Driving it with playwright-cli

Preconditions:

- `doctor.py` passes.
- Note the real state of every light `scene.bedroom_evening` and
  `scene.bathroom_evening` affect before starting, so cleanup can restore it
  exactly rather than guessing a "default" state.

- **Load with a real HA session** (either account works; scenes aren't
  admin-gated) and read baseline light state:

  ```bash
  python3 ../scripts/make-auth-state.py HOMIE_TOKEN /tmp/homie-auth-state.json
  playwright-cli open
  playwright-cli state-load /tmp/homie-auth-state.json
  playwright-cli goto "http://hass.ehlke.net/homie-dash/0"
  HB="Authorization: Bearer $HA_TOKEN"; U=http://hass.ehlke.net
  curl -s --max-time 8 -H "$HB" "$U/api/states/scene.bedroom_evening" | python3 -m json.tool
  ```

  (A scene entity's own state is its last-activated timestamp, not useful
  for "is it currently applied" — read the actual affected lights instead,
  e.g. `light.bedroom_perimeter`, `light.hallway`, `light.bath_perimeter`;
  see `docs/homie-dashboard/homie-scenes-chip.md` in the sibling
  `homeassistant` repo for the full affected-entity list per scene.)

- **Open the chip, tap Primary Suite, and confirm all three rings.**

  ```bash
  playwright-cli snapshot
  playwright-cli click <ref-for-Scenes-chip>
  playwright-cli click <ref-for-"Primary Suite"-bubble>
  playwright-cli screenshot --filename=../evidence/scenes-primary-suite-on.png
  ```

  Screenshot should show Bedroom, Bathroom, *and* Primary Suite bubbles all
  ringed on, live, without reopening the popup. Cross-check with
  `GET /api/states/light.bedroom_perimeter` etc.

- **Restore.** Tap Primary Suite again; confirm the affected lights return
  to their pre-check state, not just "off" — a light that was already on
  before this run for an unrelated reason should end the run on, not off.

- **Cleanup.** `playwright-cli close`, `rm -f /tmp/homie-auth-state.json`.

## Gotchas

- A scene's own entity state (`scene.bedroom_evening`) is a timestamp, not
  an on/off flag — never read it to decide whether the scene is "applied."
  Read the affected lights.
- `light.hallway` is shared by both Bedroom and Bathroom scenes. Toggling
  Primary Suite off turns it off once, not twice — don't expect two separate
  service calls in a network trace.
- The bubble's on-ring is genuinely live-derived, not cached — a light
  changed by some other means (a voice command, a wall switch) will flip the
  bubble's ring on its own, without a Homie interaction. Don't attribute an
  unexpected ring change to a driving-script bug before checking whether
  something else touched the lights.
