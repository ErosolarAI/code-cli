import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearPackageMetadataCache,
  getPackageVersion,
} from '../src/utils/packageMetadata.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

test('getPackageVersion returns the repository version', () => {
  clearPackageMetadataCache();
  const packagePath = resolve(ROOT, 'package.json');
  const expected = JSON.parse(readFileSync(packagePath, 'utf8')).version;

  assert.equal(getPackageVersion(), expected);
});

test('getPackageVersion falls back when package.json is missing', () => {
  clearPackageMetadataCache();
  const tempDir = mkdtempSync(join(tmpdir(), 'pkg-meta-missing-'));
  const missingPath = resolve(tempDir, 'package.json');

  assert.equal(
    getPackageVersion({ packagePath: missingPath, fallbackVersion: '9.9.9' }),
    '9.9.9',
  );
});

test('getPackageVersion caches reads but allows bypassing the cache', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'pkg-meta-cache-'));
  const packagePath = resolve(tempDir, 'package.json');
  writeFileSync(packagePath, JSON.stringify({ version: '1.0.0' }));

  clearPackageMetadataCache();
  assert.equal(getPackageVersion({ packagePath }), '1.0.0');

  writeFileSync(packagePath, JSON.stringify({ version: '2.0.0' }));
  assert.equal(getPackageVersion({ packagePath }), '1.0.0');
  assert.equal(
    getPackageVersion({ packagePath, cache: false }),
    '2.0.0',
  );
});
