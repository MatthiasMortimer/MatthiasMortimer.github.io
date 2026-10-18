# Copilot instructions

These instructions guide the use of GitHub Copilot for development within this repository. Follow the workflows and conventions outlined below to ensure consistent and efficient collaboration. This repository is the RitesDev company ecosystem.

## Tech stack in use

### Core site

- Astro manages the multi-site website and routing. Site pages are discovered from `sites/s-*` and synced into `src/pages/`; those generated symlinks are not source files to edit.
- Astro pages and components use Astro, HTML, CSS, and JavaScript. Use TypeScript where an existing endpoint or module already uses it; do not assume the project uses Svelte or TypeScript for all front-end code.
- Markdown and MDX provide editable page and blog content. Each site's `content/` directory is the source of truth for its editable content.
- The production build prerenders static pages and uses `@astrojs/node` in standalone mode for server-rendered routes and dynamic endpoints. The deployment is self-hosted behind a Cloudflare Tunnel.
- Node.js `>=22.12.0` and npm are used for the core project.

### Development apps and data

- The local management tools in `devApps/` are separate Node.js applications, primarily JavaScript, with a mix of CommonJS and ES modules. The main launcher and site-hosting control panel use Electron; their embedded/local APIs use Node.js and Express where configured.
- Shared site data and configuration live in JSON and JavaScript modules under `ritesGlobal/`. Blog content is Markdown/MDX. Do not introduce a database or ORM assumption unless directed; no central SQL database is configured for this project yet.

## Site development workflow, testing and validation

- Tests use Node.js's built-in test runner (`node --test`), with test scripts defined in the relevant `devApps/*/package.json` files.
- There is no root-level Vitest, Jest, or Playwright test setup. Run the relevant app's test script for app changes; use `npm run build` to validate core site changes.

- Identify the target site from the request: RitesDev (`sites/s-ritesdev`, `/`) or Blog (`sites/s-blog`, `/blog`). If the target is unclear and the distinction matters, ask before editing.
- Review the existing site structure and relevant content before proposing or changing anything. Treat each site's `content/` directory as its editable content source of truth; do not edit generated `src/pages/` symlinks.
- Break substantial website work into clear sections. Summarize the goal and proposed sections, then draft or implement them incrementally. Follow an explicit request to make changes without requiring an extra approval step.
- Preserve the site's established voice, content formats, frontmatter fields, and shared-content conventions. Keep progress updates and drafts in the conversation unless the user asks to save them.
- Before finishing website code or content changes, run the smallest relevant validation; for site-wide changes, use the repository's build command.

## Site Studio workflow

Choose Site Studio automatically when a request involves planning or substantially creating, restructuring, or refreshing website pages or content. If the Site Studio capability is available in the active agent session, use it without asking the user to select it. For routine code fixes, small copy edits, or other tasks that do not benefit from its collaborative section-by-section workflow, work directly without invoking it.

If Site Studio is not available in the active session, continue with the repository workflow below and do not imply that its shared canvas or progress tracker is active. Plugin availability depends on the agent client and session; repository instructions can guide selection but cannot enable or expose a plugin capability.


## System documentation

- `docs/systems/*.md` documents file placement, syntax contracts, rules, and troubleshooting for each subsystem. Read the relevant doc before changing a system it covers.
- When a change moves, renames, or changes the syntax or behavior of anything a doc lists, update that doc in the same change. For a new system with similar fragile contracts, copy `docs/TEMPLATE.md` and link it in `docs/README.md`.
- Run `npm run docs:check` after doc changes or file moves.
- Matt's Obsidian MasterVault (`/run/media/RitesDev/LinuxStorage/LargeFiles/MasterVault/MasterVault1.0`) links to these docs from `RitesDev/Ecosystem Docs.md`. Keep that note's list in sync when system docs are added, renamed, or removed. See the MasterVault section of `docs/README.md`.

## End of Session

At the end of each development session, update the official runbook in `/.github/runbook.md` only with unresolved bugs or work that remains unfinished and needs attention in a future session. Do not summarize completed work, decisions, or the session. Write entries as concise, actionable follow-ups with enough context to resume the work. If nothing remains unfinished, do not add a runbook entry. More than one agent is working on this runbook, so only edit relevant entries and avoid overwriting unrelated contributions. If the file does not exist and there is an unresolved follow-up, create it.

Remember to clear out any temporary or irrelevant notes to keep the Notes folder organized and useful for future reference. This ensures that only relevant and actionable information is retained for subsequent development sessions.

### Key word for ending a session

When I say something like "thank you for your help", consider the session concluded. Check for unresolved bugs or unfinished work and record only those actionable follow-ups in the runbook; if there are none, leave the runbook unchanged. Clear temporary or irrelevant notes, but preserve useful ongoing notes for future sessions.
