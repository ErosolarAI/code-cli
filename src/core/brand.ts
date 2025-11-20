import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const BRAND_NAME = 'Bo';
export const LEGACY_BRAND_NAMES = ['APT', 'Erosolar'] as const;
export const BRAND_CLI_NAME = 'bo';
export const LEGACY_CLI_NAMES = ['apt'] as const;
export const BRAND_CODE_PROFILE = 'bo-code';
export const LEGACY_CODE_PROFILES = ['bo-code', 'erosolar-code'] as const;
export const BRAND_DOT_DIR = '.bo';
export const LEGACY_DOT_DIRS = ['.apt', '.erosolar'] as const;
export const BRAND_UI_DOT_DIR = '.bo-ui';
export const LEGACY_UI_DOT_DIRS = ['.bo-ui', '.erosolar-ui'] as const;

const ENV_PREFIXES = ['BO', 'APT', 'EROSOLAR'] as const;

export function pickBrandEnv(env: NodeJS.ProcessEnv, suffix: string): string | null {
  for (const prefix of ENV_PREFIXES) {
    const value = env[`${prefix}_${suffix}`];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = pickBrandEnv(env, 'DATA_DIR') ?? pickBrandEnv(env, 'HOME');
  if (override) {
    return override;
  }

  const preferred = join(homedir(), BRAND_DOT_DIR);
  const fallbacks = LEGACY_DOT_DIRS.map((dir) => join(homedir(), dir));

  if (!existsSync(preferred)) {
    const existing = fallbacks.find((candidate) => existsSync(candidate));
    if (existing) {
      return existing;
    }
  }

  return preferred;
}

export function resolveUiDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = pickBrandEnv(env, 'UI_DATA_DIR');
  if (override) {
    return override;
  }

  const preferred = join(homedir(), BRAND_UI_DOT_DIR);
  const fallbacks = LEGACY_UI_DOT_DIRS.map((dir) => join(homedir(), dir));

  if (!existsSync(preferred)) {
    const existing = fallbacks.find((candidate) => existsSync(candidate));
    if (existing) {
      return existing;
    }
  }

  return preferred;
}

export function resolveCommandsDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = pickBrandEnv(env, 'COMMANDS_DIR');
  if (override) {
    return override;
  }
  return join(resolveDataDir(env), 'commands');
}

export function resolveTasksDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDataDir(env), 'tasks');
}

export function resolveSkillSearchDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const envDirs = (pickBrandEnv(env, 'SKILLS_DIRS') ?? '')
    .split(':')
    .map((dir) => dir.trim())
    .filter(Boolean);

  return dedupeStrings([
    ...envDirs,
    'skills',
    '.claude/skills',
    `${BRAND_DOT_DIR}/skills`,
    ...LEGACY_DOT_DIRS.map((dir) => `${dir}/skills`),
  ]);
}

export function resolveProfileOverride(env: NodeJS.ProcessEnv = process.env): string | null {
  return pickBrandEnv(env, 'PROFILE');
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
