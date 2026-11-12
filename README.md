# Stale Tab Curtain

A minimal Chrome extension. Any background tab you haven't looked at for X
minutes gets unloaded and replaced with a small extension page holding a
**Reactivate** button. Reactivating navigates back to the original address.

Unloading means the tab's renderer actually goes away: no video decoding, no
timers, no websockets, no JavaScript heap. This is the point — an overlay would
leave the page (and its memory) alive behind the blank screen.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder

## Using it

Click the toolbar icon on any site for a one-click toggle:

- **Exclude this site** — adds the current hostname to the exclusion list, so it
  is never put to sleep. `www.` is dropped, so excluding `www.example.com`
  stores `example.com`.
- **Include this site again** — removes the exclusion. If the site is excluded
  through a parent domain (`app.example.com` via `example.com`), the popup says
  so and the button removes that parent entry. Any of its tabs that are already
  asleep are woken up immediately.
- On pages that can't be excluded (`chrome://`, the Web Store, a new tab) it
  explains that instead.

**Settings** in the popup opens the full settings page. Every change saves as you
type — there is no Save button:

- **Put tabs to sleep after** — the idle threshold in **minutes** (default 120, i.e. two
  hours; fractions allowed). The human equivalent ("1.5 hours") is shown as you
  type, and an unusable value is refused with the old value still in effect.
- **Excluded domains** — one host per line or comma separated. A domain also
  covers its subdomains, so `example.com` excludes `app.example.com`.
  `https://…`, paths and `*.` prefixes are accepted and normalized away. The
  count is shown under the box, entries that don't read as a domain are called
  out and never stored, and the box is tidied when you leave the field.
- **Appearance** — System / Light / Dark. The popup, the settings page and the
  sleeping-tab page all use the same palette.

**Reset to defaults** asks for confirmation first.

Everything is stored in `chrome.storage.sync`, so it follows your Chrome
profile.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 declaration |
| `background.js` | timestamp tracking, the scan alarm, sending tabs to sleep |
| `settings.js` | defaults, settings loading, domain matching (shared) |
| `dormant.html` / `dormant.js` | the page that replaces a sleeping tab |
| `popup.html` / `popup.js` | toolbar popup: exclude / include the current site |
| `options.html` / `options.js` | full settings page |
| `theme.css` | light/dark palette shared by the extension's pages |
| `icons/` | PNG icons plus their SVG sources (`logo.svg`, `logo-small.svg`) |

## How it works

- The service worker keeps a `lastActive` timestamp per tab in
  `chrome.storage.session`, refreshed whenever the tab is activated, focused, or
  finishes loading while active.
- A one-minute alarm scans all tabs. If a tab is **not** the active tab, is not
  on an excluded domain, and its timestamp is older than the threshold, the
  worker navigates it to
  `dormant.html#<url-encoded original address>`.
- The original address rides in the fragment, so no extra storage is needed and a
  sleeping tab still knows where to go after a browser restart. The page title
  becomes `[Stale] <host>/<path>`, so the tab strip stays recognisable.
- **Reactivate** navigates the tab back, and Enter does the same without
  reaching for the mouse. If the address is ever missing, the browser's Back
  button still returns to the page.
- **Never sleep this site** on the sleeping-tab page adds the hostname to the
  exclusion list and reopens the page in the same click — the escape hatch when
  the same site keeps getting unloaded.
- Refreshing a sleeping tab (⌘R / Ctrl+R) also brings it back: the tab goes to the
  original address instead of reloading the curtain.
- The active tab is never put to sleep, and non-`http(s)` pages (`chrome://`, the
  Web Store) are skipped.

## Trade-offs

- Reloading a sleeping tab loses its scroll position, form input, and any
  in-page state. That is the price of actually freeing the memory.
- A page with an `beforeunload` prompt may refuse the navigation; it is retried
  on the next sweep.
- Timestamps live in session storage, so a browser restart starts everyone
  fresh.
- The scan runs once a minute, so any threshold below that only changes how old
  a tab must be, not how fast it goes to sleep.
