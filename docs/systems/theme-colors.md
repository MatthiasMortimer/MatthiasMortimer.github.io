# Theme colors

Per-site color palettes. You edit them in the Website Content Editor, the dev server applies them live, and the build bakes them into the production stylesheet.

**Depends on:** [Sites and sync](sites-and-sync.md), [Dev apps](dev-apps.md), [Hosting and ports](hosting-and-ports.md)

## How it works

```
ritesGlobal/site-theme.mjs          ← single definition: fields, defaults, CSS variable names, validation
        │
sites/<site>/content/theme.json     ← saved palette (source of truth)
        │
        ├─ DEV:   layouts/BaseLayout.astro imports theme.json → inline <style> → Vite hot-reloads on save
        └─ BUILD: scripts/sync-sites.mjs → public/generated/<slug>.<hash>.css (theme block before site CSS)

Content editor ─ POST /api/content/save    → validated, atomic write of theme.json, .bak backup
               └ POST /api/theme/preview   → finds the Site Hosting dev server URL → iframe
```

1. The editor saves valid colors automatically about 400 ms after typing stops, through the normal content API.
2. The dev server sees `theme.json` change and updates the colors in every open dev tab, including the preview.
3. Production only changes when you **rebuild**. Restarting an existing build does not pick up new colors.

## Files

| File | Role |
| --- | --- |
| [ritesGlobal/site-theme.mjs](../../ritesGlobal/site-theme.mjs) | `SITE_THEME_DEFINITIONS`: one entry per site slug, plus validation and CSS rendering. Everything else reads from here. |
| [sites/s-blog/content/theme.json](../../sites/s-blog/content/theme.json) | Blog palette |
| [sites/s-ritesdev/content/theme.json](../../sites/s-ritesdev/content/theme.json) | RitesDev palette |
| [sites/s-blog/layouts/BaseLayout.astro](../../sites/s-blog/layouts/BaseLayout.astro) | Dev-only inline theme `<style>` (Blog) |
| [sites/s-ritesdev/layouts/BaseLayout.astro](../../sites/s-ritesdev/layouts/BaseLayout.astro) | Dev-only inline theme `<style>` (RitesDev) |
| [scripts/sync-sites.mjs](../../scripts/sync-sites.mjs) | Adds the theme to the fingerprinted production CSS |
| [ritesGlobal/content-inventory.mjs](../../ritesGlobal/content-inventory.mjs) | Lists `theme.json` as **Theme colors** in the editor |
| [devApps/content-editor/content-store.js](../../devApps/content-editor/content-store.js) | Validates and atomically saves theme files (`.tmp` then rename, with a `.bak` backup) |
| [devApps/content-editor/devapp.api.mjs](../../devApps/content-editor/devapp.api.mjs) | API routes, including `POST /api/theme/preview` |
| [devApps/content-editor/live-preview.js](../../devApps/content-editor/live-preview.js) | Finds and probes the dev server URL for a site |
| [devApps/content-editor/public/app.js](../../devApps/content-editor/public/app.js) | Theme form, autosave wiring, detach/reattach controls |
| [devApps/content-editor/public/theme-autosave.js](../../devApps/content-editor/public/theme-autosave.js) | Debounced, one-at-a-time autosave |
| [devApps/content-editor/public/live-website-preview.js](../../devApps/content-editor/public/live-website-preview.js) | The dev-website iframe and its status messages |
| [devApps/content-editor/public/theme-preview.js](../../devApps/content-editor/public/theme-preview.js) | Popup window controller (open, focus, close, reattach) |
| [devApps/content-editor/public/theme-preview.html](../../devApps/content-editor/public/theme-preview.html) | Detached preview window page, with [theme-preview-window.js](../../devApps/content-editor/public/theme-preview-window.js) and [.css](../../devApps/content-editor/public/theme-preview-window.css) |
| [devApps/content-editor/public/index.html](../../devApps/content-editor/public/index.html) | Content-Security-Policy that allows the local dev iframe |

## Syntax and contracts

### `theme.json`

```json
{
  "colorScheme": "light",
  "colors": {
    "bg": "#f4efe5",
    "surface": "#faf6ee"
  }
}
```

- Only `colorScheme` and `colors` are allowed at the top level.
- `colorScheme` must be `"light"` or `"dark"`. It styles browser controls only and does not recolor the site.
- `colors` must contain **every** key defined for that site, and no others. The example above is shortened.
- Values must be `#rgb` or `#rrggbb`. Shorthand is saved as 6 digits.
- A hand-edited file that breaks any of these rules **fails the build**, because `npm run sync` throws.

