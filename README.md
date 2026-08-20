# m365-cli skill

A [Claude Code](https://claude.com/claude-code) skill plus a small toolchain that stops AI
agents from guessing their way through [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/).

## The problem

`m365` has ~900 commands. An agent that writes `--pageTitle` instead of `--title` gets a
hard rejection — annoying but harmless. The dangerous failures are the quiet ones:

- `{"error":{}}` — an empty object that hides an HTTP **401**. Usually you are hitting a
  SharePoint hostname belonging to a different tenant than the one you signed in to.
- `Attempted to perform an unauthorized operation.` — a missing **role**, not bad syntax.
  Agents burn turns rewriting a command that was correct all along.
- `{"error":{"name":"ExitPromptError"}}` — a destructive command asked for confirmation and
  found no TTY. The operation did *not* run. Adding `--force` to "fix" it silently runs it.

## The tool

One command answers "how do I call this":

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

| | |
|---|---|
| `./lookup <command>` | required vs optional, types, enums, flags |
| `./lookup <group>` | what lives under a path |
| `./lookup -f <text>` | search names, aliases, descriptions |
| `./lookup <command> --examples` | also `--remarks`, `--permissions`, `--response` |

Instant and offline. There is nothing else to learn — the awkward parts are handled inside
the tool, and the skill tells the agent to take its output as given.

## Why it is not just `m365 --help`

Two reasons, both measured against v11.10.0.

**Speed.** A single `m365 <cmd> --help` takes **~2.4 s** — the CLI loads 1417 command
modules before printing anything, and even `m365 version` costs the same. `./lookup`
answers in **~67 ms**, about 36x faster. Getting there meant three things: reading the
package's own data files instead of spawning the CLI, reading the help doc of the one
command asked about rather than all 877, and running on [bun](https://bun.sh) invoked
directly — `npm run` alone adds 213 ms of npm startup, more than the whole lookup, and
node starts ~33 ms slower than bun.

**Correctness.** `--help` is generated from docs that have drifted from the implementation.
Verified against the live CLI across every command:

| | |
|---|---|
| options documented but **rejected** by the CLI | 11 |
| options the CLI accepts but docs omit | 15 |
| requiredness disagreements | 5 |
| casing typos (`--displayname` for `--displayName`) | 2 |
| commands whose `--output` docs claim five formats but accept two | 59 |

So the tool reads the package's structured command index for names, requiredness, types
and enums, and the shipped docs only for prose sections and for whether an option takes a
value. The one option genuinely missing from the index is recorded, with the CLI output
proving it, in `scripts/verified-exceptions.json`.

## Quick start

```bash
npm install                # installs the pinned CLI for Microsoft 365
cp .env.example .env       # every value documents the command that discovers it
$EDITOR .env
npm run doctor             # runtime, package contract, .env, login, SharePoint reachability
./lookup spo page add      # and you are working
```

Run the CLI itself by path — `./node_modules/.bin/m365` — so you get the pinned version
rather than whatever `m365` resolves to on PATH.

## Pinned on purpose

The tool reads files inside `@pnp/cli-microsoft365` that are implementation detail, not
public API. The version is therefore pinned exactly, and `npm run contract` asserts every
assumption — the index shape, the docs layout, the markdown renderer. It runs automatically
whenever the installed version differs from the last one seen, and **fails loudly**:

```
@pnp/cli-microsoft365 11.11.0 does not match what this tooling reads.

  - allCommandsFull.json options lost the "required" field

Not falling back to 'm365 --help' on purpose: it would still work, ~36x slower,
and nobody would notice.
```

## The hook

`.claude/settings.json` registers one `PreToolUse` hook, `.claude/hooks/prefer-lookup.sh`.
It is ~30 lines of POSIX shell with no dependencies, it only ever returns a decision, and
it denies exactly two things:

- `m365 <command> --help` / `-h`, **however m365 is invoked** → points at `./lookup`, which
  is faster and corrects the places the CLI's help is wrong
- a bare `m365 ...` → points at `./node_modules/.bin/m365`, the pinned version

Running the pinned binary is otherwise untouched. This exists because it was measured: across six agents given read-only tasks in this
repo, three reached for `m365 --help` (19 calls) before reading anything, and two ran live
commands through a different globally-installed version without noticing.

Read it before you clone — a hook runs code on your machine, and you should never take
that on trust.

## What is in here

```
.claude/settings.json              registers the hook below
.claude/hooks/prefer-lookup.sh     PreToolUse guard, ~30 lines of POSIX sh
.claude/skills/m365-cli/SKILL.md   the skill: two rules, an error→cause table
lookup -> scripts/m365-lookup.mjs  the tool (bun shebang, run it directly)
scripts/lib/                       index building, help sections, the contract check
scripts/verified-exceptions.json   corrections to the package index, each with evidence
scripts/doctor.sh                  environment check
scripts/env.sh                     sourced preamble
```

## Prerequisites

[bun](https://bun.sh) (the lookup runs on it — node works too, ~33 ms slower per call),
Node.js and npm for installing the pinned CLI, and a signed-in `m365` (`m365 login`).
Verified against `@pnp/cli-microsoft365` v11.10.0 on macOS. `npm run doctor` checks all of it.

## License

MIT
