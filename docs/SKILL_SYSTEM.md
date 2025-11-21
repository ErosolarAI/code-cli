# Skill System Overview

Bo CLI includes a **Skill** system so you can bundle reusable workflows, policies, and domain knowledge inside
`SKILL.md` packages. Skills are automatically discovered and exposed through the `ListSkills` and `Skill` tools plus a
`/skills` slash command (see README).

## Where skills live

The CLI scans these locations (in order of precedence):

1. `<workspace>/skills/**/SKILL.md`
2. `<workspace>/.claude/skills/**/SKILL.md` (legacy compatibility)
3. `<workspace>/.bo/skills/**/SKILL.md`
4. Any nested directory under the workspace that contains a `SKILL.md` (e.g. `extensions/plugins/plugin-dev/skills/*/SKILL.md`)
5. `~/.claude/skills/**/SKILL.md` (legacy compatibility)
6. `~/.bo/skills/**/SKILL.md`
7. Any directory listed in `BO_SKILLS_DIRS` (legacy `APT_SKILLS_DIRS` still respected; use `:` as the separator, `;` on Windows)

Each skill directory may also contain optional `references/`, `scripts/`, and `assets/` folders. The loader emits a
resource inventory so the model knows which supporting files exist before reading them.

## Tooling

| Tool         | Description                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `ListSkills` | Scans for all SKILL packages and prints name, namespace-qualified slug, path, and resources.    |
| `Skill`      | Loads a single SKILL by name/slug/path and returns metadata, body, and optional resource lists. |

Both tools accept `refresh_cache: true` to force a re-scan when new skills are added during a live session.

## Output format

`ListSkills` emits compact summaries:

```
ListSkills {}
```

> Discovered 3 skills:
>
> - plugin-dev:command-development — Command authoring workflow for plugins
>   Source: workspace:skills • Path: extensions/plugins/plugin-dev/skills/command-development
>   Body ✅ | References ✅ | Scripts ✅ | Assets —

`Skill` emits a Markdown document that includes:

- ID + namespace + absolute/relative path
- Front-matter metadata (description, version, custom keys)
- Full SKILL body (procedures, guidance, triggers, etc.)
- Inventories for `references/`, `scripts/`, and `assets/` with human-readable sizes

Example:

```
Skill {
  "skill": "plugin-dev:skill-development",
  "sections": ["metadata", "body", "references"]
}
```

## Tips

- Store private or workspace-specific skills under `.bo/skills` (`.claude/skills` still works for legacy projects) so they remain Git-ignored while still discoverable.
- Use namespaces (e.g. `plugin-dev:skill-development`) to avoid collisions; they are derived from the directory path.
- Keep SKILL front matter up to date—`name`, `description`, and `version` are all surfaced to the AI before loading the
  full body.
- When bundling large reference files, prefer the `references/` directory so the agent can selectively `read_file` them
  instead of bloating the main SKILL body.
