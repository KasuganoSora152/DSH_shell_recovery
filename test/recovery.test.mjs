import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hash, originalHash, patchedHash, transform } from '../src/transform.mjs';

test('unknown official code is returned byte-for-byte without alteration', () => {
  const source = Buffer.from('export const differentOfficialImplementation = true;\n');
  const result = transform(source);
  assert.equal(result.status, 'unknown-source');
  assert.deepEqual(result.source, source);
});

test('original verified module transforms to the verified patch and remains idempotent', {
  skip: !process.env.DSH_SANDBOX_SOURCE
}, () => {
  // Optional local integration input. Never bundle official application code.
  const source = readFileSync(process.env.DSH_SANDBOX_SOURCE);
  assert.equal(hash(source), originalHash);
  const result = transform(source);
  assert.equal(result.status, 'patched-in-memory');
  assert.equal(hash(result.source), patchedHash);
  assert.equal(transform(result.source).status, 'already-patched');
});

test('install, repeat install and toggles preserve unrelated profile settings', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-shell-recovery-test-'));
  const script = fileURLToPath(new URL('../scripts/manage.mjs', import.meta.url));
  const config = join(profile, 'cordis.patch.yml');
  const unrelated = '# Existing settings\n- id: another-plugin\n  disabled: false\n';
  writeFileSync(config, unrelated);
  const run = action => {
    const result = spawnSync(process.execPath, [script, action, '--profile', profile], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readFileSync(config, 'utf8').startsWith(unrelated));
  };
  try {
    run('install');
    const installed = readFileSync(config, 'utf8');
    run('install');
    assert.equal(readFileSync(config, 'utf8'), installed);
    // A foreign setting placed after the plugin must survive disable.
    writeFileSync(config, installed + '\n- id: newly-added-setting\n  config:\n    value: keep-me\n');
    run('disable');
    assert.match(readFileSync(config, 'utf8'), /value: keep-me/);
    assert.ok(readFileSync(config, 'utf8').endsWith('  disabled: true\n'));
    run('enable');
    assert.ok(readFileSync(config, 'utf8').endsWith('  disabled: false\n'));
  } finally {
    assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
    assert.ok(basename(profile).startsWith('dsh-shell-recovery-test-'));
    rmSync(profile, { recursive: true, force: true });
  }
});
