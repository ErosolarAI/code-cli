import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PackageVersionOptions {
  packagePath?: string;
  fallbackVersion?: string;
  cache?: boolean;
}

const versionCache = new Map<string, string>();

function defaultPackagePath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../../package.json');
}

/**
 * Read the package version from package.json with a cached fallback to avoid
 * repeated filesystem reads. When cache is disabled, the version is read
 * fresh and does not update the cache.
 */
export function getPackageVersion(
  options: PackageVersionOptions = {},
): string {
  const packagePath = options.packagePath ?? defaultPackagePath();
  const fallback = options.fallbackVersion ?? '0.0.0';
  const useCache = options.cache !== false;

  if (useCache && versionCache.has(packagePath)) {
    return versionCache.get(packagePath)!;
  }

  try {
    const contents = readFileSync(packagePath, 'utf8');
    const payload = JSON.parse(contents) as { version?: unknown };
    const version =
      typeof payload.version === 'string' ? payload.version : fallback;

    if (useCache) {
      versionCache.set(packagePath, version);
    }
    return version;
  } catch {
    if (useCache) {
      versionCache.set(packagePath, fallback);
    }
    return fallback;
  }
}

export function clearPackageMetadataCache(): void {
  versionCache.clear();
}
