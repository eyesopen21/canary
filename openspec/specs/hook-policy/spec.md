# hook-policy Specification

## Purpose

Defines the deterministic rules the Canary core uses to classify a shell command as allow, warn, or block, and the exact text and privacy limits of every message sent to an agent or user.

## Requirements

### Requirement: Command classification order
The core SHALL split a command into segments on `;`, `&&`, `||`, `|`, `&`, and newlines, extract the bodies of nested shell invocations as further segments, classify each segment against the block and warn rules, and return the most severe decision across segments in the order block, then warn, then allow. A command matching no rule SHALL be allowed with no output.

#### Scenario: Safe command is allowed silently
- **WHEN** the hook receives `npm test`
- **THEN** the decision is allow and no message is produced

#### Scenario: One blocking segment wins over a warning
- **WHEN** a command contains a segment matching W2 and another segment matching B3
- **THEN** the decision is block and the message is the one for the first blocking segment

#### Scenario: Nested shell body is evaluated
- **WHEN** a command contains `bash -c 'rm -rf "$BUILD_DIR"'`
- **THEN** the nested body is classified as segment and the decision is block under B1a

### Requirement: Unparseable destructive input
The core SHALL block with B0 when splitting fails because of unbalanced quotes, nested substitutions it cannot extract, or here-documents it cannot read, and the raw text contains a trigger word of B1 to B4 (`rm`, `rimraf`, `Remove-Item`, `rmdir`, `rd`, `DROP`, `TRUNCATE`, `migrate`, `push`, `-auto-approve`). Unparseable text without such a trigger SHALL be allowed.

#### Scenario: Unparseable command with a trigger word
- **WHEN** a command with unbalanced quotes contains `rm`
- **THEN** the decision is block under B0

#### Scenario: Unparseable command without a trigger word
- **WHEN** a command with unbalanced quotes contains no B1 to B4 trigger word
- **THEN** the decision is allow

### Requirement: Project root and local host determination
The core SHALL take the project root from the first available of `CLAUDE_PROJECT_DIR`, `CURSOR_PROJECT_DIR`, `GEMINI_PROJECT_DIR`, the OpenCode context directory, or the hook input `cwd`. A database host SHALL count as local when it is `localhost`, in `127.0.0.0/8`, `::1`, a Unix socket path, a `.localhost` name, or a service declared in a Docker Compose file in the project root; every other host is non-local.

#### Scenario: No project root available
- **WHEN** a recursive delete is evaluated and no project root source is present
- **THEN** the decision is block under B1e

#### Scenario: Compose service name is local
- **WHEN** a database host matches a service declared in a Docker Compose file in the project root
- **THEN** the host is local and a destructive database command is allowed

### Requirement: Recursive delete target safety
The core SHALL block a recursive delete when any target contains a variable or command substitution, is a glob expanding to nothing or outside the project root, resolves directly or through a link outside the project root, is the project root, home, or filesystem root, or cannot be checked. A recursive delete of a literal path resolving inside the project root SHALL be allowed with no output.

#### Scenario: Empty variable target
- **WHEN** `rm -rf "$BUILD_DIR"` is evaluated with `BUILD_DIR` empty
- **THEN** the decision is block under B1a

#### Scenario: Symlink escaping the project
- **WHEN** `rm -rf node_modules/.cache/link` is evaluated and `link` resolves to the home directory
- **THEN** the decision is block under B1c

#### Scenario: Literal path inside the project
- **WHEN** `rm -rf dist` is evaluated from the project root
- **THEN** the decision is allow with no output

### Requirement: Destructive database host guard
The core SHALL block a destructive SQL, MongoDB shell, or schema migration command when the target host is non-local or when a host variable is set but cannot be parsed. It SHALL allow the command when the host is local or when no host is set. Host values SHALL be parsed in memory and discarded.

#### Scenario: Cloud database URL
- **WHEN** `npx prisma migrate reset` is evaluated with `DATABASE_URL` pointing to a non-local host
- **THEN** the decision is block under B2 and the host value is not included in the message

#### Scenario: Local database URL
- **WHEN** `npx prisma migrate reset` is evaluated with `DATABASE_URL` pointing to `localhost`
- **THEN** the decision is allow

#### Scenario: No host configured
- **WHEN** `psql -c "DROP TABLE users"` is evaluated with no host set
- **THEN** the decision is allow because the client defaults to a local connection

### Requirement: Git rewrite rules
The core SHALL block `git push` with `--force`, `-f` in combined short flags, `--mirror`, or a refspec starting with `+`, and SHALL warn instead for `--force-with-lease` alone. It SHALL warn for `git reset --hard` and for `git clean` combining `-f` with `-d`, `-x`, or `-X`.

#### Scenario: Force push
- **WHEN** `git push --force origin main` is evaluated
- **THEN** the decision is block under B3

#### Scenario: Force with lease
- **WHEN** `git push --force-with-lease` is evaluated with no B3 flag
- **THEN** the decision is warn under W1

#### Scenario: Hard reset
- **WHEN** `git reset --hard` is evaluated
- **THEN** the decision is warn under W2

### Requirement: Infrastructure change guard
The core SHALL block `terraform apply`, `terraform destroy`, `tofu apply`, or `tofu destroy` when `-auto-approve` or `--auto-approve` is present. The same commands without that flag SHALL be allowed.

#### Scenario: Unreviewed apply
- **WHEN** `terraform apply -auto-approve` is evaluated
- **THEN** the decision is block under B4

#### Scenario: Plan only
- **WHEN** `terraform plan` is evaluated
- **THEN** the decision is allow

### Requirement: Exact message text and placeholders
Every warn and block message SHALL use the template defined for its rule in `docs/specs/policy.md`, with placeholders replaced using only the sanitization rules defined there. Messages SHALL NOT contain a secret value, a database URL, a host name taken from a credential, an environment variable value, or the full command. Adapters SHALL NOT add, remove, or reword text, except truncation at an agent's length limit with an appended `…`.

#### Scenario: Remote name is sanitized
- **WHEN** a force push targets a remote whose name contains a URL
- **THEN** `{remote}` is rendered as `the remote` and the URL is not present in the message

#### Scenario: Target is truncated
- **WHEN** a block message placeholder `{target}` exceeds 80 characters
- **THEN** the rendered target is truncated to 80 characters and control characters are removed

### Requirement: Local hook log
The Cursor adapter SHALL append one JSON line for a warning to `canary/hook.log` in the project root, recording the rule ID when available and the decision only. Other adapters SHALL NOT write hook log entries. The log SHALL NOT contain the command text, placeholders, environment values, or user identity fields.

#### Scenario: Cursor warning log
- **WHEN** the core returns a warning decision for a Cursor command
- **THEN** the local log line contains the decision and, when available, its rule ID, without command or identity data

#### Scenario: No writing outside the project
- **WHEN** the hook records a warning
- **THEN** no file outside the project root's `canary/` directory is written
