#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `m365-lookup — offline lookup over the m365 CLI command tree (commands.json)

Answers:          does this command exist? what is the option called? allowed enum values?
Does NOT answer:  required (<>) vs optional ([]), what an option does, examples, permissions
                  -> that is always step two:  m365 <cmd> --help full

USAGE  (via npm:  npm run lookup -- <args>)

  m365-lookup                      top-level command groups
  m365-lookup spo page             what lives under a path  (* = another group)
  m365-lookup spo page add         exact option names + enum values
  m365-lookup -f <text>            full-text search across command paths
  m365-lookup --help               this help

commands.json is generated and refreshed automatically: a version stamp (commands.version)
is kept beside it and compared against the installed package on every run. An upgrade or
\`npm ci\` deletes both files; they are rebuilt on the next lookup.

An unknown path exits rc=1 and suggests near matches.`;

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
  console.error(`Local m365 missing (${m365}) — run 'npm install'.`);
  process.exit(1);
}

// commands.json carries NO version of its own — it is a plain command tree. So we keep a
// stamp of the package version it was built from next to it and compare exactly (not by
// mtime). Both files live inside the package directory, so an upgrade or `npm ci` deletes
// them — they are simply regenerated.
const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
const stamped = existsSync(stampPath) ? readFileSync(stampPath, 'utf8').trim() : null;

if (!existsSync(jsonPath) || stamped !== installed) {
  const why = !existsSync(jsonPath)
    ? 'commands.json missing'
    : `commands.json is from ${stamped ?? '?'}, installed is ${installed}`;
  console.error(`${why} — generating…`);
  execFileSync(m365, ['cli', 'completion', 'sh', 'update'], { stdio: 'inherit' });
  writeFileSync(stampPath, installed + '\n');
}
const tree = JSON.parse(readFileSync(jsonPath, 'utf8'));

const isOption = (k) => k.startsWith('-');
const isLeaf = (node) => Object.keys(node).some(isOption);

// A node can be BOTH a command and a group: `spo file checkout` has options and a
// child `undo`. Yield the path when it has options, then descend into non-option keys
// regardless — returning early here would hide those subcommands entirely.
function* walk(node, path = []) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const keys = Object.keys(node);
  if (keys.some(isOption)) yield path.join(' ');
  for (const k of keys) {
    if (!isOption(k)) yield* walk(node[k], [...path, k]);
  }
}

if (args[0] === '-f' || args[0] === '--find') {
  const needle = args.slice(1).join(' ').toLowerCase();
  if (!needle) { console.error('Give me something to search for: -f <text>'); process.exit(2); }
  const hits = [...walk(tree)].filter((c) => c.toLowerCase().includes(needle));
  console.log(hits.length ? hits.map((c) => `m365 ${c}`).join('\n') : `Nothing for "${needle}".`);
  process.exit(hits.length ? 0 : 1);
}

let node = tree;
for (const [i, part] of args.entries()) {
  if (!node || typeof node !== 'object' || !Object.hasOwn(node, part)) {
    console.error(`No such command: m365 ${args.slice(0, i + 1).join(' ')}`);
    const near = [...walk(tree)].filter((c) => c.includes(part)).slice(0, 10);
    if (near.length) console.error('Near matches:\n' + near.map((c) => `  m365 ${c}`).join('\n'));
    process.exit(1);
  }
  node = node[part];
}

const label = args.length ? `m365 ${args.join(' ')}` : 'm365';
const keys = Object.keys(node);
const subs = keys.filter((k) => !isOption(k));
const hasOptions = keys.some(isOption);

if (!hasOptions) {
  console.log(`${label} — group:\n`);
  for (const k of subs.sort()) {
    const child = node[k];
    const kind = child && typeof child === 'object' && !isLeaf(child) ? '*' : ' ';
    console.log(`  ${kind} ${k}`);
  }
  console.log('\n(* = another group)');
  process.exit(0);
}

const globalOpts = new Set(['--query', '--output', '-o', '--verbose', '--debug', '--help', '-h']);
const entries = Object.entries(node).filter(([k]) => isOption(k) && !globalOpts.has(k));
// long and short forms are listed separately; commands.json does not pair them
const longs = entries.filter(([k]) => k.startsWith('--'));
const shorts = entries.filter(([k]) => !k.startsWith('--'));

console.log(`${label}\n\nOPTIONS (exact names; requiredness and meaning are NOT in commands.json):\n`);
if (longs.length === 0) {
  console.log('  (no command-specific options — globals only)');
}
for (const [name, val] of longs) {
  const enumVals = Array.isArray(val) && val.length ? `  = ${val.join(' | ')}` : '';
  console.log(`  ${name}${enumVals}`);
}
if (shorts.length) console.log(`\n  short forms: ${shorts.map(([k]) => k).join(' ')}`);
console.log(`\nGlobal: --query <JMESPath> · --output json|text|csv|md|none · --verbose · --debug`);

// this node is also a group — those subcommands would otherwise be invisible here
if (subs.length) {
  console.log(`\nAlso a group. Subcommands:\n${subs.sort().map((k) => `  ${k}`).join('\n')}`);
}

console.log(`\nNext step — requiredness (<> vs []), meaning, examples:\n  m365 ${args.join(' ')} --help full`);
