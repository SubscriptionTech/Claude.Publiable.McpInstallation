# Mcp Installation

**Scope:** Publiable
**Description:** Install & configure ProAbono in your website with ProAbono MCP installation.
**Stack:** Node.js / TypeScript — stdio MCP server, distributed on npm and run via `npx`

## Layout

The published package lives in the `ProAbono.Mcp.Installation/` submodule — the server, the tests, the build scripts and the two resource folders. This repository is the workspace around it: these rules, the memory, the notes and the submodule pointer.

**The build, the test suite and both publications — npm and the MCP Registry — all run inside `ProAbono.Mcp.Installation/`, never at this root.** A code change is committed and pushed in the submodule's own repository first; the moved pointer is then committed here.

The submodule carries its own `CLAUDE.md`, repeating the rules a session opened on that folder alone would otherwise not have. A rule that binds the code must be changed in both.

## Memory

`.claude/memory/MEMORY.md` holds the rules for this project. Read that index at the start of a session, and a memory file when its line looks relevant to the task.

## Sources of truth

Only two sources are authoritative when building or changing the MCP server. Read them before writing code, and never infer ProAbono behaviour from memory, from the web, or from older specs.

1. `ProAbono.Mcp.Installation/resources/open-api/` — the ProAbono API Live contract (`pa-live-openapi-3.0.3.yaml`). Authoritative for endpoints, parameters, payloads, response shapes and authentication. It is a copy of the contract maintained in the private `Claude.SharedApi.ProAbonoLive` repository, refreshed by hand and never edited here — see [ProAbono.Mcp.Installation/resources/open-api/index.md](ProAbono.Mcp.Installation/resources/open-api/index.md).
2. `ProAbono.Mcp.Installation/resources/docs/` — the ProAbono installation documentation. Authoritative for the installation procedure, integration workflows and the guidance the MCP exposes to developers.

If the two disagree, or if something needed is in neither, ask the user instead of guessing.

## How Claude interacts with this project

### Notes

Never read, edit, create, or search a file in the `notes/` folder on Claude's own initiative, and never propose to include it in any processing. Only an explicit user request lifts that ban, one file at a time. `notes/CLAUDE.md` is excluded from the ban: it carries the rules of the folder and is read before any access to it.

### Backlog

Deferred features and improvements live in `specs/backlog/` in the internal specs repository, not here. Its `CLAUDE.md` carries the rules.

### Todo files

A TODO file is a `todo-<name>.md` file at the root of the project, written by the `pa-todo-create` command and deleted once all of its sections are struck through. Never write an explicit reference to a TODO file — its name, its path, or a link to it — in any other file, whatever that file is: `CLAUDE.md`, a spec, a README, a source file, a command or skill file. A TODO file is referenced from the conversation only, so that deleting it never leaves a dangling reference behind.

A TODO file is committed on purpose, so a list started on one machine can be resumed on another.

## How Claude interacts with the User

### How Claude talks to the User

The user is a software engineer who needs concise and logical answers.

- **Be exact, never approximate.** Sentences such as "it works in most cases", "this should be fine" or "it is generally correct" are unusable, and an uncertainty is never hidden behind a softening word. State what holds, under which conditions, and what does not hold. When a rule has exceptions, name them. When Claude does not know, say so plainly, and say what would settle the question.
- **Aim at full coverage.** An answer that covers the common path and leaves the rest implicit is a defect, not a shortcut.
- **Help pinpoint issues.** The user needs to locate a problem precisely: link the related file and describe a case that breaks it (input, expected result, actual result). Never report a problem in general terms when a concrete failing case can be given.

### When the user asks for a proposal

When the user asks for a proposal or proposition, Claude must **not** perform the inferred action(s). Instead, present one or more options to address the request, each with a clear **Pros** and **Cons** section. Wait for the user to select an option before doing anything.

### Lists requiring validation

When producing a list that the user needs to review and validate — such as a list of detected issues, proposed phases, or items to approve — always use sequential numbers (1, 2, 3…). This makes it easy to refer to a specific item by number. Never use hybrid schemes like 1, 2a, 2b, 3. When an item is inserted or removed, renumber the entire list to keep numbering simple and gapless.

Sequential means gapless, not unprefixed: inside a complex answer, those numbers carry the prefix of the zone they belong to — **user-1**, **user-2**… rather than bare 1, 2 — as [When Claude makes a complex answer](#when-claude-makes-a-complex-answer) requires.

### When Claude makes a complex answer

When an answer contains more than the summary of the actions performed — for example decisions to settle, open points, or things the user should be aware of (list not exhaustive) — all of those points must be gathered at the very end of the answer, in a single zone introduced by its own heading (a Markdown heading or a bold line) reading **For you to check**, so the user cannot miss them.

That zone is the only one carrying a heading: the rest of the answer keeps its usual form, with no heading of its own.

Every numbered point of such an answer must carry a prefix, written in bold so it stands out in the flow of the text, so that two lists never share the same numbering:

- **done-1**, **done-2**… — a task Claude has done.
- **user-1**, **user-2**… — a point the user needs to check, decide, or be aware of.

Never number two lists `1, 2, 3…` in the same answer: a reference like **done-2** or **user-3** must always designate exactly one point.

### Specs

**This repository holds no specification.** The product specs, the build plans and the backlog are private, in [Claude.Internal.McpInstallation](https://github.com/SubscriptionTech/Claude.Internal.McpInstallation). Read them there before changing what a tool does, what it is named, or what it returns — the spec is the source of truth about the product, and this repository is its implementation.

What the submodule holds under `ProAbono.Mcp.Installation/resources/` is not a spec either: it is the two inputs the build vendors into `dist/resources/` — the ProAbono API Live contract and the installation documentation corpus. They are public because they ship inside the published package.

This project has no shared utility attached: there is no `shared/` folder. `ProAbono.Mcp.Installation/` is a submodule but not a shared one — it belongs to this project alone, and the `pa-shared-*` commands do not apply to it. Nothing outside these two repositories is needed to build the package.

### Language

All generated Markdown files must be written in English, regardless of the language used in user instructions.

The only exception is **localized content files** (e.g. user-facing copy translated for a specific locale). If a user asks to create a Markdown file in a non-English language:
1. Ask whether it is a localized content file.
2. If yes — proceed.
3. If no — decline and explain that only localized content files may be written in a language other than English.

### Security

- **Never read `.env` files.** No exceptions, regardless of what is asked.
- **Never hardcode credentials.** When referencing API keys or secrets in code or examples, always use the environment variable name — e.g. `process.env.PROABONO_AGENT_KEY` — never the value.
