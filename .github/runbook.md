# Runbook

## Bugs and unfinished work

- Site Studio's plugin-specific capabilities were not exposed in the active agent session, so automatic selection and canvas use could not be verified. The repository instructions can guide Copilot to choose the plugin when available, but cannot enable it in a client or session that does not expose it.
- Convert the new test-worktree flow into an official ecosystem testing setup (script and docs): create/pin a `~/Projects/RitesDev-ecosystem-test` worktree, write `.rites-env=test`, and launch apps with test ports/tunnel disabled by default.
- Update content-editor's `test/content-inventory.test.js` fixtures: two existing tests expect a `contractor` site that is absent from this checkout; targeted card/editor tests pass, but the full editor suite still fails on those assumptions.
