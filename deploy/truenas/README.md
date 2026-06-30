# Deploy Magpie on TrueNAS SCALE

Magpie installs on **TrueNAS SCALE Electric Eel (24.10) / Fangtooth (25.04)+**
as a single **Custom App** from a Docker Compose file. The four services
(backend, frontend, flaresolverr, camoufox) run together but appear as one app.

> Older TrueNAS (Dragonfish 24.04 and earlier) uses Kubernetes and won't take a
> Compose file — upgrade to Electric Eel+ first.

## 1. Publish the images (one time)

TrueNAS pulls images from a registry; it does not build from source. CI builds
and pushes them to GHCR for you:

1. Tag a release so the `release` workflow runs:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
   (or run the **release** workflow manually from the GitHub Actions tab.)
2. After it finishes, three packages exist:
   - `ghcr.io/godwin42sh/magpie-backend`
   - `ghcr.io/godwin42sh/magpie-frontend`
   - `ghcr.io/godwin42sh/magpie-camoufox`
3. Make them **public** so TrueNAS can pull without credentials:
   GitHub → your profile → **Packages** → open each `magpie-*` package →
   **Package settings** → **Change visibility** → **Public**.
   (Or keep them private and add registry credentials when installing the app.)

`flaresolverr` is a public upstream image — nothing to publish.

## 2. Create a dataset for the data

Magpie persists `config.json` (your monitored sites) and `state/` (snapshots).
In TrueNAS: **Datasets** → create e.g. `tank/apps/magpie` (note its mount path,
e.g. `/mnt/tank/apps/magpie`). Make sure the app can write to it.

## 3. Install the Custom App

1. **Apps** → **Discover Apps** → top-right menu → **Install via YAML**
   (a.k.a. Custom App).
2. Give it a name (e.g. `magpie`).
3. Paste the contents of [`docker-compose.yaml`](./docker-compose.yaml).
4. Edit the two `TODO`s:
   - `NOTIFY_WEBHOOK_URL` — your Discord/Slack incoming webhook (or leave empty).
   - the volume path — replace `/mnt/POOL/apps/magpie/data` with your dataset,
     e.g. `/mnt/tank/apps/magpie/data`.
   - (optional) change the published port `8080:80` if 8080 is in use.
5. **Install**.

First start pulls the images (the camoufox image is ~1 GB — give it a minute).

## 4. Use it

Open **http://<truenas-ip>:8080**. Add a site, pick a zone, set a schedule.
Change alerts are POSTed to your webhook. Everything persists in the dataset, so
it survives app restarts and updates.

## Updating

The compose pins `:latest`. To update: publish new images (tag another release),
then in TrueNAS open the app → **Edit** → save (re-pulls), or use the app's
**Update**/redeploy action. To pin a specific version instead, replace `latest`
with a release tag (e.g. `:0.1.0`) in the YAML.

## Notes & troubleshooting

- **amd64 only on TrueNAS.** TrueNAS SCALE is x86_64; the GHCR images are built
  for `linux/amd64` (backend/frontend are also arm64). No action needed.
- **Image pull denied / not found** → the GHCR packages are still private; make
  them public (step 1.3) or add credentials.
- **Can't write to the dataset** → check the dataset permissions/ACL so the app
  can write `config.json` and `state/`.
- **Bot-protected sites** — Magpie escalates fetches through Playwright →
  FlareSolverr → Camoufox. Sites behind interactive challenges (e.g. Akamai
  sec-cpt) will report an honest "blocked" error rather than monitor a wrong page.
- **Resources** — Camoufox (Firefox) and the backend (Chromium) are the heavy
  parts; give the app a couple of GB of RAM headroom.
