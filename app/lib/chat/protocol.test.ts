import { describe, expect, it } from 'vitest';
import { parseMessageCommand, parseResumeCommand } from './protocol';

describe('chat message protocol', () => {
  it('normalizes a valid idempotent message command', () => {
    expect(
      parseMessageCommand({
        roomId: 'room-123',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: '  Bonjour à tous  ',
      }),
    ).toEqual({
      roomId: 'room-123',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Bonjour à tous',
      attachment: null,
    });
  });

  it('rejects empty, oversized and non-idempotent commands', () => {
    expect(() => parseMessageCommand({ roomId: 'room-123', clientMessageId: 'bad', content: ' ' })).toThrow(
      'Message vide',
    );
    expect(() =>
      parseMessageCommand({
        roomId: 'room-123',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'x'.repeat(4_001),
      }),
    ).toThrow('Message trop long');
    expect(() => parseMessageCommand({ roomId: 'room-123', clientMessageId: 'bad', content: 'Bonjour' })).toThrow(
      'Identifiant de message invalide',
    );
  });

  it('rejects malformed room identifiers before any database lookup', () => {
    expect(() =>
      parseMessageCommand({
        roomId: '../room',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Bonjour',
      }),
    ).toThrow('Salon invalide');
  });
});

describe('chat reconnect protocol', () => {
  it('accepts a server sequence cursor and rejects malformed cursors', () => {
    expect(parseResumeCommand({ roomId: 'room-123', afterSequence: 42 })).toEqual({
      roomId: 'room-123',
      afterSequence: 42,
    });
    expect(() => parseResumeCommand({ roomId: 'room-123', afterSequence: -1 })).toThrow(
      'Séquence de reprise invalide',
    );
  });
});
