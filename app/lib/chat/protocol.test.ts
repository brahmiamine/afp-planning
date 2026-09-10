import { describe, expect, it } from 'vitest';
import { parseDeleteCommand, parseMessageCommand, parseResumeCommand, parseTypingCommand } from './protocol';

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
      mentionedUserIds: [],
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

describe('chat typing protocol (issue #267)', () => {
  it('accepts a valid room id', () => {
    expect(parseTypingCommand({ roomId: 'room-123' })).toEqual({ roomId: 'room-123' });
  });

  it('rejects a malformed room id', () => {
    expect(() => parseTypingCommand({ roomId: '../room' })).toThrow('Salon invalide');
    expect(() => parseTypingCommand({})).toThrow('Salon invalide');
  });
});

describe('chat delete protocol (issue #259)', () => {
  it('accepts a valid room + message id pair', () => {
    expect(parseDeleteCommand({ roomId: 'room-123', messageId: '550e8400-e29b-41d4-a716-446655440000' })).toEqual({
      roomId: 'room-123',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('rejects a malformed message id or room id', () => {
    expect(() => parseDeleteCommand({ roomId: 'room-123', messageId: 'not-a-uuid' })).toThrow('Message invalide');
    expect(() => parseDeleteCommand({ roomId: '../room', messageId: '550e8400-e29b-41d4-a716-446655440000' })).toThrow(
      'Salon invalide',
    );
  });
});

describe('chat mention protocol (issue #321)', () => {
  it('keeps unique mention ids and drops invalid entries', () => {
    const result = parseMessageCommand({
      roomId: 'room-123',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Salut @Jean',
      mentionedUserIds: [7, 7, '8', 0, -1, 'nope', 12],
    });
    expect(result.mentionedUserIds).toEqual([7, 8, 12]);
  });
});
