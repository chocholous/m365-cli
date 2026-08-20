# Source this, do not execute:   source scripts/env.sh
# Loads .env, sets $M, and returns non-zero when something is missing.
# Works in zsh and bash, from any directory inside the project.

_m365_root="$PWD"
while [ ! -f "$_m365_root/package.json" ] && [ "$_m365_root" != "/" ]; do
  _m365_root="$(dirname "$_m365_root")"
done

# On every failure: unset M, so a stale binary from a previous project is never reused.
if [ ! -f "$_m365_root/package.json" ]; then
  echo "env.sh: not inside the project (no package.json found)" >&2
  unset M _m365_root; return 1
fi
if [ ! -x "$_m365_root/node_modules/.bin/m365" ]; then
  echo "env.sh: local m365 missing — run 'npm install'" >&2
  unset M _m365_root; return 1
fi
if [ ! -f "$_m365_root/.env" ]; then
  echo "env.sh: missing $_m365_root/.env — copy .env.example and fill it in using the commands it documents" >&2
  unset M _m365_root; return 1
fi

set -a
. "$_m365_root/.env"
set +a
M="$_m365_root/node_modules/.bin/m365"
export M
# stderr, not stdout: env.sh is sourced inside command substitutions too
echo "m365 $("$M" version 2>/dev/null | tr -d '\"')  root=${M365_SPO_ROOT:-<unset>}" >&2
unset _m365_root
