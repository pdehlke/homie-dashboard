# Overview C A/V Icon Design

Overview C builds its vertical sidebar from the configured controls. The A/V control has no entity
because it uses the custom `media_browser` action, so domain-based icon selection incorrectly falls
back to the generic switch slider.

The sidebar icon resolver will recognize `ctrl.action === "media_browser"` before attempting domain
inference and return the same circle-and-play symbol used by the dashboard's Now Playing control.
This binds the icon to the control's meaning rather than its editable label or a fake entity.

A regression test will cover the semantic action mapping and artwork. Release `20260807.5` will
cache-bust both the Lovelace iframe and its nested assets.
