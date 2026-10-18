# RitesDev Ecosystem

A multi-site Astro monorepo. Each website lives in its own folder under `sites/`, and `scripts/sync-sites.mjs` symlinks their pages into a single Astro app (`src/pages/`) at dev/build time based on each site's `site.meta.json`. Production pages and blog posts are prerendered as static files; the Node server remains for dynamic endpoints such as the inquiry API.

Currently registered sites:

- **[sites/s-ritesdev](sites/s-ritesdev)** - RitesDev business/portfolio site (freelance web development & technical teaching), served at `/`. Content is edited via Markdown/JSON in `sites/s-ritesdev/content/` (see [sites/s-ritesdev/content/README.md](sites/s-ritesdev/content/README.md)).
- **[sites/s-blog](sites/s-blog)** - Personal blog, served at `/blog`. Editable site, page, card, and post content lives in `sites/s-blog/content/`.

Shared identity/contact info, version numbers, and the site/app registries used by both sites live in [ritesGlobal/](ritesGlobal). The content editor also discovers sibling projects in the parent `websites/` folder when they contain a `ritesdev.site.json` manifest.

**Changing file layout or syntax, or debugging a break?** See [docs/](docs/README.md) for each system's file contracts, rules, and a symptom → fix table. Run `npm run docs:check` after moving files.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (runs the site sync first)
npm run dev

# Build for production
npm run build
```

## Structure

The sync script combines each site's theme with shared styles and writes
content-fingerprinted `/generated/<site>.<hash>.css` assets. Layouts read the
generated stylesheet manifest under `ritesGlobal/generated/`, so browsers and
Cloudflare request matching styles after a CSS change instead of reusing an older
fixed URL. Generated assets and the manifest are not source files to edit.
Run `npm run build` before serving a merged release.
After building, `node --test scripts/test/production-styles.test.mjs` verifies
that production pages reference existing fingerprinted stylesheets.

```
RitesDev-ecosystem/
├── astro.config.mjs      # Astro config (static-first output, Node standalone adapter; self-hosted behind a Cloudflare Tunnel)
├── tsconfig.json         # Path aliases (@blog/*, @components/*, @ritesGlobal/*, ...)
├── ritesGlobal/          # Shared modules reused across every site
│   ├── contact.js/.json      # Shared identity & contact info
│   ├── versions.js/.json     # Shared site + git version numbers
│   ├── projects.js           # Shared "Rites Projects" list
│   ├── sites.registry.mjs    # Discovers sites/s-* folders via site.meta.json
│   ├── content-inventory.mjs # Manifest of editable content files per site
│   ├── content-management.mjs# Read/write helpers for content files (used by devApps)
│   ├── devapps-registry.mjs  # Registry of devApps tools (ports, what they manage)
│   └── components/SiteSwitcher.astro
├── sites/
│   ├── s-ritesdev/       # Business/portfolio site (basePath "/")
│   │   ├── site.meta.json
│   │   ├── content/      # Editable Markdown/JSON (source of truth)
│   │   ├── components/ layouts/ pages/ styles/
│   └── s-blog/           # Personal blog (basePath "/blog")
│       ├── site.meta.json
│       ├── content/      # Site settings, page copy, cards, and MDX posts
│       ├── components/ pages/ styles/
├── devApps/              # Local dev tools (content editor, post manager, launcher, dashboard)
├── scripts/
│   ├── sync-sites.mjs        # Symlinks each site's pages/ into src/pages
│   └── management/           # status.mjs, list-apps.mjs, content-inventory.mjs, setup-check.mjs
├── src/pages/            # Generated symlinks - do not edit directly
└── public/media/         # Shared static assets
```

## Adding a new site

1. Create `sites/s-<name>/` with a `site.meta.json` (`slug`, `label`, `basePath`, `order`) and a `pages/` folder.
2. Run `npm run dev` (or `npm run sync`) - the new site's pages are symlinked into `src/pages/` automatically.
3. Put editable JSON, Markdown, MDX, JS, or MJS in the site's `content/` folder; the content editor discovers it automatically.

To edit a standalone sibling website without moving it into the ecosystem, add `ritesdev.site.json` at that website's root:

```json
{
	"slug": "example",
	"label": "Example Site",
	"order": 60,
	"editor": {
		"groups": [
			{
				"type": "page",
				"label": "Page Content",
				"roots": ["src/content"],
				"extensions": [".md", ".json"]
			}
		]
	}
}
```

Each root is resolved inside that website and only discovered files can be opened or saved. The website dropdown refreshes from these manifests when the RitesDev app starts or its refresh button is used.

For the built-in `blog` and `ritesdev` sites, the content editor also exposes `content/theme.json` as **Theme colors**. Those files drive the per-site CSS variable palette that `scripts/sync-sites.mjs` injects into the generated production stylesheets, so color changes stay content-driven and cache-busted like any other style update.

### Editing website colors

1. Start the **local dev server** in Site Hosting, then open **Website Content Editor** in the RitesDev launcher.
2. Select **Blog** or **RitesDev**, then open **Theme colors** at the top of the content list. The sidebar and editor scroll independently in desktop-sized windows.
3. Start with the five main colors using the color pickers or `#rgb` / `#rrggbb` inputs.
4. Expand **Advanced colors** for the remaining surfaces, text, borders, and hover colors. Browser-control light/dark styling is separate from the palette; it does not automatically recolor the site.
5. Valid color edits **autosave** after a brief pause and update the real dev website. Wait for **Colors autosaved** before leaving the editor. **Save changes** (or Ctrl/Cmd+S) saves immediately or retries a failed save. Incomplete/invalid hex colors are not saved.

