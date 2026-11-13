# Privacy Policy — Stale Tab Curtain

Last updated: 13 November 2026

Stale Tab Curtain is a browser extension that unloads idle background tabs. This
policy explains what the extension does with your data. The short version: it
keeps everything on your device and sends nothing anywhere.

## What the extension stores

All data stays inside your browser, in Chrome's built-in extension storage:

- **Settings** — your idle threshold, excluded domains, and appearance choice.
  Stored in `chrome.storage.sync`, which is why they follow your Chrome profile
  between signed-in devices. This is Chrome's own sync; the developer has no
  access to it.
- **Per-tab timestamps** — when each tab was last used. Stored in
  `chrome.storage.session`, in memory, and cleared when the browser closes.

## What the extension reads

- The list of open tabs, and each tab's URL, to decide whether a tab is idle and
  whether its domain is on your exclusion list.
- The URL of the tab you are on when you open the toolbar popup, so it can offer
  to exclude that site.

This information is used in memory to make those decisions. It is never written
to a server, never logged, and never shared.

## What the extension does not do

- No analytics, telemetry, crash reporting, or usage tracking.
- No network requests of any kind. The extension makes no HTTP calls.
- No accounts, cookies, or advertising identifiers.
- No sale or transfer of data to third parties.
- No remote code. All JavaScript is bundled in the extension package.

## Permissions

- `tabs` — list tabs, read tab URLs, and navigate a tab to the local curtain page.
- `storage` — save settings and per-tab timestamps, as described above.
- `alarms` — run the periodic idle scan, since Manifest V3 service workers cannot
  use timers reliably.
- No host permissions are requested.

## Children

The extension is not directed at children and collects no data from anyone.

## Changes

If this policy changes, the updated version will be published at this address
with a new "last updated" date.

## Contact

Questions about this policy: open an issue at
<https://github.com/luizpedone/stale-tab-extension/issues>.
