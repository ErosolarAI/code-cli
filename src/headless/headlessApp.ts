import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { exit, stdin, stdout } from 'node:process';
import '../config.js';
import type { ProfileName } from '../config.js';
import { listAgentProfiles } from '../core/agentProfiles.js';
import type {
  AgentEventUnion,
  CapabilityManifest,
} from '../contracts/v1/agent.js';
import { createAgentController } from '../runtime/agentController.js';
import {
  resolveWorkspaceCaptureOptions,
  buildWorkspaceContext,
} from '../workspace.js';
import { BRAND_CODE_PROFILE, resolveProfileOverride } from '../core/brand.js';
import { resolveLaunchProfile } from '../shell/launchOptions.js';
import { getPackageVersion } from '../utils/packageMetadata.js';

interface ParsedHeadlessArgs {
  profile?: string;
  sessionId?: string;
  initialPrompt?: string | null;
  watchStdIn: boolean;
}

interface EventEnvelopeBase {
  sessionId: string;
  profile: ProfileName;
}

type HeadlessStreamEvent =
  | (EventEnvelopeBase & {
      type: 'session';
      manifest: CapabilityManifest;
      workingDir: string;
      workspaceContext: string | null;
      version: string;
    })
  | (EventEnvelopeBase & {
      type: 'user-input';
      runId: string;
      content: string;
    })
  | (EventEnvelopeBase & {
      type: 'agent-event';
      runId: string;
      event: AgentEventUnion;
    })
  | (EventEnvelopeBase & {
      type: 'run-complete';
      runId: string;
    })
  | (EventEnvelopeBase & {
      type: 'error';
      runId?: string;
      message: string;
    });

interface PromptWork {
  id: string;
  prompt: string;
}

export interface HeadlessLaunchOptions {
  argv: string[];
}

export async function runHeadlessApp(
  options: HeadlessLaunchOptions,
): Promise<void> {
  const parsed = parseHeadlessArgs(options.argv);
  const availableProfiles = listAgentProfiles();
  const profile = resolveLaunchProfile({
    defaultProfile: BRAND_CODE_PROFILE,
    availableProfiles,
    cliOverride: parsed.profile ?? null,
    envOverride: resolveProfileOverride(),
    savedProfile: null,
    allowSavedProfile: false,
  });
  const sessionId = parsed.sessionId ?? randomUUID();
  const workingDir = process.cwd();
  const workspaceOptions = resolveWorkspaceCaptureOptions(process.env);
  const workspaceContext = buildWorkspaceContext(workingDir, workspaceOptions);

  const controller = await createAgentController({
    profile,
    workingDir,
    workspaceContext,
    env: process.env,
  });

  const persistAndExit = (code: number): void => {
    exit(code);
  };

  const manifest = controller.getCapabilities();
  emitEvent({
    type: 'session',
    sessionId,
    profile,
    manifest,
    workingDir,
    workspaceContext,
    version: getPackageVersion(),
  });

  const queue: PromptWork[] = [];
  let processing = false;
  let stdinClosed = !parsed.watchStdIn;

  const enqueuePrompt = (prompt: string) => {
    const content = prompt.trim();
    if (!content) {
      return;
    }
    queue.push({ id: randomUUID(), prompt: content });
    void processQueue();
  };

  const processQueue = async () => {
    if (processing) {
      return;
    }
    processing = true;
    while (queue.length) {
      const next = queue.shift()!;
      await handlePrompt(next).catch((error: unknown) => {
        emitEvent({
          type: 'error',
          sessionId,
          profile,
          runId: next.id,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
    processing = false;
    if (stdinClosed) {
      persistAndExit(0);
    }
  };

  const handlePrompt = async (work: PromptWork): Promise<void> => {
    emitEvent({
      type: 'user-input',
      sessionId,
      profile,
      runId: work.id,
      content: work.prompt,
    });
    for await (const event of controller.send(work.prompt)) {
      emitEvent({
        type: 'agent-event',
        sessionId,
        profile,
        runId: work.id,
        event,
      });
    }
    emitEvent({ type: 'run-complete', sessionId, profile, runId: work.id });
  };

  if (parsed.initialPrompt) {
    enqueuePrompt(parsed.initialPrompt);
  }

  if (parsed.watchStdIn) {
    const rl = readline.createInterface({ input: stdin, terminal: false });
    rl.on('line', (line) => {
      enqueuePrompt(line);
    });
    rl.on('close', () => {
      stdinClosed = true;
      if (!processing) {
        persistAndExit(0);
      }
    });
  } else if (!parsed.initialPrompt) {
    // Nothing to do in headless mode without stdin or an initial prompt
    emitEvent({
      type: 'error',
      sessionId,
      profile,
      message: 'Headless mode requires stdin or a prompt argument.',
    });
    persistAndExit(1);
  }

  stdin.resume();
}

function parseHeadlessArgs(argv: string[]): ParsedHeadlessArgs {
  let profile: string | undefined;
  let sessionId: string | undefined;
  let watchStdIn = true;
  const promptTokens: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === '--json') {
      continue;
    }
    if (token === '--profile' || token === '-p') {
      profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--profile=')) {
      profile = token.slice('--profile='.length);
      continue;
    }
    if (token === '--session-id') {
      sessionId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--session-id=')) {
      sessionId = token.slice('--session-id='.length);
      continue;
    }
    if (token === '--no-stdin') {
      watchStdIn = false;
      continue;
    }
    promptTokens.push(token);
  }

  return {
    profile,
    sessionId,
    watchStdIn,
    initialPrompt: promptTokens.length ? promptTokens.join(' ').trim() : null,
  };
}

function emitEvent(event: HeadlessStreamEvent): void {
  stdout.write(`${JSON.stringify(event)}\n`);
}
