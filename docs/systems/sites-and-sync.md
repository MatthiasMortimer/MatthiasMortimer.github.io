# Sites and sync

How `sites/s-*` folders become routes, and how each site's stylesheet is generated. Every dev and build run starts here.

## How it works

`npm run dev` and `npm run build` both run `npm run sync` first (`predev`/`prebuild` in [package.json](../../package.json)). [scripts/sync-sites.mjs](../../scripts/sync-sites.mjs) then:

1. Copies each `devApps/*/devapp.meta.json` `version` into `ritesGlobal/versions.json` under `devApps`.
2. Reads every `sites/s-*/site.meta.json` through [ritesGlobal/sites.registry.mjs](../../ritesGlobal/sites.registry.mjs).
3. Symlinks each site's `pages/` into `src/pages/`:
   - `basePath: "/"`: each entry in `pages/` gets its own link at the top of `src/pages/`.
   - Any other `basePath`, for example `"/blog"`: the whole `pages/` folder is linked as `src/pages/blog`.
4. For each site with a `styles/global.css`, it combines, in this order: shared tokens → site switcher CSS → site footer CSS → [theme](theme-colors.md) → site CSS. It writes the result to `public/generated/<slug>.<sha256-16>.css` and records the URL in `ritesGlobal/generated/site-styles.json`.
5. Each `BaseLayout.astro` imports that manifest (`styles.<slug>`) to link its stylesheet.

## Files

| File | Role |
| --- | --- |
| [scripts/sync-sites.mjs](../../scripts/sync-sites.mjs) | Symlinks, version sync, generated CSS |
| [ritesGlobal/sites.registry.mjs](../../ritesGlobal/sites.registry.mjs) | `listSites()` (in-repo sites) and `listEditableSites()` (adds sibling `ritesdev.site.json` projects) |
| [sites/s-ritesdev/site.meta.json](../../sites/s-ritesdev/site.meta.json) | RitesDev registration (`basePath: "/"`) |
| [sites/s-blog/site.meta.json](../../sites/s-blog/site.meta.json) | Blog registration (`basePath: "/blog"`) |
| [ritesGlobal/styles/tokens.css](../../ritesGlobal/styles/tokens.css) | Shared fonts, radii, shadows, and fallback colors |
| [ritesGlobal/versions.json](../../ritesGlobal/versions.json) | Version numbers. Sync overwrites the `devApps` section. |
| `src/pages/` | **Generated** symlinks. Do not edit. |
| `public/generated/`, `ritesGlobal/generated/` | **Generated** CSS and manifest. Do not edit. |

## Syntax and contracts

### Site folder layout

```
sites/s-<name>/          ← folder name MUST start with "s-"
├── site.meta.json       ← required, or the folder is ignored
├── pages/               ← required, or the site is skipped (warning)
├── layouts/BaseLayout.astro
├── styles/global.css    ← optional; without it, the site has no generated stylesheet
├── components/
└── content/             ← editable content (source of truth)
```

### `site.meta.json`

```json
{ "slug": "blog", "label": "Blog", "basePath": "/blog", "order": 2 }
```

| Key | Used for |
| --- | --- |
| `slug` | Key in `site-styles.json`, `versions.json` `sites`, and theme definitions. Changing it breaks those references. |
| `label` | Shown in the site switcher and editor |
| `basePath` | URL prefix. `/` merges pages into the root. Others become one folder. |
| `order` | Sort order in the switcher and editor |

## Rules

- Never edit `src/pages/` or generated CSS. Change the site's `pages/` or `styles/global.css` instead, then sync.
- Two sites must not produce the same top-level route. The root site's page names share `src/pages/` with other sites' `basePath` folders. For example, a root `pages/blog.astro` would collide with the Blog.
- Edit dev-app versions in each app's `devapp.meta.json`, not in `versions.json`, which sync overwrites. Keep `version` as `major.minor.patch`.
- Layout files must keep importing `@ritesGlobal/generated/site-styles.json` and linking `styles.<slug>`.

## When it breaks

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| A new site's pages 404 | Folder isn't named `s-*`, or `site.meta.json` or `pages/` is missing | Fix the name or add the missing file, then `npm run sync` |
| A page shows the wrong site | A route collides with another site's `basePath` | Rename the page or change the `basePath` |
| `invalid devApp version metadata` | Bad `slug` or non-`x.y.z` `version` in a `devapp.meta.json` | Fix that metadata file |
| `duplicate devApp slug` | Two apps share a `slug` | Make the slugs unique |
| Unstyled site, or `styles.<slug>` undefined | No `styles/global.css`, or sync didn't run | Add the CSS, then run `npm run sync` |
| A dev-app version reverted in `versions.json` | It was edited there instead of in `devapp.meta.json` | Edit the app's metadata |
| Stale CSS after a change | Sync didn't rerun | Restart dev, or run `npm run sync` |

## Verify

```bash
npm run sync && npm run mgmt:setup
npm run build && node --test scripts/test/production-styles.test.mjs scripts/test/blog-home.test.mjs
```
