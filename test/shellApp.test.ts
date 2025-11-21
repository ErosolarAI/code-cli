
import { launchShell } from '../src/shell/shellApp';
import { listAgentProfiles, registerAgentProfile } from '../src/core/agentProfiles';
import { InteractiveShell } from '../src/shell/interactiveShell';
import { expect } from 'node:assert';
import { vi } from 'vitest';

vi.mock('../src/shell/interactiveShell', () => {
  return {
    InteractiveShell: vi.fn().mockImplementation(() => {
      return {
        start: vi.fn(),
      };
    }),
  };
});

describe('launchShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide a default implementation for registerAgentProfile
    registerAgentProfile({
      name: 'default',
      label: 'Default Profile',
      defaultProvider: 'default',
      defaultModel: 'default',
      systemPromptConfig: {
        default: 'default',
      },
      defaultSystemPrompt: 'default',
      rulebook: {
        path: 'default',
      },
      manifestVersion: '1',
      manifestContractVersion: '1',
    });
  });
  
  it('should not throw an error', async () => {
    const profiles = listAgentProfiles();
    if (profiles.length > 0) {
      try {
        await launchShell(profiles[0].name);
        expect(InteractiveShell).toHaveBeenCalled();
      } catch (error) {
        expect.fail(`launchShell threw an error: ${error}`);
      }
    }
  });
});
