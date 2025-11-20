import { icons, theme } from './theme.js';
import {
  getContentWidth,
  normalizePanelWidth,
  renderPanel,
  wrapParagraph,
  type Colorize,
  measure,
} from './layout.js';

export type VisualTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const toneColors: Record<VisualTone, Colorize> = {
  neutral: theme.ui.text,
  info: theme.info,
  success: theme.success,
  warning: theme.warning,
  danger: theme.error,
  accent: theme.secondary,
};

export interface StatusSegment {
  label: string;
  value: string;
  tone?: VisualTone;
  icon?: string;
}

export interface StatusBarOptions {
  width?: number;
}

export interface CalloutOptions {
  title?: string;
  icon?: string;
  tone?: VisualTone;
  width?: number;
}

export interface SectionHeadingOptions {
  subtitle?: string;
  icon?: string;
  tone?: VisualTone;
  width?: number;
}

export function renderStatusBar(segments: StatusSegment[], options: StatusBarOptions = {}): string {
  if (!segments.length) {
    return '';
  }
  const width = clampWidth(options.width ?? getContentWidth());
  const divider = theme.ui.muted(` ${icons.bullet} `);
  const chunks = segments
    .filter((segment) => Boolean(segment.label?.trim() && segment.value?.trim()))
    .map((segment) => formatStatusChunk(segment));

  if (!chunks.length) {
    return '';
  }

  const lines: string[] = [];
  let current = '';

  const pushChunk = (chunk: string) => {
    if (!current) {
      current = chunk;
      return;
    }
    const candidate = `${current}${divider}${chunk}`;
    if (measure(candidate) > width) {
      lines.push(padLine(current, width));
      current = chunk;
    } else {
      current = candidate;
    }
  };

  chunks.forEach(pushChunk);
  if (current) {
    lines.push(padLine(current, width));
  }

  return lines.join('\n');
}

export function renderCallout(message: string, options: CalloutOptions = {}): string {
  const width = options.width ?? getContentWidth();
  const tone = options.tone ?? 'info';
  const icon = options.icon ?? icons.info;
  const title = options.title ?? capitalize(tone);
  const accent =
    ((tone === 'info' && (theme.gradient?.cool as Colorize | undefined)) ||
      (tone === 'success' && (theme.gradient?.success as Colorize | undefined)) ||
      (tone === 'warning' && (theme.gradient?.warm as Colorize | undefined)) ||
      (tone === 'accent' && (theme.gradient?.primary as Colorize | undefined)) ||
      toneColors[tone]) ??
    toneColors.info;
  const contentWidth = Math.max(24, normalizePanelWidth(width) - 4);

  // Split by newlines to preserve intentional line breaks
  const rawLines = message.split('\n');
  const paragraphs: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Empty line - add a blank line to preserve spacing
      paragraphs.push('');
    } else {
      // Wrap this line
      const wrapped = wrapParagraph(trimmed, contentWidth);
      paragraphs.push(...wrapped);
    }
  }

  const tagline =
    tone === 'danger'
      ? 'priority channel • failsafe engaged'
      : tone === 'warning'
        ? 'caution lane • heightened awareness'
        : 'signal lane • neon overlay';

  return renderPanel(paragraphs, {
    icon,
    title,
    tagline,
    accentColor: accent,
    borderColor: accent,
    width,
    halo: true,
  });
}

export function renderSectionHeading(title: string, options: SectionHeadingOptions = {}): string {
  const width = clampWidth(options.width ?? getContentWidth());
  const accent = toneColors[options.tone ?? 'accent'] ?? toneColors.accent;
  const icon = options.icon ? `${options.icon} ` : '';
  const label = `${icon}${title}`.toUpperCase();
  const gradient =
    (options.tone === 'info' && (theme.gradient?.cool as Colorize | undefined)) ||
    (options.tone === 'success' && (theme.gradient?.success as Colorize | undefined)) ||
    (options.tone === 'warning' && (theme.gradient?.warm as Colorize | undefined)) ||
    (options.tone === 'danger' && (theme.gradient?.warm as Colorize | undefined)) ||
    (theme.gradient?.primary as Colorize | undefined);
  const underline = (gradient ?? accent)('━'.repeat(width));
  const subtitle = options.subtitle?.trim() ? `${theme.ui.muted(options.subtitle.trim())}` : '';

  const lines = [underline, accent(padLine(label, width))];
  if (subtitle) {
    lines.push(theme.ui.muted(padLine(subtitle, width)));
  }
  lines.push(underline);
  return lines.join('\n');
}

function formatStatusChunk(segment: StatusSegment): string {
  const tone = toneColors[segment.tone ?? 'neutral'] ?? toneColors.neutral;
  const icon = segment.icon ? `${tone(segment.icon)} ` : '';
  const label = theme.ui.muted(segment.label.trim().toUpperCase());
  const value = tone(segment.value.trim());
  const pill = `${icon}${label} ${value}`;
  if (theme.ui.surface) {
    return theme.ui.surface(` ${pill} `);
  }
  return pill;
}

function padLine(text: string, width: number): string {
  const visible = measure(text);
  if (visible >= width) {
    return text;
  }
  return `${text}${' '.repeat(width - visible)}`;
}

function clampWidth(value: number): number {
  const normalized = Math.max(32, Math.floor(value));
  return Math.min(120, normalized);
}

function capitalize(value: string): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
