# Jacob's Todo — things Claude needs from you

## Nothing blocking right now

All earlier items are resolved:

- **Freesound API** — done. Key in `.env`. 6 new SFX downloaded and wired into the new minigames.
- **Nia** — done. CLI installed at `/usr/bin/nia`, authenticated, tested against Phaser repo successfully.
- **Phaser Editor v5** — evaluated and skipped (mismatch for a procedural game).
- **GitHub MCP server** — skipped in favor of existing `gh` CLI (see below).

## Why the GitHub MCP isn't needed

`gh` is already installed at `/usr/bin/gh` (v2.45.0) and authenticated as **JacobStephens2** with scopes `repo`, `read:org`, `gist`, `workflow`. Claude can invoke it via Bash for all the same operations a GitHub MCP server would offer:

- `gh issue list/view/create/close`
- `gh pr list/view/create/merge/comment`
- `gh repo view/clone`
- `gh api <endpoint>` — raw REST API for anything else
- `gh run list/view` — CI workflow runs
- `gh release list/view/create`

An MCP server wouldn't provide new capability — it would just duplicate what `gh` already does. The only real difference would be exposing tool definitions in the context window instead of invoking via Bash, and for occasional GitHub operations that's a loss, not a win (same context-efficiency argument that made us pick the Nia skill over the Nia MCP).

## If you ever want to revisit

Not needed right now, but for reference:

- **GitHub REST API directly** via `curl` + PAT — works but `gh` already wraps this
- **GitHub MCP server** — official, needs Docker or Go build; adds no capability over `gh`
- **`octokit` npm package** — if we ever want programmatic GitHub access from the game itself (e.g. leaderboards, issue reports from players), but the game currently doesn't need this
