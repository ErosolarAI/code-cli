#!/usr/bin/env node
import { launchShell } from '../shell/shellApp.js';
import { runHeadlessApp } from '../headless/headlessApp.js';
import { BRAND_CODE_PROFILE } from '../core/brand.js';

const argv = process.argv.slice(2);

if (argv.includes('--json')) {
  runHeadlessApp({ argv }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} else {
  launchShell(BRAND_CODE_PROFILE, { enableProfileSelection: true }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
