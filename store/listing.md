# Stale Tab Curtain — Chrome Web Store listing

Copy/paste answers for the Developer Dashboard
(<https://chrome.google.com/webstore/devconsole>).

## Package

Upload the zip that `npm run validate` writes to `dist/` (it is named after the
manifest version).

Live listing:
<https://chromewebstore.google.com/detail/stale-tab-curtain/dhibnicdmppcmkfojhjhamjagjcbafen>

## Store listing

**Name** (max 75)
```
Stale Tab Curtain
```

**Short description** (max 132 — this one is 123)
```
Sleep background tabs you haven't touched in a while and get their memory back. One click brings them back where they were.
```

**Detailed description**
```
Idle tabs cost memory, battery, and CPU — even the ones you forgot about.
Stale Tab Curtain unloads background tabs after a quiet period you choose, and
replaces each one with a small curtain page holding a single Reactivate button.

Unlike extensions that cover a tab with an overlay, this actually unloads the
page. The tab's renderer goes away: no video decoding, no timers, no websockets,
no JavaScript heap. That is the whole point — a covered tab is still a running
tab.

WHAT YOU GET

• A threshold you set yourself, in minutes (default: two hours).
• Never sleep this site — one click in the toolbar excludes the current
  hostname. Parent domains cover their subdomains, so excluding example.com
  also covers app.example.com.
• A sleeping tab still shows where it came from: the title becomes
  [Stale] host/path.
• Reactivate with the button, or just press Enter. Refreshing the tab works too.
• Light, dark, or follow the system.
• Settings sync with your Chrome profile.

WHAT IT DOES NOT DO

• No account, no sign-up, no telemetry.
• No network requests. Nothing leaves your browser.
• The active tab is never unloaded, and internal pages (chrome://, the Web
  Store) are skipped.

Trade-off: reactivating a tab reloads the page, so scroll position and unsaved
form input in that tab are lost. That is the price of actually freeing the
memory.

Open source, MIT licensed: https://github.com/luizpedone/stale-tab-extension
```

**Category**: Productivity / Tools
**Language**: English (or Portuguese, depending on your audience)

## Privacy practices tab

**Single purpose description**
```
Unload background tabs that have been idle longer than a user-chosen threshold,
replacing them with a local page that can restore the original address.
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `tabs` | The extension must list open tabs, read each tab's URL to decide whether it is an ordinary web page and whether its domain is on the user's exclusion list, and navigate an idle tab to the local curtain page (and back). No tab data is stored outside the browser or sent anywhere. |
| `storage` | `storage.sync` holds the user's settings and exclusion list so they follow the Chrome profile; `storage.session` holds a per-tab last-used timestamp that is cleared when the browser closes. |
| `alarms` | A one-minute periodic alarm triggers the idle scan. A Manifest V3 service worker cannot rely on `setInterval`, since the worker is suspended when idle. |
| Host permissions | None requested. |

**Are you using remote code?** No.

**Data usage** — collect nothing:
- Personally identifiable information: No
- Health information: No
- Financial and payment information: No
- Authentication information: No
- Personal communications: No
- Location: No
- Web history: No (tab URLs are used in memory to apply exclusions; never stored off-device or transmitted)
- User activity: No
- Website content: No

Tick all three certifications:
- Data is not being sold to third parties (outside of approved use cases)
- Data is not being used or transferred for purposes unrelated to the item's
  single purpose
- Data is not being used or transferred to determine creditworthiness or for
  lending purposes

**Privacy policy URL**: needs to be a public URL. Easiest is GitHub Pages on
this repo serving `PRIVACY.md`, or the raw file:
`https://raw.githubusercontent.com/luizpedone/stale-tab-extension/main/PRIVACY.md`

## Graphic assets

All of these are generated from the real extension — see `tools/README.md`.

| Asset | Size | File |
| --- | --- | --- |
| Store icon | 128×128 | `icons/icon128.png` |
| Screenshot — settings | 1280×800 | `store/screenshots/screenshot-1-settings.png` |
| Screenshot — sleeping tab | 1280×800 | `store/screenshots/screenshot-2-sleeping-tab.png` |
| Screenshot — popup | 1280×800 | `store/screenshots/screenshot-3-popup.png` |
| Small promo tile | 440×280 | `store/promo/promo-440x280.png` |
| Marquee promo tile | 1400×560 | `store/promo/promo-1400x560.png` |

Upload the screenshots in that order: settings first (it explains the product),
then the sleeping tab, then the popup.

## Distribution

- **Visibility**: Public
- **Regions**: All
- **Pricing**: Free
