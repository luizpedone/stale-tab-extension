import { getSettings, isExcluded } from "./settings.js";

const ALARM_NAME = "stale-tab-check";
const KEY_PREFIX = "lastActive:";

const DORMANT_PAGE = chrome.runtime.getURL("dormant.html");

// The original address rides along in the fragment, so it survives a browser
// restart and the tab can always be brought back.
function dormantUrl(url) {
  return `${DORMANT_PAGE}#${encodeURIComponent(url)}`;
}

function originalUrl(dormantPageUrl) {
  const hash = dormantPageUrl.slice(dormantPageUrl.indexOf("#") + 1);
  if (!hash) return null;
  try {
    const url = decodeURIComponent(hash);
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- timestamps */

async function touch(tabId) {
  if (typeof tabId !== "number" || tabId < 0) return;
  await chrome.storage.session.set({ [KEY_PREFIX + tabId]: Date.now() });
}

async function forget(tabId) {
  await chrome.storage.session.remove(KEY_PREFIX + tabId);
}

// On install / browser start every open tab counts as just used, so nothing is
// unloaded the moment Chrome opens.
async function seedAllTabs() {
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const patch = {};
  for (const tab of tabs) {
    if (tab.id != null) patch[KEY_PREFIX + tab.id] = now;
  }
  await chrome.storage.session.set(patch);
}

chrome.runtime.onInstalled.addListener(() => {
  seedAllTabs();
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  seedAllTabs();
  ensureAlarm();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  touch(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) touch(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forget(tabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab?.id != null) touch(tab.id);
});

/* ------------------------------------------------------------------ sweeping */

async function checkTabs() {
  const now = Date.now();
  const { idleMinutes, excludedDomains } = await getSettings();
  const idleMs = idleMinutes * 60 * 1000;

  const tabs = await chrome.tabs.query({ status: "complete" });
  const store = await chrome.storage.session.get(null);

  for (const tab of tabs) {
    if (tab.id == null || tab.active) continue;
    // Only ordinary web pages can be unloaded; dormant.html is left alone.
    if (!/^https?:\/\//i.test(tab.url || "")) continue;
    if (isExcluded(tab.url, excludedDomains)) continue;

    const last = store[KEY_PREFIX + tab.id];
    if (typeof last !== "number") {
      await touch(tab.id);
      continue;
    }
    if (now - last < idleMs) continue;

    // Navigate away instead of covering the page: the renderer and everything
    // it holds (video decoders, timers, websockets) is dropped.
    chrome.tabs.update(tab.id, { url: dormantUrl(tab.url) }).catch(() => {
      // tab vanished or refused the navigation — try again next sweep
    });
  }
}

// Excluding a site should wake any of its tabs that are already asleep.
async function restoreExcludedDormant() {
  const { excludedDomains } = await getSettings();
  if (!excludedDomains.length) return;

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id == null || !tab.url?.startsWith(DORMANT_PAGE)) continue;

    const url = originalUrl(tab.url);
    if (!url || !isExcluded(url, excludedDomains)) continue;

    chrome.tabs.update(tab.id, { url }).catch(() => {});
    touch(tab.id);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.settings) return;
  restoreExcludedDormant();
});

/* ------------------------------------------------------------------- scheduling */

function ensureAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) checkTabs();
});

ensureAlarm();
