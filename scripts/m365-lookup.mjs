#!/usr/bin/env bun
// Answers "does this m365 command exist and how exactly do I call it" offline.
// All the awkwardness (which of the package's data files to trust, where the help docs
// live, which documented options the CLI actually rejects) is handled in scripts/lib/.
// Callers just get the answer.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { checkContract, reportAndExit, installedVersion, paths } from './lib/contract.mjs';
import { loadIndex, resolve, search, searchDocs, withCallShapes } from './lib/index.mjs';
import { SECTIONS, availableSections, renderSection } from './lib/sections.mjs';

const HELP = `m365-lookup — offline lookup for CLI for Microsoft 365

  m365-lookup <command...>        how to call it: required/optional options, types, enums
  m365-lookup <group...>          what commands live under a path
  m365-lookup                     top-level groups
  m365-lookup -f <text>           search names, aliases and descriptions
  m365-lookup <command...> --examples | --remarks | --permissions | --response

Everything is read from the installed package, so it is instant and works offline.
Option names, requiredness, types and enum values here are what the CLI accepts —
they are not always what its own --help prints.`;

const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') { console.log(HELP); process.exit(0); }

// The tool reads package internals, which a version bump may rearrange. Verify once per
// version and fail loudly rather than silently degrading.
const version = installedVersion();
const stamp = existsSync(paths.stamp) ? readFileSync(paths.stamp, 'utf8').trim() : null;
if (stamp !== version) {
  const bad = await checkContract();
  if (bad.length) reportAndExit(bad, version);
  writeFileSync(paths.stamp, version + '\n');
}

const wantedSection = SECTIONS.find((s) => args.includes(`--${s}`));
let parts = args.filter((a) => !a.startsWith('-'));

// Our own output prints commands as `m365 spo page add`, so accept that verbatim.
if (parts[0] === 'm365') parts = parts.slice(1);

if (args[0] === '-f' || args[0] === '--find') {
  const needle = args.slice(1).join(' ').trim();
  if (!needle) { console.error('Give me something to search for: -f <text>'); process.exit(2); }
  const hits = search(needle);
  if (!hits.length) {
    const inDocs = searchDocs(needle);
    if (!inDocs.length) { console.error(`Nothing matches "${needle}".`); process.exit(1); }
    console.error(`No command name or description matches "${needle}", but it appears in the help text of:`);
    for (const n of inDocs) console.log(`m365 ${n}`);
    process.exit(0);
  }
  for (const h of hits) console.log(`m365 ${h.name}${h.why ? `   — matched in ${h.why}` : ''}`);
  process.exit(0);
}

// A single argument containing spaces means the caller's shell did not split it
// (unquoted $var in zsh does not word-split). Say that, rather than "no such command".
if (parts.length === 1 && parts[0].includes(' ')) {
  const guess = parts[0].trim().replace(/^m365\s+/, '');
  console.error(
    `Pass the command as separate arguments, not one quoted string:\n` +
    `  m365-lookup ${guess}\n` +
    `(in zsh an unquoted $var is not split into words — use \${=var})`
  );
  process.exit(2);
}

const found = resolve(parts);
if (!found) {
  console.error(`No such command: m365 ${parts.join(' ')}`);
  const near = search(parts[parts.length - 1] ?? '').slice(0, 10);
  if (near.length) console.error('Did you mean:\n' + near.map((h) => `  m365 ${h.name}`).join('\n'));
  process.exit(1);
}

const { command: rawCommand, canonicalName, isAlias, children } = found;
const command = rawCommand ? withCallShapes(rawCommand) : null;

if (!command) {
  console.log(`m365 ${parts.join(' ')}\n`);
  const { tree } = loadIndex();
  let n = tree;
  for (const p of parts) n = n[p];
  for (const k of children) {
    const child = n[k];
    const isGroup = Object.keys(child).some((x) => x !== '__cmd');
    console.log(`  ${isGroup ? '*' : ' '} ${k}`);
  }
  console.log('\n(* = has subcommands)');
  process.exit(0);
}

if (wantedSection) {
  const text = await renderSection(command.help, wantedSection);
  if (text === null) { console.error(`No help docs for m365 ${canonicalName}.`); process.exit(1); }
  if (text === '') {
    const extra = wantedSection === 'permissions'
      ? ' The package documents permissions for only 38% of commands, so this does NOT mean none are needed — check `m365 cli doctor` for what this account holds.'
      : '';
    console.error(`The package ships no ${wantedSection} section for m365 ${canonicalName}.${extra}`);
    process.exit(1);
  }
  console.log(text);
  process.exit(0);
}

// --- command detail -------------------------------------------------------------
const fmt = (o) => {
  const val = o.takesValue
    ? ` <${o.autocomplete?.length ? o.autocomplete.join('|') : o.type || 'string'}>`
    : '   (flag, takes no value)';
  return `  ${o.short ? `-${o.short}, ` : '    '}--${o.long}${val}`;
};

console.log(`m365 ${canonicalName}`);
if (isAlias) console.log(`  (you typed the alias "${parts.join(' ')}")`);
if (command.description) console.log(`\n  ${command.description}`);

const required = command.options.filter((o) => o.required);
const optional = command.options.filter((o) => !o.required);
if (required.length) console.log(`\nREQUIRED\n${required.map(fmt).join('\n')}`);
if (optional.length) console.log(`\nOPTIONAL\n${optional.map(fmt).join('\n')}`);
if (!command.options.length) console.log(`\nNo command-specific options.`);

const out = command.output?.length ? command.output.join('|') : 'json|text|csv|md|none';
console.log(`\nGLOBAL\n      --output <${out}>\n      --query <JMESPath>\n      --verbose   (flag)\n      --debug   (flag)`);

if (children.length) console.log(`\nAlso a group: ${children.join(', ')}`);

const have = availableSections(command.help);
if (have.length) console.log(`\nMore: ${have.map((s) => `--${s}`).join(' ')}`);
if (!have.includes('permissions')) {
  console.log(`\nPermissions are not documented for this command (true for 62% of them).`);
}