### Field definition in `site-theme.mjs`

```js
{ key: "bg", cssVar: "--color-bg", label: "Page background", default: "#f4efe5", simple: true }
```

| Property | Meaning |
| --- | --- |
| `key` | Name in `theme.json` `colors`. Renaming it invalidates existing theme files. |
| `cssVar` | CSS custom property the site's CSS must use, for example `var(--color-bg)` |
| `label` | Text shown in the editor |
| `default` | Used by **Reset to site defaults** |
| `simple: true` | Shown with the main colors. Everything else appears under **Advanced colors**. |

The site definition's `path` is `content/theme.json`, relative to the site folder.

## Rules

- **Don't define theme variables in a site's `styles/global.css` `:root`.** In production, the theme block comes before site CSS, so a duplicate there silently overrides the theme. In dev, the inline theme loads after it and wins. The result: dev and production look different.
- **Use the variable, not a hard-coded hex** in site CSS and components (`var(--color-accent)`). A hard-coded color can't be edited.
- Adding, renaming, or removing a field means updating the definition and **every** `theme.json` for that site in the same change.
- Keep the `import.meta.env.DEV &&` guard on the inline `<style>` in each `BaseLayout.astro`. Without it, every production page gets a duplicate theme.
- Don't edit files under `public/generated/` or `ritesGlobal/generated/`. Every sync recreates them.
- The preview iframe must point to `127.0.0.1` or `localhost`. The CSP `frame-src` in both editor HTML files and `isLocalPreviewUrl()` enforce this.

## Adding theme support to a site

1. Add a `SITE_THEME_DEFINITIONS.<slug>` entry in `site-theme.mjs`, using the same shape as `blog`.
2. Create `sites/s-<name>/content/theme.json` containing every key.
3. Replace hard-coded colors in that site's CSS with the `cssVar`s, and remove any `:root` duplicates.
4. Add these lines to the site's `BaseLayout.astro`, placing the `<style>` right after the generated stylesheet `<link>`:
   ```astro
   import theme from "../content/theme.json";
   import { renderSiteThemeCss } from "@ritesGlobal/site-theme.mjs";
   ...
   {import.meta.env.DEV && <style is:inline set:html={renderSiteThemeCss("<slug>", theme)} />}
   ```
5. Run the checks below. The editor, API, autosave, and preview need no changes.

## When it breaks

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Build/sync fails: `missing theme file for "<slug>"` | The site has a definition but no `content/theme.json` | Create the file, or restore it from `theme.json.bak` or git |
| Build/sync fails: `unsupported keys`, `missing "<key>"`, or `3- or 6-digit hex` | A hand-edited `theme.json` doesn't match the definition | Match the keys to `site-theme.mjs` and fix the hex value |
| Colors are right in dev but wrong after a rebuild | A theme variable is redefined in `styles/global.css` `:root` | Remove the duplicate from the site CSS |
| Colors are right in dev but old on the live site | Production wasn't rebuilt | Rebuild/restart hosting in Site Hosting |
| One element never changes color | A hard-coded hex in CSS or a component | Replace it with the matching `var(--color-…)` |
| **Theme colors** is missing from the editor sidebar | No definition for that slug, or a wrong `path` | Check `SITE_THEME_DEFINITIONS` |
| Preview: "Local development server unavailable" | The dev server is off or on another port | Start dev in Site Hosting, then **Reload dev preview**. See [ports](hosting-and-ports.md). |
| Preview frame is blank or blocked | The CSP `frame-src` changed, or the dev URL isn't loopback | Restore the CSP in `index.html` and `theme-preview.html` |
| Preview says to restart the launcher, or the API returns 404 | The launcher started before the API code changed | Restart the RitesDev launcher. See [dev apps](dev-apps.md). |
| "Fix invalid colors to autosave" won't clear | A text input holds an invalid hex | Correct the highlighted field |
| "Save failed" toast | An API or file error (permissions, validation) | Read the toast, fix the cause, then click **Save changes** to retry |
| Detach does nothing or shows an error | The browser blocked the popup | Allow popups for the launcher |
| You need the previous colors | Each save overwrites `theme.json.bak` | Copy the `.bak` back, or use git history |

## Verify

```bash
npm --prefix devApps/content-editor test                       # validation, autosave, preview discovery
node --test devApps/ritesDevApp/test/embedded-apps.test.mjs    # theme API and preview assets are served
npm run build && node --test scripts/test/production-styles.test.mjs
npm run docs:check                                             # links in these docs point to real files
```
