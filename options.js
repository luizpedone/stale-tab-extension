import { DEFAULTS, formatDurationText, getSettings } from "./settings.js";

const MAX_MINUTES = 43200; // matches the input's max attribute
const MINUTES_DEBOUNCE = 500;
const DOMAINS_DEBOUNCE = 800;

const form = document.getElementById("settings");
const minutesInput = document.getElementById("minutes");
const domainsInput = document.getElementById("domains");
const durationHint = document.getElementById("duration-hint");
const domainsNote = document.getElementById("domains-note");
const statusEl = document.getElementById("status");
const resetButton = document.getElementById("reset");
const themeInputs = [...form.querySelectorAll('input[name="theme"]')];

let saved = {
  idleMinutes: DEFAULTS.idleMinutes,
  excludedDomains: DEFAULTS.excludedDomains,
  theme: DEFAULTS.theme,
};
let statusTimer;
let minutesTimer;
let domainsTimer;

function setStatus(text, isError = false) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
  if (text) statusTimer = setTimeout(() => setStatus(""), 2000);
}

function selectedTheme() {
  return themeInputs.find((input) => input.checked)?.value ?? DEFAULTS.theme;
}

// CSS resolves "system" through prefers-color-scheme.
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

// Accepts "example.com", "https://app.example.com/path", "*.example.com",
// comma or newline separated. Keeps bare lowercase hostnames and reports the
// entries it could not read, instead of dropping them silently.
function parseDomains(text) {
  const seen = new Set();
  const domains = [];
  const rejected = [];

  for (const raw of text.split(/[\n,]/)) {
    const entry = raw.trim();
    if (!entry) continue;

    const domain = entry
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/^\*\./, "")
      .replace(/[?#].*$/, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .replace(/^www\./, "")
      .replace(/\.$/, "");

    if (!HOSTNAME.test(domain)) {
      rejected.push(entry);
    } else if (!seen.has(domain)) {
      seen.add(domain);
      domains.push(domain);
    }
  }

  return { domains, rejected };
}

function readMinutes() {
  const raw = minutesInput.value.trim();
  const minutes = Number(raw);
  if (!raw || !Number.isFinite(minutes) || minutes <= 0) {
    return { error: "Enter a number of minutes greater than 0." };
  }
  if (minutes > MAX_MINUTES) {
    return { error: `Keep it at ${MAX_MINUTES} minutes or less.` };
  }
  return { minutes };
}

function renderDurationHint() {
  const { minutes, error } = readMinutes();
  durationHint.textContent = error
    ? `${error} Still sleeping after ${formatDurationText(saved.idleMinutes)}.`
    : `Tabs sleep after ${formatDurationText(minutes)} without use.`;
  durationHint.classList.toggle("warn", Boolean(error));
  minutesInput.setAttribute("aria-invalid", error ? "true" : "false");
}

function renderDomainsNote() {
  const { domains, rejected } = parseDomains(domainsInput.value);

  let text = "No sites excluded.";
  if (domains.length === 1) text = `1 site excluded: ${domains[0]}.`;
  if (domains.length > 1) text = `${domains.length} sites excluded.`;

  if (rejected.length === 1) {
    text += ` Ignored one entry that isn't a domain: ${rejected[0]}.`;
  } else if (rejected.length > 1) {
    text += ` Ignored ${rejected.length} entries that aren't domains: ${rejected.join(
      ", ",
    )}.`;
  }

  domainsNote.textContent = text;
  domainsNote.classList.toggle("warn", rejected.length > 0);
}

function render() {
  renderDurationHint();
  renderDomainsNote();
}

// Every field saves itself, so there is no Save button to forget. Writes are
// skipped when nothing actually changed.
async function persist(patch) {
  const next = {
    idleMinutes: patch.idleMinutes ?? saved.idleMinutes,
    excludedDomains: patch.excludedDomains ?? saved.excludedDomains,
    theme: patch.theme ?? saved.theme,
  };

  const unchanged =
    next.idleMinutes === saved.idleMinutes &&
    next.theme === saved.theme &&
    JSON.stringify(next.excludedDomains) === JSON.stringify(saved.excludedDomains);
  if (unchanged) return;

  const previous = saved;
  saved = next;
  try {
    await chrome.storage.sync.set({ settings: next });
    setStatus("Saved.");
  } catch {
    saved = previous;
    setStatus("Couldn't save — check that Chrome sync is available.", true);
  }
}

function saveMinutes() {
  const { minutes } = readMinutes();
  if (minutes === undefined) return; // keep the last valid value stored
  persist({ idleMinutes: minutes });
}

function saveDomains({ canonicalize = false } = {}) {
  const { domains } = parseDomains(domainsInput.value);

  // Only tidy the box once the person is done with it; rewriting mid-typing
  // would move their cursor around.
  if (canonicalize) {
    const canonical = domains.join("\n");
    if (domainsInput.value.trim() !== canonical) domainsInput.value = canonical;
    renderDomainsNote();
  }

  persist({ excludedDomains: domains });
}

function fill({ idleMinutes, excludedDomains, theme }) {
  minutesInput.value = idleMinutes;
  domainsInput.value = excludedDomains.join("\n");
  for (const input of themeInputs) input.checked = input.value === theme;
  applyTheme(theme);
}

minutesInput.addEventListener("input", () => {
  renderDurationHint();
  clearTimeout(minutesTimer);
  minutesTimer = setTimeout(() => {
    minutesTimer = null;
    saveMinutes();
  }, MINUTES_DEBOUNCE);
});

minutesInput.addEventListener("change", () => {
  clearTimeout(minutesTimer);
  minutesTimer = null;
  saveMinutes();
});

domainsInput.addEventListener("input", () => {
  renderDomainsNote();
  clearTimeout(domainsTimer);
  domainsTimer = setTimeout(() => {
    domainsTimer = null;
    saveDomains();
  }, DOMAINS_DEBOUNCE);
});

domainsInput.addEventListener("change", () => {
  clearTimeout(domainsTimer);
  domainsTimer = null;
  saveDomains({ canonicalize: true });
});

for (const input of themeInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    applyTheme(input.value);
    persist({ theme: input.value });
  });
}

// No submit button left, but Enter in the number field can still submit.
form.addEventListener("submit", (event) => event.preventDefault());

// Closing or hiding the page inside the debounce window must not lose the edit.
function flushPending() {
  if (minutesTimer) {
    clearTimeout(minutesTimer);
    minutesTimer = null;
    saveMinutes();
  }
  if (domainsTimer) {
    clearTimeout(domainsTimer);
    domainsTimer = null;
    saveDomains();
  }
}

window.addEventListener("pagehide", flushPending);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPending();
});

resetButton.addEventListener("click", async () => {
  const ok = confirm(
    "Reset every setting to its default? Your excluded sites will be removed.",
  );
  if (!ok) return;

  clearTimeout(minutesTimer);
  clearTimeout(domainsTimer);

  const defaults = {
    idleMinutes: DEFAULTS.idleMinutes,
    excludedDomains: DEFAULTS.excludedDomains,
    theme: DEFAULTS.theme,
  };

  saved = defaults;
  try {
    await chrome.storage.sync.set({ settings: defaults });
  } catch {
    setStatus("Couldn't reset — check that Chrome sync is available.", true);
    return;
  }
  fill(defaults);
  render();
  setStatus("Defaults restored.");
});

getSettings().then((settings) => {
  saved = {
    idleMinutes: settings.idleMinutes,
    excludedDomains: settings.excludedDomains,
    theme: settings.theme,
  };
  fill(settings);
  render();
});
