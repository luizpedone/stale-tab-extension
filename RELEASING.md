# Releasing

Pushing a tag like `v0.7.1` builds, validates, uploads and submits the package
for review. The review itself is still Google's, so this removes the manual zip
and upload, not the wait.

```
1. bump "version" in manifest.json     (the store rejects a re-used version)
2. npm run validate                    (builds dist/, fails on drift)
3. commit, open a PR, merge
4. git tag v0.7.1 && git push origin v0.7.1
```

`v0.7.1` must match the manifest version, or the release job stops before
talking to Google.

## One-time setup

The API cannot create an item, so the first version and the listing must be
submitted by hand in the Developer Dashboard. Everything after that can be
automatic.

1. **Google Cloud project** — enable the *Chrome Web Store API*.
2. **Service account** — create one; no IAM roles needed. Create a JSON key and
   keep it out of the repo.
3. **Grant it access** — Developer Dashboard → *Account* → add the service
   account email. A publisher can have exactly one service account.
4. **Repository secrets** — Settings → Secrets and variables → Actions:

   | Secret | Where it comes from |
   | --- | --- |
   | `CWS_SERVICE_ACCOUNT_JSON` | the whole key file, as text |
   | `CWS_PUBLISHER_ID` | Dashboard → *Account* (Publisher ID) |
   | `CWS_ITEM_ID` | the 32-character extension id |

The publishing Google account needs 2-Step Verification enabled, or Google
refuses to publish.

## Doing it by hand

Same script, same credentials, from a terminal:

```bash
export CWS_PUBLISHER_ID=... CWS_ITEM_ID=...
export CWS_SERVICE_ACCOUNT_JSON="$(cat ~/secrets/cws-service-account.json)"

node scripts/publish.mjs --dry-run    # check the config, send nothing
node scripts/publish.mjs              # upload + submit for review
node scripts/publish.mjs --no-publish # upload only, leave it as a draft
```

## Things that bite

- **A version bump is mandatory.** Uploading the same version twice fails at
  the store, not in CI.
- **Visibility is sticky.** If you change visibility in the dashboard, publish
  once by hand before the API can publish again.
- **Percentage rollout** (above 10,000 seven-day active users) is a separate
  call — `setPublishedDeployPercentage` — and is not wired up here.
- **Untested against the live API.** This script has only ever run with
  `--dry-run`; the first real run is the first real test. Run it locally once
  before relying on the tag workflow, so a typo in a secret name surfaces
  somewhere you can see it.
