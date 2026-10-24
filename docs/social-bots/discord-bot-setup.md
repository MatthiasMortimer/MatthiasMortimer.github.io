# Discord Bot Manager

The Discord Bot Manager is an embedded RitesDev app. It connects one Discord bot to multiple servers and keeps each server's layout, announcement destination, and ticket settings separate. Server IDs are discovered from Discord after the bot joins; they are not entered by hand. For file formats, API routes, rules, and troubleshooting, see the [Discord bot and manager system doc](../systems/discord-manager.md).

## Connect the bot

1. In the Discord Developer Portal, create an application and bot user.
2. Under **Bot**, enable the privileged **Message Content Intent** so closed ticket transcripts can include message text, and **Server Members Intent** so configured moderators can be added to private ticket threads.
3. Start the RitesDev launcher and open **Discord Bot Manager**. Choose **Bot token**, paste the bot token, and save. The token is stored in the local ignored `.env` file and is not displayed again.
4. Use **Add bot to a server** in the manager to invite it. Repeat for each server (the expected scope is a handful of private servers). The small **Invite bot** control under **Bot token** can resolve a pasted server invite link or code and open Discord's authorization page with that server selected. A member with permission to manage the server must approve the bot there.

The invite asks for **Administrator**, so setup, tickets, and announcements work in every channel. A server that added the bot with an older invite keeps its older permissions: open **Invite bot** again for that server, or turn on Administrator for the bot's own role in **Server Settings → Roles**. Keep the bot's highest role above any roles that setup will manage.

## Server setup

Select a connected server in the manager. Add, rename, and remove categories, channels, and roles using the visual controls. The role list order is top to bottom in the server hierarchy; use the arrows to change it. The bot's highest role must be above every layout role. Choose text, announcement, or forum for each channel; forum channels can have up to 20 tags. Choose role permissions from readable labels and adjust category visibility, role access, optional per-channel overrides, and explicit access for individual server members. Remove a member's override to revoke that grant, then apply the layout. The layout editor works on a per-server draft: **Save draft** stores it locally (and saves the default announcement channel) without changing Discord, and the draft reloads automatically the next time you open that server. Use **Load a template** to switch the editor to the saved draft, the **Rites default setup** from `scripts/discord/server-layout.json`, or the **Current server setup** last applied; loading the default reuses this server's existing channel and role IDs by name. **Discard draft** deletes the draft. **Apply setup** creates or updates managed roles/categories/channels and deletes items removed from the managed layout. It replaces permission overwrites on managed categories and channels with the access settings shown in the manager, and always adds an overwrite that keeps the bot's own access, so hiding a category from @everyone never locks the bot out. On existing roles, Apply changes only the permissions the editor shows; others, such as Administrator, are kept. The bot's own role and integration roles are never edited. It only deletes categories when they are empty; unrelated channels keep their category in place. Removing a role removes it from members, and the manager asks before applying removals.

In Mobile mode, select a server from the horizontally scrollable server list. **Server setup**, **Tickets**, **Announcements**, and **Messages** appear directly underneath in a two-column menu. The server list and section menu scroll out of the way as you scroll down; the layout's Save draft and Apply setup buttons stay pinned at the bottom of the screen. Desktop keeps its section menu above the editor.

The collapsible **Roles** section sits above **Categories and channels** on mobile and desktop. Open it to edit the role hierarchy or manage member assignments; collapse it to keep the channel editor compact. It starts collapsed, and toggling it does not discard edits.

After applying a layout with `Pending` and `Network Member` roles, new members are automatically assigned `Pending`. Use **Member roles** to assign layout roles to current members. **Approve as Network Member** removes `Pending` and adds `Network Member`; it keeps other selected layout roles. The bot needs the Server Members intent and Manage Roles permission, and its highest role must be above `Pending` and `Network Member`.

The bot registers the global `/riteserver` command when it connects. Registration can take a while to appear in Discord. Server managers can use:

- The **Apply server layout** dashboard button applies the saved layout.
- The **Set announcement channel** dashboard button opens a channel picker to set or change this server's default.
- The **Post ticket panel** dashboard button posts the saved ticket panel in its configured support channel.

Run `/riteserver` to open the server dashboard. Its **Send announcement** button sends to each connected server's configured default channel. Use the manager's **Announcements** tab to choose individual servers or channels.

The commands require **Manage Server** permission. The dashboard also has a **Register /riteserver** action.

## Tickets

In **Tickets**, choose a regular text panel channel, an optional transcript log channel, moderator roles, an opening message, a welcome message, and a requester retention period. Edit the ticket type labels, add types, or remove them; the panel supports up to 25 buttons. **Post support panel** saves the current setup and posts the type buttons. Members can have one private thread per server. Thread names include a ticket sequence, type, and requester slug, such as `ticket-1042-project-support-acme`. Configured moderators are added to each private thread. Moderators can create a linked `#client-requests` forum post after triage, then close with a resolution and optional note. The bot delivers the HTML transcript to the configured log channel or `#ticket-log`, archives the thread, and removes the requester from it after the configured number of hours. The retention timer is restored when the bot restarts.

The bot needs Manage Channels and Manage Roles for setup, plus View Channels, Send Messages, Read Message History, Create Private Threads, Send Messages in Threads, Manage Threads, and Attach Files in ticket and log channels. Enable Message Content Intent and Server Members Intent in the Developer Portal for transcripts and private moderator access. Keep the bot running for retention timers to execute; overdue removals are rescheduled when it reconnects. Run one instance of this bot at a time with the configured token.

## Announcements

In **Announcements**, write a message and choose one or more servers. With no individual channels selected, the bot uses each server's saved default announcement channel. Select channels to target specific destinations, or choose **All writable text channels**. **All connected servers** uses the configured default channel in each server unless all channels are also selected.

Discord messages are limited to 2,000 characters. Use the font selector to type Unicode bold, italic, bold italic, monospace, or double-struck text, and switch styles anywhere in the same message. Select existing text to change its style or return it to normal. Type `@` in the manager's announcement box to choose a role mention. Mentions are suppressed by default. Enable **Allow role, @everyone, and @here mentions** to send them; the bot must have **Mention Everyone** permission in every destination channel. Other role and user mention parsing stays disabled. Across servers, selected roles are matched by name.

## Copy-ready channel messages

The **Messages** tab provides the `#start-here`, `#rules`, `#server-information`, `#apply-or-contact`, and launch announcement templates. Choose a template and destination to preview, copy, or post it. The manager stores each posted message ID per server, template, and channel; posting that same template there again edits the managed message. On first use it also checks recent bot messages for an exact copy before creating one. The launch template's `@everyone` text is suppressed as a mention.

## Runtime and local data

The Discord gateway client runs in the RitesDev launcher process, so the launcher must remain running for slash commands, ticket buttons, and dashboard sends to work. Stop the standalone Ticket Rites process in `Projects/bots` while using this embedded runtime so the same bot token does not have two active clients. Per-server dashboard settings are saved in the ignored `scripts/discord/guild-config.json`, and unapplied layout drafts in the ignored `scripts/discord/layout-drafts.json` (cleared after a successful Apply setup); the starter layout remains in `scripts/discord/server-layout.json`. Never commit or share the bot token.
