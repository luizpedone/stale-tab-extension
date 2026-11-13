import { uiLanguage } from "./i18n.js";

// Settings shared by the service worker, the popup and the options page.

export const DEFAULTS = {
  idleMinutes: 120,
  excludedDomains: [],
  theme: "system", // "system" | "light" | "dark"
};

const THEMES = ["system", "light", "dark"];

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get({ settings: DEFAULTS });

  const domains = Array.isArray(settings?.excludedDomains)
    ? settings.excludedDomains
    : [];

  return {
    idleMinutes: idleMinutes(settings),
    excludedDomains: domains.filter((d) => typeof d === "string" && d),
    theme: THEMES.includes(settings?.theme) ? settings.theme : DEFAULTS.theme,
  };
}

// Accepts the old hours-based setting and converts it.
function idleMinutes(settings) {
  const minutes = Number(settings?.idleMinutes);
  if (Number.isFinite(minutes) && minutes > 0) return minutes;

  const legacyHours = Number(settings?.idleHours);
  if (Number.isFinite(legacyHours) && legacyHours > 0) return legacyHours * 60;

  return DEFAULTS.idleMinutes;
}

// 120 -> "2 hours", 45 -> "45 minutes", 0.06 -> "4 seconds". Intl supplies the
// plural forms and unit names in every locale: chrome.i18n.getMessage has no
// plural rules, so wording them by hand would need a key per unit per plural.
export function formatDurationText(minutes, locale = uiLanguage()) {
  const value = Number(minutes);

  let amount = 0;
  let unit = "minute";

  if (Number.isFinite(value) && value > 0) {
    if (value < 1) {
      amount = Math.round(value * 60);
      unit = "second";
    } else if (value < 60) {
      amount = Number(value.toFixed(2));
      unit = "minute";
    } else {
      amount = Number((value / 60).toFixed(2));
      unit = "hour";
    }
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "long",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${unit}`;
  }
}

// "example.com" covers example.com and everything under it.
export function isExcluded(url, excludedDomains) {
  if (!excludedDomains?.length) return false;

  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  return excludedDomains.some(
    (domain) => hostname === domain || hostname.endsWith("." + domain),
  );
}
