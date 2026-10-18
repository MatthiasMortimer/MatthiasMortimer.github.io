# Hosting and ports

Which port each local server uses, how test mode shifts them, and where other apps read that configuration.

## How it works

[devApps/siteHosting/host-config.json](../../devApps/siteHosting/host-config.json) holds the base ports. [ritesGlobal/hosting-config.cjs](../../ritesGlobal/hosting-config.cjs) (`buildHostingConfig()`) applies the runtime environment from [ritesGlobal/runtime-env.cjs](../../ritesGlobal/runtime-env.cjs). Site Hosting and the content editor's live preview both read from it, so they always agree.

| Server | Live port | Test port | Notes |
| --- | --- | --- | --- |
| Production build (`dist/server/entry.mjs`) | 4321 | 4421 | Served publicly through the Cloudflare tunnel (live only) |
| Astro dev server | 4325 | 4425 | What the theme preview shows |
| RitesDev launcher | 4605 | 4705 | Hosts the embedded app tabs. Port is set in `devApps/ritesDevApp/server.mjs`, not `host-config.json`. |

**Test mode** is on when `RITES_ENV=test` is set, or when a gitignored `.rites-env` file at the repo root contains `test`. It adds **+100** to every port above and **disables the tunnel**.

## Files

| File | Role |
| --- | --- |
| [devApps/siteHosting/host-config.json](../../devApps/siteHosting/host-config.json) | Base ports, tunnel name, public URL |
| [ritesGlobal/runtime-env.cjs](../../ritesGlobal/runtime-env.cjs) | `live`/`test` detection and the +100 port offset |
| [ritesGlobal/hosting-config.cjs](../../ritesGlobal/hosting-config.cjs) | `buildHostingConfig()`: the one place final URLs are computed |
| [devApps/siteHosting/host-manager.js](../../devApps/siteHosting/host-manager.js) | Starts and stops dev, production, and tunnel processes |
| [devApps/content-editor/live-preview.js](../../devApps/content-editor/live-preview.js) | Uses `devLocalUrl` plus the site `basePath` for the preview |

## Rules

- Change ports only in `host-config.json`. Don't hard-code ports in apps; call `buildHostingConfig()`.
- Every loopback URL must stay `127.0.0.1`/`localhost`. The content editor's CSP and preview URL check depend on it.
- Running `npm run dev` yourself on a non-configured port works in a browser, but the editor preview won't find it.

## When it breaks

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Editor preview can't find the dev server, but it's running | It's on a different port or environment than the config, for example `RITES_ENV=test` on one side only | Start dev from Site Hosting, or match the environment on both sides |
| Ports are unexpectedly 44xx | A `.rites-env` file containing `test` exists | Delete it for live mode |
| The tunnel never starts | Test mode is active | Use live mode |
| Live site still shows old content or colors | Production wasn't rebuilt | Rebuild/restart from Site Hosting |

## Verify

```bash
node -e 'console.log(require("./ritesGlobal/hosting-config.cjs").buildHostingConfig())'
npm --prefix devApps/content-editor test   # includes port-offset tests for the preview
```
