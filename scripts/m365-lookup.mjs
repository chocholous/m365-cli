#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `m365-lookup — offline lookup nad stromem příkazů m365 CLI (commands.json)

Odpovídá na:      existuje příkaz? jak se přesně jmenuje option? jaké jsou hodnoty enumu?
NEODPOVÍDÁ na:    povinné (<>) vs volitelné ([]), co option dělá, příklady, oprávnění
                  -> na to je vždy druhý krok:  m365 <cmd> --help full

POUŽITÍ  (přes npm:  npm run lookup -- <args>)

  m365-lookup                      skupiny nejvyšší úrovně
  m365-lookup spo page             co je pod cestou  (* = další skupina)
  m365-lookup spo page add         přesná jména options + hodnoty enumů
  m365-lookup -f <text>            fulltext hledání v cestách příkazů
  m365-lookup --help               tato nápověda

commands.json si skript generuje i obnovuje sám: drží vedle něj otisk verze balíčku
(commands.version) a při neshodě přegeneruje. Upgrade i \`npm ci\` oba soubory smažou.

Neexistující cesta končí rc=1 a nabídne blízké příkazy.`;

const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
  console.log(HELP);
  process.exit(0);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgDir = join(root, 'node_modules', '@pnp', 'cli-microsoft365');
const jsonPath = join(pkgDir, 'commands.json');
const stampPath = join(pkgDir, 'commands.version');
const m365 = join(root, 'node_modules', '.bin', 'm365');

if (!existsSync(m365)) {
  console.error(`Chybí lokální m365 (${m365}) — spusť 'npm install'.`);
  process.exit(1);
}

// Samotný commands.json NENESE verzi — je to čistý strom příkazů. Držíme si proto
// vedle něj otisk verze balíčku, se kterou byl vygenerován, a porovnáváme přesně
// (ne přes mtime). Oba soubory žijí uvnitř balíčku, takže je upgrade i `npm ci`
// smažou — pak se prostě vygenerují znovu.
const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
const stamped = existsSync(stampPath) ? readFileSync(stampPath, 'utf8').trim() : null;

if (!existsSync(jsonPath) || stamped !== installed) {
  const why = !existsSync(jsonPath)
    ? 'commands.json chybí'
    : `commands.json je z verze ${stamped ?? '?'}, nainstalovaná je ${installed}`;
  console.error(`${why} — generuji…`);
  execFileSync(m365, ['cli', 'completion', 'sh', 'update'], { stdio: 'inherit' });
  writeFileSync(stampPath, installed + '\n');
}
const tree = JSON.parse(readFileSync(jsonPath, 'utf8'));

const isOption = (k) => k.startsWith('-');
const isLeaf = (node) => Object.keys(node).some(isOption);

function* walk(node, path = []) {
  if (isLeaf(node)) { yield path.join(' '); return; }
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === 'object') yield* walk(v, [...path, k]);
    else yield [...path, k].join(' ');
  }
}

if (args[0] === '-f' || args[0] === '--find') {
  const needle = args.slice(1).join(' ').toLowerCase();
  if (!needle) { console.error('Zadej co hledat: -f <text>'); process.exit(2); }
  const hits = [...walk(tree)].filter((c) => c.toLowerCase().includes(needle));
  console.log(hits.length ? hits.map((c) => `m365 ${c}`).join('\n') : `Nic pro "${needle}".`);
  process.exit(hits.length ? 0 : 1);
}

let node = tree;
for (const [i, part] of args.entries()) {
  if (!node || typeof node !== 'object' || !(part in node)) {
    console.error(`Neexistuje: m365 ${args.slice(0, i + 1).join(' ')}`);
    const near = [...walk(tree)].filter((c) => c.includes(part)).slice(0, 10);
    if (near.length) console.error('Blízko:\n' + near.map((c) => `  m365 ${c}`).join('\n'));
    process.exit(1);
  }
  node = node[part];
}

const label = args.length ? `m365 ${args.join(' ')}` : 'm365';

if (!args.length || !isLeaf(node)) {
  // skupina -> co je pod ní
  console.log(`${label} — ${isLeaf(node) ? 'příkaz' : 'skupina'}:\n`);
  for (const k of Object.keys(node).sort()) {
    const child = node[k];
    const kind = child && typeof child === 'object' && !isLeaf(child) ? '*' : ' ';
    console.log(`  ${kind} ${k}`);
  }
  console.log('\n(* = další skupina)');
  process.exit(0);
}

// list -> options
const globalOpts = new Set(['--query', '--output', '-o', '--verbose', '--debug', '--help', '-h']);
const entries = Object.entries(node).filter(([k]) => isOption(k) && !globalOpts.has(k));

// spáruj krátké a dlouhé varianty podle shodné hodnoty (enum) nebo pořadí
const longs = entries.filter(([k]) => k.startsWith('--'));
const shorts = entries.filter(([k]) => !k.startsWith('--'));

console.log(`${label}\n\nOPTIONS (přesná jména; povinnost a význam NEJSOU v commands.json):\n`);
for (const [name, val] of longs) {
  const enumVals = Array.isArray(val) && val.length ? `  = ${val.join(' | ')}` : '';
  console.log(`  ${name}${enumVals}`);
}
if (shorts.length) console.log(`\n  krátké varianty: ${shorts.map(([k]) => k).join(' ')}`);
console.log(`\nGlobální: --query <JMESPath> · --output json|text|csv|md|none · --verbose · --debug`);
console.log(`\nDalší krok — povinnost (<> vs []), význam, příklady:\n  m365 ${args.join(' ')} --help full`);
