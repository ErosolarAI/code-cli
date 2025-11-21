#!/usr/bin/env node
import { getPackageVersion } from '../utils/packageMetadata.js';

const argv = process.argv.slice(2);

async function main(): Promise<void> {
  if (hasVersionFlag(argv)) {
    console.log(getPackageVersion());
    return;
  }

  if (argv.includes('--json')) {
    const { runHeadlessApp } = await import('../headless/headlessApp.js');
    await runHeadlessApp({ argv });
    return;
  }

  const [{ launchShell }, { BRAND_CODE_PROFILE }] = await Promise.all([
    import('../shell/shellApp.js'),
    import('../core/brand.js'),
  ]);

  await launchShell(BRAND_CODE_PROFILE, { enableProfileSelection: true });
}

function hasVersionFlag(args: string[]): boolean {
  return args.some((arg) => arg === '--version' || arg === '-v');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
