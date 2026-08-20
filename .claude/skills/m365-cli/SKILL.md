---
name: m365-cli
description: "Use ALWAYS before running any `m365` command (CLI for Microsoft 365 — SharePoint, Entra, Teams, OneDrive, Planner, Viva). Look the command up with `./lookup` instead of guessing option names, confirm destructive commands with the user, and read the error table before concluding a command is wrong."
version: 6.0.0
compatibility: "@pnp/cli-microsoft365 11.10.0 (pinned), bun, zsh/bash"
user-invocable: true
---

# m365 CLI

## Start here

```bash
npm run doctor            # when something breaks: binary, .env, login, SPO reachability
```

**Run the pinned binary by its path, never a bare `m365`:**

```bash
./node_modules/.bin/m365 spo web get --url ...
```

A globally installed `m365` is usually a different version than the pinned one this repo is
verified against, so its options and its `--help` can differ. A `PreToolUse` hook
(`.claude/hooks/prefer-lookup.sh`) blocks bare `m365` and says this — it is not a
suggestion you can skip.

Values from `.env` (account, tenant, SharePoint root) need `source` on the **same command
line**, because every shell call starts fresh:

```bash
source scripts/env.sh && ./node_modules/.bin/m365 spo list list --webUrl "$M365_SPO_ROOT"
```

`.env.example` names the command that discovers each value.

## Rule: Before running m365 command, look it up, never guess

```bash
./lookup spo page add
```


That is the whole interface:

| | |
|---|---|
| `./lookup <command>` | how to call it — required vs optional, types, enums, flags |
| `./lookup <group>` | what commands live under a path |
| `./lookup -f <text>` | search names, aliases and descriptions |
| `./lookup <command> --examples` | real invocations; also `--remarks`, `--permissions`, `--response` |

It is instant and offline, and it already corrects the places where the CLI's own `--help`
is wrong — so **build commands from it, never re-check them against `--help`**.

If a command is not there, it does not exist — check the spelling with `-f`.

## Rule: confirm writes

Irreversible commands are everywhere (`spo site remove`, `spo list remove`,
`entra user remove`, `* set`, `* remove`, `* add`). Before running anything but a read:

1. Verify the target with a read command (`spo web get`, `spo list get`, `entra user get`) —
   that it exists and is genuinely the one you mean.
2. Show the user the exact command and what it will do. **Never run a destructive command
   without confirmation.**

**The m365 `-f, --force` trap:** many destructive commands accept it and it suppresses the
confirmation prompt. Without it the CLI prompts interactively — and since an agent has no
TTY, that fails.

## Errors: what they actually mean

Errors arrive **on stdout as JSON**, so they look like data. Always check whether the
response is `{"error": …}`.

| Output | Cause | What to do |
|---|---|---|
| `Invalid option: 'x'` / `Unrecognized key: "x"` | that option does not exist | `./lookup <command>` |
| `{"error":{}}` | **a hidden HTTP status**, typically 401 | `--debug 2>&1 \| rg -i '"status"\|www-authenticate'` → usually a SharePoint hostname belonging to a different tenant |
| `Attempted to perform an unauthorized operation.` | a missing role (SharePoint admin) | permissions, **not** syntax — do not rewrite the command |
| `{"error":{"name":"ExitPromptError"}}` | destructive command waiting for confirmation, no TTY | it did not run — **ask the user**, do not add `--force` |
| `Required option not specified` | a required option is missing | `./lookup <command>` lists them under REQUIRED |
| `[]` or empty with rc=0 | genuinely empty, wrong list/site, or not signed in — these look identical | `npm run doctor` first; then confirm the target exists (`spo list get`, `spo web get`) before reporting "nothing there" |

**Graph scopes ≠ SharePoint scopes.** The app may hold `AllSites.FullControl` on the
SharePoint resource and still fail on Graph for want of `Files.Read.All` / `Sites.Read.All`.
What this account actually holds: `m365 cli doctor` (`roles` and `scopes` per resource).
Check it before building a plan on permissions.

## What this skill does NOT cover

Domain knowledge about your own SharePoint (canvas format, SPFx, site structure, deployment
recipes) belongs in a skill layered on top of this one. Read-only search across M365 content
→ an M365 MCP server. Checking pages in a browser → Playwright.
