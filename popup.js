import { localizeDocument, t } from "./i18n.js";
import { formatDurationText, getSettings } from "./settings.js";

const siteEl = document.getElementById("site");
const toggleEl = document.getElementById("toggle");
const noteEl = document.getElementById("note");
const summaryEl = document.getElementById("summary");
const settingsLink = document.getElementById("open-settings");

let host = null; // canonical hostname of the current tab, null when not excludable
let settings = null;
let flash = null; // short confirmation that outranks the standing note
let flashTimer;

// The domain that actually excludes this host — it may be a parent.
function exclusionSource(domains) {
  if (!host) return null;
  return domains.find((d) => host === d || host.endsWith("." + d)) ?? null;
}

function standingNote(source) {
  if (host === null) return t("popupNoSiteNote");
  if (source && source !== host) return t("popupExcludedThrough", [source]);
  return null;
}

function render() {
  const source = exclusionSource(settings.excludedDomains);
  const supported = host !== null;

  siteEl.textContent = supported ? host : t("popupCannotExclude");
  toggleEl.hidden = !supported;

  if (supported) {
    toggleEl.textContent = source ? t("popupInclude") : t("popupExclude");
    toggleEl.classList.toggle("undo", Boolean(source));
  }

  const note = flash ?? standingNote(source);
  noteEl.hidden = !note;
  noteEl.textContent = note ?? "";

  // The footer describes this tab's policy. Saying "sleeps after 25 minutes"
  // next to "Include this site again" contradicted itself.
  summaryEl.textContent = source
    ? t("popupNeverSleeps")
    : t("popupSleepsAfter", [formatDurationText(settings.idleMinutes)]);
}

function showFlash(text) {
  clearTimeout(flashTimer);
  flash = text;
  render();
  flashTimer = setTimeout(() => {
    flash = null;
    render();
  }, 3000);
}

toggleEl.addEventListener("click", async () => {
  if (!host) return;

  const source = exclusionSource(settings.excludedDomains);
  const excluding = !source;
  settings.excludedDomains = excluding
    ? [...settings.excludedDomains, host]
    : settings.excludedDomains.filter((domain) => domain !== source);

  await chrome.storage.sync.set({ settings });
  showFlash(
    excluding
      ? t("popupFlashExcluded", [host])
      : t("popupFlashIncluded", [host]),
  );
});

settingsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let hostname = null;
  try {
    const url = new URL(tab?.url ?? "");
    if (url.protocol === "http:" || url.protocol === "https:") {
      // www.example.com and example.com are the same site for this purpose.
      hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    }
  } catch {
    // chrome://, new tab, PDF viewer, no tab — nothing to exclude
  }
  host = hostname;

  settings = await getSettings();
  document.documentElement.dataset.theme = settings.theme;

  render();
}

localizeDocument();
init();
