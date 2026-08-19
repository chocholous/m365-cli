# m365-cli skill

A [Claude Code](https://claude.com/claude-code) skill plus a small toolchain that stops AI
agents from guessing their way through [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/).

## The problem

`m365` has **897 commands**. An agent that writes `--pageTitle` instead of `--title` gets a
hard rejection — annoying but harmless. The dangerous failures are the quiet ones:

- `{"error":{}}` — an empty object that hides an HTTP **401**. Usually you are hitting a
  SharePoint hostname belonging to a different tenant than the one you signed in to.
- `Attempted to perform an unauthorized operation.` — a missing **role**, not bad syntax.
  Agents burn turns rewriting a command that was correct all along.
- `{"error":{"name":"ExitPromptError"}}` — a destructive command asked for confirmation and
  found no TTY. The operation did *not* run. Adding `--force` to "fix" it silently runs it.

## The approach

**Look the command up offline, then read `--help`.** Never one without the other.

`m365 cli completion sh update` writes a complete machine-readable command tree to
`commands.json` (~250 kB) inside the installed package. That answers *does this command
exist*, *what is the option called*, and *what are the allowed enum values* — instantly and
offline, for all 897 commands. It does **not** carry required-vs-optional, descriptions,
examples or permissions, so `--help` stays mandatory as step two.

```bash
npm run lookup -- spo page add      # exact option names + enums
m365 spo page add --help full       # required (<>) vs optional ([]), meaning, examples
```

```
m365 spo page add

OPTIONS (exact names; requiredness and meaning are NOT in commands.json):

  --name
  --webUrl
  --title
  --layoutType  = Article | Home | SingleWebPartAppPage | RepostPage | ...
  --promoteAs   = HomePage | NewsPage | Template
  ...
```

## Quick start

```bash
npm install
cp .env.example .env       # every value documents the command that discovers it
$EDITOR .env
source scripts/env.sh      # loads .env, sets $M, fails loudly if anything is missing
npm run doctor             # binary, commands.json, .env, login, SharePoint reachability
```

| command | does |
|---|---|
| `npm run doctor` | environment check; exits 1 on a failed required check |
| `npm run lookup -- --help` | lookup modes (tree / options / full-text search) |
| `npm run commands:refresh` | regenerate the command tree by hand |

`scripts/env.sh` works in both zsh and bash, from any directory inside the project.

## Why a separate lookup script

`commands.json` carries no version of its own, so the script keeps a `commands.version`
stamp next to it and compares against the installed package version on every run,
regenerating on mismatch. A package upgrade or `npm ci` replaces the whole package
directory, which deletes both files — they are then regenerated on the next lookup. Two
small file reads per run, no subprocess.

## What is in here

```
.claude/skills/m365-cli/SKILL.md   the skill: two rules, an error→cause table
scripts/m365-lookup.mjs            offline lookup, zero dependencies
scripts/doctor.sh                  environment check
scripts/env.sh                     sourced preamble
.env.example                       config template; each value names its discovery command
```

The skill deliberately carries only what an agent **cannot** find out on its own. Anything
printed by `m365 <cmd> --help`, or stated in the CLI's own error messages, was audited out.

## Prerequisites

Node.js and a signed-in `m365` (`m365 login`). Verified against
`@pnp/cli-microsoft365` v11.10.0 on macOS.

## License

MIT