**Reset to site defaults** restores and autosaves that site's original palette. Theme updates are written atomically; the previous source file is backed up as `theme.json.bak` on each save. Changes are real edits to `content/theme.json`, not temporary frame-only overrides. Ordinary dev browser tabs show the same colors.

The inline preview is the actual dev website configured by Site Hosting (normally `http://127.0.0.1:4325/`, or port `4425` in test mode). Navigate its pages normally to check links, responsive layouts, and colors. No extra dev restart is needed for color edits: site layouts read their theme JSON directly during development. If the dev server is stopped, the editor shows an actionable message; start it in Site Hosting and select **Reload dev preview**. Existing launcher instances need a restart once to load the new preview API.

When finished, rebuild/restart production hosting and the tunnel through Site Hosting to publish the saved colors. Merely restarting an existing build process without rebuilding cannot incorporate source changes. No automatic Git push, rebuild, tunnel restart, or production-server change occurs while editing.

Use **Detach preview** to open the dev website in a separate resizable preview window. Choose **Fit window**, **Mobile**, **Tablet**, **Desktop**, or custom width (240-2560 px) and height (240-2160 px). Fixed sizes apply to the website iframe itself, excluding window decorations and preview controls. **Reattach preview** in either window or closing the window restores the inline view; **Focus preview window** reuses it. Browser popup permission may be needed.

The preview is local to the hosting PC; a phone cannot reach its loopback dev server. Website forms and external popup windows are disabled inside the preview frame to avoid accidental submissions. Use **Open dev website in a browser** for an ordinary dev tab with full browser controls.

### Adding theme support to another ecosystem site

Theme support is opt-in. Add the site's slug and field/default definitions to [ritesGlobal/site-theme.mjs](ritesGlobal/site-theme.mjs), put a complete `content/theme.json` under that site's content directory, and have the site's CSS use those mapped custom properties. The inventory, dedicated editor, validation, and generated stylesheet pipeline reuse that definition; no new editor UI or API route is needed. Keep defaults separate from saved values so Reset remains stable.

Sibling projects remain content-editable but are not automatically recolored. Their build pipelines must explicitly integrate the theme contract before enabling theme controls. Semantic success/error colors, image content, and syntax highlighting are not part of the editable branding palette.

For theme file syntax, placement rules, and troubleshooting, see [docs/systems/theme-colors.md](docs/systems/theme-colors.md).

## Dev management tools

Run these from the repo root to inspect the registered sites and devApps:

```bash
npm run mgmt:status    # Sites, apps, and content overview
npm run mgmt:apps      # List devApps (content-editor, blog-post-manager, inquiry-manager, ritesDevApp, siteHosting)
npm run mgmt:content   # Content inventory across all sites
npm run mgmt:setup     # Sanity-check the workspace setup
```
