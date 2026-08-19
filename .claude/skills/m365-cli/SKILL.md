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
source scripts/env.sh     # loads .env, sets $M
npm run doctor            # when something breaks: binary, .env, login, SPO reachability
```

The environment (account, tenant, SharePoint root) lives in `.env`; `.env.example` names
the command that discovers each value. `$M` is the local `m365`.

## Rule: look it up, never guess

```bash
./lookup spo page add
```

```
m365 spo page add

  Creates modern page

REQUIRED
  -n, --name <string>
  -u, --webUrl <string>

OPTIONAL
  -t, --title <string>
  -l, --layoutType <Article|Home|SingleWebPartAppPage|RepostPage|...>
      --publish   (flag, takes no value)

GLOBAL
      --output <csv|json|md|text|none>
      --query <JMESPath>

More: --examples --remarks --response
```

That is the whole interface:

| | |
|---|---|
| `./lookup <command>` | how to call it — required vs optional, types, enums, flags |
| `./lookup <group>` | what commands live under a path |
| `./lookup -f <text>` | search names, aliases and descriptions |
| `./lookup <command> --examples` | real invocations; also `--remarks`, `--permissions`, `--response` |

It is instant and offline. **Take its output as given** — it already accounts for the
places where the CLI's own `--help` is wrong, so you do not need to cross-check with
`m365 <cmd> --help` (which also costs ~2.4 s per call, against ~67 ms here).

If a command is not there, it does not exist — check the spelling with `-f`.

## Rule: confirm writes

Irreversible commands are everywhere (`spo site remove`, `spo list remove`,
`entra user remove`, `* set`, `* remove`, `* add`). Before running anything but a read:

1. Verify the target with a read command (`spo web get`, `spo list get`, `entra user get`) —
   that it exists and is genuinely the one you mean.
2. Show the user the exact command and what it will do. **Never run a destructive command
   without confirmation.**

**The `-f, --force` trap:** many destructive commands accept it and it suppresses the
confirmation prompt. Without it the CLI prompts interactively — and since an agent has no
TTY, that fails:

```
? Are you sure you want to remove the list …? (Y/n)
{"error":{"name":"ExitPromptError"}}          rc=1
```

That is **fail-safe: the operation did NOT run.** Do not "fix" it by adding `--force` —
that silently performs it. `ExitPromptError` means *ask the user*, not *bypass the prompt*.

Read commands (`get`, `list`) can be run freely.

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
| empty result | may simply mean not signed in | `npm run doctor` before concluding "there is nothing there" |

**Graph scopes ≠ SharePoint scopes.** The app may hold `AllSites.FullControl` on the
SharePoint resource and still fail on Graph for want of `Files.Read.All` / `Sites.Read.All`.
What this account actually holds: `m365 cli doctor` (`roles` and `scopes` per resource).
Check it before building a plan on permissions; consent changes.

## What this skill does NOT cover

Domain knowledge about your own SharePoint (canvas format, SPFx, site structure, deployment
recipes) belongs in a skill layered on top of this one. Read-only search across M365 content
→ an M365 MCP server. Checking pages in a browser → Playwright.
