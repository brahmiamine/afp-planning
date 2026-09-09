import { describe, expect, it } from 'vitest';
import { mergeMessages, type ChatMessage } from './ChatConversation';

function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'sequence'>): ChatMessage {
  return {
    roomId: 'room-1',
    senderUserId: 1,
    senderName: 'Test',
    clientMessageId: overrides.id,
    content: `content-${overrides.sequence}`,
    attachment: null,
    createdAt: new Date(2026, 0, 1, 10, overrides.sequence).toISOString(),
    ...overrides,
  };
}

describe('mergeMessages', () => {
  it('prepends an older page without duplicating existing messages, sorted by sequence', () => {
    const current = [message({ id: 'm3', sequence: 3 }), message({ id: 'm4', sequence: 4 })];
    const olderPage = [message({ id: 'm1', sequence: 1 }), message({ id: 'm2', sequence: 2 })];

    const merged = mergeMessages(current, olderPage);

    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('deduplicates by id when the same message appears in both pages', () => {
    const current = [message({ id: 'm2', sequence: 2 }), message({ id: 'm3', sequence: 3 })];
    const olderPage = [message({ id: 'm1', sequence: 1 }), message({ id: 'm2', sequence: 2 })];

    const merged = mergeMessages(current, olderPage);

    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(merged).toHaveLength(3);
  });

  it('keeps the incoming version of a message when ids collide (e.g. server ack replacing an optimistic echo)', () => {
    const current = [message({ id: 'm1', sequence: 1, content: 'stale' })];
    const incoming = [message({ id: 'm1', sequence: 1, content: 'fresh' })];

    const merged = mergeMessages(current, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.content).toBe('fresh');
  });
});
