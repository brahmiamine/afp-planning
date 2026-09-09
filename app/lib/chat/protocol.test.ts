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
      replyToMessageId: null,
      forwardSourceMessageId: null,
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

describe('chat reply and forward protocol (issue #268)', () => {
  it('accepts a valid reply-to message id', () => {
    const result = parseMessageCommand({
      roomId: 'room-123',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Je confirme',
      replyToMessageId: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(result.replyToMessageId).toBe('550e8400-e29b-41d4-a716-446655440099');
  });

  it('rejects a malformed reply-to message id', () => {
    expect(() =>
      parseMessageCommand({
        roomId: 'room-123',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Je confirme',
        replyToMessageId: 'not-a-uuid',
      }),
    ).toThrow('Message cité invalide');
  });

  it('accepts a valid forward-source message id', () => {
    const result = parseMessageCommand({
      roomId: 'room-123',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Transféré',
      forwardSourceMessageId: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(result.forwardSourceMessageId).toBe('550e8400-e29b-41d4-a716-446655440099');
  });

  it('rejects a malformed forward-source message id', () => {
    expect(() =>
      parseMessageCommand({
        roomId: 'room-123',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Transféré',
        forwardSourceMessageId: 'not-a-uuid',
      }),
    ).toThrow('Message à transférer invalide');
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
