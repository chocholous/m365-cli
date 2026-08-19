#!/usr/bin/env bash
# Check the environment before drawing the wrong conclusion from an error.
# rc=1 if any check fails.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
M="$root/node_modules/.bin/m365"
fail=0

ok()   { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fail=1; }
skip() { printf '  \033[33m--\033[0m   %s\n' "$*"; }

echo "== m365 =="
if [ -x "$M" ]; then ok "local binary, $("$M" version 2>/dev/null)"
else bad "local m365 missing — run 'npm install'"; echo; exit 1; fi

pkg="$root/node_modules/@pnp/cli-microsoft365"
inst="$(node -p "require('$pkg/package.json').version" 2>/dev/null)"
if [ -f "$pkg/commands.json" ]; then
  stamp="$(cat "$pkg/commands.version" 2>/dev/null | tr -d '[:space:]')"
  if [ "$stamp" = "$inst" ]; then ok "commands.json built from $inst"
  else bad "commands.json is from ${stamp:-unknown}, installed is $inst — 'npm run lookup' rebuilds it"; fi
else skip "commands.json missing (lookup generates it on demand)"; fi

echo "== .env =="
if [ -f "$root/.env" ]; then
  set -a; . "$root/.env"; set +a
  ok ".env loaded"
  for v in M365_ACCOUNT M365_TENANT_ID M365_SPO_ROOT; do
    if [ -n "${!v:-}" ]; then ok "$v=${!v}"; else bad "$v is not set"; fi
  done
  [ -n "${M365_SITE:-}" ] && ok "M365_SITE=$M365_SITE" || skip "M365_SITE not filled in"
else bad "missing .env — copy .env.example"; fi

echo "== sign-in =="
status="$("$M" status --output json 2>&1)"
who="$(printf '%s' "$status" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).connectedAs||"")}catch{}})' 2>/dev/null)"
if [ -n "$who" ]; then
  ok "signed in as $who"
  [ -n "${M365_ACCOUNT:-}" ] && [ "$who" != "$M365_ACCOUNT" ] && bad "does not match M365_ACCOUNT=$M365_ACCOUNT"
else bad "not signed in ($status) — run 'm365 login'"; fi

echo "== SharePoint =="
if [ -n "${M365_SPO_ROOT:-}" ] && [ -n "$who" ]; then
  title="$("$M" spo web get --url "$M365_SPO_ROOT" --output json --query 'Title' 2>&1)"
  case "$title" in
    *error*|'') bad "$M365_SPO_ROOT unreachable: $title  (--debug reveals the HTTP status)" ;;
    *) ok "$M365_SPO_ROOT → $title" ;;
  esac
else skip "skipped (no M365_SPO_ROOT, or not signed in)"; fi

echo
[ "$fail" -eq 0 ] && echo "Environment looks good." || echo "Something is off — see FAIL above."
exit "$fail"
