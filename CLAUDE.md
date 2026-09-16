# Mcp Installation

**Scope:** Publiable
**Description:** Install & configure ProAbono in your website with ProAbono MCP installation.
**Stack:** Node.js / TypeScript — stdio MCP server, distributed on npm and run via `npx`

## Memory

`.claude/memory/MEMORY.md` holds the rules for this project. Read that index at the start of a session, and a memory file when its line looks relevant to the task.

## Sources of truth

Only two sources are authoritative when building or changing the MCP server. Read them before writing code, and never infer ProAbono behaviour from memory, from the web, or from older specs.

1. `shared/ProAbonoLive/open-api/` — the ProAbono Live API contract (`pa-live-openapi-3.0.3.yaml` and its `instructions.md`). Authoritative for endpoints, parameters, payloads, response shapes and authentication.
2. `specs/mcp-installation-docs/` — the ProAbono installation documentation. Authoritative for the installation procedure, integration workflows and the guidance the MCP exposes to developers.

If the two disagree, or if something needed is in neither, ask the user instead of guessing.

## How Claude interacts with this project

### Notes

Never read, edit, create, or search a file in the `notes/` folder on Claude's own initiative, and never propose to include it in any processing. Only an explicit user request lifts that ban, one file at a time. `notes/CLAUDE.md` is excluded from the ban: it carries the rules of the folder and is read before any access to it.

### Backlog

The local specs and the shared specs can each hold a `backlog` folder, gathering the features and improvements that are deferred to a later version. Its `CLAUDE.md` file carries the rules and is read before creating, updating, or implementing a backlog.

### Todo files

A TODO file is a `todo-<name>.md` file at the root of the project, written by the `/add-todo` command and deleted once all of its sections are struck through. Never write an explicit reference to a TODO file — its name, its path, or a link to it — in any other file, whatever that file is: `CLAUDE.md`, a spec, a README, a source file, a command or skill file. A TODO file is referenced from the conversation only, so that deleting it never leaves a dangling reference behind.

A TODO file is committed on purpose, so a list started on one machine can be resumed on another.

## How Claude interacts with the User

### When the user asks for a proposal

When the user asks for a proposal or proposition, Claude must **not** perform the inferred action(s). Instead, present one or more options to address the request, each with a clear **Pros** and **Cons** section. Wait for the user to select an option before doing anything.

### Lists requiring validation

When producing a list that the user needs to review and validate — such as a list of detected issues, proposed phases, or items to approve — always use sequential numbers (1, 2, 3…). This makes it easy to refer to a specific item by number. Never use hybrid schemes like 1, 2a, 2b, 3. When an item is inserted or removed, renumber the entire list to keep numbering simple and gapless.

### When Claude makes a complex answer

When an answer contains more than the summary of the actions performed — for example decisions to settle, open points, or things the user should be aware of (list not exhaustive) — all of those points must be gathered at the very end of the answer, in a single zone introduced by its own heading (a Markdown heading or a bold line) reading **For you to check**, so the user cannot miss them.

That zone is the only one carrying a heading: the rest of the answer keeps its usual form, with no heading of its own.

Every numbered point of such an answer must carry a prefix, written in bold so it stands out in the flow of the text, so that two lists never share the same numbering:

**done-1**, **done-2**… — a task Claude has done.
**user-1**, **user-2**… — a point the user needs to check, decide, or be aware of.

Never number two lists 1, 2, 3… in the same answer: a reference like **done-2** or **user-3** must always designate exactly one point.

### When the user asks for a TODO list

A TODO list is a file, written at the root of the project and named todo-<name>.md, where <name> is inferred from what the answer is about — kebab-case, 30 characters at most. Asking for a TODO list is asking for that file: Claude writes it and performs none of the points it holds.

The file carries the whole explanation of the answer Claude has just given, rewritten to be **self-contained**. A later session reads the file alone, without the conversation that produced it, so every term, entity, spec section, source and finding the answer relied on is named in the file itself. A reference to "the previous point", "the rule discussed above" or "what you asked" is a defect: the file is context-less by construction.

Each **user-x** point of that answer that calls for a decision from the user, or that states a major change, becomes a section of the file titled todo-x — see [When Claude makes a complex answer](#when-claude-makes-a-complex-answer) for where those points come from. The sections are numbered in the order of the answer, from todo-1, and each one states the point, what depends on it, and the options when there are some. A **user-x** point that is only something to be aware of, with nothing to settle, stays in the explanation and takes no section of its own.

### When the user asks to process a TODO list

Which todo-<name>.md file is meant is inferred from the request and from what the root folder holds. When more than one fits, ask the user before reading anything.

Processing runs one point at a time:

1. Write the context the file holds into the conversation, so the user has the whole picture before deciding anything.
2. Ask the first todo-x section that is not struck through, and that one alone. Never present the remaining sections at the same time.
3. Once the point is settled — the user has decided, and what the decision calls for is done — strike through the text of that section in the file, its heading included.
4. Move to the first section that is still not struck through, and repeat from point 2.

Striking a section as it is settled is what makes a TODO list resumable: a session can stop between any two points, and the next one starts at the first section that is not struck through. The file is deleted once every section is struck.

### Specs

- **Local specs** are the specs located in the root `specs/` folder of this project.
- **Shared specs** are specs located inside a `shared/` folder. When multiple shared utilities have been added, the name of the shared utility is used for disambiguation (e.g. "the DocApi specs").

When the user asks to do anything with the specs, default to the local specs unless they explicitly reference a shared utility by name or are currently working on a file inside a shared folder. If there is any doubt, ask the user which specs to update.

### Language

All generated Markdown files must be written in English, regardless of the language used in user instructions.

The only exception is **localized content files** (e.g. user-facing copy translated for a specific locale). If a user asks to create a Markdown file in a non-English language:
1. Ask whether it is a localized content file.
2. If yes — proceed.
3. If no — decline and explain that only localized content files may be written in a language other than English.

### Security

- **Never read `.env` files.** No exceptions, regardless of what is asked.
- **Never hardcode credentials.** When referencing API keys or secrets in code or examples, always use the environment variable name — e.g. `process.env.PROABONO_AGENT_KEY` — never the value.

## Shared utilities

Read the following files for context before answering questions about this project:

- shared/ProAbonoLive/CLAUDE.md
