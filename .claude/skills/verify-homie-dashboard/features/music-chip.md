# Music chip

Six radio-station bubbles (Jazz: Hiromi, 80s/90s, Dinner Party, The Jam, 1st
Wave, Blues) played through Music Assistant on `media_player.crestron`. A
tap starts Harmony Hub's Airplay activity, sets the Crestron player to its
idle-start volume, then plays the station. Tapping the active bubble again
stops Music Assistant and turns Harmony off. On-state is derived live from
the player's real `state`/`media_content_id` (`musicStationIsOn()`), not a
tracked boolean. This is a **mutating** feature: driving it starts real
audio and moves a real receiver.

## Sub-features

- `music-play` — tapping an idle bubble routes Harmony → volume → play.
- `music-stop` — tapping the active bubble stops playback and Harmony.
- `music-hot-switch` — tapping a different bubble while one is active
  switches stations without resetting volume (only a cold/idle start resets
  it).
- `music-unavailable` — a bubble whose target `media_player` is
  `unavailable` renders `.disabled`, skips every service call, and gives a
  haptic tick instead of the optimistic on-flash it used to show before the
  2026-08-15 fix.

## How to get to it (user POV)

- Bottom chip row, "MUSIC" chip, on any Overview screen.
- Tap the chip to expand its popup; tap a station bubble to play/stop it.

## Driving it with playwright-cli

Preconditions:

- `doctor.py` passes.
- No station is currently playing (check `media_player.crestron`'s state
  first, so `music-play`'s before/after comparison is unambiguous).
- Willing to actually make noise / move the receiver — this is not a
  simulated tap.

- **Load with a real HA session** (needed to reach inside the iframe with
  `eval`; the direct-file load also works for the tap itself but makes
  scoping `eval` to Homie's own `window` harder to describe generically):

  ```bash
  python3 ../scripts/make-auth-state.py HOMIE_TOKEN /tmp/homie-auth-state.json
  playwright-cli open
  playwright-cli state-load /tmp/homie-auth-state.json
  playwright-cli goto "http://hass.ehlke.net:8123/homie-dash/0"
  ```

- **Read baseline state.**

  ```bash
  HB="Authorization: Bearer $HA_TOKEN"; U=http://hass.ehlke.net:8123
  curl -s --max-time 8 -H "$HB" "$U/api/states/media_player.crestron" | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print(d['state'], d.get('attributes',{}).get('media_title'))"
  ```

- **Open the chip and tap a station.** Snapshot to find the bubble's ref
  (labels match the six station names above), click it, then re-read
  `media_player.crestron` — expect `state: playing` within a few seconds and
  `media_title` reflecting the station.

  ```bash
  playwright-cli snapshot
  playwright-cli click <ref-for-Music-chip>
  playwright-cli snapshot
  playwright-cli click <ref-for-"Jazz: Hiromi"-bubble>
  # give it a few seconds for Harmony's activity switch + MA to start streaming
  ```

- **Proof.** Screenshot the bubble showing its on state (glow + popup ring),
  and re-confirm via the real entity, matching the standard this feature's
  own checkpoints already used (`elapsed_time` advancing, not just `state`):

  ```bash
  playwright-cli screenshot --filename=../evidence/music-chip-playing.png
  curl -s --max-time 8 -H "$HB" "$U/api/states/media_player.crestron" | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print(d['state'], d.get('attributes',{}).get('media_position'))"
  ```

- **Restore.** Tap the active bubble again to stop, confirm `media_player.crestron`
  returns to `idle`/`off` and Harmony's `current_activity` returns to
  `PowerOff`.

- **Cleanup.** `playwright-cli close`, `rm -f /tmp/homie-auth-state.json`.

## Gotchas

- The chip does not wait for Harmony's activity switch to finish before
  calling `play_media` — a latent race in principle. It has not reproduced
  live even from a cold Harmony state; don't invent a wait-for-Harmony step
  that isn't in the real code.
- A "played for a few seconds then reverted" result usually means the
  target `media_player` was actually `unavailable` (the pre-2026-08-15
  failure mode) or the HA host had just restarted and Music Assistant's
  add-on connection hadn't recovered yet — check `media_player.crestron`'s
  own state before assuming the chip is broken.
- `unavailable` is the one state this feature must **not** be driven
  through the tap for: proving `music-unavailable` means forcing the
  client-side cached state to `unavailable` via `eval`/`run-code` (no real
  device touched), not waiting for a real outage.
- Stop-not-pause is deliberate. Do not report the lack of a paused state as
  a bug.
