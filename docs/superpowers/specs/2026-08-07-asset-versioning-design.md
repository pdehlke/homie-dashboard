# Homie Asset Versioning Design

## Goal

Prevent wall-mounted kiosk browsers from mixing stale Homie HTML, configuration, and helper JavaScript despite Home Assistant's month-long static-file cache policy.

## Design

Use one explicit release token, currently `20260807.7`, at both cache boundaries:

- The supported Home Assistant Lovelace iframe strategy loads `/local/community/homie-dashboard/homie-dashboard.html?v=20260807.7`.
- The HTML loads `config.js?v=20260807.7` and `homie-custom.js?v=20260807.7`.

The HTML defines the token once and dynamically loads both dependencies in order. Every future Homie deployment increments the token and updates the Lovelace iframe URL through Home Assistant's supported WebSocket API. No Home Assistant source, internal implementation, or `.storage` file is edited directly.

The Solar chart reports a visible unavailable/error state when History API requests fail instead of silently leaving an empty region.

## Verification and Rollback

Regression tests require a nonempty version token and matching version usage for both dependencies. Deployment verification compares served artifacts and confirms the Lovelace iframe URL through the API.

Before deployment, back up the live Homie directory and the current Homie Lovelace configuration. The Home dashboard and tablet navigation remain untouched.
