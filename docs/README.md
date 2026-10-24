# RitesDev documentation

Reference docs for the parts of the ecosystem that depend on **exact file placement, naming, or syntax**. Use them two ways:

- **Before a change:** read the system's *Rules* so you don't break a hidden dependency.
- **After something breaks:** find the symptom below, or in a doc's *When it breaks* table.

For everyday how-to guides (editing colors, adding a site), see the [project README](../README.md). For the architecture overview, see [ECOSYSTEM.md](../ECOSYSTEM.md).

## Systems

| Doc | Covers |
| --- | --- |
| [Sites and sync](systems/sites-and-sync.md) | `sites/s-*`, `site.meta.json`, `src/pages` symlinks, generated CSS, version sync |
| [Theme colors](systems/theme-colors.md) | `theme.json`, `site-theme.mjs`, dev live colors, editor autosave and preview |
| [Dev apps](systems/dev-apps.md) | `devapp.meta.json`, `devapp.api.mjs`, launcher tabs, when a launcher restart is needed |
| [Hosting and ports](systems/hosting-and-ports.md) | Dev/production/launcher ports, test mode, shared hosting config |
| [Discord bot and manager](systems/discord-manager.md) | RitesBot runtime, layout/draft/config JSON, dashboard API, tickets, `/riteserver` |

## Something broke?

| Symptom | Look at |
| --- | --- |
| `npm run dev`/`build` fails in `[sync-sites]` | [Sites and sync](systems/sites-and-sync.md#when-it-breaks), [Theme colors](systems/theme-colors.md#when-it-breaks) |
| A page 404s or shows the wrong site | [Sites and sync](systems/sites-and-sync.md#when-it-breaks) |
| Colors differ between dev and production, or won't change | [Theme colors](systems/theme-colors.md#when-it-breaks) |
| Theme preview can't connect | [Theme colors](systems/theme-colors.md#when-it-breaks), [Hosting and ports](systems/hosting-and-ports.md#when-it-breaks) |
| App tab missing, or API returns 404 or old data | [Dev apps](systems/dev-apps.md#when-it-breaks) |
| Unexpected ports (44xx/47xx) or the tunnel won't start | [Hosting and ports](systems/hosting-and-ports.md#when-it-breaks) |
| Discord bot offline, layout won't load or apply, tickets misbehave | [Discord bot and manager](systems/discord-manager.md#when-it-breaks) |

## Keeping docs accurate

- **Update the matching doc in the same change** that moves, renames, or changes the syntax of anything it lists.
- **New system?** Copy [TEMPLATE.md](TEMPLATE.md) to `systems/<name>.md`, then add it to both tables above. Also add it to the **Ecosystem Docs** note in the [MasterVault](#mastervault-obsidian).
- **Link files with relative Markdown links** (for example `[site-theme.mjs](../../ritesGlobal/site-theme.mjs)`) so the check below can find broken references.
- Run the docs check after moving files:

```bash
npm run docs:check
```

It fails when a relative link points to a missing file, when a doc in `systems/` lacks a required section, or when a system doc isn't listed in this index.

## MasterVault (Obsidian)

Matt's personal Obsidian vault links to these docs from its own notes. The doc files themselves stay in this repo.

| What | Path |
| --- | --- |
| Vault root | `/run/media/RitesDev/LinuxStorage/LargeFiles/MasterVault/MasterVault1.0` |
| Docs node | `RitesDev/Ecosystem Docs.md`: `file://` links to every doc listed above |
| Parent notes | `RitesDev/RitesDev.md` (hub) and `RitesDev/Projects/RitesDev Ecosystem.md` |
| Vault conventions | `Vault Guide.md` at the vault root |

- **Keep the docs node in sync.** When you add, rename, or remove a doc in `systems/`, update `Ecosystem Docs.md` in the same change. `npm run docs:check` does not check vault files.
- **Use vault conventions.** Notes there use `[[wikilinks]]` between vault notes, and each note starts with a "Back to [[Hub]]" link. Follow the `Vault Guide.md` conventions; don't move these doc files into the vault.
- **Don't overwrite vault changes.** The vault syncs with the Fit plugin to the private GitHub repo `MatthiasMortimer/MasterVault` and often has uncommitted edits. Change only the notes you need.
- Obsidian lists its vaults in `~/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json` (Flatpak install). Check there if the vault moves.
