/* Homie Dashboard configuration for pde's Home Assistant.
 * Derived from the installed Homie Dashboard v4.1.1 schema on 2026-08-07.
 * This file contains a long-lived HA token and must never enter Git.
 */

const HA_TOKEN = "YOUR_LONG_LIVED_ACCESS_TOKEN";
// hass.ehlke.net resolves via real DNS (not mDNS), so it works everywhere:
// the Fire HD tablet included, whose FireOS has no mDNS resolver and could
// never reach homeassistant.local. Replaces the literal-IP workaround this
// file used from 2026-08-10 to 2026-08-11; see homie-dashboard-install-plan.md.
// Port dropped 2026-08-24: HA moved behind a Caddy reverse proxy as part of
// the Pi-to-Proxmox migration; :8123 no longer works at all. Scheme flipped
// to wss:// the same day when Caddy's automatic HTTPS went live (real Let's
// Encrypt certificate; plain HTTP now redirects). A browser refuses to open
// a plain ws:// connection from a page loaded over https, so this was not
// optional: see docs/networking/caddy-reverse-proxy.md in pdehlke/homeassistant.
const WS_URL = "wss://hass.ehlke.net/api/websocket";
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
      // Refilled 2026-09-02 with the real Crestron loads, once the CIP bridge
      // was live and driving them. Grouped by Home Assistant area, not by
      // Crestron zone page: the eight panel pages are groupings of what one
      // panel can reach, and they do not line up with rooms anywhere. The
      // mapping is docs/crestron/crestron-load-room-worksheet.md in the
      // sibling homeassistant repo.
      //
      // All 30 of the house's Crestron loads, as of 2026-09-03. The last four,
      // Kitchen Range, Island, Pathway and Cabinet, were reached through the
      // MC2E rather than the AADS because their only joins sit inside the
      // range the DSC alarm keypad shares. They were unmapped and omitted
      // here until the identification pass (issue #18) found which MC2E join
      // drives each one.
      //
      // Four more, added 2026-09-04, aren't Crestron loads at all: Kitchen
      // Counter Lamp and Living Room's Cabinet/Globe Lamp/Reading Nook are
      // Zigbee smart plugs (switch_as_x over Third Reality plugs) filling
      // gaps the Crestron wiring never reached. They render the same as every
      // Crestron entry -- this popup has no notion of how a light is driven,
      // only that it's a light.* entity -- so they're placed straight into
      // their rooms' existing subGroups rather than a separate group.
      subGroups: [
        {
          label: "Courtyard",
          subEntities: [
            { label: "Patio North", entity: "light.courtyard_patio_north" },
            { label: "Patio South", entity: "light.courtyard_patio_south" },
          ],
        },
        {
          label: "Dining Room",
          subEntities: [
            { label: "North", entity: "light.dining_room_north" },
            { label: "Powder", entity: "light.dining_room_powder" },
            { label: "South", entity: "light.dining_room_south" },
            { label: "Table", entity: "light.dining_room_table" },
          ],
        },
        {
          label: "Entry",
          subEntities: [
            { label: "Center", entity: "light.entry_center" },
            { label: "Door", entity: "light.entry_door" },
            { label: "Perimeter", entity: "light.entry_perimeter" },
          ],
        },
        {
          label: "Guest Suite",
          subEntities: [
            { label: "East Hall", entity: "light.guest_suite_east_hall" },
          ],
        },
        {
          label: "Kitchen",
          subEntities: [
            { label: "Cabinet", entity: "light.kitchen_cabinet" },
            // Counter Lamp: a Zigbee smart plug (switch_as_x over a Third
            // Reality plug), not a Crestron load, added 2026-09-04 alongside
            // three more in Living Room. Same subEntities shape either way --
            // the popup doesn't distinguish how a light is actually driven.
            { label: "Counter Lamp", entity: "light.kitchen_kitchen_counter_lamp" },
            { label: "Island", entity: "light.kitchen_island" },
            { label: "Pathway", entity: "light.kitchen_pathway" },
            { label: "Perimeter", entity: "light.kitchen_perimeter" },
            { label: "Range", entity: "light.kitchen_range" },
          ],
        },
        {
          label: "Living Room",
          subEntities: [
            { label: "Ambient", entity: "light.living_room_ambient" },
            // Cabinet, Globe Lamp, Reading Nook: the other three new Zigbee
            // lights (see Counter Lamp's comment above, Kitchen subGroup).
            { label: "Cabinet", entity: "light.living_room_living_room_cabinet" },
            { label: "East Seating", entity: "light.living_room_east_seating" },
            { label: "Globe Lamp", entity: "light.living_room_globe_lamp" },
            { label: "Pathway", entity: "light.living_room_pathway" },
            { label: "Perimeter", entity: "light.living_room_perimeter" },
            { label: "Reading Nook", entity: "light.living_room_reading_nook" },
            { label: "West Seating", entity: "light.living_room_west_seating" },
          ],
        },
        {
          label: "Office",
          subEntities: [
            { label: "North Sink", entity: "light.office_north_sink" },
            { label: "Pool Bath", entity: "light.office_pool_bath" },
          ],
        },
        {
          label: "Outdoor Kitchen",
          subEntities: [
            { label: "Outdoor Kitchen", entity: "light.outdoor_kitchen" },
          ],
        },
        {
          label: "Outside",
          subEntities: [
            { label: "Garage Sconces", entity: "light.outside_garage_sconces" },
            { label: "Home Perimeter", entity: "light.outside_home_perimeter" },
          ],
        },
        {
          label: "Primary Suite",
          subEntities: [
            { label: "Bath Diagonal", entity: "light.primary_suite_bath_diagonal" },
            { label: "Bath Perimeter", entity: "light.primary_suite_bath_perimeter" },
            { label: "Bed Diagonal", entity: "light.primary_suite_bed_diagonal" },
            { label: "Bed Perimeter", entity: "light.primary_suite_bed_perimeter" },
            { label: "Hallway", entity: "light.primary_suite_hallway" },
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
      // but for radio presets and library playlists: isMusicChip /
      // subGroups[].stations[]. Every bubble targets the one fixed `entity`
      // below rather than carrying its own, since there's only one physical
      // player these presets can play through. On-state is derived live from
      // that entity's own state/media_content_id (musicStationIsOn(),
      // homie-dashboard.html) rather than tracked separately, same reasoning
      // as sceneIsOn() — see docs/homie-dashboard/homie-music-chip.md in the
      // pdehlke/homeassistant repo for the full design writeup (parallels
      // homie-scenes-chip.md). Deliberately no showCount: at most one of
      // these can ever be "on" at once, so an "N on" badge would only ever
      // read 0 or 1.
      //
      // Two labeled subGroups render as an accordion (the same
      // toggleRoomAccordion() mechanism the Lights chip uses, generalized in
      // homie-dashboard.html to build a bubble grid instead of Mushroom cards
      // when the group belongs to a Music chip): "Stations" is Music
      // Assistant's own radio presets (`library://radio/<n>`); "Playlists" is
      // MA library playlists (`library://playlist/<n>`) sourced from Jellyfin.
      // MA ingests a Jellyfin playlist into its regular library exactly like
      // any other playlist, so this needs no bridge to MA's native (non-HA)
      // API. A bubble's `mediaType` selects which `music_assistant.play_media`
      // media_type gets sent; omitted means "radio" (togglePopupMusic's
      // default), so every existing Station entry below is unchanged. Every
      // Playlists entry always plays shuffled (togglePopupMusic sets
      // media_player.shuffle_set accordingly before play_media); Stations
      // explicitly turn shuffle back off, since it's meaningless for radio
      // and would otherwise carry over from a previous Playlists tap.
      label: "Music",
      isMusicChip: true,
      entity: "media_player.crestron",
      subGroups: [
        {
          label: "Stations",
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
            {
              uri: "library://radio/40",
              label: "AltNation",
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.25a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
            },
          ],
        },
        {
          // Populated at runtime, not here. This used to be a hand-maintained
          // list (one entry, "Alternative", library://playlist/10) that
          // needed a config.js edit and a redeploy every time a Jellyfin
          // playlist was added or removed. syncDynamicPlaylistsFromHA()
          // (homie-dashboard.html) now overwrites this array on page load
          // from sensor.homie_dynamic_playlists, which an external script
          // refreshes periodically. See
          // docs/homie-dashboard/homie-dynamic-playlists.md in the
          // pdehlke/homeassistant repo for the full design.
          label: "Playlists",
          stations: [],
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
      // Emptied 2026-09-03 (issue #16), refilled 2026-09-03 with the first
      // real scene: "Dinner". Both scenes this chip originally pointed at,
      // scene.bedroom_evening and scene.bathroom_evening, were deleted
      // 2026-09-02 along with the rest of the placeholder Crestron-PoC
      // fleet, so every bubble looked normal and fired scene.turn_on at
      // nothing. The empty period is why isSceneChip's code paths
      // (refreshControls's count/glow branch, openPopup's scene-popup
      // early return, refreshOpenScenePopup, the Overview C sidebar icon
      // override) all tolerate an empty subGroups — they start from
      // `(c.subGroups || []).flatMap(...)` — and why openPopup renders an
      // explicit "No scenes configured" message rather than an empty grid.
      //
      // Dinner isn't a scene.* snapshot: it turns off the TV only if it's
      // on, then turns on lights, then starts a specific radio station
      // through Harmony — a conditional plus a service-call sequence, which
      // a scene (pure entity-state restore) can't express. It's backed by
      // the HA script script.scene_dinner instead. sceneAffectedEntities()
      // and togglePopupScene() were generalized to support that (see their
      // doc comments in homie-dashboard.html and
      // docs/homie-dashboard/homie-scenes-chip.md in the pdehlke/homeassistant
      // repo): `entities` below is what the bubble's on/off glow follows and
      // what a tap-while-on turns off (the lights Dinner sets), and
      // `activate` is what a tap-while-off actually runs (the script) —
      // tapping off does not stop the music or touch Harmony/TV state.
      //
      // The three hand-authored bubble icons this chip's emptying preserved
      // (crescent moon, bath, dresser) are still unused, waiting for
      // whichever future scene fits them.
      label: "Scenes",
      isSceneChip: true,
      showCount: true,
      subGroups: [
        {
          label: "Scenes",
          scenes: [
            {
              // 2026-09-04: was the ten lights spelled out individually; now
              // just the light.dinner_lights group pde created in HA, which
              // wraps those same fixtures (plus a couple more). One indirection
              // point instead of ten means the light list can be changed by
              // editing the group in HA, not this config: sceneIsOn() reads the
              // group's own on/off state, and a tap-while-on calls
              // homeassistant.turn_off on the group, which HA forwards to every
              // member. script.scene_dinner's light.turn_on step was updated the
              // same way, so both the on- and off-direction now go through the
              // group.
              entities: ["light.dinner_lights"],
              activate: "script.scene_dinner",
              // Reused verbatim from ICONS.scenes.candle in homie-dashboard.html
              // (not referenced live — every other subGroups.scenes icon in this
              // file is a self-contained inline SVG literal, so this follows the
              // same convention rather than depending on the HTML's global scope).
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="12" width="6" height="9" rx="1"/><path d="M12 12V9"/><path d="M12 9 C13.5 7 13.5 5 12 3.5 C10.5 5 10.5 7 12 9Z" fill="rgba(255,200,80,0.85)" stroke="rgba(255,160,40,0.9)" stroke-width="1"/><line x1="9" y1="15" x2="9" y2="17" stroke="rgba(255,255,255,0.35)" stroke-width="1"/></svg>`,
              label: "Dinner",
              color: "var(--accent)",
            },
            {
              // Same generalized mechanism as Dinner above, just a bigger
              // light list: every one of the house's light.* entities
              // (originally 30, confirmed live against /api/states,
              // including both courtyard fixtures and both "outside"
              // ones; 34 as of 2026-09-04 once the four Zigbee lights
              // below were added), backed by its own script,
              // script.scene_visitors — which needs the same four added to
              // its own light.turn_on step, since this array only drives
              // the bubble's on/off glow and off-tap, not what a tap-while-
              // off actually turns on. No dashboard code changed for this
              // bubble — sceneAffectedEntities(), togglePopupScene(), and
              // every isSceneChip render/refresh site already iterate
              // subGroups[].scenes generically, so a second bubble in the
              // same "Scenes" group needed nothing beyond this config
              // entry.
              entities: [
                "light.courtyard_patio_north",
                "light.courtyard_patio_south",
                "light.dining_room_north",
                "light.dining_room_powder",
                "light.dining_room_south",
                "light.dining_room_table",
                "light.entry_center",
                "light.entry_door",
                "light.entry_perimeter",
                "light.guest_suite_east_hall",
                "light.kitchen_cabinet",
                "light.kitchen_island",
                "light.kitchen_kitchen_counter_lamp",
                "light.kitchen_pathway",
                "light.kitchen_perimeter",
                "light.kitchen_range",
                "light.living_room_ambient",
                "light.living_room_east_seating",
                "light.living_room_globe_lamp",
                "light.living_room_living_room_cabinet",
                "light.living_room_pathway",
                "light.living_room_perimeter",
                "light.living_room_reading_nook",
                "light.living_room_west_seating",
                "light.office_north_sink",
                "light.office_pool_bath",
                "light.outdoor_kitchen",
                "light.outside_garage_sconces",
                "light.outside_home_perimeter",
                "light.primary_suite_bath_diagonal",
                "light.primary_suite_bath_perimeter",
                "light.primary_suite_bed_diagonal",
                "light.primary_suite_bed_perimeter",
                "light.primary_suite_hallway",
                // 2026-09-04: the four Zigbee lights added to the Lights
                // chip the same day (Globe Lamp, Reading Nook, Living Room
                // Cabinet, Kitchen Counter Lamp) were never added here, so
                // "every light in the house" silently excluded them from
                // both directions — found live when a Visitors off-tap left
                // them lit. See homie-scenes-chip.md's "Ninth pass".
              ],
              activate: "script.scene_visitors",
              // Hand-authored, not reused: none of the other five unused
              // ICONS.scenes entries (relax, romantic, movie, fireplace,
              // nightlight) or the three "still unused" ones named in the
              // comment above (crescent moon, bath, dresser) read as
              // "guests," so this is a plain two-person glyph in the same
              // stroke style as the rest of the set. Easy for pde to swap.
              icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
              label: "Visitors",
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
