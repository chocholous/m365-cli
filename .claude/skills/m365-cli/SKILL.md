---
name: m365-cli
description: "Use ALWAYS before running any `m365` command (CLI for Microsoft 365 — SharePoint, Entra, Teams, OneDrive, Planner, Viva). Forces every command and option to be verified against the offline commands.json tree instead of guessed, guards destructive commands, and carries an error-to-cause map for failures the CLI reports ambiguously."
version: 5.0.0
compatibility: "@pnp/cli-microsoft365 v11.10.0, node v26.4.0, zsh/bash"
user-invocable: true
---

# m365 CLI

## Start here

```bash
source scripts/env.sh     # loads .env, sets $M, fails loudly if anything is missing
npm run doctor            # when something breaks: binary, .env, login, SPO reachability
```

`env.sh` works in zsh and bash, from any directory inside the project. The environment
(account, tenant, SPO root) lives in **`.env`**, not in this text; `.env.example` documents
the command that discovers each value. A global `m365` may be a different version than the
local one — `$M` always points at the local binary.

**Run `npm run doctor` before concluding anything from an error.** Most "it doesn't work"
turns out to be permissions, a wrong SharePoint hostname, or not being signed in — not syntax.

## Rule: never guess options

`m365` has **897 commands**. An unknown option is rejected outright, but a misunderstood
one goes through silently. So: two steps, neither skipped.

```bash
npm run lookup -- spo page add      # exists? exact option names? enums?
$M spo page add --help full         # required (<>) vs optional ([]), meaning, examples
```

Lookup reads `commands.json` in `node_modules/@pnp/cli-microsoft365/`. The tree itself
**carries no version**, so lookup keeps a `commands.version` stamp beside it and compares
against the installed package version on every run, regenerating on mismatch. An upgrade or
`npm ci` replaces the whole package directory, so both files vanish and are rebuilt.

Lookup modes (tree / options / full-text) are printed by `npm run lookup -- --help`.

**What `commands.json` does NOT carry:** required vs optional, descriptions, examples,
permissions. That is what `--help` is for (sections `options` (default), `examples`,
`remarks`, `permissions`, `response`, `full`). When `--help` disagrees with your
expectation — or with the documentation — **`--help` wins**.

## Rule: confirm writes

Among those 897 commands are irreversible ones (`spo site remove`, `spo list remove`,
`entra user remove`, `* set`, `* remove`, `* add`). Before running anything but a read:

1. Verify the target with a read command (`spo web get`, `spo list get`, `entra user get`) —
   that it exists and is genuinely the one you mean.
2. Show the user the exact command and what it will do. **Never run a destructive command
   without confirmation.**

**The `-f, --force` trap (verified on `spo list remove`):** many destructive commands accept
it, and it suppresses the confirmation prompt. Without it the CLI prompts interactively — and
since an agent has no TTY, that fails:

```
? Are you sure you want to remove the list …? (Y/n)
{"error":{"name":"ExitPromptError"}}          rc=1
```

This is **fail-safe: the operation did NOT run.** Do not "fix" it by adding `--force` — that
silently performs it. `ExitPromptError` means *ask the user*, not *bypass the prompt*.
(The `prompt: false` setting does not affect this; it only governs disambiguation when
several results match.)

Read commands (`get`, `list`) can be run freely.

## Errors: what they actually mean

Errors arrive **on stdout as JSON** (`errorOutput=stdout`), so they look like data. Always
check whether the response is `{"error": …}`.

| Output | Cause | What to do |
|---|---|---|
| `Invalid option: 'x'` | wrong option name | `npm run lookup -- <cmd>` |
| `{"error":{}}` | **a hidden HTTP status**, typically 401 | `--debug 2>&1 \| rg -i '"status"\|www-authenticate'` → usually a SharePoint hostname belonging to a different tenant |
| `Attempted to perform an unauthorized operation.` | a missing role (SharePoint admin) | permissions, **not** syntax — do not rewrite the command |
| `{"error":{"name":"ExitPromptError"}}` | destructive command is waiting for confirmation, no TTY | it did not run — **ask the user**, do not add `--force` |
| empty result | may simply mean not signed in | `npm run doctor` before concluding "there is nothing there" |

**Graph scopes ≠ SPO scopes.** The app may hold `AllSites.FullControl` on resource
`00000003-0000-0ff1-ce00-000000000000` (SharePoint) and still fail on Graph (`m365 search`)
for want of `Files.Read.All` / `Sites.Read.All`.

What **this** account actually holds is answered by `m365 cli doctor` — it returns `roles`
and `scopes` per resource. Check it before building a plan on permissions; consent changes.

## What this skill does NOT cover

Domain knowledge about your own SharePoint (canvas format, SPFx, site structure, deployment
recipes) belongs in a skill layered on top of this one. Read-only search across M365 content
→ an M365 MCP server. Checking pages in a browser → Playwright.
