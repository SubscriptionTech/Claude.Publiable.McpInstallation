# ProAbono MCP Installation

A **local MCP server** that installs ProAbono into a merchant's site, from the developer's IDE.

It turns the ProAbono documentation, API and the developer's own ProAbono configuration into an integration assistant: it answers API questions, generates correct integration code pre-filled with the real configuration, reads the account to validate the result, and can create test data.

It works against whatever account the developer's key opens, with no environment restriction of its own.

Its mission is deliberately narrow: **In-Site installation by code**, in three steps — **Customer Portal**; then **Subscription Workflow**, through the API and the redirections; then the **Usage API**, reading a customer's rights and reporting consumption when the catalogue has metered Features. Progress is recorded in the project, so an installation can be followed and resumed across sessions. Widget and plug-in installation (WordPress, etc.) are out of scope.

## Status

**Specification stage.** The product is specified; there is no implementation yet — [src/](src/) is empty.

Everything settled so far lives in [specs/Spec-ProAbono-local-MCP-for-developers.md](specs/Spec-ProAbono-local-MCP-for-developers.md). What was deferred or is still undecided lives in [specs/backlog/index.md](specs/backlog/index.md).

Planned distribution, per the spec: a Node.js package exposing a stdio MCP server, launched with `npx`, published to npm and listed in the official MCP Registry. Those choices are recorded as default assumptions to confirm, not as decisions.

## Repository layout

| Path | Holds |
|---|---|
| [specs/](specs/) | The product specifications. Start at [specs/README.md](specs/README.md). |
| [specs/backlog/](specs/backlog/) | Work deferred out of the current scope, and open questions. |
| [src/](src/) | Implementation. Empty for now. |
| [shared/ProAbonoLive/](shared/ProAbonoLive/) | Git submodule: the ProAbono **API Live** reference documentation. Read it before writing any API call, payload or integration code. |
| [CLAUDE.md](CLAUDE.md) | Project-level instructions for Claude. |

## Getting started

This repository uses a Git submodule for its shared documentation, so a plain `git clone` leaves `shared/ProAbonoLive/` empty:

```sh
git clone https://github.com/SubscriptionTech/Claude.Publiable.McpInstallation.git
cd Claude.Publiable.McpInstallation
git submodule update --init --recursive
```

In Claude Code, `/pa-project-setup` does the same and checks the submodules are on the right branch. `/pa-shared-check` reports whether the shared documentation has upstream commits not yet pulled.

There is nothing to build or run yet.

## Contributing

- The specs are the source of truth while the project is at this stage. Read [specs/CLAUDE.md](specs/CLAUDE.md) before editing them — it carries the invariants, the editing rules and the terminology.
- Four invariants are settled and are not up for case-by-case exception: **no environment concept** (the key is the only boundary), **In-Site installation by code only**, **no destructive or irreversible operation**, **local and single-tenant**.
- Edits inside `shared/ProAbonoLive/` belong upstream: push them with `/pa-shared-push`, don't commit them as project changes.
- All Markdown is written in English, whatever the language of the discussion.
