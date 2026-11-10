"""Constants for Homie Dashboard."""

DOMAIN = "homie_dashboard"

# pde fork: the tablet and bookmarks open /homie-dash, the URL the v4 Lovelace dashboard had.
PANEL_URL_PATH = "homie-dash"
PANEL_COMPONENT = "homie-dashboard-panel"

URL_FRONTEND = "/homie_dashboard_static"
URL_MEDIA = "/homie_dashboard_media"

CONF_TITLE = "sidebar_title"
CONF_ICON = "sidebar_icon"
CONF_REQUIRE_ADMIN = "require_admin"

DEFAULT_TITLE = "Homie"
DEFAULT_ICON = "mdi:tablet-dashboard"

STORAGE_KEY = "homie_dashboard.config"
STORAGE_VERSION = 1

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
MAX_CONFIG_BYTES = 1_000_000
