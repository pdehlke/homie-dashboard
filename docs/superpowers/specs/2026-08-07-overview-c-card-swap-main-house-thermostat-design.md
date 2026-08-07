# Overview C Card Swap and Main House Thermostat Design

## Goal

Rearrange two Overview C cards and make the bottom-right thermostat card open the existing dedicated thermostat overlay for only the Main House thermostat.

## Layout

- Move the Irrigation/garden card from the right column into the center-column position currently occupied by the Main House/floors card.
- Move the Main House/floors card into the right-column position currently occupied by the Irrigation/garden card.
- Preserve the cards' existing contents, live-state behavior, and styling while adapting their grid or wrapper placement only as needed for the new locations.
- Leave the accepted Overview C Solar card and A/V sidebar control unchanged.

## Main House Thermostat Card

- Replace the bottom-right inline AC controls with a launcher card labeled `Main House`.
- Bind the launcher to `climate.casasolar_south_zone_1`.
- Tapping the launcher opens the same dedicated thermostat overlay used by Overview A's Climate button.
- The overlay must show only `climate.casasolar_south_zone_1` when opened from this card.
- The launcher should display the current Main House temperature and HVAC mode from the existing Home Assistant state cache, without implementing a second thermostat-control surface.

## Reusable Filtered Overlay

- Extend the existing thermostat-overlay opening path with an optional entity filter.
- Calling the existing unfiltered path from Overview A must continue to show both configured thermostat zones.
- Calling the filtered path from the Overview C Main House card must show only the specified entity.
- Closing the overlay must clear the filter so one entry point cannot affect a later opening from another entry point.
- The interface should accept another climate entity later so a North Thermostat launcher can be added without duplicating overlay code.

## Error Handling

- If the Main House entity is missing or unavailable, keep the launcher visible with an unavailable placeholder and allow the overlay to represent that state safely.
- If an invalid filtered entity is supplied, render no unrelated thermostat controls; do not silently fall back to all thermostats.

## Verification

- Add source or behavior tests proving the Main House/floors and Irrigation/garden cards occupy their new locations.
- Test that the Overview C launcher requests a filtered overlay containing only `climate.casasolar_south_zone_1`.
- Test that Overview A's Climate button still opens the unfiltered overlay with both Main House and Office Wing.
- Test that closing a filtered overlay clears its filter.
- Run the existing Homie test suite and JavaScript syntax checks.
- Deploy with a new release token, preserving the live secret-bearing `config.js` and never copying its token into Git or output.
- Verify the live release token and visually confirm the swapped cards and filtered thermostat overlay when browser access is available.

## Non-Goals

- Do not add the North Thermostat card yet.
- Do not redesign the dedicated thermostat overlay.
- Do not change the Overview A Climate interaction.
- Do not alter Solar, weather, AQI, A/V, or the existing Home Assistant `vision-sample` dashboard.
