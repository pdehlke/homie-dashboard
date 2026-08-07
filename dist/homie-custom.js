(function initializeHomieCustom(root, factory) {
  const api = factory();
  root.HOMIE_CUSTOM = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function buildHomieCustom() {
  "use strict";

  function controlOnClick(control, index) {
    if (control && control.action === "thermostat") {
      return "openThermostat()";
    }
    if (control && control.action === "media_browser") {
      return "openMediaBrowser()";
    }
    if (control && (control.subEntities || control.subGroups)) {
      return `openPopup(${index})`;
    }
    return `toggleControl(${index})`;
  }

  function controlIndex(controls, label) {
    return (controls || []).findIndex((control) => control.label === label);
  }

  function requiresStartConfirmation(control, isOn) {
    return Boolean(control && control.confirmStart && !isOn);
  }

  function startConfirmationMessage(entity) {
    const label = entity && entity.label ? entity.label : "this irrigation zone";
    return `Start ${label}?`;
  }

  function statColumns(statCount) {
    return statCount === 8 ? 4 : 5;
  }

  function sensorPanelInteractive(panel) {
    return !(panel && panel.interactive === false);
  }

  function securityMessage() {
    return "Alarm Not Configured";
  }

  function installDefaults(storage, defaults, version) {
    const markerKey = "homie_pde_defaults_version";
    if (storage.getItem(markerKey) === version) {
      return false;
    }
    let settings = {};
    try {
      settings = JSON.parse(storage.getItem("homie_dashboard_settings") || "{}");
    } catch (_error) {
      settings = {};
    }
    settings.clockFormat = defaults.clockFormat;
    settings.startupMode = defaults.startupMode;
    settings.bgMode = defaults.backgroundMode;
    storage.setItem("homie_dashboard_settings", JSON.stringify(settings));
    storage.setItem("homie-theme", defaults.theme);
    storage.setItem("homie-base-theme", defaults.theme);
    storage.setItem(markerKey, version);
    return true;
  }

  return {
    controlIndex,
    controlOnClick,
    installDefaults,
    requiresStartConfirmation,
    securityMessage,
    sensorPanelInteractive,
    startConfirmationMessage,
    statColumns,
  };
});
