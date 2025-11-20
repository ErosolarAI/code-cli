import { randomUUID } from 'node:crypto';

export type TimelineStatus = 'started' | 'succeeded' | 'failed' | 'blocked' | 'skipped';

export interface TimelineEvent {
  eventId: string;
  action: string;
  timestamp: string;
  stepId?: string;
  tool?: string;
  status?: TimelineStatus;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
}

export class TimelineRecorder {
  private readonly events: TimelineEvent[] = [];

  record(event: Omit<TimelineEvent, 'eventId' | 'timestamp'> & Partial<Pick<TimelineEvent, 'eventId' | 'timestamp'>>): TimelineEvent {
    const normalized: TimelineEvent = {
      ...event,
      eventId: event.eventId ?? randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.events.push(normalized);
    return normalized;
  }

  list(): TimelineEvent[] {
    return [...this.events];
  }

  latest(count = 10): TimelineEvent[] {
    if (count <= 0) {
      return [];
    }
    return this.events.slice(-count);
  }

  clear(): void {
    this.events.length = 0;
  }
}
