import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RepositoryEngineeringSnapshot {
  packageManager: string;
  workspaces: string[];
  stack: string[];
  qualitySignals: QualitySignals;
  keyConfigs: string[];
  notableDirs: string[];
  recommendedCommands: string[];
  gaps: string[];
  packageName?: string;
}

export interface QualitySignals {
  tests: string[];
  lint: string[];
  typecheck: string[];
  build: string[];
  coverage: string[];
  formatting: string[];
}

interface PackageJson {
  name?: string;
  packageManager?: string;
  workspaces?: string[] | { packages?: string[] };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const DEFAULT_PM = 'npm';
const KNOWN_CONFIGS = [
  'tsconfig.json',
  'tsconfig.base.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.cjs',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  'prettier.config.js',
  'prettier.config.cjs',
  'jest.config.js',
  'vitest.config.ts',
  'vitest.config.js',
  'playwright.config.ts',
  'playwright.config.js',
];
const NOTABLE_DIRS = [
  'src',
  'apps',
  'packages',
  'services',
  'examples',
  'scripts',
  'test',
  'tests',
  '__tests__',
  'docs',
];

const FRAMEWORK_HINTS = new Map<string, string>([
  ['next', 'Next.js'],
  ['react', 'React'],
  ['vite', 'Vite'],
  ['vue', 'Vue'],
  ['@angular/core', 'Angular'],
  ['@sveltejs/kit', 'SvelteKit'],
  ['svelte', 'Svelte'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
  ['koa', 'Koa'],
  ['hapi', 'hapi'],
  ['@nestjs/core', 'NestJS'],
  ['graphql', 'GraphQL'],
  ['apollo-server', 'Apollo'],
]);

const TEST_HINTS = ['vitest', 'jest', 'mocha', 'ava', 'uvu', 'tap', 'cypress', 'playwright'];
const LINT_HINTS = ['eslint', 'tslint', 'rome'];
const FORMAT_HINTS = ['prettier', '@biomejs/biome'];
const HEALTH_HINTS = ['health-check', 'healthcheck', 'doctor', 'checkup', 'validate'];

export function analyzeRepositoryEngineering(root: string): RepositoryEngineeringSnapshot | null {
  const pkg = readPackageJson(root);
  if (!pkg) {
    return null;
  }

  const scripts = pkg.scripts ?? {};
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const qualitySignals = collectQualitySignals(scripts, deps, root);
  const recommendedCommands = buildRecommendedCommands(
    qualitySignals,
    detectPackageManager(pkg, root),
    scripts,
  );

  return {
    packageManager: detectPackageManager(pkg, root),
    workspaces: detectWorkspaces(pkg),
    stack: buildStackHints(deps, scripts, root),
    qualitySignals,
    keyConfigs: detectConfigs(root),
    notableDirs: detectNotableDirs(root),
    recommendedCommands,
    gaps: collectGaps(qualitySignals, recommendedCommands),
    packageName: pkg.name,
  };
}

export function formatRepositoryEngineering(snapshot: RepositoryEngineeringSnapshot): string {
  const lines: string[] = ['Repository Engineering Snapshot'];

  const name = snapshot.packageName ? ` (${snapshot.packageName})` : '';
  lines.push(`- Package manager: ${snapshot.packageManager}${name}`);

  if (snapshot.workspaces.length) {
    lines.push(`- Workspaces: ${snapshot.workspaces.join(', ')}`);
  } else {
    lines.push('- Workspaces: none detected');
  }

  if (snapshot.stack.length) {
    lines.push(`- Stack: ${snapshot.stack.join(', ')}`);
  }

  lines.push(
    `- Quality signals: tests(${formatList(snapshot.qualitySignals.tests)}); lint(${formatList(snapshot.qualitySignals.lint)}); typecheck(${formatList(snapshot.qualitySignals.typecheck)}); build(${formatList(snapshot.qualitySignals.build)}); coverage(${formatList(snapshot.qualitySignals.coverage)}); formatting(${formatList(snapshot.qualitySignals.formatting)})`,
  );

  if (snapshot.keyConfigs.length) {
    lines.push(`- Key configs: ${snapshot.keyConfigs.join(', ')}`);
  }
  if (snapshot.notableDirs.length) {
    lines.push(`- Notable dirs: ${snapshot.notableDirs.join(', ')}`);
  }

  if (snapshot.recommendedCommands.length) {
    lines.push('\nRecommended commands:');
    snapshot.recommendedCommands.forEach((cmd) => lines.push(`- ${cmd}`));
  }

  if (snapshot.gaps.length) {
    lines.push('\nGaps to address:');
    snapshot.gaps.forEach((gap) => lines.push(`- ${gap}`));
  }

  return lines.join('\n');
}

function readPackageJson(root: string): PackageJson | null {
  try {
    const raw = readFileSync(join(root, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function detectPackageManager(pkg: PackageJson, root: string): string {
  if (pkg.packageManager) {
    const name = pkg.packageManager.split('@')[0] ?? DEFAULT_PM;
    return name || DEFAULT_PM;
  }
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  return DEFAULT_PM;
}

function detectWorkspaces(pkg: PackageJson): string[] {
  if (!pkg.workspaces) return [];
  if (Array.isArray(pkg.workspaces)) {
    return pkg.workspaces;
  }
  if (Array.isArray(pkg.workspaces.packages)) {
    return pkg.workspaces.packages;
  }
  return [];
}

function detectConfigs(root: string): string[] {
  return KNOWN_CONFIGS.filter((file) => existsSync(join(root, file)));
}

function detectNotableDirs(root: string): string[] {
  const entries = new Set(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && NOTABLE_DIRS.includes(entry.name))
      .map((entry) => (entry.name.endsWith('/') ? entry.name : `${entry.name}/`)),
  );
  return Array.from(entries);
}

function buildStackHints(
  deps: Record<string, string>,
  scripts: Record<string, string>,
  root: string,
): string[] {
  const stack = new Set<string>();

  if (existsSync(join(root, 'tsconfig.json')) || 'typescript' in deps) {
    stack.add('TypeScript');
  } else {
    stack.add('JavaScript');
  }

  for (const [pkg, label] of FRAMEWORK_HINTS) {
    if (pkg in deps) {
      stack.add(label);
    }
  }

  const scriptValues = Object.values(scripts).join(' ').toLowerCase();
  if (scriptValues.includes('node') && scriptValues.includes('bin')) {
    stack.add('CLI tooling');
  }

  return Array.from(stack);
}

function collectQualitySignals(
  scripts: Record<string, string>,
  deps: Record<string, string>,
  root: string,
): QualitySignals {
  const scriptKeys = new Set(Object.keys(scripts));
  const scriptValues = Object.values(scripts).join(' ').toLowerCase();

  const testScripts = findScriptMatches(scriptKeys, [
    'test',
    'tests',
    'unit',
    'integration',
    'e2e',
    'vitest',
    'jest',
    'mocha',
    'playwright',
  ]);
  const lintScripts = findScriptMatches(scriptKeys, [
    'lint',
    'lint:fix',
    'lint:ci',
    'eslint',
  ]);
  const typeScripts = findScriptMatches(scriptKeys, [
    'type-check',
    'typecheck',
    'types',
    'check',
  ]);
  const coverageScripts = findScriptMatches(scriptKeys, [
    'coverage',
    'test:coverage',
    'cov',
  ]);
  const formatScripts = findScriptMatches(scriptKeys, [
    'format',
    'fmt',
    'format:check',
    'prettier',
  ]);

  return {
    tests: mergeUnique(
      testScripts,
      findMatches(scriptKeys, scriptValues, TEST_HINTS, deps),
    ),
    lint: mergeUnique(
      lintScripts,
      findMatches(scriptKeys, scriptValues, LINT_HINTS, deps),
    ),
    typecheck: mergeUnique(
      typeScripts,
      collectTypecheck(scriptKeys, scripts, deps, root),
    ),
    build: findScriptMatches(scriptKeys, ['build', 'compile', 'bundle']),
    coverage: mergeUnique(
      coverageScripts,
      findMatches(scriptKeys, scriptValues, ['nyc', 'coverage'], deps),
    ),
    formatting: mergeUnique(
      formatScripts,
      findMatches(scriptKeys, scriptValues, FORMAT_HINTS, deps),
    ),
  };
}

function findMatches(
  scriptKeys: Set<string>,
  scriptValues: string,
  hints: string[],
  deps: Record<string, string>,
): string[] {
  const matches = new Set<string>();
  for (const hint of hints) {
    if (scriptKeys.has(hint) || scriptValues.includes(hint)) {
      matches.add(hint);
    }
    if (hint in deps) {
      matches.add(hint);
    }
  }
  return Array.from(matches);
}

function collectTypecheck(
  scriptKeys: Set<string>,
  scripts: Record<string, string>,
  deps: Record<string, string>,
  root: string,
): string[] {
  const matches = new Set<string>();
  for (const key of scriptKeys) {
    if (key.toLowerCase().includes('type') && key.toLowerCase().includes('check')) {
      matches.add(key);
    }
  }
  for (const [name, value] of Object.entries(scripts)) {
    if (value?.includes('tsc')) {
      matches.add(name);
    }
  }
  if ('typescript' in deps || existsSync(join(root, 'tsconfig.json'))) {
    matches.add('typescript');
  }
  return Array.from(matches);
}

function detectHealthScripts(
  scriptKeys: Set<string>,
  scripts: Record<string, string>,
): string[] {
  const matches = new Set<string>();
  const keyMatches = findScriptMatches(scriptKeys, HEALTH_HINTS);
  keyMatches.forEach((entry) => matches.add(entry));

  for (const [name, value] of Object.entries(scripts)) {
    const combined = `${name} ${value ?? ''}`.toLowerCase();
    if (
      combined.includes('health-check') ||
      combined.includes('healthcheck')
    ) {
      matches.add(name);
    } else if (
      combined.includes('health') ||
      combined.includes('doctor') ||
      combined.includes('validate')
    ) {
      matches.add(name);
    }
  }

  return Array.from(matches);
}

function findScriptMatches(scriptKeys: Set<string>, candidates: string[]): string[] {
  const matches = new Set<string>();
  for (const name of candidates) {
    if (scriptKeys.has(name)) {
      matches.add(name);
    }
    for (const script of scriptKeys) {
      if (script.toLowerCase().includes(name)) {
        matches.add(script);
      }
    }
  }
  return Array.from(matches);
}

function buildRecommendedCommands(
  signals: QualitySignals,
  packageManager: string,
  scripts: Record<string, string>,
): string[] {
  const ordered: string[] = [];
  const pm = normalizePackageManager(packageManager);
  const scriptKeys = new Set(Object.keys(scripts));

  const addCommand = (script: string) => {
    if (ordered.includes(script)) return;
    ordered.push(script);
  };

  const recommendScripts = (scripts: string[], preferred: string) => {
    if (!scripts.length) return;
    const script = scripts.includes(preferred) ? preferred : scripts[0]!;
    addCommand(formatScript(pm, script));
  };

  const healthScripts = detectHealthScripts(scriptKeys, scripts);
  recommendScripts(healthScripts, 'health-check');
  recommendScripts(signals.tests, 'test');
  recommendScripts(signals.lint, 'lint');
  recommendScripts(signals.typecheck, 'type-check');
  recommendScripts(signals.coverage, 'coverage');
  recommendScripts(signals.build, 'build');

  return ordered;
}

function collectGaps(signals: QualitySignals, recommended: string[]): string[] {
  const gaps: string[] = [];
  if (!signals.tests.length) {
    gaps.push('No test script or framework detected.');
  }
  if (!signals.lint.length) {
    gaps.push('Linters not detected (add eslint/rome and a lint script).');
  }
  if (!signals.typecheck.length && !signals.build.some((name) => name.includes('tsc'))) {
    gaps.push('Type checking not detected; expose a type-check script.');
  }
  if (!signals.coverage.length) {
    gaps.push('Coverage command not found.');
  }
  if (!signals.formatting.length) {
    gaps.push('Formatter not detected (prettier/biome).');
  }
  if (!recommended.length) {
    gaps.push('No runnable scripts identified.');
  }
  return gaps;
}

function normalizePackageManager(pm: string): 'npm' | 'yarn' | 'pnpm' {
  if (pm === 'yarn') return 'yarn';
  if (pm === 'pnpm') return 'pnpm';
  return 'npm';
}

function formatScript(packageManager: 'npm' | 'yarn' | 'pnpm', script: string): string {
  if (packageManager === 'npm') {
    return script === 'test' ? 'npm test' : `npm run ${script}`;
  }
  if (packageManager === 'yarn') {
    return script === 'test' ? 'yarn test' : `yarn ${script}`;
  }
  return script === 'test' ? 'pnpm test' : `pnpm run ${script}`;
}

function formatList(values: string[]): string {
  if (!values.length) return 'none';
  return values.join(', ');
}

function mergeUnique(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const entry of list) {
      if (!entry || seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      merged.push(entry);
    }
  }
  return merged;
}
