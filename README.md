# RitesDev Ecosystem

A multi-site Astro monorepo. Each website lives in its own folder under `sites/`, and `scripts/sync-sites.mjs` symlinks their pages into a single Astro app (`src/pages/`) at dev/build time based on each site's `site.meta.json`.

Currently registered sites:

- **[sites/s-ritesdev](sites/s-ritesdev)** - RitesDev business/portfolio site (freelance web development & technical teaching), served at `/`. Content is edited via Markdown/JSON in `sites/s-ritesdev/content/` (see [sites/s-ritesdev/content/README.md](sites/s-ritesdev/content/README.md)).
- **[sites/s-blog](sites/s-blog)** - Personal blog, served at `/blog`. Editable site, page, card, and post content lives in `sites/s-blog/content/`.

Shared identity/contact info, version numbers, and the site/app registries used by both sites live in [ritesGlobal/](ritesGlobal). The content editor also discovers sibling projects in the parent `websites/` folder when they contain a `ritesdev.site.json` manifest.

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

```
RitesDev-ecosystem/
├── astro.config.mjs      # Astro config (server output, node adapter)
├── tsconfig.json         # Path aliases (@blog/*, @components/*, @ritesGlobal/*, ...)
├── netlify.toml          # Netlify build/publish config
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

## Dev management tools

Run these from the repo root to inspect the registered sites and devApps:

```bash
npm run mgmt:status    # Sites, apps, and content overview
npm run mgmt:apps      # List devApps (content-editor, blog-post-manager, inquiry-manager, ritesDevApp, siteHosting)
npm run mgmt:content   # Content inventory across all sites
npm run mgmt:setup     # Sanity-check the workspace setup
```
