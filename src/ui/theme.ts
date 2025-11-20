import chalk from 'chalk';
import gradientString from 'gradient-string';

type Colorize = (value: string) => string;

/**
 * Theme system matching the Bo CLI aesthetics
 */
export const theme = {
  primary: chalk.hex('#22D3EE'), // Electric cyan
  secondary: chalk.hex('#F472B6'), // Rose
  accent: chalk.hex('#F97316'), // Ember
  success: chalk.hex('#22C55E'), // Emerald
  warning: chalk.hex('#FACC15'), // Sunrise
  error: chalk.hex('#F43F5E'), // Rose red
  info: chalk.hex('#60A5FA'), // Sky

  dim: chalk.dim,
  bold: chalk.bold,
  italic: chalk.italic,
  underline: chalk.underline,

  gradient: {
    primary: gradientString(['#22D3EE', '#60A5FA', '#A855F7']),
    cool: gradientString(['#0EA5E9', '#22D3EE', '#14B8A6']),
    warm: gradientString(['#F97316', '#FB7185', '#F472B6']),
    horizon: gradientString(['#22C55E', '#F97316', '#F472B6']),
    success: gradientString(['#16A34A', '#22C55E', '#86EFAC']),
    aurora: gradientString(['#0EA5E9', '#22D3EE', '#A855F7', '#F472B6']),
    plasma: gradientString(['#0EA5E9', '#6366F1', '#F59E0B']),
    ember: gradientString(['#FB923C', '#F43F5E', '#A855F7']),
  },

  ui: {
    border: chalk.hex('#1F2937'),
    panelEdge: chalk.hex('#67E8F9'),
    background: chalk.bgHex('#050914'),
    surface: chalk.bgHex('#0B1220'),
    glass: chalk.bgHex('#0F1B34'),
    haze: chalk.bgHex('#0A1428'),
    userPromptBackground: chalk.bgHex('#0EA5E9'),
    muted: chalk.hex('#94A3B8'),
    text: chalk.hex('#E2E8F0'),
  },

  metrics: {
    elapsedLabel: chalk.hex('#22D3EE').bold,
    elapsedValue: chalk.hex('#FB7185'),
  },

  fields: {
    label: chalk.hex('#67E8F9').bold,
    agent: chalk.hex('#F472B6'),
    profile: chalk.hex('#22D3EE'),
    model: chalk.hex('#A855F7'),
    workspace: chalk.hex('#F97316'),
  },

  link: {
    label: chalk.hex('#22D3EE').underline,
    url: chalk.hex('#F59E0B'),
  },

  diff: {
    header: chalk.hex('#FACC15'),
    hunk: chalk.hex('#38BDF8'),
    added: chalk.hex('#22C55E'),
    removed: chalk.hex('#F43F5E'),
    meta: chalk.hex('#94A3B8'),
  },

  user: chalk.hex('#22D3EE'),
  assistant: chalk.hex('#F472B6'),
  system: chalk.hex('#94A3B8'),
  tool: chalk.hex('#22C55E'),
};

/**
 * Claude Code style icons
 * Following the official Claude Code UI conventions:
 * - ⏺ (action): Used for tool calls, actions, and thinking/reasoning
 * - ⎿ (subaction): Used for results, details, and nested information
 * - ─ (separator): Horizontal lines for dividing sections (not in this object)
 * - > (user prompt): User input prefix (used in formatUserPrompt)
 */
export const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  arrow: '→',
  bullet: '•',
  thinking: '◐',
  tool: '⚙',
  user: '❯',
  assistant: '◆',
  loading: '⣾',
  action: '⏺',      // Claude Code: tool actions and thoughts
  subaction: '⎿',   // Claude Code: results and details
};

export function formatBanner(profileLabel: string, model: string): string {
  const name = profileLabel || 'Agent';
  const title = theme.gradient.primary(name);
  const subtitle = theme.ui.muted(`${model} • Interactive Shell`);

  return `\n${title}\n${subtitle}\n`;
}

export function formatUserPrompt(_profile?: string): string {
  const border = theme.ui.border('│');
  const glyph = theme.user('>');
  const padded = `${theme.ui.text(' ')}${glyph}${theme.ui.text(' ')}`;
  const background = theme.ui.userPromptBackground ?? theme.ui.background;
  const tinted = background(theme.bold(padded));
  return `${border}${tinted} `;
}

export function formatToolCall(name: string, status: 'running' | 'success' | 'error'): string {
  const statusIcon = status === 'running' ? icons.thinking :
                     status === 'success' ? icons.success : icons.error;
  const statusColor = status === 'running' ? theme.info :
                      status === 'success' ? theme.success : theme.error;

  return `${statusColor(statusIcon)} ${theme.tool(name)}`;
}

export function formatMessage(role: 'user' | 'assistant' | 'system', content: string): string {
  switch (role) {
    case 'user':
      return `${theme.user('You:')} ${content}`;
    case 'assistant':
      return `${theme.assistant('Assistant:')} ${content}`;
    case 'system':
      return theme.system(`[System] ${content}`);
  }
}

export interface ProviderAccent {
  edge: Colorize;
  text: Colorize;
  motif?: Colorize;
  panel?: Colorize;
}

export function pickProviderAccent(provider: string | undefined | null): ProviderAccent {
  const normalized = provider?.toLowerCase() ?? '';
  const baseEdge = (value: string) => value;

  if (normalized.includes('anthropic') || normalized.includes('claude')) {
    const chroma = (theme.gradient?.warm as Colorize | undefined) ?? theme.secondary;
    return {
      edge: chroma,
      text: theme.secondary,
      motif: chroma,
      panel: chroma,
    };
  }

  if (normalized.includes('openai') || normalized.includes('gpt')) {
    const chroma = (theme.gradient?.cool as Colorize | undefined) ?? theme.info;
    return {
      edge: chroma,
      text: theme.info,
      motif: chroma,
      panel: chroma,
    };
  }

  if (normalized.includes('google') || normalized.includes('gemini')) {
    const chroma = (theme.gradient?.horizon as Colorize | undefined) ?? theme.warning;
    return {
      edge: chroma,
      text: theme.warning,
      motif: chroma,
      panel: chroma,
    };
  }

  if (normalized.includes('azure')) {
    const chroma = (theme.gradient?.primary as Colorize | undefined) ?? theme.primary;
    return {
      edge: chroma,
      text: theme.primary,
      motif: chroma,
      panel: chroma,
    };
  }

  return {
    edge: (theme.gradient?.primary as Colorize | undefined) ?? baseEdge,
    text: theme.secondary,
    motif: (theme.gradient?.primary as Colorize | undefined) ?? theme.secondary,
    panel: (theme.gradient?.primary as Colorize | undefined) ?? theme.primary,
  };
}
