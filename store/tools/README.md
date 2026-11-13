# Store graphics

The Chrome Web Store needs a listing icon, at least one 1280×800 screenshot, and
(optionally) promo tiles. Everything in `../screenshots` and `../promo` is
generated from the real extension — no mockups.

## Files

| Path | What it is |
| --- | --- |
| `../raw/` | untouched captures straight out of Chrome |
| `../screenshots/` | 1280×800 images to upload |
| `../promo/promo-440x280.png` | small promo tile |
| `../promo/promo-1400x560.png` | marquee promo tile |
| `capture-screenshots.mjs` | CDP driver: loads the extension, captures pages and the real popup |
| `load-extension.mjs` | loads an unpacked extension via the CDP `Extensions` domain |
| `compose-graphics.py` | builds the popup screenshot and the promo tiles with Pillow |

## Regenerating

Chrome no longer honours `--load-extension` from the command line, so the
extension is loaded through CDP instead, in a throwaway profile:

```bash
# 1. headless Chrome with the unsafe-extension-debugging switch
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-first-run \
  --user-data-dir=/tmp/stc-profile \
  --enable-unsafe-extension-debugging \
  --remote-debugging-port=9333 --window-size=1280,800 about:blank &

# 2. load the extension (prints the id Chrome assigned)
node --experimental-websocket store/tools/load-extension.mjs 9333 "$PWD"

# 3. capture pages, the real action popup, and the logo at 4x
node --experimental-websocket store/tools/capture-screenshots.mjs \
  9333 <id> "$PWD/store/raw"

# 4. compose the store images
python3 store/tools/compose-graphics.py
```

`capture-screenshots.mjs` seeds `chrome.storage.sync` with two excluded domains
first, so the settings screenshot shows a lived-in state instead of an empty
form. Nothing in the extension is modified; the popup capture is the genuine
`chrome.action.openPopup()` window, opened with a synthetic user gesture.

## Notes

- `--headless=new` reports the popup as a window that cannot be resized or have
  its device metrics overridden, so the popup is captured at its native 300×154
  and doubled with Lanczos in `compose-graphics.py`.
- `icons/icon128.png` was fully transparent until it was regenerated from
  `icons/logo.svg`; `raw/logo-512.png` is that render, and the promo tiles use
  it.
