import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { AgentSessionService } from '../../services/agent-session.service';

interface PastedBlock {
  id: string;
  content: string;
  lines: number;
  characters: number;
  preview: string;
}

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [NgIf, NgFor],
  templateUrl: './chat-input.html',
  styleUrl: './chat-input.css'
})
export class ChatInputComponent implements AfterViewInit, OnDestroy {
  private readonly session = inject(AgentSessionService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('inputField') private inputField?: ElementRef<HTMLTextAreaElement>;

  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pastedBlocks = signal<PastedBlock[]>([]);
  protected readonly canSend = computed(
    () => !!this.draft().trim() || this.pastedBlocks().length > 0
  );
  private readonly draftStorageKey = 'bo-chat-draft';
  private readonly legacyDraftStorageKey = 'apt-chat-draft';

  private persistHandle: ReturnType<typeof setTimeout> | null = null;
  private lastLoadedKey: string | null = null;

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    // Reload a locally persisted draft whenever the session changes.
    effect(
      () => {
        const key = this.composeStorageKey();
        const legacyKey = this.composeStorageKey(true);
        if (this.lastLoadedKey === key) {
          return;
        }

        this.lastLoadedKey = key;
        const stored = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
        this.draft.set(stored ?? '');
        this.restorePastedBlocks();
        queueMicrotask(() => this.resizeToContent());
      },
      { allowSignalWrites: true }
    );
  }

  ngAfterViewInit(): void {
    this.resizeToContent();
    this.focusInput();
  }

  ngOnDestroy(): void {
    if (this.persistHandle) {
      clearTimeout(this.persistHandle);
    }
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.draft.set(value);
    this.queuePersist(value);
    this.error.set(null);
    this.resizeToContent();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void this.submitDraft();
  }

  protected onPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text/plain');
    if (!pasted) {
      return;
    }

    const normalized = pasted.replace(/\r\n/g, '\n');
    if (!this.isLargePaste(normalized)) {
      return;
    }

    event.preventDefault();
    this.addPastedBlock(normalized);
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    void this.submitDraft();
  }

  protected clearDraft(): void {
    this.draft.set('');
    this.pastedBlocks.set([]);
    this.queuePersist('');
    this.resizeToContent();
    this.focusInput();
  }

  protected removePastedBlock(id: string): void {
    this.pastedBlocks.update((current) => {
      const next = current.filter((block) => block.id !== id);
      this.queuePersist(this.draft(), next);
      return next;
    });
  }

  protected explodePastedBlockToDraft(id: string): void {
    const block = this.pastedBlocks().find((candidate) => candidate.id === id);
    if (!block) {
      return;
    }

    this.pastedBlocks.update((current) => {
      const next = current.filter((item) => item.id !== id);
      const combinedDraft = this.draft().trim()
        ? `${this.draft().trim()}\n\n${block.content}`
        : block.content;
      this.draft.set(combinedDraft);
      this.queuePersist(combinedDraft, next);
      return next;
    });

    this.resizeToContent();
  }

  private async submitDraft(): Promise<void> {
    const text = this.draft().trim();
    const blocks = this.pastedBlocks();
    if ((text.length === 0 && blocks.length === 0) || this.sending()) {
      return;
    }

    this.sending.set(true);
    this.error.set(null);

    try {
      const payload = this.composePayload(text, blocks);
      await this.session.sendCommand({ text: payload });
      this.draft.set('');
      this.pastedBlocks.set([]);
      this.queuePersist('');
      this.resizeToContent();
    } catch (error) {
      this.error.set(this.describeError(error));
    } finally {
      this.sending.set(false);
      this.focusInput();
    }
  }

  private queuePersist(value: string, blocks: PastedBlock[] = this.pastedBlocks()): void {
    if (!this.isBrowser) {
      return;
    }

    if (this.persistHandle) {
      clearTimeout(this.persistHandle);
    }

    const key = this.composeStorageKey();
    const legacyKey = this.composeStorageKey(true);
    const blockKey = this.composeBlockStorageKey();
    const legacyBlockKey = this.composeBlockStorageKey(true);
    this.persistHandle = setTimeout(() => {
      this.persistHandle = null;
      if (value.trim().length === 0) {
        localStorage.removeItem(key);
        localStorage.removeItem(legacyKey);
      } else {
        localStorage.setItem(key, value);
        localStorage.removeItem(legacyKey);
      }

      if (!blocks.length) {
        localStorage.removeItem(blockKey);
        localStorage.removeItem(legacyBlockKey);
      } else {
        const serialized = blocks.map((block) => ({
          id: block.id,
          content: block.content
        }));
        localStorage.setItem(blockKey, JSON.stringify(serialized));
        localStorage.removeItem(legacyBlockKey);
      }
    }, 150);
  }

  private composeStorageKey(useLegacy = false): string {
    const sessionId = this.session.sessionId();
    const base = useLegacy ? this.legacyDraftStorageKey : this.draftStorageKey;
    return sessionId ? `${base}:${sessionId}` : base;
  }

  private composeBlockStorageKey(useLegacy = false): string {
    return `${this.composeStorageKey(useLegacy)}:blocks`;
  }

  private resizeToContent(): void {
    const input = this.inputField?.nativeElement;
    if (!input) {
      return;
    }

    input.style.height = 'auto';
    const nextHeight = Math.min(input.scrollHeight, 240);
    input.style.height = `${nextHeight}px`;
  }

  private focusInput(): void {
    if (!this.isBrowser) {
      return;
    }

    const input = this.inputField?.nativeElement;
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      const length = input.value.length;
      input.setSelectionRange(length, length);
    });
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unable to deliver your command to the Bo CLI.';
  }

  private isLargePaste(text: string): boolean {
    const lineCount = text.split('\n').length;
    return text.length > 600 || lineCount > 8;
  }

  private addPastedBlock(content: string): void {
    const block = this.createPastedBlock(content);
    this.pastedBlocks.update((current) => {
      const next = [...current, block].slice(-10);
      this.queuePersist(this.draft(), next);
      return next;
    });
  }

  private createPastedBlock(content: string): PastedBlock {
    const normalized = content.trimEnd();
    const lines = normalized.split('\n');
    const previewSource = lines.slice(0, 3).join(' ').trim();
    const preview =
      previewSource.length > 90 ? `${previewSource.slice(0, 90)}…` : previewSource || 'pasted block';
    const randomId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return {
      id: randomId,
      content: normalized,
      lines: lines.length,
      characters: normalized.length,
      preview
    };
  }

  private restorePastedBlocks(): void {
    const blockKey = this.composeBlockStorageKey();
    const stored = localStorage.getItem(blockKey);
    if (!stored) {
      this.pastedBlocks.set([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as { id?: string; content: string }[];
      const hydrated = parsed
        .filter((item) => typeof item.content === 'string')
        .map((item) => this.createPastedBlock(item.content));
      this.pastedBlocks.set(hydrated);
    } catch {
      this.pastedBlocks.set([]);
    }
  }

  private composePayload(text: string, blocks: PastedBlock[]): string {
    if (!blocks.length) {
      return text;
    }

    const blockBundle = blocks
      .map(
        (block, index) =>
          `[[ attachment ${index + 1} | ${block.lines} lines | ${block.characters} chars ]]\n${block.content}`
      )
      .join('\n\n');

    if (!text) {
      return blockBundle;
    }

    return `${text}\n\n${blockBundle}`;
  }
}
