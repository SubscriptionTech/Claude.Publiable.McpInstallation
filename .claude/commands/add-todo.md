# Method: Write a TODO List

Follow these steps when the user asks for a TODO list. Writing the file is the whole task: none of the points it holds are performed here.

## Trigger

- User explicitly runs `/add-todo`
- User asks for a TODO list, a TODO file, or asks that the open points of the answer just given be recorded as a TODO

## Steps

### 0. Check there is something to convert

The file is built from the answer Claude has just given. When there is no preceding answer — the command is the first message of a session — or when that answer holds no **user-x** point calling for a decision, say so and write no file. An empty TODO file is deleted on its first `/process-todo` run without anything being settled.

### 1. Name the file

A TODO list is a file, written at the root of the project and named `todo-<name>.md`, where `<name>` is inferred from what the answer is about — kebab-case, 30 characters at most. When the command is invoked with an argument, that argument is the `<name>` (normalized to kebab-case, truncated to 30 characters).

An existing file is never overwritten: `<name>` is inferred from the subject, so two sessions on the same subject converge on the same name and the open sections of the first one would be lost. When `todo-<name>.md` already exists, write `todo-<name>-2.md` instead — `-3`, and so on, up to the first name that is free — and report the collision to the user, naming the file that was already there.

### 2. Write the explanation, self-contained

The file carries the whole explanation of the answer Claude has just given, rewritten to be **self-contained**. A later session reads the file alone, without the conversation that produced it, so every term, entity, spec section, source and finding the answer relied on is named in the file itself. A reference to "the previous point", "the rule discussed above" or "what you asked" is a defect: the file is context-less by construction.

### 3. Turn the decisions into `todo-x` sections

Each **user-x** point of that answer that calls for a decision from the user, or that states a major change, becomes a section of the file titled `todo-x` — see [When Claude makes a complex answer](../../CLAUDE.md#when-claude-makes-a-complex-answer) for where those points come from. The sections are numbered in the order of the answer, from `todo-1`, and each one states the point, what depends on it, and the options when there are some. A **user-x** point that is only something to be aware of, with nothing to settle, stays in the explanation and takes no section of its own.

### 4. Stop there

Claude writes the file and performs none of the points it holds. The file is processed later, one point at a time, by the `/process-todo` command — see [.claude/commands/process-todo.md](process-todo.md).
