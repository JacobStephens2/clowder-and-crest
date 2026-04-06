# Jacob's Todo — things Claude needs from you

## MCP servers that need credentials/tooling

### GitHub MCP server
- **What:** https://github.com/github/github-mcp-server — lets Claude interact with GitHub issues, PRs, commits directly.
- **Blocker:** Docker isn't installed on this server, and the alternative is building from Go source.
- **What I need from you:** Either
  1. Install Docker (`apt install docker.io`) and generate a GitHub Personal Access Token at https://github.com/settings/tokens (scopes: `repo`, `read:org`, `read:user`). Export it as `GITHUB_PERSONAL_ACCESS_TOKEN` in your shell, then tell me to add it to `.mcp.json`.
  2. Or build the Go binary: `go install github.com/github/github-mcp-server@latest` (needs Go installed), then tell me to wire it up.

### Nia MCP (Filesystem / Context indexing)
- **What:** https://www.trynia.ai/ — indexes external docs and codebases, claimed 27% agent performance boost.
- **Blocker:** Needs a free API key from https://app.trynia.ai.
- **What I need from you:** Sign up, generate an API key, paste it here (or into an env var), then tell me to add the config to `.mcp.json`. I already know the config format.

### Freesound API key (optional, low priority)
- **What:** https://freesound.org — lets Claude search and download SFX programmatically. Useful for adding dedicated sounds to the 5 newer minigames (Patrol lantern click, Ritual bell, Heist lock pick, etc.).
- **Blocker:** Needs a free API key from https://freesound.org/apiv2/apply/.
- **What I need from you:** Register, grab the key, paste it here or into an env var. Not urgent — current SFX pool works fine.

## Phaser Editor v5 desktop app (for the MCP I already configured)

- **What:** I added the Phaser Editor MCP to `.mcp.json`, but the MCP acts as a bridge to a **running Phaser Editor v5 desktop instance**. Without the editor running, the MCP won't do anything useful.
- **What I need from you:** Download and install Phaser Editor v5 from https://phasereditor2d.com/ if you want to use it. Then launch it before asking me to interact with scenes via the MCP. If you don't plan to use the editor, tell me and I'll remove the MCP entry.

## Nothing else blocking

Everything else in the todo is either done or can be handled by me without your input.
