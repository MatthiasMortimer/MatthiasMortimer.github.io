# Runbook

## Bugs and unfinished work

- Site Studio's plugin-specific capabilities were not exposed in the active agent session, so automatic selection and canvas use could not be verified. The repository instructions can guide Copilot to choose the plugin when available, but cannot enable it in a client or session that does not expose it.
- Convert the new test-worktree flow into an official ecosystem testing setup (script and docs): create/pin a `~/Projects/RitesDev-ecosystem-test` worktree, write `.rites-env=test`, and launch apps with test ports/tunnel disabled by default.
- Restore the missing `/media/project-home.svg` asset or update its content reference; public-site checks return HTTP 404 for this image.
- Startup optimization is incomplete. Measure cold-start time for ritesDevApp and siteHosting, then consider one shared Electron install on the SSD; the repo is on a 5400rpm HDD. The work so far covers only a loading window, cached builds, and async cleanup.
- Decide whether to drop `stash@{0}` ("Backup main local edits before ecosystem-finish merge"), which holds the old main edits the user said were unimportant.
- Discord RitesDev server (1563060495328743525): the bot's role "RitesDev" lacks Administrator (old invite). Re-invite via the manager's **Invite bot** or enable Administrator on that role. Then delete the leftover hidden test category `zz-perm-test` (the bot can't see it now) and run **Apply setup** again.
