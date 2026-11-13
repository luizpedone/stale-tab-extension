// Captures every Chrome Web Store image for Stale Tab Curtain from the real extension.
// Usage: node cdp-capture.mjs <port> <extId> <outDir>
import { writeFileSync, mkdirSync } from "node:fs";

const [port, extId, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  const k = `${m.sessionId ?? ""}:${m.id}`;
  if (k && pending.has(k)) { pending.get(k)(m); pending.delete(k); }
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(`${sessionId ?? ""}:${i}`, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

const attach = async (targetId) => (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
const targets = async () => (await send("Target.getTargets")).targetInfos;

async function shotPage(url, out, { width = 1280, height = 800, dsf = 1, wait = 1800, transparent = false, targetId } = {}) {
  const tid = targetId ?? (await send("Target.createTarget", { url: "about:blank" })).targetId;
  const s = await attach(tid);
  await send("Page.enable", {}, s);
  if (transparent) await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 255, g: 255, b: 255, a: 0 } }, s);
  if (!targetId) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dsf, mobile: false }, s);
  }
  if (url) await send("Page.navigate", { url }, s);
  await sleep(wait);
  const { data } = await send("Page.captureScreenshot", { format: "png", omitBackground: transparent, captureBeyondViewport: true }, s);
  writeFileSync(out, Buffer.from(data, "base64"));
  const { cssContentSize } = await send("Page.getLayoutMetrics", {}, s);
  console.log(`saved ${out} (${cssContentSize.width}x${cssContentSize.height} css @${dsf}x)`);
  if (!targetId) await send("Target.closeTarget", { targetId: tid });
  return s;
}

try {
  // ---------- seed realistic settings so the UI doesn't show an empty state
  const swTarget = (await targets()).find((t) => t.type === "service_worker" && t.url.includes(extId));
  if (!swTarget) throw new Error("extension service worker not found");
  const sw = await attach(swTarget.targetId);
  const seeded = await send("Runtime.evaluate", {
    expression: `(async () => { try { await chrome.storage.sync.set({ settings: { idleMinutes: 120, excludedDomains: ["mail.google.com", "calendar.google.com"], theme: "system" } }); const got = await chrome.storage.sync.get(null); return "seeded " + JSON.stringify(got); } catch (e) { return "err " + e.message; } })()`,
    awaitPromise: true, returnByValue: true,
  }, sw);
  console.log("settings:", seeded.result.value, seeded.exceptionDetails ? JSON.stringify(seeded.exceptionDetails).slice(0,200) : "");

  // ---------- 1. options page (native 1280x800)
  await shotPage(`chrome-extension://${extId}/options.html`, `${outDir}/screenshot-1-settings.png`);

  // ---------- 2. sleeping tab (native 1280x800)
  const dormantUrl = `chrome-extension://${extId}/dormant.html#${encodeURIComponent("https://news.ycombinator.com/item?id=41234567")}`;
  await shotPage(dormantUrl, `${outDir}/screenshot-2-sleeping-tab.png`);

  // ---------- 3. real action popup, rendered at 2x
  const page = (await targets()).find((t) => t.type === "page" && !t.url.startsWith("chrome-extension://"));
  const ps = await attach(page.targetId);
  await send("Page.enable", {}, ps);
  await send("Page.navigate", { url: "https://news.ycombinator.com/" }, ps);
  await sleep(2500);
  const opened = await send("Runtime.evaluate", {
    expression: `chrome.action.openPopup().then(() => "ok").catch(e => "err: " + e.message)`,
    awaitPromise: true, returnByValue: true, userGesture: true,
  }, sw);
  console.log("openPopup:", opened.result.value);
  await sleep(1200);

  let popup = (await targets()).find((t) => t.url.includes("popup.html"));
  if (!popup) throw new Error("popup target missing");
  let pSession = await attach(popup.targetId);
  await send("Page.enable", {}, pSession);
  const { cssContentSize } = await send("Page.getLayoutMetrics", {}, pSession);
  const pw = Math.ceil(cssContentSize.width), ph = Math.ceil(cssContentSize.height);
  await sleep(500);
  let png = await send("Page.captureScreenshot", { format: "png" }, pSession);
  writeFileSync(`${outDir}/screenshot-3-popup.png`, Buffer.from(png.data, "base64"));
  console.log(`saved screenshot-3-popup.png (${pw}x${ph} css native)`);

  // ---------- 4. logo at 512px, transparent, for the promo tiles
  await shotPage(`chrome-extension://${extId}/icons/logo.svg`, `${outDir}/logo-512.png`, { width: 128, height: 128, dsf: 4, wait: 900, transparent: true });
} catch (e) {
  console.error("FAILED", e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}
