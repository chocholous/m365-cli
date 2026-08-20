#!/bin/sh
# PreToolUse(Bash) guard. Two habits it enforces, both observed failing in practice:
#
#  1. `m365 <cmd> --help` / `-h` costs ~2.4 s and its docs are wrong in places the
#     repo's ./lookup already corrects. Agents that never read SKILL.md reach for it
#     by reflex -- one test agent made ~14 such calls and never found ./lookup.
#     Denied however m365 is invoked, matching SKILL.md: ./lookup IS the help here.
#  2. A bare `m365` resolves through PATH to whatever is installed globally, which is
#     usually NOT the version this repo pins and verifies against.
#
# Reads the hook payload on stdin, writes a decision as JSON on stdout. No dependencies
# beyond POSIX sh -- it runs on every clone of this repo, so it stays readable and inert.
# Only ever denies; never edits, never calls out.

payload=$(cat)

# crude but dependency-free: pull "command" out of tool_input
cmd=$(printf '%s' "$payload" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1)
[ -z "$cmd" ] && exit 0

# any invocation of the CLI: bare `m365`, or the pinned binary by path
echo "$cmd" | grep -Eq '(^|[|;&(]|&&|\|\|)[[:space:]]*([./a-zA-Z0-9_-]*/)?m365[[:space:]]' || exit 0

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$1"
  exit 0
}

# 1. help, however m365 was invoked -- ./lookup IS the help in this repo
if echo "$cmd" | grep -Eq '(^|[[:space:]])(-h|--help)([[:space:]]|$)'; then
  deny '"./lookup is the help for this repo: run  ./lookup <command>  (e.g. ./lookup spo page add), plus --examples / --remarks / --permissions / --response. It is ~36x faster than m365 --help and it corrects the places where the CLI help is wrong -- option casing, restricted --output values, and options the docs list that the CLI rejects."'
fi

# 2. a bare `m365` resolves through PATH to whatever is installed globally
if echo "$cmd" | grep -Eq '(^|[|;&(]|&&|\|\|)[[:space:]]*m365[[:space:]]'; then
  deny '"Call the pinned binary by path: ./node_modules/.bin/m365 <command>  -- a bare m365 resolves through PATH to whatever is installed globally, which is a different version than the one this repo pins and is verified against. Values from .env come from prefixing the SAME command line with: source scripts/env.sh &&  ... And look the command up first: ./lookup <command>."'
fi

exit 0
