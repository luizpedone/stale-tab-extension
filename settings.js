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

// 120 -> "2 hours", 45 -> "45 minutes", 0.06 -> "4 seconds".
export function formatDuration(minutes) {
  const value = Number(minutes);

  if (!Number.isFinite(value) || value <= 0) {
    return { amount: "0", unit: "minutes" };
  }

  if (value < 1) {
    const seconds = Math.round(value * 60);
    return { amount: String(seconds), unit: seconds === 1 ? "second" : "seconds" };
  }

  if (value < 60) {
    return {
      amount: String(Number(value.toFixed(2))),
      unit: value === 1 ? "minute" : "minutes",
    };
  }

  const hours = Number((value / 60).toFixed(2));
  return { amount: String(hours), unit: hours === 1 ? "hour" : "hours" };
}

export function formatDurationText(minutes) {
  const { amount, unit } = formatDuration(minutes);
  return `${amount} ${unit}`;
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
