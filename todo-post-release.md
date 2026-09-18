# TODO — follow-ups after the 0.1.0 release

## Context

`@proabono/mcp-installation` is a stdio MCP server distributed on npm and run via `npx`. Its source
lives in the public repository `SubscriptionTech/ProAbono.Mcp.Installation` (GitHub numeric id
**1376081941**), attached as a Git submodule at the path `ProAbono.Mcp.Installation` to the parent
repository `SubscriptionTech/Claude.Publiable.McpInstallation`, which holds the Claude rules, the
memory, the notes and the submodule pointer and builds nothing.

On 2026-09-18 the source was split out of the parent into that new repository, and version **0.1.0**
was released to close the move: it is the first version whose published metadata names the new
repository, and the first published from CI with an npm provenance attestation. `0.0.1` keeps the old
repository URL permanently — a published version's metadata is frozen on npm and in the MCP Registry
alike — which is why the parent repository survives and its `README.md` points at the new one.

### How a release works here

- The version lives in four places that `tests/release.test.ts` forces to agree: `package.json`
  `version`, `server.json` `version` and `packages[0].version`, and `SERVER_VERSION` in
  `src/server.ts`. The same test also holds `package.json` and `server.json` to the same repository.
- Pushing a `v*` tag **is** the release. `.github/workflows/release.yml` compares the tag to
  `package.json`, then runs `npm ci`, `npm run typecheck`, `npm run build`, `npm test`,
  `npm publish --provenance --access public`, and finally `gh release create`.
- It authenticates with a granular npm token held as the `NPM_TOKEN` repository secret. Provenance
  does **not** come from that token: it comes from the workflow's `id-token: write` permission.
- Publishing to the MCP Registry stays manual and local, and must run **after** npm, because the
  registry verifies that the published npm package carries an `mcpName` matching the server name.
- A published version number is spent. npm refuses to republish it, even after an unpublish. A run
  that fails *before* npm accepts the tarball costs nothing — fix and re-run the failed job, never
  re-tag.

### State at the time this list was written

- npm serves `0.1.0` as `latest`, with `repository.url`
  `git+https://github.com/SubscriptionTech/ProAbono.Mcp.Installation.git`, `mcpName`
  `com.proabono/mcp-installation`, and `dist.attestations` carrying predicate
  `https://slsa.dev/provenance/v1`.
- The MCP Registry serves `com.proabono/mcp-installation` `0.1.0` with the new URL, id `1376081941`,
  `isLatest: true`.
- `main` of the submodule is at `dea9ac5`; CI is green on Node 20.x, 22.x and 24.x; the parent's
  submodule pointer matches.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml` are both on `actions/checkout@v7`
  and `actions/setup-node@v7`.
- `.github/dependabot.yml` ignores `typescript` **major** bumps, and nothing else.

Everything below is a follow-up. None of it is broken, and none of it blocks a user of the package.

---

## ~~todo-1 — Record how to release, where it will be read~~

~~Two facts cost an hour during the `0.1.0` release and currently survive only in a git commit message~~
~~(`0aab059` on the parent), which is not where anyone will look next time:~~

~~1. **`mcp-publisher login dns --private-key` takes the key in hex.** The tool's own help says~~
~~`Private key (hex)`; its documented example line, `--private-key <key>`, does not. Passing the~~
~~base64 form fails with~~
~~`Error: invalid hex private key format: encoding/hex: invalid byte: U+004D 'M'` — `M` is not a hex~~
~~digit. The error names the encoding, not the fix.~~
~~2. **The key is stored as a PKCS8 PEM** on the publishing machine. Converting and logging in without~~
~~the key ever reaching the terminal or the shell history.~~

~~Where should this live? Options:~~

~~1. **A `## Releasing` section in the submodule's `CLAUDE.md`.**~~
~~2. **A `RELEASING.md` in the submodule**, linked from `CONTRIBUTING.md`.~~
~~3. **In `CONTRIBUTING.md` itself**.~~

~~Whichever is chosen: no key, no token and no secret value goes in it.~~

**Settled 2026-09-18, option 2.** `RELEASING.md` added to the submodule (commit `e080884`), linked
from `CLAUDE.md`'s *Release identity* section and from `CONTRIBUTING.md`'s *Pull requests* bullet, so
neither a Claude session nor an outside contributor reaches the version rules without seeing it.

It holds the whole sequence: the four files that must agree, `npm version --no-git-tag-version`, the
tag as the trigger, what the workflow does step by step, what a failure before and after the publish
step costs, the registry publish, the verification of all three surfaces, and the submodule-pointer
bump afterwards.

