import { OpenAIResponsesProvider } from '../../../providers/openaiResponsesProvider.js';
import { registerProvider } from '../../../providers/providerFactory.js';
import type { ProviderId } from '../../../core/types.js';

let registered = false;

export function registerNsaLocalProviderPlugin(
  providerId: ProviderId = 'nsa-local',
): void {
  if (registered) {
    return;
  }

  registerProvider(providerId, (config) => {
    const baseURL = requireEnv('NSA_LLM_BASE_URL');
    const apiKey = requireEnv('NSA_LLM_API_KEY');

    return new OpenAIResponsesProvider({
      apiKey,
      baseURL,
      model: config.model,
      providerId,
      ...(config.reasoningEffort
        ? { reasoningEffort: config.reasoningEffort }
        : {}),
      ...(config.textVerbosity ? { textVerbosity: config.textVerbosity } : {}),
    });
  });

  registered = true;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}
