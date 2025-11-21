import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProfileName } from '../src/config.js';
import type { AgentProfileBlueprint } from '../src/core/agentProfiles.js';
import {
  parseLaunchArguments,
  resolveLaunchProfile,
} from '../src/shell/launchOptions.js';

const profile = (name: string): AgentProfileBlueprint => ({
  name,
  label: name,
  defaultProvider: 'test-provider',
  defaultModel: 'test-model',
  systemPromptConfig: { type: 'literal', content: 'hello' },
  defaultSystemPrompt: 'hello',
  rulebook: { file: 'rules.md', version: '1.0.0', contractVersion: '1.0.0' },
  manifestVersion: '1.0.0',
  manifestContractVersion: '1.0.0',
});

test('parseLaunchArguments extracts profile override and prompt args', () => {
  const result = parseLaunchArguments(['--profile', 'dev', 'edit', 'file.ts']);
  assert.equal(result.profileOverride, 'dev');
  assert.deepEqual(result.promptArgs, ['edit', 'file.ts']);

  const inline = parseLaunchArguments(['--profile=Prod', 'deploy']);
  assert.equal(inline.profileOverride, 'Prod');
  assert.deepEqual(inline.promptArgs, ['deploy']);
});

test('parseLaunchArguments throws on missing profile value', () => {
  assert.throws(
    () => parseLaunchArguments(['--profile']),
    /Missing value for --profile/,
  );
});

test('resolveLaunchProfile prefers CLI override, then env, then saved profile', () => {
  const available = [profile('bo-code'), profile('ops')];
  const baseInput = {
    defaultProfile: 'bo-code' as ProfileName,
    availableProfiles: available,
    savedProfile: 'ops' as ProfileName,
    allowSavedProfile: true,
  };

  const cliSelected = resolveLaunchProfile({
    ...baseInput,
    cliOverride: 'OPS',
    envOverride: null,
  });
  assert.equal(cliSelected, 'ops');

  const envSelected = resolveLaunchProfile({
    ...baseInput,
    cliOverride: null,
    envOverride: 'bo-code',
  });
  assert.equal(envSelected, 'bo-code');

  const savedSelected = resolveLaunchProfile({
    ...baseInput,
    cliOverride: null,
    envOverride: null,
  });
  assert.equal(savedSelected, 'ops');
});

test('resolveLaunchProfile falls back to default and errors on unknown profiles', () => {
  const available = [profile('default'), profile('secondary')];
  const resolved = resolveLaunchProfile({
    defaultProfile: 'secondary' as ProfileName,
    availableProfiles: available,
    cliOverride: null,
    envOverride: null,
    savedProfile: null,
    allowSavedProfile: false,
  });
  assert.equal(resolved, 'secondary');

  assert.throws(
    () =>
      resolveLaunchProfile({
        defaultProfile: 'missing' as ProfileName,
        availableProfiles: available,
        cliOverride: 'unknown',
        envOverride: null,
        savedProfile: null,
        allowSavedProfile: false,
      }),
    /Unknown agent profile "unknown"/,
  );
});
