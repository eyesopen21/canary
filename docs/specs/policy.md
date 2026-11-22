# Hook policy

| | |
| --- | --- |
| Status | Draft for the MVP (P0). Not implemented. |
| Requirements | CAN-F-04, CAN-F-05, CAN-F-06 in the [SRS](../SRS.md) |
| Date | 2026-11-22 |

This document defines what the Canary hook allows, warns about, and blocks, and the exact text of every message. The core implements these rules once; each agent adapter only translates the result ([agent-adapters.md](agent-adapters.md)). The key words MUST, SHOULD, and MAY follow RFC 8174 [S17].

## Principles

1. **Stop only the irreversible.** Commands that match no rule run with no output and no prompt.
2. **Fail closed on destructive input Canary cannot analyze.** If a command contains a destructive pattern and Canary cannot resolve it, the command is blocked.
3. **Name the danger and the consequence.** Every message says what is dangerous, what happens if it runs, and what to do instead.
4. **Never echo secrets.** Messages contain only the placeholders defined in [Placeholders](#placeholders). They never contain a URL, a host name, an environment variable value, or the full command.

## Scope

The P0 hook evaluates shell commands only:

| Agent | Tools evaluated |
| --- | --- |
| Claude Code | `Bash`, `PowerShell` [S1] |
| Codex | `Bash`, which covers shell commands and unified exec [S8] |
| Cursor | `Shell` [S9] |
| Gemini CLI | `run_shell_command` [S11][S25] |
| OpenCode | the `shell` permission action [S14][S16] |

File-editing tools, MCP tools, and web tools are not evaluated in P0.

## Evaluation

The core MUST evaluate a command in this order:

1. **Split.** Split the command into segments on `;`, `&&`, `||`, `|`, `&`, and newlines, and extract the bodies of `$(...)`, backticks, `bash -c '...'`, `sh -c '...'`, `pwsh -Command ...`, and `powershell -Command ...` as further segments.
2. **Classify each segment** against the rules below.
3. **Combine.** The result is the most severe decision across segments: block, then warn, then allow. When several rules block, the message of the first blocking segment is used.
4. **Unparseable input.** If splitting fails (unbalanced quotes, nested substitutions it cannot extract, here-documents it cannot read) and the raw text contains a trigger word of B1 to B4 (`rm`, `rimraf`, `Remove-Item`, `rmdir`, `rd`, `DROP`, `TRUNCATE`, `migrate`, `push`, `-auto-approve`), the result is **B0**. Otherwise the command is allowed.

### Project root

The project root is the first of these that the agent provides: `CLAUDE_PROJECT_DIR` [S1], `CURSOR_PROJECT_DIR` [S9], `GEMINI_PROJECT_DIR` [S10], OpenCode `ctx.location.directory` [S14], the hook input `cwd` [S1][S8][S9][S11]. If none is available, every B1 check fails closed.

### Local host

A database host is **local** when it is `localhost`, an address in `127.0.0.0/8`, `::1`, a Unix socket path, a name ending in `.localhost`, or the name of a service declared in a Docker Compose file in the project root (assumption A9 in [open-questions.md](../open-questions.md#assumptions)). Every other host is **non-local**.

## Rules

| ID | Decision | Rule |
| --- | --- | --- |
| B0 | Block | Destructive trigger word in a command Canary cannot parse |
| B1 | Block | Recursive delete with an unresolved target |
| B2 | Block | Destructive database command against a non-local host |
| B3 | Block | Force push |
| B4 | Block | Infrastructure change without review |
| W1 | Warn | Push with `--force-with-lease` |
| W2 | Warn | `git reset --hard` |
| W3 | Warn | `git clean` that deletes untracked or ignored files |

### B1. Recursive delete with an unresolved target

**Matches** a segment that runs any of:

- `rm` with `-r`, `-R`, or `--recursive` (alone or combined, such as `-rf`)
- `rimraf`
- `Remove-Item` or its aliases `rm`, `ri`, `del` in PowerShell, with `-Recurse`
- `rmdir /s` or `rd /s` in `cmd.exe`
- `find ... -delete`

**Blocks** when any target:

| Case | Condition |
| --- | --- |
| B1a | contains a variable (`$VAR`, `${VAR}`, `$env:VAR`, `%VAR%`) or a command substitution |
| B1b | is a glob whose expansion, relative to the segment's working directory, is empty or contains a path outside the project root |
| B1c | is, or resolves through `realpath` (including symlinks and Windows junctions) to, a path outside the project root |
| B1d | is the project root itself, the user's home directory, or a filesystem root, or is a glob whose expansion covers every top-level entry of one of those directories (such as `./*` run from the project root) |
| B1e | cannot be checked, for example because the project root is unknown |

A recursive delete whose every target is a literal path that resolves inside the project root and is not the root itself is allowed with no output.

Paths that arrive with backslash separators on Windows MUST be normalized before comparison [S1].

### B2. Destructive database command against a non-local host

**Matches** a segment that runs one of these:

| Kind | Commands |
| --- | --- |
| SQL clients | `psql`, `mysql`, `mariadb` with `-c`, `-e`, `--command`, `--execute`, or `-f` / `--file` (the file is read), when the SQL contains `DROP DATABASE`, `DROP SCHEMA`, `DROP TABLE`, `TRUNCATE`, or `DELETE FROM` with no `WHERE` |
| MongoDB shell | `mongosh` with `--eval` containing `dropDatabase(` or `.drop(` |
| Schema migrations | `prisma migrate deploy`, `prisma migrate reset`, `prisma migrate dev`, `prisma db push`; `rails` or `rake` `db:drop`, `db:reset`, `db:migrate`, `db:rollback`, `db:schema:load`; `python manage.py migrate` or `flush`; `knex migrate:latest`, `migrate:rollback`, `migrate:up`, `migrate:down`; `sequelize db:drop`, `db:migrate`, `db:migrate:undo`; `typeorm schema:drop`, `migration:run`, `migration:revert`; `drizzle-kit push`, `drizzle-kit migrate`; `alembic upgrade`, `alembic downgrade`; `flyway migrate`, `flyway clean`; `liquibase update`, `liquibase rollback`, `liquibase dropAll` |

**Target host.** The core determines the host from, in order: a `-h` / `--host` argument; a variable assigned inline in the segment; the hook process environment; `.env` and `.env.local` in the project root. Variables read: `DATABASE_URL`, `POSTGRES_URL`, `PGHOST`, `MYSQL_HOST`, `MONGODB_URI`, `MONGO_URL`. Values are parsed in memory to extract the host and then discarded.

**Blocks** when the host is non-local, or when a variable is set but its host cannot be parsed. **Allows** when the host is local, or when no host is set at all, because the clients then default to a local connection.

### B3. Force push

**Matches** `git push` with `--force`, `-f` (alone or in combined short flags), `--mirror`, or a refspec that starts with `+`.

`--force-with-lease` is not B3; it is W1.

### B4. Infrastructure change without review

**Matches** `terraform apply`, `terraform destroy`, `tofu apply`, or `tofu destroy` with `-auto-approve` or `--auto-approve`.

### W1, W2, W3. Warnings

| ID | Matches |
| --- | --- |
| W1 | `git push` with `--force-with-lease` and no B3 flag |
| W2 | `git reset --hard` |
| W3 | `git clean` with `-f` combined with `-d`, `-x`, or `-X` |

## Message text

Every message MUST use the template below for its rule, with placeholders replaced as defined in [Placeholders](#placeholders). The adapters MUST NOT add, remove, or reword text, except where an agent field has a length limit, in which case the adapter truncates at the end and appends `…`.

### Blocks

| ID | Message |
| --- | --- |
| B0 | `Canary blocked this command. Danger: it contains "{token}", which Canary treats as destructive, but Canary could not parse the command. Consequence: Canary cannot tell what it would delete or change. Instead: split it into simple commands without nested substitutions.` |
| B1a | `Canary blocked a recursive delete. Danger: the target {target} contains a variable or command substitution that Canary cannot resolve before it runs. Consequence: if it expands to an empty or wrong path, the command deletes files outside the intended folder, and they cannot be restored from this machine. Instead: use a literal path inside the project.` |
| B1b | `Canary blocked a recursive delete. Danger: the pattern {target} matches nothing or matches paths outside the project root. Consequence: the command could delete files that are not part of this project, and they cannot be restored from this machine. Instead: use a literal path inside the project.` |
| B1c | `Canary blocked a recursive delete. Danger: {target} resolves to a path outside the project root, directly or through a link. Consequence: the command deletes files that are not part of this project, and they cannot be restored from this machine. Instead: delete only paths inside the project.` |
| B1d | `Canary blocked a recursive delete. Danger: {target} is the project root, your home directory, or a filesystem root. Consequence: the command deletes everything under it, and it cannot be restored from this machine. Instead: delete the specific subfolder you mean.` |
| B1e | `Canary blocked a recursive delete. Danger: Canary could not determine the project root, so it cannot check where {target} points. Consequence: the command could delete files outside the project, and they cannot be restored from this machine. Instead: run the agent from the project folder, or ask a human to run this command.` |
| B2 | `Canary blocked a destructive database command. Danger: {var} points to a non-local host, which may be production. Consequence: this command {effect}, and the data cannot be recovered from this machine. Instead: point {var} to a local database, or ask a human to run this command.` |
| B3 | `Canary blocked a force push. Danger: this push rewrites history on {remote}. Consequence: commits that exist only on {remote} are lost for everyone who uses it. Instead: push without forcing, or ask a human to approve a force push.` |
| B4 | `Canary blocked an infrastructure change without review. Danger: {tool} {subcommand} with -auto-approve applies changes without showing the plan for approval. Consequence: it can destroy or replace live infrastructure, and deleted resources may not be recoverable. Instead: run {tool} plan and let a human review and apply it.` |

### Warnings

| ID | Message |
| --- | --- |
| W1 | `Canary warning. Danger: --force-with-lease still overwrites commits on {remote} that your local copy has fetched but not merged. Consequence: those commits are lost for everyone who uses {remote}. Use it only on a branch nobody else pushes to.` |
| W2 | `Canary warning. Danger: git reset --hard discards every uncommitted change in this working tree. Consequence: those changes cannot be recovered with Git.` |
| W3 | `Canary warning. Danger: git clean {flags} deletes untracked files in this working tree. Consequence: they are not in Git and cannot be recovered with Git.` |

### Placeholders

| Placeholder | Value | Sanitization |
| --- | --- | --- |
| `{target}` | The delete target exactly as written in the command, in backticks | Control characters removed; truncated to 80 characters |
| `{token}` | The trigger word found | One of the fixed trigger words in [Evaluation](#evaluation) |
| `{var}` | The variable name, in backticks, such as `` `DATABASE_URL` ``, or the text `the --host argument` | Must match `[A-Za-z_][A-Za-z0-9_]*`; otherwise `the database connection setting` |
| `{effect}` | One of: `DROPS tables`, `DROPS the database or schema`, `TRUNCATES tables (deletes every row)`, `DELETES every row of a table`, `DROPS a MongoDB database or collection`, `applies or reverts schema migrations, which can drop tables or columns`, `RESETS the database schema` | Fixed list |
| `{remote}` | The remote name, in backticks, such as `` `origin` `` | Must match `[A-Za-z0-9._-]+`. A URL or anything else becomes `the remote`, because remote URLs can contain tokens |
| `{tool}` | `terraform` or `tofu` | Fixed list |
| `{subcommand}` | `apply` or `destroy` | Fixed list |
| `{flags}` | The `git clean` flags as written | Must match `-[A-Za-z]+( -[A-Za-z]+)*` |

## What reaches the user and the agent

| Agent | Block | Warn |
| --- | --- | --- |
| Claude Code | `permissionDecisionReason` is shown to Claude; `systemMessage` shows the same text to the user [S1] | `additionalContext` to Claude and `systemMessage` to the user [S1] |
| Codex | `permissionDecisionReason` and `systemMessage` [S8] | `additionalContext` and `systemMessage` [S8] |
| Cursor | `agent_message` to the agent and `user_message` to the user [S9] | Allowed; recorded in the local log only (Q8) |
| Gemini CLI | `reason` is sent to the agent as a tool error; `systemMessage` is shown to the user [S11] | `systemMessage` [S11] |
| OpenCode | `event.message` becomes the denial reason [S14] | `event.effect = "ask"` with `event.message` in the prompt [S14] |

## Local log

The hook MAY append one line per warn or block to `canary/hook.log` in the project root, with: time, agent name, rule ID, and decision. It MUST NOT write the command text, placeholders other than `{token}`, environment values, or user identity fields.

## Examples

| Command | Decision | Rule |
| --- | --- | --- |
| `npm test` | Allow | — |
| `rm -rf dist` (inside the project) | Allow | — |
| `rm -rf "$BUILD_DIR"` | Block | B1a |
| `rm -rf ./*` run from the project root | Block | B1d (the expansion covers the whole root) |
| `rm -rf ../shared` | Block | B1c |
| `rm -rf node_modules/.cache/link` where `link` points to `~/data` | Block | B1c |
| `npx prisma migrate reset` with `DATABASE_URL` on a cloud host | Block | B2 |
| `npx prisma migrate reset` with `DATABASE_URL` on `localhost` | Allow | — |
| `psql -c "DROP TABLE users"` with no host set | Allow | — (local default) |
| `git push --force origin main` | Block | B3 |
| `git push --force-with-lease` | Warn | W1 |
| `terraform apply -auto-approve` | Block | B4 |
| `terraform plan` | Allow | — |
| `npm run clean && rm -rf $(cat dirs.txt)` | Block | B1a |
| `bash ./scripts/reset-db.sh` | Allow | — (not recognized; see gaps) |

## Known gaps

These are accepted for P0 and listed in the [threat model](../THREAT-MODEL.md):

- Commands that reach the same effect indirectly (a script file, `make`, `npm run`, an interpreter one-liner such as `python -c` with `shutil.rmtree`) are not recognized.
- Database tools not listed in B2 are not recognized, including hosted-database CLIs and `pulumi`.
- Non-shell tools (file writes, MCP tools) are not evaluated.
- Per-repository exceptions and warn-only mode are P1 (CAN-F-15).
