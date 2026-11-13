// Uploads the built package to the Chrome Web Store and optionally submits it
// for review, using the Chrome Web Store API v2 and a service account.
//
//   node scripts/publish.mjs --dry-run   # checks config, no network
//   node scripts/publish.mjs             # upload + publish
//   node scripts/publish.mjs --no-publish # upload only, leave it as a draft
//
// Credentials, all from the environment so nothing lands in the repo:
//   CWS_SERVICE_ACCOUNT_JSON  the service account key file, verbatim
//   CWS_PUBLISHER_ID          Developer Dashboard -> Account
//   CWS_ITEM_ID               the 32-character extension id
//
// No dependencies: the JWT is signed with node:crypto and the calls use fetch.
import { createSign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://chromewebstore.googleapis.com/v2";
const UPLOAD_API = "https://chromewebstore.googleapis.com/upload/v2";
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const POLL_LIMIT = 20;
const POLL_DELAY_MS = 3000;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const uploadOnly = args.has("--no-publish");

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

/* ------------------------------------------------------------------- inputs */

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "manifest.json"), "utf8"));
const zipPath = path.join("dist", `stale-tab-curtain-${manifest.version}.zip`);

if (!fs.existsSync(zipPath)) fail(`missing ${zipPath} — run \`npm run validate\` first`);

// A tag like v0.7.1 must match the manifest, or the store would publish a
// version nobody intended (and reject the upload anyway).
const ref = process.env.GITHUB_REF_NAME;
if (ref?.startsWith("v") && ref !== `v${manifest.version}`) {
  fail(`tag ${ref} does not match manifest version ${manifest.version}`);
}

const publisherId = process.env.CWS_PUBLISHER_ID;
const itemId = process.env.CWS_ITEM_ID;
const keyJson = process.env.CWS_SERVICE_ACCOUNT_JSON;

if (!publisherId) fail("CWS_PUBLISHER_ID is not set");
if (!itemId) fail("CWS_ITEM_ID is not set");
if (!dryRun && !keyJson) fail("CWS_SERVICE_ACCOUNT_JSON is not set");

const base = `${API}/publishers/${publisherId}/items/${itemId}`;
const uploadUrl = `${UPLOAD_API}/publishers/${publisherId}/items/${itemId}:upload`;
const zip = fs.readFileSync(zipPath);

console.log(`item        ${itemId}`);
console.log(`publisher   ${publisherId}`);
console.log(`version     ${manifest.version}`);
console.log(`package     ${zipPath} (${(zip.length / 1024).toFixed(0)} KB)`);
console.log(`action      ${uploadOnly ? "upload only" : "upload and publish"}`);

if (dryRun) {
  console.log("\n✓ dry run: configuration looks usable, nothing was sent");
  process.exit(0);
}

/* ---------------------------------------------------------------- auth: JWT */

const base64url = (value) => Buffer.from(value).toString("base64url");

function assertion(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(account.private_key, "base64url");

  return `${unsigned}.${signature}`;
}

async function accessToken() {
  let account;
  try {
    account = JSON.parse(keyJson);
  } catch {
    fail("CWS_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!account.client_email || !account.private_key) {
    fail("CWS_SERVICE_ACCOUNT_JSON has no client_email or private_key");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion(account),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`token exchange failed (${response.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

/* ------------------------------------------------------------------ actions */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(token, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) fail(`${url.split("/").pop()} failed (${response.status}): ${text}`);
  return body;
}

// The upload is asynchronous: uploadState can come back IN_PROGRESS and has to
// be polled until it settles.
async function waitForUpload(token, initial) {
  let state = initial.uploadState ?? initial.lastAsyncUploadState;
  for (let attempt = 0; attempt < POLL_LIMIT && state === "IN_PROGRESS"; attempt += 1) {
    await sleep(POLL_DELAY_MS);
    const status = await call(token, `${base}:fetchStatus`);
    state = status.uploadState ?? status.lastAsyncUploadState ?? state;
    console.log(`  upload    ${state}`);
  }
  if (state !== "SUCCEEDED" && state !== "NOT_FOUND") {
    if (state === "IN_PROGRESS") fail("upload did not finish in time");
  }
  return state;
}

try {
  const token = await accessToken();
  console.log("\n✓ authenticated as the service account");

  const uploaded = await call(token, uploadUrl, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: zip,
  });
  console.log(`✓ uploaded  uploadState=${uploaded.uploadState ?? "unknown"}`);
  await waitForUpload(token, uploaded);

  if (uploadOnly) {
    console.log("✓ uploaded, left unpublished (--no-publish)");
    process.exit(0);
  }

  const published = await call(token, `${base}:publish`, { method: "POST" });
  console.log(`✓ submitted for review  state=${published.state ?? "unknown"}`);

  const status = await call(token, `${base}:fetchStatus`);
  console.log(`  review    ${status.submittedForReview ? "submitted" : "not submitted"}`);
} catch (error) {
  fail(error.message ?? String(error));
}
