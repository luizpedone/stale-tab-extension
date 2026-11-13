# Releasing

Pushing a tag like `v0.7.1` builds, validates, uploads and submits the package
for review. The review itself is still Google's, so this removes the manual zip
and upload, not the wait.

It has run for real: `v0.7.0` uploaded and submitted 0.7.0, and the status API
came back `PENDING_REVIEW` with 0.6.0 still `PUBLISHED` until Google approved.

```
1. bump "version" in manifest.json     (the store rejects a re-used version)
2. npm run validate                    (builds dist/, fails on drift)
3. commit, open a PR, merge
4. git tag v0.7.1 && git push origin v0.7.1
```

`v0.7.1` must match the manifest version, or the release job stops before
talking to Google.

## One-time setup

The API cannot create an item, so the first version and the listing had to be
submitted by hand in the Developer Dashboard. That is done — the listing is live
at
<https://chromewebstore.google.com/detail/stale-tab-curtain/dhibnicdmppcmkfojhjhamjagjcbafen>.
Everything after that can be automatic.

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
   | `CWS_ITEM_ID` | the 32-character extension id (`dhibnicdmppcmkfojhjhamjagjcbafen`, also in the store URL) |

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
  the store, not in CI. A version that was ever uploaded is spent, even if it
  was never published.
- **An empty secret looks set.** `gh secret set NAME` with no value reads stdin,
  so in a non-interactive shell it stores an empty string while `gh secret list`
  still shows the name. The release then dies on `CWS_ITEM_ID is not set`. Always
  pass the value: `gh secret set NAME --body "..."` or `< file`.
- **Visibility is sticky.** If you change visibility in the dashboard, publish
  once by hand before the API can publish again.
- **Percentage rollout** (above 10,000 seven-day active users) is a separate
  call — `setPublishedDeployPercentage` — and is not wired up here.
- **The credential is one key file.** `~/secrets/cws-service-account.json` (or
  the `CWS_SERVICE_ACCOUNT_JSON` secret). A publisher can have exactly one
  service account, so deleting and recreating it means re-linking it in the
  dashboard's Account page before the next release.
