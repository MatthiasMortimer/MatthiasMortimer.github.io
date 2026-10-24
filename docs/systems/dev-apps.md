# Dev apps

How management apps in `devApps/` are discovered, embedded as tabs in the RitesDev launcher, and given their APIs.

**Depends on:** [Sites and sync](sites-and-sync.md), which copies app versions into `versions.json`

## How it works

The launcher ([devApps/ritesDevApp/server.mjs](../../devApps/ritesDevApp/server.mjs)) scans `devApps/*/devapp.meta.json` at runtime. An app is **embedded** as a tab when:

- it has `devapp.api.mjs` **and** `public/index.html`, and
- its metadata does not say `"embed": false`.

Embedded apps are served at `/apps/<folder-name>/`:

- `/apps/<folder>/api/...` is passed to the handler returned by `createApiHandler()`.
- Everything else is served as a static file from `devApps/<folder>/public/`.

**The API module is cached, but reloaded when `devapp.api.mjs` itself changes.** On the next API request, the launcher calls the old module's optional `disposeApiHandler()` export and imports the new file. Changes to files that `devapp.api.mjs` imports are **not** detected and need a **launcher restart**. Changes to files in `public/` take effect on page reload.

## Files

| File | Role |
| --- | --- |
| [devApps/ritesDevApp/server.mjs](../../devApps/ritesDevApp/server.mjs) | Discovery, `/apps/:appId` embedding, API dispatch |
| [ritesGlobal/devapps-registry.mjs](../../ritesGlobal/devapps-registry.mjs) | Registry for management CLI scripts. Keep it aligned manually. |
| [devApps/content-editor/devapp.meta.json](../../devApps/content-editor/devapp.meta.json) | Example embedded app metadata |
| [devApps/content-editor/devapp.api.mjs](../../devApps/content-editor/devapp.api.mjs) | Example API handler |
| [devApps/siteHosting/devapp.meta.json](../../devApps/siteHosting/devapp.meta.json) | Example standalone app (`"embed": false`) |

## Syntax and contracts

### Folder layout for an embedded app

```
devApps/<folder>/
├── devapp.meta.json
├── devapp.api.mjs        ← export function createApiHandler()
├── package.json
├── public/index.html     ← plus its JS/CSS, loaded with relative paths
└── test/*.test.js        ← run with node --test
```

### `devapp.meta.json` (key fields)

| Key | Rule |
| --- | --- |
| `slug` | Unique; must match `^[A-Za-z][A-Za-z0-9_-]*$` (sync checks this) |
| `version` | `major.minor.patch`. Edit it here, not in `versions.json`. |
| `embed` | `false` keeps the app as its own window |
| `tabOrder` | Tab position |

### API handler

```js
export function createApiHandler() {
	return async function handleApi({ method, pathname, searchParams, body }) {
		if (method === "GET" && pathname === "/api/thing") return { ok: true };
		throw Object.assign(new Error("Not found"), { statusCode: 404 });
	};
}
```

The returned value is sent as JSON. A thrown error becomes `{ success: false, message }` with `error.statusCode`, or 400 if none is set.

## Rules

- Use **relative** URLs in `public/` (for example `fetch("api/content")`, not `/api/content`). The app lives under `/apps/<folder>/`.
- Any new browser asset must live in `public/`. Add it to the launcher test's asset list if the app depends on it.
- A `Content-Security-Policy` meta tag in `index.html` must allow everything the page loads. The content editor's `frame-src` is an example.

## When it breaks

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| A new or changed API route returns 404 or an old response | A file imported by `devapp.api.mjs` changed, which the launcher does not detect | Save `devapp.api.mjs` again or restart the launcher |
| The app tab is missing | `devapp.meta.json`, `devapp.api.mjs`, or `public/index.html` is missing, or `"embed": false` | Add the missing file or fix the flag |
| Assets 404 inside the tab | Absolute paths (`/app.js`) used instead of relative paths | Use relative paths |
| The tab shows a 500 error with an import error | A syntax or import error in `devapp.api.mjs` or its imports | Check the launcher console |
| A resource is blocked by CSP in the console | The CSP meta tag doesn't allow that source | Update the CSP in `index.html` |

## Verify

```bash
node --test devApps/ritesDevApp/test/embedded-apps.test.mjs
npm --prefix devApps/<folder> test
npm run mgmt:apps
```
