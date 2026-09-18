# TODO — finish the ProAbono.Mcp.Installation submodule split

## Context

The MCP server `@proabono/mcp-installation` used to live entirely in
`SubscriptionTech/Claude.Publiable.McpInstallation`. On 2026-09-18 its source was moved into a new
public repository, `SubscriptionTech/ProAbono.Mcp.Installation` (numeric id **1376081941**), attached
to the old one as a Git submodule at the path `ProAbono.Mcp.Installation`. The old repository stays
as the parent: it holds the Claude rules, the memory, the notes and the submodule pointer, and builds
nothing.

The move had to be paid for with a new published version. A published npm version's `repository`
comes from its tarball and cannot be edited, and the MCP Registry likewise refuses to change a
published version's metadata, so `@proabono/mcp-installation@0.0.1` and
`com.proabono/mcp-installation@0.0.1` keep the **old** repository URL forever. The mitigation is that
the parent repository survives and its README points at the new one, so the stale link never breaks.

### What is already done

- The new repository exists, is public, carries the full 19-commit history, the `v0.0.1` tag and a
  `0.0.1` GitHub release.
- It carries `.gitattributes`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, its own `CLAUDE.md`, `.github/dependabot.yml`, issue templates, and
  `.github/workflows/release.yml`.
- `package.json` `repository.url` and `server.json` `repository.url` / `repository.id` name the new
  repository, and `tests/release.test.ts` now fails if those two ever disagree.
- The parent was emptied, the submodule added with `-b main`, and its `README.md`, `.gitignore`,
  `CLAUDE.md` and `mcp-installation.code-workspace` updated.
- A fresh `git clone --recurse-submodules` of the parent builds and passes: 79 tests, 79 pass.
  `npm pack --dry-run` yields 47 files / 86.0 kB carrying `dist/`, `dist/resources/`, `README.md`,
  `LICENSE` and `server.json`.
- CI is green on the new repository for Node 20.x, 22.x and 24.x.
- Version `0.1.0` is committed and pushed on the new repository's `main` (commit `054e66e`,
  `release: 0.1.0`), in the four places `tests/release.test.ts` forces to agree — `package.json`
  `version`, `server.json` `version` and `packages[0].version`, and `SERVER_VERSION` in
  `src/server.ts` — plus `package-lock.json` and a `CHANGELOG.md` entry. The parent's submodule
  pointer was bumped to it. **`0.1.0` is not tagged and not published.**

### What is left

Everything below. Nothing so far has touched npm or the MCP Registry, and everything so far is
reversible: `git reset --hard pre-submodule-split` on the parent, and delete
`SubscriptionTech/ProAbono.Mcp.Installation`.

That stops being true at `todo-2`. A published version number is spent: npm refuses to republish it,
even after an unpublish, so a failed publish that already uploaded burns `0.1.0`.

The release workflow does guard against the commonest way that happens — its first step compares the
tag against `package.json` and fails the run before anything is uploaded if they disagree.

---

## todo-1 — The npm token, and the publishing setting

The release workflow authenticates to npm through `NODE_AUTH_TOKEN`, fed by a repository secret named
`NPM_TOKEN`. That secret does not exist yet, and nothing can be published until it does.

On npmjs.com, create a **granular access token** scoped to `@proabono/mcp-installation` with read and
write permission, then store it as the `NPM_TOKEN` secret of
`SubscriptionTech/ProAbono.Mcp.Installation`.

Two things to settle while there:

1. **The package's publishing setting.** If the package demands two-factor authentication on every
   publish, a token-driven CI publish is **refused**. The setting must allow automation tokens.
2. **Scope and expiry.** The token is long-lived and lives on a public repository. Give it the
   narrowest scope npm offers and an expiry date, and record where it is kept so it can be rotated.

Trusted publishing was considered and rejected for this release: provenance does not depend on it. The
attestation comes from the workflow's `id-token: write` permission, which is already in
`.github/workflows/release.yml`, not from how the publish authenticates.

Nothing else depends on this but everything after it does.

---

## todo-2 — Push the `v0.1.0` tag

**This is the irreversible step.** The tag *is* the release trigger: pushing it starts
`.github/workflows/release.yml`, which runs `npm ci`, `npm run typecheck`, `npm run build`,
`npm test`, then `npm publish --provenance --access public`, and finally creates the GitHub release.

Only after `todo-1`, from the new repository:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Decide who does it — it can be delegated to Claude once the secret is in place, or done by hand.

