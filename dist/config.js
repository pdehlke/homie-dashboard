/* Homie Dashboard configuration for pde's Home Assistant.
 * Derived from the installed Homie Dashboard v4.1.1 schema on 2026-08-07.
 * This file contains a long-lived HA token and must never enter Git.
 */

const HA_TOKEN = "YOUR_LONG_LIVED_ACCESS_TOKEN";
// hass.ehlke.net resolves via real DNS (not mDNS), so it works everywhere:
// the Fire HD tablet included, whose FireOS has no mDNS resolver and could
// never reach homeassistant.local. Replaces the literal-IP workaround this
// file used from 2026-08-10 to 2026-08-11; see homie-dashboard-install-plan.md.
// Port dropped 2026-08-24: HA moved behind a Caddy reverse proxy on plain
// HTTP port 80 as part of the Pi-to-Proxmox migration; :8123 no longer works
// at all. See docs/networking/caddy-reverse-proxy.md in pdehlke/homeassistant.
const WS_URL = "ws://hass.ehlke.net/api/websocket";
const BASE = WS_URL
  .replace(/^wss:\/\//, "https://")
  .replace(/^ws:\/\//, "http://")
  .replace(/\/api\/websocket$/, "");

const ALARM_CODE = "";
const ALARM_ENTITY = "";
// The three activities below (Watch TV, Watch a Movie, and Harmony's own
// built-in "PowerOff" all-off activity) are what's actually programmed into
// the physical hub right now. See docs/harmony-hub/harmony-hub-integration.md
// in the pdehlke/homeassistant repo for the full integration inventory.
const HARMONY_ENTITY = "remote.harmony_hub";
const PHOTO_FRAME_IMAGES = [];
const PHOTO_FRAME_INTERVAL = 20;
const BACKGROUND_IMAGES = [];

const CONFIG = {
  brandName: "HOME",
  showPetButton: false,
  backgroundImages: BACKGROUND_IMAGES,
  uiDefaults: {
    startupMode: "overview1",
    clockFormat: "12h",
    theme: "blue",
    backgroundMode: "vivid",
  },

  greetingSlots: [
    { slot: "morning", from: 5, label: "GOOD MORNING" },
    { slot: "afternoon", from: 12, label: "GOOD AFTERNOON" },
    { slot: "evening", from: 18, label: "GOOD EVENING" },
    { slot: "night", from: 22, label: "GOOD NIGHT" },
  ],
  get welcomeText() {
    const hour = new Date().getHours();
    for (let index = this.greetingSlots.length - 1; index >= 0; index--) {
      if (hour >= this.greetingSlots[index].from) {
        return this.greetingSlots[index].label;
      }
    }
    return this.greetingSlots[this.greetingSlots.length - 1].label;
  },

  wsUrl: WS_URL,
  alarmEntity: ALARM_ENTITY,
  alarm: { entity: "" },
  security: [],
  harmonyEntity: HARMONY_ENTITY,

  weather: {
    entity: "weather.openweathermap",
    uvEntity: "sensor.openweathermap_uv_index",
    tempUnit: "°F",
  },
  sun: {
    entity: "sun.sun",
    sunrise: "",
    sunset: "",
    timezone: "America/Phoenix",
  },
  aqi: {
    entity: "sensor.geronimo_pima_county_usa_air_quality_index",
    pm25: "sensor.geronimo_pima_county_usa_pm2_5",
    pm10: "sensor.geronimo_pima_county_usa_pm10",
    co: "sensor.geronimo_pima_county_usa_carbon_monoxide",
    no2: "sensor.geronimo_pima_county_usa_nitrogen_dioxide",
    bands: [],
  },
  moon: { entity: "sensor.moon_phase" },
  homeStats: [
    { label: "Alarm", entity: "sensor.homie_alarm_status" },
    { label: "Lights", entity: "sensor.homie_lights_status" },
    {
      label: "Main House",
      entity: "sensor.casasolar_south_zone_1_casasolar_south_zone_1_temperature",
      unit: " °F",
    },
    {
      label: "Office Wing",
      entity: "sensor.casasolar_north_zone_1_casasolar_north_zone_1_temperature",
      unit: " °F",
    },
    { label: "Media", entity: "sensor.homie_media_status" },
    { label: "Irrigation", entity: "sensor.homie_irrigation_status" },
    { label: "Robot", entity: "sensor.homie_robot_status" },
    { label: "EV", entity: "sensor.homie_ev_status" },
  ],
  floorSensors: [
    {
      label: "Main House",
      entity: "climate.casasolar_south_zone_1",
      sensors: [
        {
          type: "temp",
          entity: "sensor.casasolar_south_zone_1_casasolar_south_zone_1_temperature",
          unit: "°F",
        },
        {
          type: "humidity",
          entity: "sensor.casasolar_south_zone_1_casasolar_south_zone_1_humidity",
          unit: "%",
        },
      ],
    },
    {
      label: "Office Wing",
      entity: "climate.casasolar_north_zone_1",
      sensors: [
        {
          type: "temp",
          entity: "sensor.casasolar_north_zone_1_casasolar_north_zone_1_temperature",
          unit: "°F",
        },
        {
          type: "humidity",
          entity: "sensor.casasolar_north_zone_1_casasolar_north_zone_1_humidity",
          unit: "%",
        },
      ],
    },
    {
      label: "Solar",
      interactive: false,
      sensors: [
        { type: "solar", entity: "sensor.homie_solar_generation", unit: "kW", decimal: true },
        { type: "power", entity: "sensor.homie_whole_house_load", unit: "kW", decimal: true },
        { type: "export", entity: "sensor.homie_grid_flow", unit: "kW", decimal: true },
      ],
    },
  ],
  solar: {
    sensorRow: [
      { type: "solar", entity: "sensor.homie_solar_generation", unit: "kW", decimal: true },
      { type: "power", entity: "sensor.homie_whole_house_load", unit: "kW", decimal: true },
      { type: "export", entity: "sensor.homie_grid_flow", unit: "kW", decimal: true },
    ],
    stats: [
      { type: "live-consumption", entity: "sensor.sense_287516_energy" },
      { type: "solar", entity: "sensor.sense_287516_production" },
      { type: "export", entity: "sensor.homie_grid_flow" },
      { type: "daily-consumption", entity: "sensor.sense_287516_daily_energy" },
      { type: "monthly-kwh", entity: "sensor.sense_287516_monthly_energy" },
      { type: "net-today", entity: "sensor.sense_287516_daily_net_production" },
      { type: "daily-production", entity: "sensor.sense_287516_daily_production" },
      { type: "daily-from-grid", entity: "sensor.sense_287516_daily_from_grid" },
      { type: "daily-to-grid", entity: "sensor.sense_287516_daily_to_grid" },
      { type: "fossil-percentage", entity: "sensor.electricity_maps_grid_fossil_fuel_percentage" },
      { type: "co2-intensity", entity: "sensor.electricity_maps_co2_intensity" },
      { type: "solar-temp", entity: "" },
    ],
  },

  musicPlayers: [
    { entity: "media_player.carol_2", label: "Carol" },
    { entity: "media_player.crestron", label: "Crestron" },
    { entity: "media_player.gym", label: "Gym" },
    { entity: "media_player.gymnasium", label: "Gymnasium" },
    { entity: "media_player.lsx_ii_045089_2", label: "LSX II" },
    { entity: "media_player.lg_webos_tv_um7300pua", label: "LG TV" },
    { entity: "media_player.samsung_qn90ba_85", label: "Samsung 85" },
    { entity: "media_player.samsung_tu7000_60_tv", label: "Samsung 60" },
  ],
  musicHideDelay: 10_000,

  calendarEntities: [
    "calendar.rachio_base_station_ca358975",
    "calendar.pde_rfc822_net",
    "calendar.birthdays",
    "calendar.holidays_in_united_states",
  ],
  mealCalendarEntity: "",
  mealSlots: [],
  notifications: [],
  echoTimers: [],
  wazeTravelTime: [],

  cameraRefreshSeconds: 1,
  cameras: [],
  doorbell: {
    buttonEntity: "",
    cameraEntity: "",
    label: "Doorbell",
  },

  petName: "",
  petStats: {
    litterCount: "",
    litterLast: "",
    litterCounter: "",
    litterResetAuto: "",
    litterCleanBoolean: "",
    foodCount: "",
    foodWeight: "",
    foodDes: "",
    waterVol: "",
    waterFilter: "",
    litterChart: {
      okMax: 5,
      warnMax: 10,
      colors: { ok: "#22a722", warn: "#f59e0b", high: "#ef4444" },
    },
  },
  habitsMoodHistoryEntities: { habits: "", mood: "" },
  moods: [],
  habits: [],

  controls: [
    {
      label: "Lights",
      showCount: true,
      subGroups: [
        {
          label: "Dining Room",
          subEntities: [
            { label: "North", entity: "light.north" },
            { label: "South", entity: "light.south" },
            { label: "Table", entity: "light.table" },
          ],
        },
        {
          label: "Entry",
          subEntities: [
            { label: "Door", entity: "light.door" },
            { label: "Center", entity: "light.entry_center" },
            { label: "Perimeter", entity: "light.entry_perimeter" },
            { label: "Garage Sconces", entity: "light.garage_sconces" },
            { label: "Home Perimeter", entity: "light.home_perimeter" },
          ],
        },
        {
          label: "Kitchen",
          subEntities: [
            { label: "Cabinet", entity: "light.cabinet" },
            { label: "Island", entity: "light.island" },
            { label: "Pathway", entity: "light.pathway" },
            { label: "Powder", entity: "light.powder" },
            { label: "Range", entity: "light.range" },
          ],
        },
        {
          label: "Office",
          subEntities: [
            { label: "North Sink", entity: "light.north_sink" },
            { label: "Pool Bathroom", entity: "light.pool_bathroom" },
          ],
        },
        {
          label: "Primary Suite",
          subEntities: [
            { label: "Bath Diagonals", entity: "light.bath_diagonals" },
            { label: "Bath Perimeter", entity: "light.bath_perimeter" },
            { label: "Bedroom Diagonals", entity: "light.bedroom_diagonals" },
            { label: "Bedroom Perimeter", entity: "light.bedroom_perimeter" },
            { label: "Hallway", entity: "light.hallway" },
          ],
        },
      ],
    },
    {
      label: "Climate",
      action: "thermostat",
      showCount: true,
      subEntities: [
        {
          label: "Main House",
          entity: "climate.casasolar_south_zone_1",
          alertEntity: "sensor.basement_casasolar_south_casasolar_south_alert",
        },
        {
          label: "Office Wing",
          entity: "climate.casasolar_north_zone_1",
          alertEntity: "sensor.basement_casasolar_north_casasolar_north_alert",
        },
      ],
    },
    {
      label: "A/V",
      action: "media_browser",
    },
    {
      // Bottom-row equivalent of the Scenes chip (isSceneChip / subGroups[].scenes[])
      // but for radio presets: isMusicChip / subGroups[].stations[]. Every bubble
      // targets the one fixed `entity` below rather than carrying its own, since
      // there's only one physical player these presets can play through. On-state
      // is derived live from that entity's own state/media_content_id
      // (musicStationIsOn(), homie-dashboard.html) rather than tracked separately,
      // same reasoning as sceneIsOn() — see docs/homie-dashboard/homie-music-chip.md
      // in the pdehlke/homeassistant repo for the full design writeup (parallels
      // homie-scenes-chip.md). Deliberately no showCount: at most one of these can
      // ever be "on" at once, so an "N on" badge would only ever read 0 or 1.
      label: "Music",
      isMusicChip: true,
      entity: "media_player.crestron",
      subGroups: [
        {
          stations: [
            {
              uri: "library://radio/1",
              label: "Jazz: Hiromi",
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.25a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
            },
            {
              uri: "library://radio/2",
              label: "80s/90s",
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.25a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
            },
            {
              uri: "library://radio/4",
              label: "Dinner Party",
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.25a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
            },
            {
              uri: "library://radio/5",
              label: "The Jam",
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.25a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
            },
            {
              uri: "library://radio/38",
              label: "1st Wave",
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.25a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
            },
            {
              uri: "library://radio/39",
              label: "Blues",
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.25a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
            },
          ],
        },
      ],
    },
    {
      label: "TV",
      action: "harmony",
      // Drives the chip's on/off glow via the generic entityIsOn() path in
      // refreshControls() (remote domain: state "on" whenever any activity
      // other than PowerOff is running) — same shared .chip.on styling
      // Climate uses, no bespoke activity-detection needed the way Climate's
      // hvac_action check is, since this entity's own state is already
      // exactly the right signal.
      entity: HARMONY_ENTITY,
    },
    {
      label: "Irrigation",
      showCount: true,
      noRoomGrouping: true,
      twoColumnGrid: true,
      confirmStart: true,
      subEntities: [
        { label: "East of Garage", entity: "switch.main_irrigation_east_of_garage" },
        { label: "East Triangle", entity: "switch.main_irrigation_east_triangle" },
        { label: "Emma's Yard", entity: "switch.main_irrigation_emmas_yard" },
        { label: "South of Driveway", entity: "switch.main_irrigation_south_of_driveway" },
        { label: "North", entity: "switch.main_irrigation_north" },
        { label: "Back Yard", entity: "switch.back_yard_irrigation" },
      ],
    },
    {
      // Stock Homie Dashboard feature (isSceneChip / subGroups[].scenes[]),
      // present in the template since before any pde customization but never
      // wired up here. Each scene's "entities" is one or more real scene.*
      // entities — togglePopupScene (homie-dashboard.html) fires scene.turn_on
      // against all of them at once and derives what to turn back off from
      // their own attributes, no wrapping automation needed. A bubble backed
      // by more than one entity (Primary Suite Evening below) is how multiple
      // scenes group into a single toggle; add more entries there as more
      // rooms get combined, rather than inventing a second mechanism. See
      // docs/homie-dashboard/homie-scenes-chip.md in the pdehlke/homeassistant
      // repo for the full investigation, including an earlier version of this
      // that did go through a wrapping automation and why that was dropped.
      label: "Scenes",
      isSceneChip: true,
      showCount: true,
      subGroups: [
        {
          label: "Bedroom",
          scenes: [
            {
              entities: ["scene.bedroom_evening"],
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
              label: "Evening",
              color: "var(--accent)",
            },
          ],
        },
        {
          label: "Bathroom",
          scenes: [
            {
              entities: ["scene.bathroom_evening"],
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="12" width="6" height="9" rx="1"/><path d="M12 12V9"/><path d="M12 9 C13.5 7 13.5 5 12 3.5 C10.5 5 10.5 7 12 9Z" fill="rgba(255,200,80,0.85)" stroke="rgba(255,160,40,0.9)" stroke-width="1"/><line x1="9" y1="15" x2="9" y2="17" stroke="rgba(255,255,255,0.35)" stroke-width="1"/></svg>`,
              label: "Evening",
              color: "var(--accent)",
            },
          ],
        },
        {
          label: "Primary Suite",
          scenes: [
            {
              // Both scenes overlap on light.hallway; sceneAffectedEntities
              // dedupes the union so it's only ever turned off/on once, not
              // fought over by two redundant service calls.
              entities: ["scene.bedroom_evening", "scene.bathroom_evening"],
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="1.5"/><path d="M9 9 Q8 13 10 15 L8 21"/><path d="M9 9 L15 9 Q17 9 17 12 L17 15"/><path d="M10 15 L17 15 L19 21"/><path d="M6 21 L20 21"/></svg>`,
              label: "Evening",
              color: "var(--accent)",
            },
          ],
        },
      ],
    },
    {
      // Read-only Synology NAS health/capacity chip, admin-only (visibility
      // gated by isAdminViewer() at render time — the dedicated non-admin
      // `Homie Dashboard` kiosk account never sees this). isNasChip flags the
      // custom Attention/Critical-only glow logic in refreshControls() /
      // _refreshOv3SidebarControls() (nasChipNeedsAttention()), parallel to
      // isSceneChip/isMusicChip; action: "nas" routes taps to the dedicated
      // openNasOverlay() rather than the generic subEntities/subGroups popup,
      // parallel to the TV chip's action: "harmony". entity is the shared
      // sensor.nas_health contract this and the native dashboard-nas
      // dashboard both read — see docs/homie-dashboard/homie-nas-chip.md and
      // docs/synology-nas/synology-nas-dashboard.md in the pdehlke/homeassistant
      // repo for the full design writeup and the native four-state contract
      // this mirrors.
      label: "NAS",
      action: "nas",
      isNasChip: true,
      entity: "sensor.nas_health",
    },
  ],

  garden: {
    soilMoisture: [],
    thresholds: { dryBelow: 30, wetAbove: 80 },
  },
};
