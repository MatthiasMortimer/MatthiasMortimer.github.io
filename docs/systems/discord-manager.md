# Discord bot and manager

The Discord Bot Manager is an embedded launcher app that also runs the RitesDev Discord bot (RitesBot). Use this doc when you change the bot, its dashboard, the server layout files, or the ticket workflow. For step-by-step usage (token, invites, tickets, announcements), see the [Discord manager guide](../social-bots/discord-bot-setup.md).

**Depends on:** [Dev apps](dev-apps.md), [Hosting and ports](hosting-and-ports.md)

## How it works

```text
.env (DISCORD_BOT_TOKEN)
        │
launcher (port 4605) ── imports devapp.api.mjs ── discord.js gateway client (one per launcher)
        │                         │
/apps/discord-manager/   reads/writes scripts/discord/*.json
 (public/ dashboard)              │
        └── /api/... ─────────────┴── Discord: servers, roles, channels, tickets, /riteserver
```

- **One bot, many servers.** The bot is the only source of server IDs: a server appears in the manager after the bot is invited. Nothing is entered by hand.
- **Layout flow.** The editor works on a per-server **draft**. *Save draft* writes `layout-drafts.json` and touches nothing in Discord. *Apply setup* sends the layout to Discord, records the created IDs in `guild-config.json`, and clears the draft.
- **Templates.** *Load a template* switches the editor to the saved draft, the Rites default (`server-layout.json`), or the current applied setup. Loading the default copies the applied channel, category, and role IDs by name, so unchanged items are not deleted and recreated.
- **Server data comes from the gateway cache.** `GET /api/config` reads channels, roles, and members from discord.js caches. It falls back to Discord's REST API only when a cache is empty. The member fetch is capped at 5 seconds. The dashboard refreshes every 15 seconds; uncached REST calls on every refresh get rate-limited.
- **Bot runtime.** On connect, the bot registers the global `/riteserver` command, re-arms ticket retention timers, and assigns `Pending` to new members (when the layout has that role).

## Files

| File | Role |
| --- | --- |
| [devApps/discord-manager/devapp.api.mjs](../../devApps/discord-manager/devapp.api.mjs) | Bot client, REST API for the dashboard, layout apply, tickets, announcements, `/riteserver` |
| [devApps/discord-manager/public/app.js](../../devApps/discord-manager/public/app.js) | Dashboard logic: server list, layout editor, drafts and templates, tickets, announcements |
| [devApps/discord-manager/public/index.html](../../devApps/discord-manager/public/index.html) | Dashboard markup (section tabs, panels, dialogs) |
| [devApps/discord-manager/public/style.css](../../devApps/discord-manager/public/style.css) | Desktop and phone layouts (main phone breakpoints: 760 and 600 px) |
| [devApps/discord-manager/devapp.meta.json](../../devApps/discord-manager/devapp.meta.json) | Launcher tab metadata |
| [devApps/discord-manager/test/](../../devApps/discord-manager/test/) | `node --test` checks for navigation and draft helpers |
| [scripts/discord/server-layout.json](../../scripts/discord/server-layout.json) | **Rites default setup** template (committed) |
| `scripts/discord/guild-config.json` | Per-server applied layout, managed IDs, announcement channel, tickets (git-ignored) |
| `scripts/discord/layout-drafts.json` | Per-server unapplied layout drafts (git-ignored) |
| `.env` | `DISCORD_BOT_TOKEN`, written by the **Bot token** dialog (git-ignored) |
| [scripts/discord/setup.mjs](../../scripts/discord/setup.mjs) | Legacy single-server CLI (`npm run discord:setup`, needs `DISCORD_GUILD_ID`) |
| [DISCORD_SETUP.md](../../DISCORD_SETUP.md) | First-run steps and the target community structure |

## Syntax and contracts

**Layout** (`server-layout.json`, `layout` in the config, and drafts):

```json
{
  "guildName": "RitesDev | Client & Project Hub",
  "roles": [{ "name": "Admin", "permissions": ["ManageChannels", "ManageRoles"] }],
  "categoryAccess": { "TEAM": { "everyone": "hidden", "roles": { "Admin": "view" } } },
  "categories": [
    { "name": "SUPPORT & TICKETS", "channels": [
      "staff-notes",
      { "name": "client-requests", "type": "forum", "topic": "…", "tags": ["New Request"], "access": { "bot": "view" } }
    ] }
  ]
}
```

- A channel is either a name string (a text channel) or an object. `type` is `text` (the default), `announcement`, or `forum`. Forum `tags` hold at most 20 entries of up to 20 characters each.
- Channel `access` values for `everyone` and `roles.<name>`: `inherit`, `hidden`, `read`, or `view`. `members.<userId>`: `hidden`, `read`, or `view`. `bot` is still accepted for older layouts but ignored: Apply always gives the bot a member overwrite on every managed category and channel.
- Category access (`categoryAccess.<category name>`): `everyone` and `roles.<name>` are `view` or `hidden`. `members.<userId>` takes the same values.
- Role order in `roles` is the Discord hierarchy order, top first. Role names must be unique (case-insensitive). Access entries refer to roles **by name**.
- After Apply, objects gain `roleId`, `categoryId`, and `channelId`. These IDs take precedence over name matching on the next Apply.
- `permissions` uses discord.js `PermissionFlagsBits` names. The dashboard offers only a curated list (`layoutRolePermissions` in `devapp.api.mjs`, plus `rolePermissionOptions` in `app.js`; keep them aligned). On existing roles, Apply sets only those permissions and keeps all others, such as Administrator.

