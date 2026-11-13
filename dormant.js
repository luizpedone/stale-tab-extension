import { localizeDocument, t } from "./i18n.js";
import { formatDurationText, getSettings, isExcluded } from "./settings.js";

const titleEl = document.getElementById("title");
const reasonEl = document.getElementById("reason");
const addressEl = document.getElementById("address");
const reactivate = document.getElementById("reactivate");
const keepAwake = document.getElementById("keep-awake");
const tipEl = document.getElementById("tip");

// background.js put the original address in the fragment.
function originalUrl() {
  const hash = location.hash.slice(1);
  if (!hash) return null;

  try {
    const url = decodeURIComponent(hash);
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

function labelFor(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (pathname === "/") return hostname;

    const full = `${hostname}${pathname}`;
    if (full.length <= 60) return full;

    const cut = full.lastIndexOf("/", 59);
    return `${full.slice(0, cut > hostname.length ? cut : 59)}…`;
  } catch {
    return url;
  }
}

// A bare origin says nothing the headline doesn't already say.
function addressFor(url) {
  try {
    const { pathname, search, hash } = new URL(url);
    return pathname === "/" && !search && !hash ? null : url;
  } catch {
    return url;
  }
}

// Matches what the popup stores: www. is not part of the site's identity.
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const target = originalUrl();

// Refreshing the curtain is a request for the page back, not for another copy
// of the curtain, so that navigation goes straight to the original address.
function wasReloaded() {
  const [navigation] = performance.getEntriesByType("navigation");
  return navigation?.type === "reload";
}

async function init() {
  if (target && wasReloaded()) {
    // replace() keeps history clean: Back still leads away from the tab, not
    // into a loop of the curtain.
    location.replace(target);
    return;
  }

  const settings = await getSettings();
  document.documentElement.dataset.theme = settings.theme;

  if (!target) {
    document.title = t("dormantTitle");
    reasonEl.textContent = t("dormantUnused");
    addressEl.textContent = t("dormantNoAddress");
    reactivate.hidden = true;
    keepAwake.hidden = true;
    return;
  }

  const label = labelFor(target);
  document.title = t("dormantTitleWithLabel", [label]);
  titleEl.textContent = new URL(target).hostname;
  reasonEl.textContent = t("dormantReason", [
    formatDurationText(settings.idleMinutes),
  ]);

  const address = addressFor(target);
  addressEl.hidden = !address;
  if (address) addressEl.textContent = address;

  // Nothing to add when the site is already excluded (it can only be a leftover
  // tab from before the exclusion).
  if (isExcluded(target, settings.excludedDomains)) keepAwake.hidden = true;

  const mod = navigator.userAgent.includes("Mac") ? "⌘R" : "Ctrl+R";
  tipEl.textContent = t("dormantTip", [mod]);

  // Enter works without tabbing to the button first, but autofocus would leave
  // a focus ring on an otherwise quiet page.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.activeElement?.tagName === "BUTTON") return;
    event.preventDefault();
    reactivate.click();
  });

  reactivate.addEventListener("click", async () => {
    reactivate.disabled = true;
    reactivate.textContent = t("dormantReactivating");
    try {
      const tab = await chrome.tabs.getCurrent();
      if (!tab?.id) throw new Error("no tab");
      await chrome.tabs.update(tab.id, { url: target });
    } catch {
      reactivate.disabled = false;
      reactivate.textContent = t("dormantReactivate");
      addressEl.hidden = false;
      addressEl.textContent = t("dormantReopenFailed");
    }
  });

  keepAwake.addEventListener("click", async () => {
    keepAwake.disabled = true;
    keepAwake.textContent = t("dormantExcluding");
    const host = hostOf(target);
    try {
      if (!host) throw new Error("no host");
      // Re-read: this page can sit here for hours, and a stale copy would
      // overwrite settings changed elsewhere in the meantime.
      const current = await getSettings();
      const domains = current.excludedDomains.includes(host)
        ? current.excludedDomains
        : [...current.excludedDomains, host];
      await chrome.storage.sync.set({
        settings: { ...current, excludedDomains: domains },
      });
      // The site is no longer a sleeping candidate, so go back to it now.
      location.replace(target);
    } catch {
      keepAwake.disabled = false;
      keepAwake.textContent = t("dormantNeverSleep");
      addressEl.hidden = false;
      addressEl.textContent = t("dormantExcludeFailed");
    }
  });
}

localizeDocument();
init();
