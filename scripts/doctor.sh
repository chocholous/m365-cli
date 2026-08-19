#!/usr/bin/env bash
# Ověří prostředí dřív, než z chyby uděláš špatný závěr.
# rc=1 když selže některá kontrola.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
M="$root/node_modules/.bin/m365"
fail=0

ok()   { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fail=1; }
skip() { printf '  \033[33m--\033[0m   %s\n' "$*"; }

echo "== m365 =="
if [ -x "$M" ]; then ok "lokální binárka, $("$M" version 2>/dev/null)"
else bad "chybí lokální m365 — 'npm install'"; echo; exit 1; fi

pkg="$root/node_modules/@pnp/cli-microsoft365"
inst="$(python3 -c 'import json;print(json.load(open("'"$pkg"'/package.json"))["version"])' 2>/dev/null)"
if [ -f "$pkg/commands.json" ]; then
  stamp="$(cat "$pkg/commands.version" 2>/dev/null | tr -d '[:space:]')"
  if [ "$stamp" = "$inst" ]; then ok "commands.json z verze $inst"
  else bad "commands.json je z verze ${stamp:-neznámé}, nainstalovaná $inst — 'npm run lookup' ho přegeneruje"; fi
else skip "commands.json chybí (lookup si ho vygeneruje sám)"; fi

echo "== .env =="
if [ -f "$root/.env" ]; then
  set -a; . "$root/.env"; set +a
  ok ".env načten"
  for v in M365_ACCOUNT M365_TENANT_ID M365_SPO_ROOT; do
    if [ -n "${!v:-}" ]; then ok "$v=${!v}"; else bad "$v není nastaven"; fi
  done
  [ -n "${M365_SITE:-}" ] && ok "M365_SITE=$M365_SITE" || skip "M365_SITE nevyplněn"
else bad "chybí .env — zkopíruj .env.example"; fi

echo "== přihlášení =="
status="$("$M" status --output json 2>&1)"
who="$(printf '%s' "$status" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("connectedAs",""))' 2>/dev/null)"
if [ -n "$who" ]; then
  ok "přihlášen jako $who"
  [ -n "${M365_ACCOUNT:-}" ] && [ "$who" != "$M365_ACCOUNT" ] && bad "neshoda s M365_ACCOUNT=$M365_ACCOUNT"
else bad "nepřihlášen ($status) — 'm365 login'"; fi

echo "== SharePoint =="
if [ -n "${M365_SPO_ROOT:-}" ] && [ -n "$who" ]; then
  title="$("$M" spo web get --url "$M365_SPO_ROOT" --output json --query 'Title' 2>&1)"
  case "$title" in
    *error*|'') bad "$M365_SPO_ROOT nedostupný: $title  (--debug ukáže HTTP status)" ;;
    *) ok "$M365_SPO_ROOT → $title" ;;
  esac
else skip "přeskočeno (chybí M365_SPO_ROOT nebo přihlášení)"; fi

echo
[ "$fail" -eq 0 ] && echo "Prostředí v pořádku." || echo "Něco nesedí — viz FAIL výše."
exit "$fail"
