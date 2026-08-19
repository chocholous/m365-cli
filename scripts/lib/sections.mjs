// Renders help sections straight from the docs shipped in the package, using the CLI's
// own markdown renderer. Same text `m365 <cmd> --help <section>` prints, without paying
// the ~2.4 s it costs to start the CLI (it loads 1417 command modules first).
//
// Section slicing mirrors dist/cli/cli.js getHelpSection().

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './contract.mjs';

export const SECTIONS = ['examples', 'remarks', 'permissions', 'response'];

/** Returns rendered text, '' when the command has no such section, or null when no docs. */
export async function renderSection(helpPath, section) {
  if (!helpPath) return null;
  const file = join(paths.docsCmd, helpPath);
  if (!existsSync(file)) return null;

  const contents = readFileSync(file, 'utf8');
  const title = section[0].toUpperCase() + section.slice(1);
  const lines = contents.split('\n');
  const picked = [];
  for (const line of lines) {
    if (line.startsWith(`## ${title}`)) picked.push(line);
    else if (picked.length) {
      if (line.startsWith('## ')) break;
      picked.push(line);
    }
  }
  if (!picked.length) return '';

  const { md } = await import(paths.md);
  return md.md2plain(picked.join('\n'), paths.docs).trim();
}

/** Which sections this command actually documents, with content -- a bare heading
 *  with an empty body (e.g. `teams app remove` Remarks) is not offered. */
export function availableSections(helpPath) {
  if (!helpPath) return [];
  const file = join(paths.docsCmd, helpPath);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n');
  return SECTIONS.filter((s) => {
    const title = `## ${s[0].toUpperCase()}${s.slice(1)}`;
    const i = lines.findIndex((l) => l.startsWith(title));
    if (i < 0) return false;
    for (let j = i + 1; j < lines.length && !lines[j].startsWith('## '); j++) {
      if (lines[j].trim()) return true;
    }
    return false;
  });
}
