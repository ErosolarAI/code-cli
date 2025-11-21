import type { ProfileName } from '../config.js';
import type { AgentProfileBlueprint } from '../core/agentProfiles.js';

export interface ParsedLaunchArguments {
  profileOverride: string | null;
  promptArgs: string[];
}

export interface ProfileResolutionInput {
  defaultProfile: ProfileName;
  availableProfiles: AgentProfileBlueprint[];
  cliOverride: string | null;
  envOverride: string | null;
  savedProfile: ProfileName | null;
  allowSavedProfile: boolean;
}

export function parseLaunchArguments(argv: string[]): ParsedLaunchArguments {
  const promptArgs: string[] = [];
  let override: string | null = null;

  const expectValue = (flag: string, value: string | undefined): string => {
    if (value && value.trim()) {
      return value.trim();
    }
    throw new Error(`Missing value for ${flag}.`);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === '--profile' || token === '-p') {
      const value = expectValue(token, argv[index + 1]);
      override = value;
      index += 1;
      continue;
    }

    if (token.startsWith('--profile=')) {
      const [, candidate] = token.split('=');
      if (!candidate?.trim()) {
        throw new Error('Missing value for --profile.');
      }
      override = candidate.trim();
      continue;
    }

    promptArgs.push(token);
  }

  return {
    profileOverride: override,
    promptArgs,
  };
}

export function resolveLaunchProfile(
  input: ProfileResolutionInput,
): ProfileName {
  if (input.cliOverride) {
    const resolved = matchProfile(input.cliOverride, input.availableProfiles);
    if (!resolved) {
      throw new Error(
        `Unknown agent profile "${input.cliOverride}". Run "/agents" to view available options.`,
      );
    }
    return resolved;
  }

  if (input.envOverride?.trim()) {
    const resolved = matchProfile(input.envOverride, input.availableProfiles);
    if (!resolved) {
      throw new Error(
        `Unknown agent profile "${input.envOverride}" provided via BO_PROFILE (or legacy APT_PROFILE).`,
      );
    }
    return resolved;
  }

  if (input.allowSavedProfile) {
    const saved = matchProfile(input.savedProfile, input.availableProfiles);
    if (saved) {
      return saved;
    }
  }

  const fallback = matchProfile(input.defaultProfile, input.availableProfiles);
  if (fallback) {
    return fallback;
  }

  throw new Error('No registered CLI profile is available.');
}

function matchProfile(
  candidate: string | null | undefined,
  availableProfiles: ProfileResolutionInput['availableProfiles'],
): ProfileName | null {
  if (!candidate) {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const match = availableProfiles.find(
    (profile) => profile.name.toLowerCase() === lower,
  );
  return match ? (match.name as ProfileName) : null;
}