If the registry step (`todo-3`) later reports the package as missing, npm has simply not propagated
yet: **retry, never re-tag.** A second tag for the same version cannot help, because the version
number is already spent.

---

## todo-3 — Publish to the MCP Registry

The MCP Registry verifies that the published npm package carries an `mcpName` matching the server
name, so **npm must be published first**: this runs after `todo-2` has succeeded, never before.

It stays manual and local. The `com.proabono` namespace is **domain**-authenticated — a DNS TXT
record on the apex — not GitHub-authenticated, and the Ed25519 private key it needs does not belong in
a secret of a public repository. Changing the repository does not affect the right to publish.

From the machine holding the key, in the submodule folder:

```bash
mcp-publisher login dns --domain proabono.com --private-key <key>
mcp-publisher publish
```

Two failure modes worth knowing before starting:

1. The TXT record must sit on the **apex** `proabono.com`, not under a selector.
2. Any stale record left from a key rotation must be removed — a leftover record is tried first and
   fails with a generic signature error that does not say which record was used.

---

## todo-4 — Verify, then clean up

Once `todo-2` and `todo-3` are done, check all three surfaces name the new repository:

```bash
npm view @proabono/mcp-installation repository.url
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=com.proabono"
```

- `npm view` must return `git+https://github.com/SubscriptionTech/ProAbono.Mcp.Installation.git`.
- The npmjs page must show **both** the Repository link and a **Provenance** panel naming the new
  repository. If the panel is absent the publish succeeded without an attestation, which means
  `id-token: write` did not apply — that is a defect to fix before the next release, not something
  `0.1.0` can be repaired for.
- The registry response must show `0.1.0` with the new URL and the id `1376081941`, and
  `isLatest: true`.

Then:

- Bump the parent's submodule pointer to whatever the release commit ended up being, and commit it.
- Delete `plan-submodule-split.md` at the parent root — it exists only until this verification passes.
- Delete this file.

---

## todo-5 — Dependabot pull request #3, which is red

`.github/dependabot.yml` groups development dependencies into a single pull request, so the
bump of `@types/node` 24.13.5 → 26.5.1 travels together with **typescript 5.9.3 → 7.0.2**, a major
version. TypeScript 7 stops resolving `@types/node` under the repository's current `tsconfig.json`,
and `npm run typecheck` collapses — on Node 20.x it reports, among roughly twenty errors of the same
shape:

```
src/config.ts(54,20): error TS2503: Cannot find namespace 'NodeJS'.
src/api/client.ts(39,48): error TS2304: Cannot find name 'fetch'.
src/api/client.ts(49,35): error TS2591: Cannot find name 'Buffer'.
src/corpus/index.ts(35,67): error TS2339: Property 'url' does not exist on type 'ImportMeta'.
```

**Do not merge it.** Two options:

1. **Close #3 and add an `ignore` for `typescript` major bumps** in `.github/dependabot.yml`, so the
   two stop travelling together and `@types/node` can move on its own. Cheapest, and it keeps the
   group useful.
2. **Take the TypeScript 7 migration deliberately**, as its own piece of work, adjusting
   `tsconfig.json` until the typecheck passes on all three Node versions. Larger, and it has nothing
   to do with the split.

Option 1 unless the TypeScript 7 move is wanted now.

---

## todo-6 — Dependabot pull requests #1 and #2, which are green

`#1` bumps `actions/setup-node` from 4 to 7 and `#2` bumps `actions/checkout` from 4 to 7. CI passes
on both.

Both actions are named in the provenance attestation the release workflow produces. Merging them
**before** `todo-2` is fine; merging them while a release is in flight is not, because the attestation
would then describe a workflow different from the one that was reviewed.

Decide: merge both now, before the tag — or leave them until after `todo-4` and merge them into a
quiet tree.

---

## todo-7 — The redundant sibling clone

`ProAbono.Mcp.Installation` was first cloned as a **sibling** of the parent, at
`C:\Users\sebas\Documents\Produit\Tiers\MCPs\ProAbono.Mcp.Installation`, to build the new repository
from. The working copy that counts is now the submodule, at
`C:\Users\sebas\Documents\Produit\Tiers\MCPs\mcp-installation\ProAbono.Mcp.Installation`.

The sibling is a full clone with its own `origin` and its own `node_modules`. It is harmless, but a
commit made in it by mistake goes to the right remote from the wrong place, and the parent never sees
it. Check it holds nothing unpushed, then delete it.
