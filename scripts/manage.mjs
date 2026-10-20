// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 KasuganoSora152
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const action = args.shift();
if (!['install', 'enable', 'disable'].includes(action) ||
    !(args.length === 0 || (args.length === 2 && args[0] === '--profile'))) {
  console.error('Usage: node scripts/manage.mjs install|enable|disable [--profile <desktop-profile-directory>]');
  process.exit(1);
}
const profile = resolve(args[1] ?? join(homedir(), '.dsh', 'profiles', 'desktop'));
const patchPath = join(profile, 'cordis.patch.yml');
const destination = join(profile, 'local-shell-fix');
const source = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const files = ['plugin.mjs', 'preload.mjs', 'transform.mjs'];
const id = 'desktop-local-shell-fix';
if (!existsSync(patchPath)) throw Error('Existing desktop cordis.patch.yml not found. Start DSH Desktop first, or pass --profile.');
if (lstatSync(patchPath).isSymbolicLink() ||
    (existsSync(destination) && lstatSync(destination).isSymbolicLink())) {
  throw Error('Refusing to replace a symlinked configuration or plugin directory.');
}
const before = readFileSync(patchPath, 'utf8');
const idPattern = /^\s*- id:\s*['"]?desktop-local-shell-fix['"]?\s*$/m;
const registered = idPattern.test(before);
if (registered && !/name:\s*['"]?\.\/local-shell-fix\/plugin\.mjs['"]?\s*$/m.test(before)) {
  throw Error('This entry ID is already used by a different registration; inspect configuration first.');
}
if (action !== 'install' && !registered) throw Error('Plugin is not registered. Run install first.');
if (action !== 'install' && !files.every(file => existsSync(join(destination, file)))) {
  throw Error('Plugin files are missing. Run install first.');
}
// Back up locally before changing either the configuration or existing source.
// These backups contain user data and must never be committed or shared.
const backup = join(profile, 'local-shell-fix-backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
mkdirSync(backup, { recursive: true });
copyFileSync(patchPath, join(backup, 'cordis.patch.yml'));
if (action === 'install') {
  mkdirSync(destination, { recursive: true });
  for (const file of files) {
    const target = join(destination, file);
    if (existsSync(target)) {
      if (lstatSync(target).isSymbolicLink()) throw Error('Refusing to overwrite a symlinked plugin source.');
      copyFileSync(target, join(backup, file));
    }
    copyFileSync(join(source, file), target);
  }
}
const enabled = action !== 'disable';
const registration = registered ? '' :
  `\n# DSH Shell Recovery: desktop-only local plugin\n- insert:\n    - id: ${id}\n      name: ./local-shell-fix/plugin.mjs\n`;
// Append a narrowly targeted override. Never remove text between comment
// markers: other tools may have inserted unrelated settings there.
const override = `\n- id: ${id}\n  name: ./local-shell-fix/plugin.mjs\n  disabled: ${!enabled}\n`;
const after = before + registration + (before.endsWith(override) && registered ? '' : override);
if (readFileSync(patchPath, 'utf8') !== before) throw Error('Profile changed concurrently; configuration was not overwritten.');
if (after !== before) writeFileSync(patchPath, after, 'utf8');
console.log(enabled ? 'Plugin enabled. Restart DSH Desktop to ensure new source is loaded.' : 'Plugin disabled. Restart DSH Desktop if configuration hot reload is unavailable.');
console.log('A backup was saved inside the selected profile. Keep backups and status.json private.');