The hex-versus-base64 trap is recorded there with the verbatim error, along with a one-liner that
converts the PEM and logs in in one step, and a second that derives the public key so a key can be
checked against DNS before use. **Both were run against the real key file before being written down**:
the derived public key matched `s8Q3jYzTLX2RPqBgpMppOmdKOsZl2zPbOvB+TIPFiCE=` exactly, and the seed is
64 hex characters.

One deliberate change from what this section proposed: the runbook takes the key path as a command
argument (`/path/to/your/key.pem`) instead of naming the real one. Both repositories are public, and
publishing where the signing key sits on a machine is free intelligence for anyone who later gets a
foothold. The generic half of the lesson loses nothing by it. The real path, the npm token and its
expiry belong in the password manager, which the runbook says explicitly.

---

## todo-2 — `release.yml` is unexercised under the v7 actions

`actions/checkout` and `actions/setup-node` were bumped from 4 to 7 after the release, in
`37a56e8` and `dea9ac5`. CI is green — but CI only runs `ci.yml`.

`release.yml` uses `setup-node` differently: it passes `registry-url`, which writes the `.npmrc` that
`NODE_AUTH_TOKEN` feeds, and it relies on `id-token: write` for the provenance attestation. Neither
is exercised by any push. **The next release is the first proof the release path still works under
v7.**

The consequence is bounded: a failure there happens before npm accepts a tarball, so the version is
not spent and the failed job can be re-run. But it is discovered at the worst moment, when a release
is what you actually wanted.

Options:

1. **Accept it.** Do nothing; find out at the next release, and re-run the job if it breaks.
2. **Add a `workflow_dispatch` trigger to `release.yml`** with a guard so a manual run performs every
   step up to and including `npm publish --dry-run` but never a real publish. The release path
   becomes testable on demand, at the cost of a conditional in the workflow that must itself be
   right — a mistake there is the one failure mode that could spend a version by accident.
3. **Extend CI instead**, adding a job that runs `setup-node` with the same `registry-url` and asserts
   the `.npmrc` was written. Narrower than option 2 and it cannot publish anything, but it does not
   cover the provenance half at all.

---

## todo-3 — The pending `@types/node` bump

Dependabot PR #3 bundled `@types/node` 24.13.5 → 26.5.1 with `typescript` 5.9.3 → 7.0.2. TypeScript 7
(the typescript-go rewrite) stops resolving `@types/node` under the repository's `tsconfig.json`, and
`npm run typecheck` failed on 20.x, 22.x and 24.x alike — around twenty errors of the shape
`TS2503: Cannot find namespace 'NodeJS'` and `TS2304: Cannot find name 'fetch'`.

`.github/dependabot.yml` now ignores `typescript` major bumps (`b6ebaef`), and Dependabot closed #3
by itself. `@types/node` 24 → 26 is **also** a major, but it is **not** ignored — only `typescript`
is — so Dependabot should re-propose it on its own at the next weekly run.

Check whether that pull request appeared. If nothing has by 2026-09-25, force an evaluation from
**Insights → Dependency graph → Dependabot → Check for updates** on
`SubscriptionTech/ProAbono.Mcp.Installation`.

When it appears, it is an ordinary review: green CI on all three Node versions means merge. If it
comes back red, the interesting question is whether `@types/node` 26 alone breaks the build, or only
did so in combination with TypeScript 7 — that changes whether the ignore rule was the right fix.

---

## todo-4 — The npm token: expiry, and the 2FA-bypass deprecation

The release run printed:

> npm tokens that bypass 2FA are being restricted for account changes and direct publishing.
> Learn how to prepare: https://gh.io/npm-gat-bypass2fa-deprecation

The granular token in the `NPM_TOKEN` secret works today. Two separate clocks are now running against
it: its own expiry date, set when it was created, and npm's deprecation of tokens that bypass 2FA for
publishing. When either expires, the release workflow fails at the publish step — before any upload,
so no version is spent, but a release is blocked until it is fixed.

The alternative is **npm trusted publishing** (OIDC): the workflow authenticates by identity rather
than by a stored token, and no long-lived secret sits on a public repository. It was considered
during the split and rejected in favour of the token; that was a choice, not a constraint, and the
deprecation above is what will eventually settle it.

Options:

1. **Record the dates and wait.** Put the token's expiry in a calendar, with a reminder to rotate. Do
   nothing else until npm forces the move. Read the deprecation page first to learn the actual
   deadline, which is not known here.
2. **Move to trusted publishing now**, while nothing is urgent and a failed attempt costs nothing:
   configure the repository and workflow on npmjs.com, drop `NODE_AUTH_TOKEN` from `release.yml`, and
   delete the `NPM_TOKEN` secret once a release has succeeded without it. Provenance is unaffected
   either way — it comes from `id-token: write`.
3. **Both, in order**: record the dates now, move to trusted publishing as part of the next release
   rather than as a change of its own.
