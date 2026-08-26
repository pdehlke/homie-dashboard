# Music chip

Two accordion categories (same `toggleRoomAccordion()` mechanism the Lights
chip uses: tap a row to expand it in place, only one open at a time):
**Stations**, seven radio-preset bubbles (Jazz: Hiromi, 80s/90s, Dinner Party,
The Jam, 1st Wave, Blues, AltNation), and **Playlists**, MA library playlists
sourced from Jellyfin (currently one: Alternative). Everything plays through
Music Assistant on `media_player.crestron`. A tap starts Harmony Hub's Airplay
activity, sets the Crestron player to its idle-start volume, sets shuffle
(always on for Playlists, always off for Stations), then plays the bubble's
URI with its configured `media_type` (`"radio"` for Stations, `"playlist"`
for Playlists; a Stations entry omits the config field entirely and
`togglePopupMusic` defaults it). Tapping the active bubble again stops Music
Assistant and turns Harmony off. On-state is derived live from the player's
real `state` for Stations (`musicStationIsOn()` matching `media_content_id`
against the bubble's own URI), but tracked in-memory for Playlists, since MA
rewrites `media_content_id` to the currently-playing *track's* URI the moment
a playlist starts, never the playlist's own URI again; kept live while the
popup is open by `refreshOpenMusicPopup()` regardless of which accordion row
is currently expanded. Below both category rows sits a third, non-expanding
row, **All Off** (`stopAllMusic()`): the same stop sequence as tapping the
active bubble, but without needing to know which Station or Playlist it is.
This is a **mutating** feature: driving it starts real audio and moves a real
receiver.

## Sub-features

- `music-category-switch` — tapping "Stations" or "Playlists" expands that
  row's bubble grid in place and collapses whichever row was open before;
  only one category is ever expanded at once.
- `music-all-off` — tapping the "All Off" row stops whatever bubble is
  playing (media_stop + Harmony turn_off, same as `music-stop`) regardless of
  which category or bubble is active, and is safe to tap even when nothing is
  playing. It has no bubbleId to flash, so there is no optimistic UI update;
  the on-ring clears once `refreshOpenMusicPopup()`'s next tick picks up the
  real state.
- `music-play` — tapping an idle bubble routes Harmony → volume → play.
- `music-stop` — tapping the active bubble stops playback and Harmony.
- `music-hot-switch` — tapping a different bubble while one is active
  switches stations without resetting volume (only a cold/idle start resets
  it). Works across categories too: a Station playing, then a Playlist
  tapped, is still a hot switch, both go through the same function.
- `music-playlist-shuffle` — a Playlists tap always sets shuffle on first
  (`media_player.shuffle_set`, before `play_media`); a Stations tap always
  sets it off. Verify via the entity's own `shuffle` attribute, not just that
  a different track played first, since a false positive there is possible by
  chance.
- `music-unavailable` — a bubble whose target `media_player` is
  `unavailable` renders `.disabled`, skips every service call, and gives a
  haptic tick instead of the optimistic on-flash it used to show before the
  2026-08-15 fix.

## How to get to it (user POV)

- Bottom chip row, "MUSIC" chip, on any Overview screen.
- Tap the chip to expand its popup (a compact category list, not bubbles
  yet); tap "Stations" or "Playlists" to expand that category's bubbles; tap
  a bubble to play/stop it. The red "All Off" row sits below both categories
  at all times, no expansion needed.

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
  playwright-cli goto "https://hass.ehlke.net/homie-dash/0"
  ```

- **Read baseline state.**

  ```bash
  HB="Authorization: Bearer $HA_TOKEN"; U=https://hass.ehlke.net
  curl -s --max-time 8 -H "$HB" "$U/api/states/media_player.crestron" | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print(d['state'], d.get('attributes',{}).get('media_title'))"
  ```

- **Open the chip, expand a category, tap a bubble.** The popup opens to the
  compact two-row category list first; a bubble only exists in the DOM once
  its row has been tapped and expanded. Snapshot after each step rather than
  assuming a bubble ref exists from the first snapshot.

  ```bash
  playwright-cli snapshot
  playwright-cli click <ref-for-Music-chip>
  playwright-cli snapshot                      # shows "Stations" / "Playlists" rows only
  playwright-cli click <ref-for-"Stations"-row>
  playwright-cli snapshot                      # now the 7 station bubbles exist
  playwright-cli click <ref-for-"Jazz: Hiromi"-bubble>
  # give it a few seconds for Harmony's activity switch + MA to start streaming
  ```

  For a Playlists bubble, click the "Playlists" row instead of "Stations" at
  the expand step; everything else (proof, restore, cleanup) is identical.

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
  `PowerOff`. To prove `music-all-off` specifically, tap the "All Off" row
  (`#music-all-off-row`, always present, no category expansion needed)
  instead of the bubble itself, and confirm the same two entities the same
  way.

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
- Only one accordion row is expanded at a time: tapping "Playlists" while
  "Stations" is open collapses Stations first. A collapsed row's bubbles stay
  in the DOM (just visually hidden), so `eval`-based checks against a bubble
  by id work even when its row isn't the currently-expanded one; a `click`
  on it won't, since it isn't visible/interactable until expanded.
- Stop-not-pause is deliberate. Do not report the lack of a paused state as
  a bug.
- "All Off" is one row, not per-category: there is exactly one
  `#music-all-off-row` in the popup, not one under Stations and another
  under Playlists.
