// Validates the extension and builds the Chrome Web Store package.
//
// No dependencies: the checks that matter here are structural, and every one of
// them maps to something that has actually broken or would get a submission
// rejected. Run with `node scripts/validate.mjs`; it writes the zip to dist/.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

// Everything that belongs in the uploaded package. A file the manifest refers to
// but that is missing here fails the build, so the list cannot drift silently.
const RUNTIME = [
  "manifest.json",
  "background.js",
  "dormant.html",
  "dormant.js",
  "options.html",
  "options.js",
  "popup.html",
  "popup.js",
  "settings.js",
  "theme.css",
  "icons",
  "_locales",
];

// A new permission is a deliberate product decision: it needs a justification
// in the store listing and, usually, user-facing copy. Fail until this list is
// updated on purpose.
const ALLOWED_PERMISSIONS = ["alarms", "storage", "tabs"];

const errors = [];
const notes = [];
const fail = (message) => errors.push(message);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

/* ------------------------------------------------------------------ manifest */

const manifest = JSON.parse(read("manifest.json"));

/* -------------------------------------------------------------------- locales */

const LOCALES_DIR = path.join(ROOT, "_locales");
const locales = new Map();

if (!fs.existsSync(LOCALES_DIR)) {
  fail("_locales is missing");
} else {
  for (const dir of fs.readdirSync(LOCALES_DIR)) {
    const file = path.join(LOCALES_DIR, dir, "messages.json");
    if (!fs.existsSync(file)) {
      fail(`_locales/${dir} has no messages.json`);
      continue;
    }
    try {
      locales.set(dir, JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (error) {
      fail(`_locales/${dir}/messages.json: ${error.message}`);
    }
  }
}

if (locales.size && !manifest.default_locale) fail("manifest.json has no default_locale");
if (manifest.default_locale && !locales.has(manifest.default_locale)) {
  fail(`default_locale "${manifest.default_locale}" has no _locales/${manifest.default_locale}/messages.json`);
}

const defaultMessages = locales.get(manifest.default_locale) ?? {};
const resolveMessage = (value) =>
  typeof value === "string"
    ? value.replace(/__MSG_(\w+)__/g, (_, key) => defaultMessages[key]?.message ?? `__MISSING_${key}__`)
    : value;

for (const [, key] of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) {
  if (!defaultMessages[key]) fail(`manifest.json uses __MSG_${key}__ but default_locale has no "${key}"`);
}

if (manifest.manifest_version !== 3) fail("manifest_version must be 3");
if (!/^\d+(\.\d+){1,3}$/.test(manifest.version ?? "")) fail(`unusable version: ${manifest.version}`);

const description = resolveMessage(manifest.description) ?? "";
if (description.length > 132) {
  fail(`description is ${description.length} chars, the store allows 132`);
}
if (!manifest.icons?.["128"]) fail("manifest.icons is missing the 128px entry the store requires");

const referenced = [
  manifest.background?.service_worker,
  manifest.options_ui?.page,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);

for (const file of referenced) {
  if (!fs.existsSync(path.join(ROOT, file))) fail(`manifest refers to a missing file: ${file}`);
}

const permissions = [...(manifest.permissions ?? [])].sort();
const unexpected = permissions.filter((p) => !ALLOWED_PERMISSIONS.includes(p));
const dropped = ALLOWED_PERMISSIONS.filter((p) => !permissions.includes(p));
if (unexpected.length) fail(`unjustified permission(s): ${unexpected.join(", ")} — add one to ALLOWED_PERMISSIONS and to store/listing.md`);
if (dropped.length) fail(`permission(s) listed but no longer requested: ${dropped.join(", ")} — remove them from ALLOWED_PERMISSIONS`);
if (manifest.host_permissions?.length) fail(`host_permissions requested: ${manifest.host_permissions.join(", ")}`);

/* ---------------------------------------------------------------------- html */

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

for (const file of htmlFiles) {
  const html = read(file);

  if (/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html)) {
    fail(`${file}: inline <script> — blocked by the MV3 content security policy`);
  }
  if (/\son[a-z]+\s*=\s*["']/i.test(html)) {
    fail(`${file}: inline event handler (on*=) — blocked by the MV3 content security policy`);
  }
  if (/https?:\/\//i.test(html)) fail(`${file}: remote URL — the extension must not load anything off-device`);

  for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(#|data:|mailto:)/.test(asset)) continue;
    if (!fs.existsSync(path.join(ROOT, asset))) fail(`${file}: refers to a missing file: ${asset}`);
  }
}

/* ------------------------------------------------------------------------ js */

const jsFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".js"));

for (const file of jsFiles) {
  const js = read(file);

  if (/\beval\s*\(/.test(js)) fail(`${file}: eval() — blocked by the MV3 content security policy`);
  if (/\bnew\s+Function\s*\(/.test(js)) fail(`${file}: new Function() — blocked by the MV3 content security policy`);
  // The privacy policy promises no network access at all.
  if (/\bfetch\s*\(/.test(js)) fail(`${file}: fetch() — the extension promises no network requests`);
  if (/\bXMLHttpRequest\b/.test(js)) fail(`${file}: XMLHttpRequest — the extension promises no network requests`);
  if (/\bimport\s*\(\s*["'`]https?:/.test(js)) fail(`${file}: remote dynamic import`);
}

/* ------------------------------------------------------------------ messages */

const placeholders = (message) => [...message.matchAll(/\$(\d+)/g)].map((m) => m[1]).sort().join(",");

for (const [locale, messages] of locales) {
  if (locale === manifest.default_locale) continue;

  for (const key of Object.keys(defaultMessages)) {
    if (!messages[key]) fail(`_locales/${locale}: missing message "${key}"`);
  }
  for (const key of Object.keys(messages)) {
    if (!defaultMessages[key]) fail(`_locales/${locale}: message "${key}" does not exist in ${manifest.default_locale}`);
    else if (placeholders(messages[key].message) !== placeholders(defaultMessages[key].message)) {
      fail(`_locales/${locale}: "${key}" has placeholders [${placeholders(messages[key].message)}], default has [${placeholders(defaultMessages[key].message)}]`);
    }
  }
}

// "pt" is the fallback for Portuguese locales that are neither pt_BR nor pt_PT
// (Angola, Mozambique, …). It carries the European Portuguese text, so a change
// to one has to land in both; silent drift between them would only surface in
// locales nobody tests.
for (const [alias, source] of [["pt", "pt_PT"]]) {
  const aliasMessages = locales.get(alias);
  const sourceMessages = locales.get(source);
  if (!aliasMessages || !sourceMessages) continue;

  for (const key of Object.keys(sourceMessages)) {
    const a = aliasMessages[key]?.message;
    const b = sourceMessages[key]?.message;
    if (a && b && a !== b) {
      fail(`_locales/${alias} and _locales/${source} disagree on "${key}" — update both`);
    }
  }
}

// Every key the pages ask for must exist, or the UI renders blank.
const usedKeys = new Set();
for (const file of [...htmlFiles, ...jsFiles]) {
  const source = read(file);
  for (const match of source.matchAll(/data-i18n(?:-html|-title|-aria-label|-placeholder)?="([A-Za-z0-9_]+)"/g)) usedKeys.add(match[1]);
  for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) usedKeys.add(match[1]);
}

for (const key of usedKeys) {
  if (!defaultMessages[key]) fail(`message "${key}" is used in a page but not defined in ${manifest.default_locale}`);
}

const unused = Object.keys(defaultMessages).filter(
  (key) => !usedKeys.has(key) && !JSON.stringify(manifest).includes(`__MSG_${key}__`),
);
if (unused.length) notes.push(`unused messages: ${unused.join(", ")}`);

/* --------------------------------------------------------------------- icons */

// Minimal PNG reader: dimensions from IHDR, and for 8-bit RGBA the alpha plane
// after unfiltering, which is how the fully transparent 128px icon was caught.
function readPng(file) {
  const png = fs.readFileSync(path.join(ROOT, file));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!png.subarray(0, 8).equals(signature)) return { error: "not a PNG" };

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const depth = png[24];
  const colorType = png[25];

  const idat = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const result = { width, height, depth, colorType };

  if (colorType === 6 && depth === 8) {
    const channels = 4;
    const stride = width * channels;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const pixels = Buffer.alloc(stride * height);
    const paeth = (a, b, c) => {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };

    for (let y = 0; y < height; y += 1) {
      const filter = raw[y * (stride + 1)];
      const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? pixels[y * stride + x - channels] : 0;
        const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
        const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
        let value = line[x];
        if (filter === 1) value += left;
        else if (filter === 2) value += up;
        else if (filter === 3) value += (left + up) >> 1;
        else if (filter === 4) value += paeth(left, up, upLeft);
        else if (filter !== 0) return { ...result, error: `unknown PNG filter ${filter}` };
        pixels[y * stride + x] = value & 0xff;
      }
    }

    let maxAlpha = 0;
    for (let i = 3; i < pixels.length; i += 4) maxAlpha = Math.max(maxAlpha, pixels[i]);
    result.maxAlpha = maxAlpha;
  }

  return result;
}

const iconFiles = fs.readdirSync(path.join(ROOT, "icons")).filter((f) => f.endsWith(".png"));
for (const name of iconFiles) {
  const file = path.join("icons", name);
  const expected = Number(name.match(/^icon(\d+)\.png$/)?.[1]);
  const png = readPng(file);

  if (png.error) {
    fail(`${file}: ${png.error}`);
    continue;
  }
  if (expected && (png.width !== expected || png.height !== expected)) {
    fail(`${file}: is ${png.width}x${png.height}, the name says ${expected}x${expected}`);
  }
  if (png.maxAlpha === 0) fail(`${file}: fully transparent — Chrome renders nothing`);
  if (png.maxAlpha === undefined) notes.push(`${file}: alpha not checked (unsupported PNG format)`);
}

/* ------------------------------------------------------------ store graphics */

const expectedGraphics = {
  "store/screenshots/screenshot-1-settings.png": [1280, 800],
  "store/screenshots/screenshot-2-sleeping-tab.png": [1280, 800],
  "store/screenshots/screenshot-3-popup.png": [1280, 800],
  "store/promo/promo-440x280.png": [440, 280],
  "store/promo/promo-1400x560.png": [1400, 560],
};

for (const [file, [width, height]] of Object.entries(expectedGraphics)) {
  if (!fs.existsSync(path.join(ROOT, file))) {
    fail(`missing store graphic: ${file}`);
    continue;
  }
  const png = readPng(file);
  if (png.error) fail(`${file}: ${png.error}`);
  else if (png.width !== width || png.height !== height) fail(`${file}: is ${png.width}x${png.height}, expected ${width}x${height}`);
}

/* -------------------------------------------------------------------- package */

const packageFiles = [];
for (const entry of RUNTIME) {
  if (!fs.existsSync(path.join(ROOT, entry))) fail(`package file missing: ${entry}`);
}
const walk = (dir) => {
  for (const item of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, item.name);
    if (item.isDirectory()) walk(rel);
    else if (item.name !== ".DS_Store") packageFiles.push(rel);
  }
};
for (const entry of RUNTIME) {
  if (fs.statSync(path.join(ROOT, entry)).isDirectory()) walk(entry);
  else packageFiles.push(entry);
}

const zipName = `stale-tab-curtain-${manifest.version}.zip`;
const zipPath = path.join(DIST, zipName);

if (!errors.length) {
  fs.mkdirSync(DIST, { recursive: true });
  fs.rmSync(zipPath, { force: true });
  execFileSync("zip", ["-r", "-q", "-X", zipPath, ...packageFiles], { cwd: ROOT });

  const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((e) => !e.endsWith("/"));

  const missing = packageFiles.filter((f) => !entries.includes(f));
  const extra = entries.filter((e) => !packageFiles.includes(e));
  if (!entries.includes("manifest.json")) fail("the package has no manifest.json at its root");
  if (missing.length) fail(`package is missing: ${missing.join(", ")}`);
  if (extra.length) fail(`package has unexpected entries: ${extra.join(", ")}`);

  const leaked = entries.filter((e) => /^(store|test|scripts|dist|\.github)\//.test(e) || /^(README|LICENSE|PRIVACY|package)/.test(e));
  if (leaked.length) fail(`package leaks development files: ${leaked.join(", ")}`);
}

/* --------------------------------------------------------------------- report */

for (const note of notes) console.log(`note: ${note}`);

if (errors.length) {
  console.error(`\n${errors.length} check(s) failed:`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

const size = (fs.statSync(zipPath).size / 1024).toFixed(0);
console.log(`✓ ${packageFiles.length} files, all checks passed`);
console.log(`✓ dist/${zipName} (${size} KB)`);
