// What we depend on INSIDE the @pnp/cli-microsoft365 package.
//
// None of this is public API. The CLI's public contract is `m365 <cmd> --help`; the files
// below are implementation detail that pnp may rearrange in any release. We read them
// anyway because they are ~36x faster than spawning the CLI (a single `--help` costs
// ~2.4 s, dominated by loading 1417 command modules) and because they carry `required`,
// `type` and `aliases` as structured fields instead of prose to be parsed.
//
// The version is pinned exactly in package.json for this reason. That does not remove the
// risk, it concentrates it into the moment someone bumps the pin -- so this check runs
// then and FAILS LOUDLY. It deliberately does not fall back to `--help`: a silent
// fallback would leave everything working, 36x slower, with nobody noticing.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const pkgDir = join(root, 'node_modules', '@pnp', 'cli-microsoft365');
export const paths = {
  pkgJson: join(pkgDir, 'package.json'),
  commands: join(pkgDir, 'commands.json'),
  stamp: join(pkgDir, 'commands.version'),
  full: join(pkgDir, 'allCommandsFull.json'),
  docs: join(pkgDir, 'docs'),
  docsCmd: join(pkgDir, 'docs', 'docs', 'cmd'),
  md: join(pkgDir, 'dist', 'utils', 'md.js'),
  bin: join(root, 'node_modules', '.bin', 'm365'),
};

export function installedVersion() {
  return JSON.parse(readFileSync(paths.pkgJson, 'utf8')).version;
}

/** Returns [] when the contract holds, otherwise one string per broken assumption. */
export async function checkContract() {
  const bad = [];
  const need = (cond, msg) => { if (!cond) bad.push(msg); return cond; };

  if (!need(existsSync(paths.bin), `missing local m365 binary (${paths.bin}) — run 'npm install'`)) return bad;

  // 1. allCommandsFull.json — the structured command index
  if (need(existsSync(paths.full), 'allCommandsFull.json is gone from the package root')) {
    let full;
    try { full = JSON.parse(readFileSync(paths.full, 'utf8')); }
    catch (e) { bad.push(`allCommandsFull.json is not valid JSON: ${e.message}`); }
    if (full) {
      need(Array.isArray(full) && full.length > 500,
        `allCommandsFull.json should be an array of >500 commands, got ${Array.isArray(full) ? full.length : typeof full}`);
      const c = Array.isArray(full) && full.find((x) => x?.options?.length);
      if (need(c, 'no entry in allCommandsFull.json has an options array')) {
        for (const k of ['name', 'description', 'options', 'help']) {
          need(k in c, `allCommandsFull.json entries lost the "${k}" field`);
        }
        const o = c.options[0];
        for (const k of ['long', 'required', 'type']) {
          need(k in o, `allCommandsFull.json options lost the "${k}" field (that is why we read this file at all)`);
        }
      }
    }
  }

  // 2. shipped help docs, addressed by the `help` field
  if (need(existsSync(paths.docsCmd), `help docs are gone (${paths.docsCmd})`)) {
    need(readdirSync(paths.docsCmd).length > 0, 'help docs directory is empty');
    try {
      const full = JSON.parse(readFileSync(paths.full, 'utf8'));
      const withHelp = full.filter((c) => c.help).slice(0, 5);
      const missing = withHelp.filter((c) => !existsSync(join(paths.docsCmd, c.help)));
      need(missing.length === 0,
        `help paths no longer resolve under docs/docs/cmd (e.g. ${missing[0]?.help})`);
    } catch { /* already reported above */ }
  }

  // 3. the renderer that turns those docs into what --help prints
  if (need(existsSync(paths.md), `dist/utils/md.js is gone — cannot render help offline`)) {
    try {
      const { md } = await import(paths.md);
      if (need(typeof md?.md2plain === 'function', 'dist/utils/md.js no longer exports md.md2plain()')) {
        const out = md.md2plain('# Title\n\nBody text.\n', paths.docs);
        need(typeof out === 'string' && out.includes('Body text'),
          'md.md2plain() no longer returns rendered text');
      }
    } catch (e) {
      bad.push(`importing dist/utils/md.js failed: ${e.message}`);
    }
  }

  return bad;
}

/** Print the failures in a form that says what to actually do, then exit non-zero. */
export function reportAndExit(bad, version) {
  console.error(
    `\n@pnp/cli-microsoft365 ${version} does not match what this tooling reads.\n` +
    `These are package internals, not public API — a version bump can move them.\n`
  );
  for (const b of bad) console.error(`  - ${b}`);
  console.error(
    `\nFix one of:\n` +
    `  - pin package.json back to the version that worked, run 'npm ci'\n` +
    `  - update scripts/lib/contract.mjs and the readers to the new layout\n` +
    `\nNot falling back to 'm365 --help' on purpose: it would still work, ~36x slower,\n` +
    `and nobody would notice.\n`
  );
  process.exit(1);
}
