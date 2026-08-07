/* Homie Dashboard configuration for pde's Home Assistant.
 * Derived from the installed Homie Dashboard v4.1.1 schema on 2026-08-07.
 * This file contains a long-lived HA token and must never enter Git.
 */

const HA_TOKEN = "YOUR_LONG_LIVED_ACCESS_TOKEN";
const WS_URL = "ws://192.168.4.125:8123/api/websocket";
const BASE = WS_URL
  .replace(/^wss:\/\//, "https://")
  .replace(/^ws:\/\//, "http://")
  .replace(/\/api\/websocket$/, "");

const ALARM_CODE = "";
const ALARM_ENTITY = "";
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
    theme: "gold",
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

  weather: {
    entity: "weather.openweathermap",
    tempUnit: "°F",
  },
  sun: {
    sunrise: "",
    sunset: "",
    timezone: "America/Phoenix",
  },
  aqi: {
    entity: "",
    pm25: "",
    pm10: "",
    co: "",
    no2: "",
    bands: [],
  },
  moon: { entity: "" },
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
    stats: [],
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
    "calendar.home",
    "calendar.rachio_base_station_ca358975",
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
        { label: "Main House", entity: "climate.casasolar_south_zone_1" },
        { label: "Office Wing", entity: "climate.casasolar_north_zone_1" },
      ],
    },
    {
      label: "A/V",
      action: "media_browser",
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
        { label: "Back Yard", entity: "switch.back_yard_irrigation" },
      ],
    },
  ],

  garden: {
    soilMoisture: [],
    thresholds: { dryBelow: 30, wetAbove: 80 },
  },
};
