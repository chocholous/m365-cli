// Builds the command index the tool answers from.
//
// Source is the package's own allCommandsFull.json: it carries `required`, `type`,
// `short` and enum values as structured fields. The help docs are NOT used for options
// -- they were measured against the live CLI across all 877 commands and document 11
// options the CLI rejects outright, plus two casing typos. See verified-exceptions.json.
// Docs are still the only source for examples/remarks/permissions/response.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './contract.mjs';

const scriptsDir = dirname(dirname(fileURLToPath(import.meta.url)));

const GLOBAL = new Set(['query', 'output', 'debug', 'verbose', 'help']);

// Whether an option takes a value is the one thing the data files do not say: `type`
// is absent on 4422 options, and where present it describes the VALUE type, not the call
// shape -- `entra user set --accountEnabled` is `type: boolean` yet is written
// `--accountEnabled true`, while `spo page add --publish` takes nothing at all.
// The docs' placeholder syntax is what distinguishes them, so read it -- but only for
// options the data already knows about. Docs are never allowed to introduce an option.
function docCallShapes(helpPath) {
  if (!helpPath) return null;
  const file = join(paths.docsCmd, helpPath);
  if (!existsSync(file)) return null;
  const txt = readFileSync(file, 'utf8');
  const heads = [...txt.matchAll(/^##\s+(.+)$/gm)];
  const i = heads.findIndex((h) => h[1].trim().toLowerCase() === 'options');
  if (i < 0) return null;
  const sec = txt.slice(heads[i].index, i + 1 < heads.length ? heads[i + 1].index : txt.length);
  const shapes = new Map();
  for (const line of sec.split('\n')) {
    const m = line.match(/^\s*`(?:(-\w),\s*)?(--[\w-]+)(\s*[<\[][^>\]]*[>\]])?`/);
    if (m) shapes.set(m[2].slice(2), Boolean(m[3]));
  }
  return shapes;
}

let cache = null;

export function loadIndex() {
  if (cache) return cache;

  const full = JSON.parse(readFileSync(paths.full, 'utf8'));
  const ex = JSON.parse(readFileSync(join(scriptsDir, 'verified-exceptions.json'), 'utf8'));

  const byName = new Map();
  for (const c of full) {
    byName.set(c.name, {
      name: c.name,
      description: c.description || '',
      help: c.help || null,
      aliases: c.aliases || [],
      options: c.options.filter((o) => !GLOBAL.has(o.long)),
      output: c.options.find((o) => o.long === 'output')?.autocomplete || null,
    });
  }

  for (const add of ex.addOptions || []) {
    const c = byName.get(add.command);
    if (c && !c.options.some((o) => o.long === add.option.long)) c.options.push(add.option);
  }

  // alias path -> canonical command
  const aliasOf = new Map();
  for (const c of byName.values()) for (const a of c.aliases) aliasOf.set(a, c.name);

  // tree for browsing; every command and alias is addressable by its path
  const tree = {};
  const put = (path, leaf) => {
    let n = tree;
    for (const seg of path.slice(0, -1)) n = n[seg] ??= {};
    const last = path[path.length - 1];
    n[last] = Object.assign(n[last] ?? {}, { __cmd: leaf });
  };
  for (const c of byName.values()) {
    put(c.name.split(' '), c.name);
    for (const a of c.aliases) put(a.split(' '), c.name);
  }

  cache = { byName, aliasOf, tree, names: [...byName.keys()].sort() };
  return cache;
}

/** Walk the tree by path. Returns {command} | {group, children} | null. */
export function resolve(pathParts) {
  const { tree, byName, aliasOf } = loadIndex();
  let n = tree;
  for (const part of pathParts) {
    if (!Object.hasOwn(n, part)) return null;
    n = n[part];
  }
  const children = Object.keys(n).filter((k) => k !== '__cmd').sort();
  const canonical = n.__cmd ?? null;
  if (!canonical && !children.length) return null;
  return {
    command: canonical ? byName.get(canonical) : null,
    canonicalName: canonical,
    isAlias: canonical ? canonical !== pathParts.join(' ') : false,
    children,
  };
}

/** Annotate one command's options with whether they take a value. Reads exactly one
 *  doc file, so it stays off the path of searching and browsing. */
export function withCallShapes(command) {
  const shapes = docCallShapes(command.help);
  return {
    ...command,
    options: command.options.map((o) => ({
      ...o,
      // documented shape wins; with no doc entry, only an explicit boolean reads as a flag
      takesValue: shapes?.has(o.long) ? shapes.get(o.long) : o.type !== 'boolean',
    })),
  };
}

export function search(needle) {
  const { names, byName } = loadIndex();
  const q = needle.toLowerCase();
  const hits = [];
  for (const n of names) {
    const c = byName.get(n);
    if (n.toLowerCase().includes(q)) { hits.push({ name: n, why: null }); continue; }
    const alias = c.aliases.find((a) => a.toLowerCase().includes(q));
    if (alias) { hits.push({ name: n, why: `alias ${alias}` }); continue; }
    if (c.description.toLowerCase().includes(q)) hits.push({ name: n, why: 'description' });
  }
  return hits;
}
