# Sourcuj, nespouštěj:   source scripts/env.sh
# Načte .env, nastaví $M a hlasitě selže, když něco chybí.
# Funguje v zsh i bash, z libovolného adresáře uvnitř projektu.

_m365_root="$PWD"
while [ ! -f "$_m365_root/package.json" ] && [ "$_m365_root" != "/" ]; do
  _m365_root="$(dirname "$_m365_root")"
done

if [ ! -f "$_m365_root/package.json" ]; then
  echo "env.sh: nejsem uvnitř projektu (nenašel jsem package.json)" >&2
elif [ ! -f "$_m365_root/.env" ]; then
  echo "env.sh: chybí $_m365_root/.env — zkopíruj .env.example a naplň ho příkazy, které jsou v něm popsané" >&2
elif [ ! -x "$_m365_root/node_modules/.bin/m365" ]; then
  echo "env.sh: chybí lokální m365 — spusť 'npm install'" >&2
else
  set -a
  . "$_m365_root/.env"
  set +a
  M="$_m365_root/node_modules/.bin/m365"
  export M
  echo "m365 $("$M" version 2>/dev/null | tr -d '\"')  root=${M365_SPO_ROOT:-<nenastaveno>}"
fi
unset _m365_root
