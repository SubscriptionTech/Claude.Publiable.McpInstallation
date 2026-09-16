# Method: Process a TODO List

Follow these steps when the user asks to process a TODO list — a `todo-<name>.md` file at the root of the project, written by the `/add-todo` command (see [.claude/commands/add-todo.md](add-todo.md)).

## Trigger

- User explicitly runs `/process-todo`
- User asks to process, resume or go through a TODO list

## Steps

### 1. Pick the file

Which `todo-<name>.md` file is meant is inferred from the request and from what the root folder holds. When the command is invoked with an argument, that argument names the file. When more than one fits, ask the user before reading anything.

### 2. Run the points, one at a time

1. Take the first `todo-x` section that is not struck through. Never write the context the file holds as it stands: read it, keep only what bears on that one section — the entities, rules, files and findings this point depends on — and summarize it. Write that summary into the conversation under a title reading **The context**, and carry over nothing the point does not need.
2. Write the title of that section — its `todo-x` number and its wording, as the file carries them — then the point itself, so the user sees it as a section of its own, separate from the context above it. Ask that section alone, and never present the remaining ones at the same time.
3. When the point comes with a list of proposals to settle it — those the file states, or those Claude adds — do not leave them in prose: prompt the user with a selection list, one entry per proposal. When Claude has a recommendation, that proposal is the first entry and is marked as the recommended one, with the reason for it given in the entry; when Claude has none, the list carries no recommendation rather than an invented one.
4. Once the point is settled — the user has decided, and what the decision calls for is done — strike through the text of that section in the file, its heading included.
5. Move to the first section that is still not struck through, and repeat from point 1.

### 3. Delete the file

Striking a section as it is settled is what makes a TODO list resumable: a session can stop between any two points, and the next one starts at the first section that is not struck through. The file is deleted once every section is struck.
