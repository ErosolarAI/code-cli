import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export interface SkillRepositoryOptions {
  workingDir: string;
  env?: Record<string, string>;
}

export interface SkillRecord {
  id: string;
  slug: string;
  name: string;
  namespace: string;
  description?: string;
  version?: string;
  hasReferences: boolean;
  hasScripts: boolean;
  hasAssets: boolean;
  path: string;
}

export class SkillRepository {
  private skills: SkillRecord[] = [];
  private readonly root: string;

  constructor(options: SkillRepositoryOptions) {
    this.root = options.workingDir;
    this.refresh();
  }

  listSkills(): SkillRecord[] {
    return [...this.skills];
  }

  getSkill(identifier: string): SkillRecord | undefined {
    return this.skills.find((skill) => skill.id === identifier || skill.slug === identifier);
  }

  refresh(): void {
    this.skills = this.scanSkills();
  }

  private scanSkills(): SkillRecord[] {
    const discovered: SkillRecord[] = [];
    for (const file of this.walkForSkills(this.root)) {
      const record = this.buildSkillRecord(file);
      if (record) {
        discovered.push(record);
      }
    }
    return discovered;
  }

  private *walkForSkills(directory: string): Generator<string> {
    const entries = readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* this.walkForSkills(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') {
        yield fullPath;
      }
    }
  }

  private buildSkillRecord(filePath: string): SkillRecord | null {
    const skillDir = dirname(filePath);
    const relativeDir = relative(this.root, skillDir);
    if (relativeDir.startsWith('..')) {
      return null;
    }

    const segments = relativeDir.split(/[/\\]+/).filter(Boolean);
    const dirName = segments.at(-1) ?? '';
    const namespace = segments
      .slice(0, -1)
      .filter((segment) => segment !== 'skills')
      .join(':');

    const frontMatter = this.parseFrontMatter(readFileSync(filePath, 'utf8'));
    const baseName = frontMatter['name'] ?? dirName;
    const slug = this.toSlug(baseName || dirName);
    const id = namespace ? `${namespace}:${slug}` : slug;
    const hasReferences = this.hasFiles(join(skillDir, 'references'));
    const hasScripts = this.hasFiles(join(skillDir, 'scripts'));
    const hasAssets = this.hasFiles(join(skillDir, 'assets'));

    return {
      id,
      slug,
      name: frontMatter['name'] ?? slug,
      description: frontMatter['description'],
      version: frontMatter['version'],
      namespace,
      hasReferences,
      hasScripts,
      hasAssets,
      path: filePath,
    };
  }

  private toSlug(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || value
    );
  }

  private parseFrontMatter(content: string): Record<string, string> {
    if (!content.startsWith('---')) {
      return {};
    }

    const end = content.indexOf('---', 3);
    if (end === -1) {
      return {};
    }

    const lines = content
      .slice(3, end)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const result: Record<string, string> = {};
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(':');
      if (!rawKey || !rest.length) {
        continue;
      }
      const key = rawKey.trim();
      const value = rest.join(':').trim();
      if (key) {
        result[key] = value;
      }
    }
    return result;
  }

  private hasFiles(directory: string): boolean {
    try {
      if (!existsSync(directory)) {
        return false;
      }
      const stats = statSync(directory);
      if (!stats.isDirectory()) {
        return false;
      }
      const entries = readdirSync(directory);
      return entries.length > 0;
    } catch {
      return false;
    }
  }
}
