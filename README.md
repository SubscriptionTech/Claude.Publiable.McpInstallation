# ProAbono MCP Installation — workspace

**The source of the published package now lives in
[SubscriptionTech/ProAbono.Mcp.Installation](https://github.com/SubscriptionTech/ProAbono.Mcp.Installation).**
Everything `@proabono/mcp-installation` is built from — the server, the tests, the build scripts, the
ProAbono API contract and the documentation corpus — moved there, and is attached here as a Git
submodule of the same name.

If you arrived from the npm page of version `0.0.1`, that link points here because a published npm
version's metadata is frozen. Follow the repository above; it is the same code, with its history.

- **Package**: [`@proabono/mcp-installation`](https://www.npmjs.com/package/@proabono/mcp-installation)
- **MCP Registry**: `com.proabono/mcp-installation`
- **Install and configure**: see the
  [README of the submodule](https://github.com/SubscriptionTech/ProAbono.Mcp.Installation#readme)

## What this repository is

The workspace around the package: the Claude Code rules (`CLAUDE.md`), the project memory
(`.claude/memory/`), the private notes (`notes/`), and the submodule pointer. It ships nothing and
builds nothing.

The build, the test suite and both publications — npm and the MCP Registry — all run **inside**
`ProAbono.Mcp.Installation/`, never here.

## Working on it

```bash
git clone --recurse-submodules https://github.com/SubscriptionTech/Claude.Publiable.McpInstallation.git
cd Claude.Publiable.McpInstallation/ProAbono.Mcp.Installation
npm ci && npm run typecheck && npm run build && npm test
```

On a clone that already exists, `git submodule update --init --recursive` fills the folder. The
submodule tracks `main`, so `git submodule update --remote` moves it forward; the new pointer is then
committed here like any other change.

A commit made inside the submodule belongs to the submodule's repository: push it there first, then
commit the moved pointer here.

## Licence

MIT. See [LICENSE](LICENSE) — the same licence the package carries.
