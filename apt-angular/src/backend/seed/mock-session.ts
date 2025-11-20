import {
  ChatMessage,
  OpsEvent,
  SessionSnapshot,
  Shortcut,
  StreamMeter,
} from '../../shared/session-models';

export const mockChatMessages: ChatMessage[] = [
  {
    id: 'user-boot',
    agent: 'user',
    timestamp: '12:40:03',
    title: 'you · tmux pane 1',
    caption: '~/GitHub/angular-tailwind',
    command: 'bo --profile bo-code --json stream',
    body: [
      'request: replace the placeholder marketing layout with the actual CLI chat feed.',
      'the browser view should feel identical to a Bo CLI session (general + bo-code).',
      'show live diffs, command cues, and the dual-profile log so reviewers trust it.'
    ],
    status: 'command dispatched'
  },
  {
    id: 'bo-plan',
    agent: 'bo',
    timestamp: '12:40:07',
    title: 'bo (general) · planning',
    caption: 'stack depth 4 · angular context',
    body: [
      '- scanning workspace and tailwind config...',
      '- ripping out hero gradient panes...',
      '- composing CLI chrome + mirrored chat feed for bo.'
    ],
    status: 'thinking 1.3k tok/s',
    tokens: 'buffer 72%',
    streaming: true,
    extensions: [
      {
        id: 'plan-tool-usage',
        kind: 'tool-usage',
        label: 'plan',
        description: 'Planning stack depth breakdown',
        data: {
          graph: [
            { tool: 'repo.scan', durationMs: 2200 },
            { tool: 'tailwind.audit', durationMs: 940 }
          ]
        }
      }
    ]
  },
  {
    id: 'bo-code-diff',
    agent: 'bo-code',
    timestamp: '12:40:13',
    title: 'bo code · patch builder',
    caption: 'src/app/app.*',
    body: [
      'patched component data model into chatMessages + meters.',
      'rewired template so both bo profiles render like the terminal.',
      'poured new terminal/tmux styling into the Tailwind layer.'
    ],
    status: 'diff streaming',
    tokens: '980 tok/s · 54ms',
    diff: [
      { kind: 'context', text: 'diff --git a/src/app/app.ts b/src/app/app.ts' },
      { kind: 'context', text: '@@ -1,34 +1,74 @@' },
      { kind: 'remove', text: '-  protected readonly streams: StreamChannel[] = [' },
      { kind: 'add', text: '+  protected readonly chatMessages: ChatMessage[] = [' },
      { kind: 'context', text: '  ...' }
    ],
    footer: 'applied patch to workspace · ready for sync'
  },
  {
    id: 'bo-verify',
    agent: 'bo',
    timestamp: '12:40:19',
    title: 'bo (general) · verify',
    caption: 'npm start · smoke checks',
    body: [
      '- viewport now mirrors CLI chrome with shared scrollback.',
      '- keyboard map + telemetry panes wired to live data.',
      '- ready to share using bo share --live.'
    ],
    status: 'tests pass',
    tokens: 'signal 98%',
    footer: 'sync contexts to keep bo general + code aligned.'
  }
];

export const mockStreamMeters: StreamMeter[] = [
  {
    label: 'Bo (general)',
    value: 'streaming',
    detail: '1.2k tok/s · latency 72ms',
    tone: 'success'
  },
  {
    label: 'Bo Code',
    value: 'diffing',
    detail: '980 tok/s · tmux :2',
    tone: 'info'
  },
  {
    label: 'Workspace sync',
    value: 'clean',
    detail: '/Users/bo/GitHub/angular-tailwind',
    tone: 'success'
  },
  {
    label: 'Merge risk',
    value: '12%',
    detail: 'watching dependency drift',
    tone: 'warn'
  }
];

export const mockOpsEvents: OpsEvent[] = [
  {
    label: 'npm run start',
    detail: 'dev server watch · port 4200',
    meta: '00:03:11 · ok',
    tone: 'info'
  },
  {
    label: 'ng test --watch',
    detail: '18 suites · 96% coverage',
    meta: 'pass',
    tone: 'success'
  },
  {
    label: 'git status',
    detail: 'working tree clean',
    meta: 'ready for share',
    tone: 'success'
  }
];

export const mockShortcuts: Shortcut[] = [
  { keys: 'Shift+Enter', description: 'Send to Bo CLI' },
  { keys: 'Cmd+.', description: 'Interrupt streaming response' },
  { keys: 'Ctrl+K', description: 'Merge Bo general + code buffers' },
  { keys: 'Esc', description: 'Jump back to terminal input' }
];

export const mockSnapshot: SessionSnapshot = {
  sessionId: 'mock-local',
  source: 'mock',
  chatMessages: mockChatMessages,
  streamMeters: mockStreamMeters,
  opsEvents: mockOpsEvents,
  shortcuts: mockShortcuts,
  status: {
    label: 'bo-cli://mock',
    detail: 'dual-profile mirror (sample data)',
    tone: 'info'
  }
};
