# Dual Inverter Cards Design

## Scope

The expanded Solar view will replace its single unbound inverter-temperature card with two
unbound cards labeled `Left Inverter` and `Right Inverter`. Both display `— °F` until their Tesla
inverter entities are configured.

## Layout

The lower Solar statistics row will contain five equal flex children: Production, Grid, Left
Inverter, Right Inverter, and Outdoor Temp. This matches the five equal cards in the upper row, so
cards in both rows have the same width without introducing fixed dimensions or a new layout system.

## Temperature Convention

All temperature-related displays in this fork use Fahrenheit and show `°F`. Future entity bindings
must preserve that convention or convert source values before display.

## Verification

The regression suite will assert the two labels, unique value elements, Fahrenheit units, five-card
row counts, and the documented dashboard-wide Fahrenheit convention. The release token will change
so existing kiosk browsers load the new markup without a hard refresh.