**Config store** (`guild-config.json`), keyed by server ID:
`{ guildId, guildName, layout, managedIds: { categoryIds, channelIds, roleIds }, announcementChannelId, tickets: { channelId, logChannelId, retentionHours, types[{id,label}], openingMessage, welcomeMessage, moderatorRoleIds, records }, templatePosts }`.

**Drafts** (`layout-drafts.json`), keyed by server ID: `{ layout, savedAt }`.

**API** (all paths under `/apps/discord-manager/api/`):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `status`, `servers`, `templates` | Connection state and invite URL; connected servers; copy-ready messages |
| GET | `config?guildId=…&includeMembers=1` | Applied config + `layoutDraft` + live channels, roles, and members |
| PUT | `config` | Save settings (the dashboard keeps the applied layout unchanged here) |
| GET | `layout/default` | The Rites default layout |
| PUT / DELETE | `layout/draft` | Save `{ guildId, layout }` / discard (`?guildId=`) |
| POST | `setup/apply` | Apply `{ guildId, config }` to Discord, then clear the draft |
| POST | `members/roles`, `tickets/panel`, `announcements/send`, `templates/post`, `commands/sync`, `invites/resolve` | Member roles, ticket panel, announcements, managed posts, `/riteserver` registration, invite lookup |
| PUT | `credentials` | Save the token and reconnect |

**Discord interaction IDs** start with `rites_admin_` (dashboard buttons and modals) or `rites_ticket_` (ticket open, triage, and close). Ticket open buttons are `rites_ticket_open:<typeId>`. Renaming these breaks buttons on messages already posted.

## Rules

- **Run one bot client per token.** Stop the standalone Ticket Rites bot (`Projects/bots`) while the launcher runs this one. Two gateway clients with the same token both answer interactions, and tickets duplicate or fail.
- **Keep the launcher running.** The bot lives in the launcher process. With the launcher closed, `/riteserver`, ticket buttons, Pending auto-roles, and requester-removal timers stop.
- **Save draft never touches Discord; Apply does.** Apply creates and updates managed items and **deletes** managed channels and roles removed from the layout. It deletes a managed category only when no unmanaged channels remain in it. Keep the confirm prompt when the layout contains removals.
- **The bot is invited with Administrator** (`permissions=8` in the invite URL). Do not add checks or layout options that can take the bot's own access away: Apply skips the bot's own and integration roles and always adds the bot's channel overwrite.
- **Keep the bot's highest role above every layout role.** Otherwise role edits and reordering fail with *Move the bot's highest role above all roles managed by this layout*.
- **Do not call Discord REST APIs on every dashboard refresh.** Use the gateway caches. Repeated `channels.fetch`, `roles.fetch`, or `members.fetch` calls get rate-limited, and server loads then stall for up to a minute.
- **Name changes in the layout are matched by name.** Without stored IDs, a renamed category, channel, or role creates a new item. Keep IDs in drafts by loading the default, rather than rebuilding layouts by hand.
- **Never commit** `.env`, `guild-config.json`, or `layout-drafts.json`. The token gives full control of the bot.
- **The *Apply server layout* button in Discord applies the last applied layout,** not the dashboard draft.
- Saving `devapp.api.mjs` makes the launcher reload it on the next API request. The reload disposes of the running client and reconnects the bot. Changes to `public/` take effect on page reload.

## When it breaks

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Status says *Token needed* or *Connection error* | `DISCORD_BOT_TOKEN` missing, or the token was reset in the Developer Portal | Save the token again under **Bot token** |
| Server list is empty | Bot not invited, or not connected yet | Use **Invite bot**/**Add bot to a server**; wait for *Connected* |
| Layout editor stays blank or a toast says *rate limited* | REST fetches on every refresh hit Discord's limits | Keep `getConfig` cache-first (see Rules); wait about 30 s and reselect the server |
| Apply creates roles, then fails on channels with *Missing Permissions*/*Missing Access*; sends fail too | Bot lacks Administrator (added with an older invite) and a hidden category locked it out | Re-invite with **Invite bot** or enable Administrator on the bot's role; delete any category the bot created but can no longer see, then apply again |
| Apply fails: *Move the bot's highest role above…* | Bot role ranks below managed roles | Drag the bot role to the top in Discord **Server Settings → Roles** |
| Apply fails: *already exists with a different channel type* | An unmanaged channel has the same name as a layout channel of a different type | Rename or delete the channel in Discord, or rename the layout channel |
| Apply recreates channels instead of updating them | Draft lost its IDs (built by hand or renamed) | Load **Current server setup** or the default (which copies IDs by name), then edit |
| `/riteserver` missing | Global command not registered yet, or the user lacks **Manage Server** | Click **Register /riteserver**; allow time for Discord to show it |
| Ticket transcript not posted | No log channel and no `#ticket-log`, or the bot can't post there | Choose a log channel in **Tickets**; grant View/Send/Attach Files |
| Moderators not added to ticket threads; transcripts lack text | Server Members or Message Content intent disabled | Enable both privileged intents in the Developer Portal |
| Ticket buttons answer twice, or *Interaction failed* | Standalone Ticket Rites bot also running with this token | Stop the other process |
| New members don't get `Pending` | Layout not applied with a `Pending` role, or the bot's role ranks too low | Apply the layout; move the bot role above `Pending` |

## Verify

```bash
cd devApps/discord-manager && node --test
node --check devApps/discord-manager/devapp.api.mjs
# With the launcher running:
curl -s http://127.0.0.1:4605/apps/discord-manager/api/status
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" "http://127.0.0.1:4605/apps/discord-manager/api/config?guildId=<server id>&includeMembers=1"
```

The config request should return `200` in well under a second once the bot is connected.
