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

[x] Add music into folder to be added to games
[x] Get portraits from https://www.midjourney.com/imagine, following `Next steps for you:

Review the generated expression variants — for each set of 4, pick the best one that matches the character's identity lock

Save the chosen images to todo/portraits-raw/ using the naming convention breed-expression.png

Let Claude Code handle the resize-and-install per your pipeline (480×640, Lanczos resampling, placed into public/assets/sprites/portraits/)

The conversation system (src/ui/Conversations.ts) will automatically pick up the new portraits via setPortrait — no code changes needed`, per the goal of:

`6 Neutral portraits (completed earlier):

Wildcat (variant 1), Russian Blue (variant 3), Tuxedo (variant 3), Maine Coon (variant 1), Siamese (variant 1), Bengal (variant 4)

24 Expression variants (just submitted with --cref referencing your chosen neutral portraits):

Wildcat: happy, sad, angry, surprised

Russian Blue (Mist): happy, sad, angry, surprised

Tuxedo (Inkwell): happy, sad, angry, surprised

Maine Coon (Thorne): happy, sad, angry, surprised

Siamese (Oracle): happy, sad, angry, surprised

Bengal (Ember): happy, sad, angry, surprised`
[x] regenerate art for the following, trying even more intensely to get the emotional expression
Siamese: sad
