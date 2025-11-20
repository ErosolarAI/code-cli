#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BIN_NAMES = ['bo', 'apt'];
const OWNERSHIP_MARKERS = ['bo', 'apt', 'codex runtime ready', 'launchCli'];

const isGlobalInstall = process.env.npm_config_global === 'true';
const prefix = process.env.npm_config_prefix;

if (!isGlobalInstall || !prefix) {
  process.exit(0);
}

const binDir = process.platform === 'win32' ? join(prefix, 'Scripts') : join(prefix, 'bin');

for (const name of BIN_NAMES) {
  for (const target of candidatePaths(binDir, name)) {
    cleanCandidate(target);
  }
}

const conflicts = [];

function candidatePaths(baseDir, name) {
  if (process.platform === 'win32') {
    return [join(baseDir, name), join(baseDir, `${name}.cmd`), join(baseDir, `${name}.ps1`)];
  }
  return [join(baseDir, name)];
}

function cleanCandidate(path) {
  if (!existsSync(path)) {
    return;
  }

  try {
    rmSync(path);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    conflicts.push({ path, message });
  }
}

if (conflicts.length) {
  console.error('[bo] Could not remove conflicting CLI binaries:');
  for (const conflict of conflicts) {
    console.error(` - ${conflict.path}: ${conflict.message}`);
  }
  console.error(
    '[bo] Please remove the files above (e.g., `rm /path/to/bo` or `npm uninstall -g bo-cli`) and re-run the install.'
  );
  process.exit(1);
}
