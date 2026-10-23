# Discord server setup bot

The `discord:setup` utility creates the categories and text channels in [DISCORD_SETUP.md](../../DISCORD_SETUP.md). Edit [server-layout.json](../../scripts/discord/server-layout.json) to change the channel list before running it.

The **Discord Bot Manager** tab in the RitesDev launcher shows and edits the bot token, server ID, and server layout. Credentials are stored in the ignored `.env` file and can be viewed or changed over mobile mode. **Check Discord connection** makes read-only API requests to validate the token, server membership, and setup permissions. It does not change Discord or send messages. The launcher discovers the tab automatically.

## Create and invite the bot

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and add a bot user.
2. Copy the bot token into `DISCORD_BOT_TOKEN` in the repository's local `.env` file. Put your server ID in `DISCORD_GUILD_ID` in the same file. `.env` is ignored by Git; never commit the token or paste it into chat.
3. Under **OAuth2 → URL Generator**, select the `bot` scope and the `Manage Channels` and `Manage Roles` permissions. Open the generated URL and add the bot to your server.
4. Enable Developer Mode in Discord, right-click the target server, and copy its ID.

The manager's connection check and setup utility use Discord's HTTP API, so no Gateway intents or always-on bot process are required. Grant the bot `Manage Channels` and `Manage Roles`; it does not need Administrator. Its highest role must be above the roles this utility manages. Discord only lets a bot manage roles below its highest role ([role hierarchy](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions)).

## Run

Fill in the two values in the **Discord Bot Manager** tab, or edit the ignored `.env` file directly. In the tab, choose **Check Discord connection** to verify the token, server membership, and permissions. This check makes read-only requests and does not modify the server.

To preview the channel layout:

```sh
npm run discord:setup -- --dry-run
```

After reviewing the plan, apply it:

```sh
npm run discord:setup
```

The script reuses categories by name and skips channels with the same name in their matching category. Discord has a channel limit per server; if creation reaches that limit, remove unneeded channels or split the setup into stages.

## Follow-up in Discord

The utility creates and updates the roles listed in `server-layout.json`, and applies category visibility rules from that file. The `Admin` role is created without Administrator permissions; assign trusted people to it only after you configure its permissions in Discord. The script does not assign members to roles or grant individual client/project access. It creates text channels, not forum channels or posts. Convert `client-requests`, `client-updates`, `active-projects`, `internal-projects`, and `project-archive` to forum channels where noted in [DISCORD_SETUP.md](../../DISCORD_SETUP.md), then add individual client and project members to their private categories before inviting them.

Each run reapplies the configured permissions on the six managed categories, replacing their existing category overwrites. Review and back up any custom overwrites there before rerunning. Channel overwrites that differ from their category remain channel-specific.
